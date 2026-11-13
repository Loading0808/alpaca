// APEX GARAGE server: static files + real-time multiplayer over WebSocket.
// Zero dependencies — the WebSocket protocol (RFC 6455) is implemented here.
//
//   node server.js            → http://localhost:5173  (set PORT to change it)
//
// The server is authoritative for rooms, membership, names, chat and the
// multiplayer leaderboard, and it validates everything a client sends:
// message size and rate, value ranges, movement (speed / teleport checks) and
// score growth. Clients only ever receive data that passed those checks.
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 5173;
const ROOT = __dirname;
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
};
const PRIVATE_FILES = new Set(['server.js', 'mp-scores.json', 'package.json']);

const server = http.createServer((req, res) => {
  let url; try { url = decodeURIComponent(req.url.split('?')[0]); } catch (_) { res.writeHead(400); return res.end('Bad request'); }
  if (url === '/health') { res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ ok: true, players: clients.size, rooms: rooms.size })); }
  const file = path.normalize(path.join(ROOT, url === '/' ? 'index.html' : url));
  if (!file.startsWith(ROOT + path.sep) || PRIVATE_FILES.has(path.basename(file)) || path.basename(file).startsWith('.')) { res.writeHead(403); return res.end('Forbidden'); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  });
});

// ---------------------------------------------------------------------------
// Minimal WebSocket layer
// ---------------------------------------------------------------------------
const MAX_MSG = 6000;                     // bytes; the largest legitimate message is a join with a car build

function wsAccept(req, socket) {
  const key = req.headers['sec-websocket-key'];
  if (!key || (req.headers.upgrade || '').toLowerCase() !== 'websocket' || req.url.split('?')[0] !== '/ws') { socket.destroy(); return null; }
  const accept = crypto.createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' + accept + '\r\n\r\n');
  socket.setNoDelay(true);
  return socket;
}
function wsSend(socket, text) {
  if (socket.destroyed) return;
  const data = Buffer.from(text), n = data.length;
  const head = n < 126 ? Buffer.from([0x81, n]) : n < 65536 ? Buffer.from([0x81, 126, n >> 8, n & 255]) : (() => { const b = Buffer.alloc(10); b[0] = 0x81; b[1] = 127; b.writeBigUInt64BE(BigInt(n), 2); return b; })();
  socket.write(Buffer.concat([head, data]));
}
/** Feeds raw socket data into `onText`; closes the socket on anything malformed or oversized. */
function wsReader(socket, onText, onClose) {
  let buf = Buffer.alloc(0), closed = false;
  const close = () => { if (!closed) { closed = true; socket.destroy(); onClose(); } };
  socket.on('data', chunk => {
    buf = Buffer.concat([buf, chunk]);
    if (buf.length > MAX_MSG * 4) return close();
    for (;;) {
      if (buf.length < 2) return;
      const op = buf[0] & 15, fin = buf[0] & 128, masked = buf[1] & 128; let len = buf[1] & 127, off = 2;
      if (len === 126) { if (buf.length < 4) return; len = buf.readUInt16BE(2); off = 4; }
      else if (len === 127) return close();                         // nothing a client sends is that large
      if (!masked || !fin || len > MAX_MSG) return close();          // clients must mask; fragments are not supported
      if (buf.length < off + 4 + len) return;
      const mask = buf.subarray(off, off + 4), payload = Buffer.from(buf.subarray(off + 4, off + 4 + len));
      for (let i = 0; i < len; i++) payload[i] ^= mask[i & 3];
      buf = buf.subarray(off + 4 + len);
      if (op === 8) return close();
      if (op === 9) socket.write(Buffer.concat([Buffer.from([0x8a, payload.length]), payload]));   // ping → pong
      else if (op === 1) onText(payload.toString('utf8'));
    }
  });
  socket.on('close', close); socket.on('error', close);
}

// ---------------------------------------------------------------------------
// Rooms and players
// ---------------------------------------------------------------------------
const MAX_PLAYERS = 8, TICK_MS = 66, TIMEOUT_MS = 30000;
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const BOUNDS = { x: 2600, z: 2600, yMin: -10, yMax: 80, speed: 140 };   // generous limits for the expressway map
const SCORE_FILE = path.join(ROOT, 'mp-scores.json');
const clients = new Map(), rooms = new Map();
let nextId = 1, topScores = [];
try { topScores = JSON.parse(fs.readFileSync(SCORE_FILE, 'utf8')).slice(0, 20); } catch (_) { topScores = []; }

const now = () => Date.now();
const makeRoom = (id, name, priv) => { const r = { id, name, private: priv, code: priv ? id : null, players: new Map(), seed: crypto.randomInt(1, 1e9), created: now() }; rooms.set(id, r); return r; };
for (let i = 1; i <= 3; i++) makeRoom('public-' + i, 'Expressway Lobby ' + i, false);
const newCode = () => { const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let c; do { c = Array.from({ length: 6 }, () => A[crypto.randomInt(A.length)]).join(''); } while (rooms.has(c)); return c; };

