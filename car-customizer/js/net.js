// Multiplayer client. Talks to server.js over a WebSocket: lobbies, private
// rooms, position streaming, chat and the room leaderboard.
// Nothing here simulates other players — every remote car is a real connection.
const SEND_HZ = 15;

export class Net {
  constructor() {
    this.ws = null; this.id = 0; this.room = null; this.players = new Map(); this.board = { rows: [], top: [] };
    this.top = []; this.topDrag = { quarter: [], eighth: [] }; this.dragWaiting = { quarter: 0, eighth: 0 }; this.offset = 0; this.rtt = 0; this.bestRtt = 1e9; this.lastSend = 0; this.on = {};
  }
  get connected() { return !!this.ws && this.ws.readyState === 1; }
  get inRoom() { return this.connected && !!this.room; }
  /** Server clock in ms, estimated from the lowest-latency ping. */
  serverNow() { return Date.now() + this.offset; }
  emit(ev, a) { if (this.on[ev]) this.on[ev](a); }

  defaultUrl() { return (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws'; }

  connect(url, name) {
    this.disconnect();
    return new Promise((resolve, reject) => {
      let ws; try { ws = new WebSocket(url || this.defaultUrl()); } catch (e) { return reject(new Error('That server address is not valid')); }
      this.ws = ws; let opened = false;
      const timer = setTimeout(() => { if (!opened) { ws.close(); reject(new Error('The server did not answer')); } }, 6000);
      ws.onopen = () => { opened = true; clearTimeout(timer); this.bestRtt = 1e9; this.send({ t: 'hello', name }); this._ping(); this.pinger = setInterval(() => this._ping(), 2000); };
      ws.onmessage = e => { let m; try { m = JSON.parse(e.data); } catch (_) { return; } if (m.t === 'welcome') { this.id = m.id; resolve(m); } this._handle(m); };
      ws.onerror = () => { if (!opened) { clearTimeout(timer); reject(new Error('Could not reach the multiplayer server. Start it with “node server.js”.')); } };
      ws.onclose = () => { clearInterval(this.pinger); const was = this.room; this.ws = null; this.room = null; this.players.clear(); if (opened) this.emit('closed', was); };
    });
  }
  disconnect() { if (this.ws) { try { this.ws.close(); } catch (_) { /* already closed */ } } this.ws = null; this.room = null; this.players.clear(); }
  send(o) { if (this.connected) this.ws.send(JSON.stringify(o)); }
  _ping() { this.send({ t: 'ping', c: Date.now() }); }

  lobbies() { this.send({ t: 'lobbies' }); }
  join(roomId, build, name) { this.send({ t: 'join', room: roomId, build, name }); }
  joinCode(code, build, name) { this.send({ t: 'join', code, build, name }); }
  create(build, name) { this.send({ t: 'create', build, name }); }
  // drag racing
  dragMatch(dist, tree, build, name) { this.send({ t: 'dragmatch', dist, tree, build, name }); }
  createDrag(dist, tree, build, name) { this.send({ t: 'create', mode: 'drag', dist, tree, build, name }); }
  dragStage(v) { this.send({ t: 'dr', ev: 'stage', v }); }
  dragResult(r) { this.send({ t: 'dr', ev: 'result', rt: r.rt, et: r.et, trap: r.trap }); }
  leave() { this.send({ t: 'leave' }); this.room = null; this.players.clear(); }
  chat(text) { this.send({ t: 'chat', m: text }); }
  bank(total) { this.send({ t: 'bank', total }); }

  /** Stream the local car. s = drive state; flags: 1 braking, 2 lights, 4 just reset. */
  sendState(s, rpm, score, flags) {
    const t = performance.now(); if (!this.inRoom || t - this.lastSend < 1000 / SEND_HZ) return;
    this.lastSend = t;
    this.send({ t: 's', p: [s.x, s.y, s.z, s.psi, s.vx, s.vy, s.st, rpm, flags], sc: Math.round(score) });
  }

  _handle(m) {
    switch (m.t) {
      case 'pong': { const rtt = Date.now() - m.c; this.rtt = rtt; if (rtt <= this.bestRtt + 5) { this.bestRtt = Math.min(this.bestRtt, rtt); this.offset = m.time + rtt / 2 - Date.now(); } break; }
      case 'welcome': case 'lobbies': if (m.top) this.top = m.top; if (m.topDrag) this.topDrag = m.topDrag; this.dragWaiting = m.dragWaiting || this.dragWaiting; this.emit('lobbies', m.lobbies || m.list); break;
      case 'joined':
        this.room = m.room; this.seed = m.seed; this.name = m.name; this.lane = m.lane || 0; this.players.clear();
        for (const p of m.players) if (p.id !== m.you) this.players.set(p.id, { ...p, snaps: [] });
        this.emit('joined', m); break;
      case 'in': this.players.set(m.p.id, { ...m.p, snaps: [] }); this.emit('in', m.p); break;
      case 'out': { const p = this.players.get(m.id); this.players.delete(m.id); if (p) this.emit('out', p); break; }
      case 'snap':
        for (const st of m.s) { const p = this.players.get(st[0]); if (!p) continue; p.snaps.push({ t: m.time, x: st[1], y: st[2], z: st[3], psi: st[4], vx: st[5], vy: st[6], st: st[7], rpm: st[8], flags: st[9] }); if (p.snaps.length > 12) p.snaps.shift(); }
        break;
      case 'board': this.board = m; if (m.top) this.top = m.top; this.emit('board', m); break;
      case 'chat': this.emit('chat', m); break;
      case 'dr_go': this.emit('dragGo', m); break;
      case 'dr_stage': { const p = this.players.get(m.id); if (p) p.staged = m.v; break; }
      case 'dr_wait': this.emit('dragWait'); break;
      case 'dr_result': if (m.top) this.topDrag = m.top; this.emit('dragResult', m); break;
      case 'sys': this.emit('sys', m.m); break;
      case 'err': this.emit('error', m.m); break;
    }
  }

  /**
   * Where a remote player is right now. Rendering runs ~130 ms behind the server so there are
   * always two snapshots to interpolate between; if updates stop it coasts on the last velocity.
   */
  sample(p) {
    if (!p) return null;
    const s = p.snaps, n = s.length; if (!n) return null;
    const t = this.serverNow() - 130;
    let i = n - 1; while (i > 0 && s[i - 1].t > t) i--;
    const b = s[i], a = s[i - 1];
    if (a && t <= b.t) {
      const u = Math.min(1, Math.max(0, (t - a.t) / Math.max(1, b.t - a.t))); let d = b.psi - a.psi; d = Math.atan2(Math.sin(d), Math.cos(d));
      return { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u, z: a.z + (b.z - a.z) * u, psi: a.psi + d * u, vx: b.vx, st: a.st + (b.st - a.st) * u, flags: b.flags };
    }
    const dt = Math.min(0.3, Math.max(0, (t - b.t) / 1000)), c = Math.cos(b.psi), sn = Math.sin(b.psi);
    return { x: b.x + (b.vx * c - b.vy * sn) * dt, y: b.y, z: b.z + (-b.vx * sn - b.vy * c) * dt, psi: b.psi, vx: b.vx, st: b.st, flags: b.flags };
  }
}