const cleanName = n => String(n || '').replace(/[^\p{L}\p{N} _.\-]/gu, '').trim().slice(0, 18) || 'Driver';
const cleanChat = m => String(m || '').replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, 140);
const isNum = v => typeof v === 'number' && Number.isFinite(v);
const ID = /^[a-z0-9]{1,16}$/, HEX = /^#[0-9a-fA-F]{6}$/;
/** Accept only a structurally valid car build with bounded values; anything else is rejected. */
function cleanBuild(b) {
  try {
    const id = v => (typeof v === 'string' && ID.test(v) ? v : null), num = (v, a, z) => (isNum(v) ? Math.min(z, Math.max(a, v)) : null);
    const out = {
      carId: id(b.carId), paint: { color: HEX.test(b.paint.color) ? b.paint.color : null, finish: id(b.paint.finish) },
      roof: id(b.roof), hood: id(b.hood), tint: id(b.tint), kit: id(b.kit), spoiler: id(b.spoiler),
      rim: { style: id(b.rim.style), size: num(b.rim.size, 14, 24), color: id(b.rim.color) }, caliper: HEX.test(b.caliper) ? b.caliper : null, tire: id(b.tire),
      susp: { type: id(b.susp.type), drop: num(b.susp.drop, -0.08, 0.2), camberF: num(b.susp.camberF, 0, 12), camberR: num(b.susp.camberR, 0, 12), offF: num(b.susp.offF, 0, 60), offR: num(b.susp.offR, 0, 60),
        air: b.susp.air ? { preset: id(b.susp.air.preset), f: num(b.susp.air.f, -0.08, 0.2), r: num(b.susp.air.r, -0.08, 0.2) } : undefined },
      engine: id(b.engine), turbo: id(b.turbo), sc: id(b.sc), exhaust: id(b.exhaust), intake: id(b.intake),
    };
    const bad = o => Object.values(o).some(v => v === null || (typeof v === 'object' && bad(v)));
    return bad(out) ? null : out;
  } catch (_) { return null; }
}

const send = (c, o) => wsSend(c.socket, JSON.stringify(o));
const cast = (room, o, except) => { const s = JSON.stringify(o); for (const p of room.players.values()) if (p !== except) wsSend(p.socket, s); };
const lobbyList = () => [...rooms.values()].filter(r => !r.private).map(r => ({ id: r.id, name: r.name, players: r.players.size, max: MAX_PLAYERS }));
const roster = room => [...room.players.values()].map(p => ({ id: p.id, name: p.name, build: p.build }));
const board = room => ({ t: 'board', rows: [...room.players.values()].map(p => ({ id: p.id, name: p.name, score: Math.round(p.score), best: p.best })).sort((a, b) => Math.max(b.best, b.score) - Math.max(a.best, a.score)), top: topScores });

function leave(c, why) {
  const room = c.room; if (!room) return;
  room.players.delete(c.id); c.room = null;
  log(`- ${c.name} left ${room.id}${why ? ' (' + why + ')' : ''} · ${room.players.size} in room`);
  cast(room, { t: 'out', id: c.id }); cast(room, { t: 'sys', m: `${c.name} left${why ? ' (' + why + ')' : ''}` }); cast(room, board(room));
  if (room.private && room.players.size === 0) rooms.delete(room.id);
}
function join(c, room, build) {
  if (room.players.size >= MAX_PLAYERS) return send(c, { t: 'err', m: 'That room is full' });
  leave(c);
  let name = c.name, n = 2; while ([...room.players.values()].some(p => p.name === name)) name = `${c.name} ${n++}`;   // names are unique within a room
  Object.assign(c, { room, shown: name, build, state: null, score: 0, best: 0, scoreT: now(), strikes: 0, lastPos: null, lastPosT: 0 });
  c.name = name;
  room.players.set(c.id, c);
  log(`+ ${name} joined ${room.id} · ${room.players.size} in room`);
  send(c, { t: 'joined', room: { id: room.id, name: room.name, private: room.private, code: room.code, max: MAX_PLAYERS }, you: c.id, name, players: roster(room), seed: room.seed, time: now() });
  cast(room, { t: 'in', p: { id: c.id, name, build } }, c); cast(room, { t: 'sys', m: `${name} joined` }, c); cast(room, board(room));
}

function onState(c, m) {
  const p = m.p, t = now();
  if (!c.room || !Array.isArray(p) || p.length !== 9 || !p.every(isNum)) return;
  if (t - c.stateT < 20) return; c.stateT = t;                         // at most ~50 updates a second
  const [x, y, z, psi, vx, vy, st, rpm, flags] = p;
  const bad = Math.abs(x) > BOUNDS.x || Math.abs(z) > BOUNDS.z || y < BOUNDS.yMin || y > BOUNDS.yMax || Math.hypot(vx, vy) > BOUNDS.speed || Math.abs(st) > 1.2 || rpm < 0 || rpm > 12000;
  // movement check: a car cannot travel further than its top speed allows since the last accepted update
  const jump = c.lastPos && Math.hypot(x - c.lastPos[0], z - c.lastPos[1]) > (t - c.lastPosT) / 1000 * BOUNDS.speed * 1.3 + 12;
  if (bad || (jump && !(flags & 4))) {                                 // flag 4 = the player pressed "reset car" (a short, legal jump)
    if (++c.strikes > 40) { send(c, { t: 'err', m: 'Removed: your game is sending impossible movement' }); return leave(c, 'movement check'); }
    return;
  }
  if (jump && Math.hypot(x - c.lastPos[0], z - c.lastPos[1]) > 400) return;   // even a reset cannot cross the map
  c.strikes = Math.max(0, c.strikes - 0.2);
  c.lastPos = [x, z]; c.lastPosT = t;
  c.state = [c.id, +x.toFixed(2), +y.toFixed(2), +z.toFixed(2), +psi.toFixed(3), +vx.toFixed(2), +vy.toFixed(2), +st.toFixed(2), Math.round(rpm), flags & 7];
  // score check: points can only grow as fast as the scoring rules allow
  if (isNum(m.sc) && m.sc >= 0) {
    const dt = (t - c.scoreT) / 1000, cap = c.score + 9000 * dt + 4000;
    if (m.sc < c.score) c.score = m.sc;                                // a new run started
    else if (m.sc <= cap) c.score = m.sc;
    c.scoreT = t;
  }
}

function onBank(c, m) {
  if (!c.room || !isNum(m.total) || m.total <= 0 || c.score <= 0) return;   // nothing verified as earned = nothing to bank
  const total = Math.round(Math.min(m.total, c.score * 1.02 + 50));    // cannot bank more than the server saw being earned
  if (total <= 0) return;
  c.best = Math.max(c.best, total); c.score = 0; c.scoreT = now();
  topScores.push({ name: c.name, score: total, car: c.build.carId, ts: now() });
  topScores.sort((a, b) => b.score - a.score); topScores.length = Math.min(topScores.length, 20);
  fs.writeFile(SCORE_FILE, JSON.stringify(topScores), () => { });
  cast(c.room, board(c.room));
}

function onMessage(c, text) {
  let m; try { m = JSON.parse(text); } catch (_) { return; }
  if (!m || typeof m.t !== 'string') return;
  c.seen = now();
  switch (m.t) {
    case 's': return onState(c, m);
    case 'ping': return send(c, { t: 'pong', c: isNum(m.c) ? m.c : 0, time: now() });
    case 'hello': c.name = cleanName(m.name); return send(c, { t: 'welcome', id: c.id, name: c.name, time: now(), lobbies: lobbyList(), top: topScores });
    case 'lobbies': return send(c, { t: 'lobbies', list: lobbyList(), top: topScores });
    case 'join': case 'create': {
      const t = now(); if (t - c.joinT < 700) return send(c, { t: 'err', m: 'Slow down a moment' }); c.joinT = t;
      const build = cleanBuild(m.build); if (!build) return send(c, { t: 'err', m: 'That car could not be validated' });
      if (m.name) c.name = cleanName(m.name);
      if (m.t === 'create') return join(c, makeRoom(newCode(), 'Private room', true), build);
      const key = typeof m.code === 'string' ? m.code.trim().toUpperCase() : typeof m.room === 'string' ? m.room : '';
      const room = rooms.get(key);
      // a private room can only be entered with its exact code; guesses are rate-limited
      if (!room || (room.private && typeof m.code !== 'string')) { if (++c.badJoins > 8) { c.joinT = t + 30000; c.badJoins = 0; } return send(c, { t: 'err', m: m.code ? 'No room with that code' : 'That lobby does not exist' }); }
      return join(c, room, build);
    }
    case 'chat': {
      const t = now(), txt = cleanChat(m.m); if (!c.room || !txt || t - c.chatT < 800) return; c.chatT = t;
      return cast(c.room, { t: 'chat', id: c.id, name: c.name, m: txt });
    }
    case 'bank': return onBank(c, m);
    case 'leave': return leave(c);
  }
}

server.on('upgrade', (req, socket) => {
  if (!wsAccept(req, socket)) return;
  const c = { id: nextId++, socket, name: 'Driver', room: null, seen: now(), stateT: 0, chatT: 0, joinT: 0, badJoins: 0, score: 0, best: 0 };
  clients.set(c.id, c);
  wsReader(socket, text => onMessage(c, text), () => { leave(c, 'disconnected'); clients.delete(c.id); });
});

// broadcast: positions ~15 times a second, the scoreboard once a second
let tick = 0;
setInterval(() => {
  const t = now(); tick++;
  for (const c of clients.values()) if (t - c.seen > TIMEOUT_MS) { leave(c, 'timed out'); c.socket.destroy(); clients.delete(c.id); }
  for (const room of rooms.values()) {
    if (!room.players.size) continue;
    const s = []; for (const p of room.players.values()) if (p.state) s.push(p.state);
    cast(room, { t: 'snap', time: t, s });
    if (tick % 15 === 0) cast(room, board(room));
  }
}, TICK_MS);

server.listen(PORT, () => console.log(`APEX GARAGE running at http://localhost:${PORT}  (multiplayer on ws://localhost:${PORT}/ws)`));
