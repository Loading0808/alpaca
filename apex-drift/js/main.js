// APEX DRIFT — game loop, camera, drawing, HUD and menus.
import { TRACKS, Track } from './track.js';
import { CARS, PAINTS, ratings, topSpeed, drawCarShape } from './car.js';
import { Race, MODES, SCORE } from './race.js';
import { FX } from './fx.js';
import { Sound } from './audio.js';
import { Input } from './input.js';
import * as store from './store.js';

const $ = (id) => document.getElementById(id);
const canvas = $('game');
const ctx = canvas.getContext('2d');
const params = new URLSearchParams(location.search);
const save = store.load();
const sound = new Sound();
sound.on = save.settings.sound;
const input = new Input();
const fx = new FX();
const ASSIST = [0, 0.5, 0.85];
const STEP = 1 / 120;

const tracks = {};
const trackFor = (id) => (tracks[id] = tracks[id] || new Track(TRACKS.find((t) => t.id === id) || TRACKS[0]));
const carDef = (id) => CARS.find((c) => c.id === id) || CARS[0];

let state = 'title'; // title | race | paused | results
let race = null;
let track = null;
let paint = PAINTS[0];
let cam = { x: 0, y: 0, a: 0, z: 10 };
let dpr = 1, W = 0, H = 0;
let acc = 0, last = performance.now();
let lastCount = 0;
let returnTo = 'title';
const touchMode = matchMedia('(hover: none) and (pointer: coarse)').matches || params.has('touch');
if (touchMode) document.body.classList.add('touch-mode');

// ------------------------------------------------------------------ helpers
const fmt = (t) => {
  if (!isFinite(t)) return '—';
  const m = Math.floor(t / 60), s = t - m * 60;
  return `${m}:${s < 10 ? '0' : ''}${s.toFixed(3)}`;
};
const num = (n) => Math.round(n).toLocaleString('en-US');
const el = (tag, attrs = {}, ...kids) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v; else if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else e.setAttribute(k, v);
  }
  for (const k of kids) if (k != null) e.append(k);
  return e;
};
const unlocked = (c) => save.xp >= c.unlock;
const medalFor = (val, list, lower) => {
  // list = [bronze, silver, gold]
  let m = 0;
  for (let i = 0; i < 3; i++) if (lower ? val <= list[i] : val >= list[i]) m = i + 1;
  return m;
};
const MEDALS = ['none', 'bronze', 'silver', 'gold'];

function resize() {
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  W = canvas.clientWidth; H = canvas.clientHeight;
  canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
}
window.addEventListener('resize', resize);
resize();

// ------------------------------------------------------------------ screens
const SCREENS = ['title', 'setup', 'pause', 'results', 'settings', 'help'];
let modalStack = [];
function show(name) {
  if (name === 'settings' || name === 'help') {
    modalStack.push(SCREENS.find((s) => !$(s).hidden) || 'title');
  } else modalStack = [];
  for (const s of SCREENS) $(s).hidden = s !== name;
  if (name === 'setup') buildSetup();
  if (name === 'title') { refreshXp(); if (state !== 'title') startAttract(); }
  if (name === 'settings') syncSettings();
  const first = $(name).querySelector('.btn.hot, .btn');
  if (first && !touchMode) first.focus({ preventScroll: true });
}
function back() {
  const to = modalStack.pop() || 'title';
  for (const s of SCREENS) $(s).hidden = s !== to;
}
document.addEventListener('click', (e) => {
  const go = e.target.closest('[data-go]');
  if (go) { sound.unlock(); sound.blip(); const to = go.dataset.go; if (to === 'title' || to === 'setup') { if (state !== 'title') quitRace(); } show(to); }
  const b = e.target.closest('[data-back]');
  if (b) { sound.blip(); back(); }
});
document.addEventListener('pointerdown', () => sound.unlock(), { once: false });

function refreshXp() {
  const next = CARS.find((c) => c.unlock > save.xp);
  const prev = [...CARS].reverse().find((c) => c.unlock <= save.xp);
  for (const id of ['titleXp', 'setupXp']) {
    const box = $(id); box.textContent = '';
    box.append(el('span', {}, 'XP'), el('b', {}, num(save.xp)));
    if (next) {
      const f = (save.xp - prev.unlock) / (next.unlock - prev.unlock);
      const bar = el('div', { class: 'bar' }, el('i', { style: `width:${Math.round(f * 100)}%` }));
      box.append(bar, el('span', {}, `${num(next.unlock - save.xp)} to ${next.name}`));
    } else box.append(el('span', {}, 'All cars unlocked'));
  }
}

// ------------------------------------------------------------------ setup screen
let carIdx = Math.max(0, CARS.findIndex((c) => c.id === save.car));
function buildSetup() {
  refreshXp();
  const modes = $('modes'); modes.textContent = '';
  for (const [id, m] of Object.entries(MODES)) {
    const b = el('button', { class: 'pick', type: 'button', role: 'radio', 'aria-checked': String(save.mode === id) }, el('b', {}, m.name), el('span', {}, m.blurb));
    b.addEventListener('click', () => { save.mode = id; store.save(); sound.blip(); buildSetup(); });
    modes.append(b);
  }
  const tl = $('tracks'); tl.textContent = '';
  for (const def of TRACKS) {
    const t = trackFor(def.id);
    const cv = el('canvas', { width: 240, height: 180 });
    const g = cv.getContext('2d');
    g.fillStyle = t.theme.night ? '#0e1020' : def.theme === 'dusk' ? '#3a1d10' : '#14301a';
    g.fillRect(0, 0, 240, 180);
    t.drawOutline(g, 240, 180, 18, { color: '#f6f6f7', width: 4, under: 'rgba(0,0,0,0.5)' });
    const b = store.best(def.id);
    const rec = el('div', { class: 'rec' });
    if (b.drift) rec.append(el('span', {}, 'Drift ', el('em', {}, num(b.drift)), ' ', medalDot(medalFor(b.drift, def.medals.drift))));
    if (b.lap) rec.append(el('span', {}, 'Lap ', el('em', {}, fmt(b.lap)), ' ', medalDot(medalFor(b.lap, def.medals.lap, true))));
    if (!b.drift && !b.lap) rec.append(el('span', {}, 'Not raced yet'));
    const dots = el('span', { class: 'dots', 'aria-label': `Difficulty ${def.difficulty} of 3` }, ...[1, 2, 3].map((i) => el('i', { class: i <= def.difficulty ? 'on' : '' })));
    const btn = el('button', { class: 'pick track-pick', type: 'button', role: 'radio', 'aria-checked': String(save.track === def.id), title: def.blurb },
      cv, el('div', {}, el('b', {}, def.name, dots), el('span', {}, def.blurb), rec));
    btn.addEventListener('click', () => { save.track = def.id; store.save(); sound.blip(); buildSetup(); startAttract(); });
    tl.append(btn);
  }
  drawGarage();
}
function medalDot(m) {
  if (!m) return null;
  return el('span', { style: `color:var(--${MEDALS[m]})`, title: MEDALS[m] + ' medal' }, '●');
}
function drawGarage() {
  const c = CARS[carIdx];
  const ok = unlocked(c);
  $('carName').textContent = c.name;
  $('carIdx').textContent = `${carIdx + 1} / ${CARS.length}`;
  $('carTag').textContent = c.tag;
  const r = ratings(c);
  const st = $('carStats'); st.textContent = '';
  for (const [k, label] of [['power', 'Power'], ['speed', 'Top speed'], ['grip', 'Grip'], ['drift', 'Slide']]) {
    st.append(el('span', {}, label), el('div', { class: 'sbar' }, el('i', { style: `width:${Math.round(Math.max(0.06, r[k]) * 100)}%` })));
  }
  st.append(el('span', {}, 'Specs'), el('span', { style: 'text-transform:none;letter-spacing:0;color:var(--text)' },
    `${c.power} kW · ${c.mass} kg · ${Math.round(topSpeed(c) * 3.6)} km/h`));
  const lock = $('carLock');
  lock.hidden = ok;
  lock.textContent = '';
  if (!ok) lock.append('LOCKED', el('small', {}, `${num(c.unlock - save.xp)} more XP to unlock`));
  const pi = save.paint[c.id] ?? 0;
  const ps = $('paints'); ps.textContent = '';
  PAINTS.forEach((p, i) => {
    const b = el('button', { type: 'button', role: 'radio', 'aria-checked': String(i === pi), 'aria-label': `Paint ${i + 1}`, style: `background:${p}` });
    b.addEventListener('click', () => { save.paint[c.id] = i; store.save(); sound.blip(); drawGarage(); });
    ps.append(b);
  });
  $('startBtn').disabled = !ok;
  $('startBtn').textContent = ok ? 'Start' : 'Locked';
  if (ok) { save.car = c.id; store.save(); }
  // car picture
  const cv = $('carCanvas'), g = cv.getContext('2d');
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, cv.width, cv.height);
  const s = Math.min(cv.width / (c.len * 1.6), cv.height / (c.wid * 2.6));
  g.setTransform(s, 0, 0, s, cv.width / 2, cv.height / 2);
  g.rotate(-0.35);
  if (!ok) g.filter = 'brightness(0.35) saturate(0.4)';
  drawCarShape(g, c, PAINTS[pi], { steer: 0.25 });
  g.filter = 'none';
}
$('carPrev').addEventListener('click', () => { carIdx = (carIdx - 1 + CARS.length) % CARS.length; sound.blip(); drawGarage(); });
$('carNext').addEventListener('click', () => { carIdx = (carIdx + 1) % CARS.length; sound.blip(); drawGarage(); });
$('startBtn').addEventListener('click', () => { sound.unlock(); startRace(); });

// ------------------------------------------------------------------ settings
function syncSettings() {
  for (const seg of document.querySelectorAll('.seg[data-set]')) {
    const k = seg.dataset.set, v = String(save.settings[k]);
    for (const b of seg.querySelectorAll('button')) b.setAttribute('aria-pressed', String(b.dataset.v === v));
  }
}
for (const seg of document.querySelectorAll('.seg[data-set]')) {
  seg.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    const k = seg.dataset.set;
    let v = b.dataset.v;
    if (v === 'true' || v === 'false') v = v === 'true'; else if (/^\d+$/.test(v)) v = Number(v);
    save.settings[k] = v; store.save();
    if (k === 'sound') { sound.unlock(); sound.setOn(v); }
    sound.blip();
    syncSettings();
  });
}
$('settingsDone').addEventListener('click', () => { sound.blip(); back(); });
$('wipeBtn').addEventListener('click', () => {
  if (!confirm('Reset all progress? Your XP, unlocked cars and best scores will be deleted.')) return;
  const s = save.settings;
  Object.assign(save, store.wipe()); save.settings = s; store.save();
  carIdx = 0; refreshXp(); back();
});

// ------------------------------------------------------------------ races
function startAttract() {
  const id = state === 'title' && $('setup').hidden ? TRACKS[Math.floor(Math.random() * TRACKS.length)].id : save.track;
  track = trackFor(params.get('track') || id);
  track.prepare();
  const c = CARS[Math.floor(Math.random() * CARS.length)];
  paint = PAINTS[(save.paint[c.id] ?? 0)];
  race = new Race(track, c, 'free', { auto: true });
  // start somewhere interesting
  const i = Math.floor(track.n * (0.15 + Math.random() * 0.6));
  race.car.reset(track.x[i], track.y[i], track.heading(i));
  track.locate(race.car.x, race.car.y, -1, race.loc);
  race.lastI = race.loc.i;
  fx.clear();
  snapCamera();
  state = 'title';
  $('hud').hidden = true;
  document.body.classList.remove('racing');
}

function startRace() {
  const c = carDef(save.car);
  if (!unlocked(c) && !params.has('demo')) return;
  track = trackFor(save.track);
  track.prepare();
  paint = PAINTS[save.paint[c.id] ?? 0];
  const b = store.best(track.def.id);
  const ghost = save.mode === 'time' && save.settings.ghost && b.ghost ? b.ghost : null;
  race = new Race(track, c, save.mode, { ghost });
  race.bestLap = b.lap || Infinity;
  race.recordLap = b.lap || Infinity;
  fx.clear();
  snapCamera();
  state = 'race';
  for (const s of SCREENS) $(s).hidden = true;
  $('hud').hidden = false;
  $('touch').hidden = !touchMode;
  $('scoreBox').hidden = save.mode === 'time';
  $('endBtn').hidden = save.mode !== 'free';
  $('feed').textContent = '';
  setMsg('', '');
  lastCount = 0;
  document.body.classList.add('racing');
  buildMinimap();
  canvas.focus();
}

function quitRace() { sound.car(null, false); startAttract(); }

function pause(on) {
  if (on && state === 'race') {
    state = 'paused'; sound.pause(true);
    show('pause');
  } else if (!on && state === 'paused') {
    state = 'race'; sound.pause(false);
    for (const s of SCREENS) $(s).hidden = true;
    last = performance.now();
    canvas.focus();
  }
}
$('pauseBtn').addEventListener('click', () => pause(true));
$('resumeBtn').addEventListener('click', () => pause(false));
$('restartBtn').addEventListener('click', () => { sound.pause(false); startRace(); });
$('quitBtn').addEventListener('click', () => { sound.pause(false); show('title'); });
$('endBtn').addEventListener('click', () => { sound.pause(false); race.end(); state = 'race'; finishRace(); });
$('againBtn').addEventListener('click', () => startRace());
input.on('pause', () => {
  if (state === 'race') pause(true);
  else if (state === 'paused' && !$('pause').hidden) pause(false);
  else if (!$('settings').hidden || !$('help').hidden) back();
  else if (!$('setup').hidden) show('title');
});
input.on('reset', () => { if (state === 'race' && race.state === 'running' && !race.finished) { race.respawn(); fx.breakSkid(); } });
input.on('camera', () => {
  if (state !== 'race') return;
  save.settings.camera = save.settings.camera === 'fixed' ? 'chase' : 'fixed'; store.save();
  toast(save.settings.camera === 'fixed' ? 'TOP-DOWN CAMERA' : 'CHASE CAMERA', 'good');
});
input.on('mute', () => { save.settings.sound = !save.settings.sound; store.save(); sound.unlock(); sound.setOn(save.settings.sound); if (state === 'race') toast(save.settings.sound ? 'SOUND ON' : 'SOUND OFF', 'good'); });
input.on('enter', (e) => {
  if (!$('title').hidden && document.activeElement === document.body) { show('setup'); }
});
input.on('blur', () => { if (state === 'race' && !params.has('demo')) pause(true); });
document.addEventListener('visibilitychange', () => { if (document.hidden && state === 'race') pause(true); });
input.bindTouch($('touch'));

function finishRace() {
  state = 'results';
  const r = race, def = track.def;
  // autopilot demo races (?demo) don't count towards your records or XP
  const b = params.has('demo') ? {} : store.best(def.id);
  const mode = r.mode;
  const stats = [];
  const news = {};
  let medal = 0, title = 'Finished', sub = `${def.name} · ${carDef(save.car).name} · ${MODES[mode].name}`;
  if (mode === 'drift') {
    medal = medalFor(r.score, def.medals.drift);
    if (r.score > (b.drift || 0)) { b.drift = r.score; news.score = true; }
    stats.push(['Drift score', num(r.score), news.score], ['Best combo', num(r.bestCombo)], ['Total time', fmt(r.time)]);
    title = medal ? `${MEDALS[medal][0].toUpperCase() + MEDALS[medal].slice(1)} medal` : 'Finished';
    const nextM = def.medals.drift.find((v) => v > r.score);
    if (nextM) sub += ` · ${num(nextM - r.score)} more for the next medal`;
  } else if (mode === 'time') {
    const bl = Math.min(...r.lapTimes);
    medal = medalFor(bl, def.medals.lap, true);
    if (!b.time || r.time < b.time) { b.time = r.time; news.time = true; }
    stats.push(['Best lap', fmt(bl), r.newLap], ['Total time', fmt(r.time), news.time], ['Laps', r.lapTimes.map(fmt).join('  ')]);
    title = medal ? `${MEDALS[medal][0].toUpperCase() + MEDALS[medal].slice(1)} medal` : 'Finished';
    const nextM = def.medals.lap.find((v) => v < bl);
    if (nextM) sub += ` · ${fmt(nextM)} for the next medal`;
  } else {
    if (r.bestCombo > (b.combo || 0)) { b.combo = r.bestCombo; news.combo = true; }
    stats.push(['Points', num(r.score)], ['Best combo', num(r.bestCombo), news.combo], ['Time', fmt(r.time)]);
    title = 'Session over';
  }
  if (r.lapTimes.length && mode !== 'time') stats.push(['Best lap', fmt(Math.min(...r.lapTimes)), r.newLap]);
  const xp = Math.round(r.score + (mode === 'time' ? 2500 + medal * 2500 : medal * 2000));
  const before = save.xp;
  if (!params.has('demo')) { save.xp += xp; save.races++; store.save(); }
  stats.push(['XP earned', '+' + num(xp)]);
  $('rMedal').className = 'medal ' + MEDALS[medal];
  $('rMedal').textContent = medal ? ['', 'B', 'S', 'G'][medal] : '—';
  $('rTitle').textContent = title;
  $('rSub').textContent = sub;
  const box = $('rStats'); box.textContent = '';
  for (const [k, v, n] of stats) box.append(el('div', { class: 'rstat' + (n ? ' new' : '') }, el('span', {}, k), el('b', {}, v)));
  const newCars = CARS.filter((c) => c.unlock > before && c.unlock <= save.xp);
  $('rUnlock').hidden = !newCars.length;
  $('rUnlock').textContent = newCars.length ? `New car unlocked: ${newCars.map((c) => c.name).join(', ')}` : '';
  if (medal) sound.win();
  setTimeout(() => { if (state === 'results') show('results'); }, 1200);
}

// race events → HUD, sound, effects
function handleEvents() {
  for (const e of race.events) {
    switch (e.type) {
      case 'count': if (e.n > 0) { setMsg(String(e.n), 'flash'); sound.count(false); } break;
      case 'go': setMsg('GO!', 'go flash'); sound.count(true); break;
      case 'bank': toast(`+${num(e.pts)}${e.mult > 1 ? ` <em>×${e.mult}</em>` : ''}`, 'good'); sound.bank(e.mult); break;
      case 'lost': toast(`${e.reason} −${num(e.pts)}`, 'bad'); sound.lost(); break;
      case 'wall':
        if (e.impact > 1.2) { fx.sparks(e.x, e.y, e.nx, e.ny, Math.min(16, 3 + e.impact * 1.5)); sound.hit(e.impact); }
        if (e.impact > 6) shake = Math.min(0.9, e.impact / 18);
        break;
      case 'lap': {
        const b = params.has('demo') ? {} : store.best(track.def.id);
        const record = e.time < (b.lap || Infinity);
        if (record) { b.lap = e.time; b.ghost = e.ghost; race.newLap = true; if (!params.has('demo')) store.save(); }
        const last = race.lap > race.laps;
        if (!last) setMsg(`${race.laps - race.lap === 1 ? 'FINAL LAP' : 'LAP ' + (race.lap + 1)}<small>${fmt(e.time)}${record ? ' · BEST LAP' : ''}</small>`, 'flash');
        sound.lap(record);
        break;
      }
      case 'finish': setMsg('FINISH', 'go flash'); finishRace(); break;
    }
  }
  race.events.length = 0;
}

let msgTimer = 0;
function setMsg(html, cls) {
  const m = $('msg');
  m.className = 'msg';
  void m.offsetWidth; // restart the animation
  m.className = 'msg ' + cls;
  m.innerHTML = html;
  clearTimeout(msgTimer);
  if (html) msgTimer = setTimeout(() => { if (m.innerHTML === html) m.innerHTML = ''; }, 1300);
}
function toast(html, cls) {
  const f = $('feed');
  const p = el('div', { class: 'pop ' + cls });
  p.innerHTML = html;
  f.prepend(p);
  while (f.children.length > 3) f.lastChild.remove();
  setTimeout(() => p.remove(), 1400);
}

// ------------------------------------------------------------------ minimap
let mini = null;
function buildMinimap() {
  const cv = $('mini');
  const off = document.createElement('canvas');
  off.width = cv.width; off.height = cv.height;
  const g = off.getContext('2d');
  const tf = track.drawOutline(g, off.width, off.height, 12, { color: 'rgba(246,246,247,0.85)', width: 3, under: 'rgba(0,0,0,0.6)' });
  mini = { off, tf, g: cv.getContext('2d') };
}
function drawMinimap() {
  const { off, tf, g } = mini;
  g.clearRect(0, 0, off.width, off.height);
  g.drawImage(off, 0, 0);
  const gh = race.ghostAt(race.time);
  if (gh) { g.fillStyle = 'rgba(255,255,255,0.6)'; g.beginPath(); g.arc(tf.ox + gh.x * tf.s, tf.oy + gh.y * tf.s, 4, 0, 7); g.fill(); }
  const c = race.car;
  g.fillStyle = '#ff6b1a'; g.strokeStyle = '#0a0a0b'; g.lineWidth = 2;
  g.beginPath(); g.arc(tf.ox + c.x * tf.s, tf.oy + c.y * tf.s, 5.5, 0, 7); g.fill(); g.stroke();
}

// ------------------------------------------------------------------ HUD
const hud = {};
for (const id of ['hLap', 'hTime', 'hBest', 'hLaps', 'hScore', 'hSpeed', 'hGear', 'hAngle', 'combo', 'cPts', 'cMult', 'cBar', 'cTag']) hud[id] = $(id);
const setText = (e, v) => { if (e._v !== v) { e._v = v; e.textContent = v; } };
function updateHud() {
  const r = race, c = r.car;
  const lapNow = Math.min(r.lap, r.laps);
  setText(hud.hLap, r.laps === Infinity ? `${r.lap}` : `${lapNow}/${r.laps}`);
  setText(hud.hTime, fmt(r.state === 'running' ? (r.finished ? r.lapTimes[r.lapTimes.length - 1] || 0 : r.time - r.lapStart) : 0));
  setText(hud.hBest, fmt(r.bestLap));
  setText(hud.hLaps, r.lapTimes.map((t, i) => `L${i + 1}  ${fmt(t)}`).join('\n'));
  setText(hud.hScore, num(r.score));
  setText(hud.hSpeed, String(Math.round(c.speed * 3.6)));
  setText(hud.hGear, c.gear === 0 ? 'R' : String(c.gear));
  hud.hAngle.style.width = `${Math.min(100, ((c.driftAngle || 0) / 60) * 100)}%`;
  const cb = r.combo, showCombo = cb.active && r.mode !== 'time';
  hud.combo.classList.toggle('on', showCombo);
  if (showCombo) {
    hud.combo.classList.toggle('grace', cb.grace > 0);
    setText(hud.cPts, num(cb.pts));
    setText(hud.cMult, `×${cb.mult}`);
    hud.cBar.style.width = cb.mult >= SCORE.maxMult ? '100%' : `${((cb.time % SCORE.multEvery) / SCORE.multEvery) * 100}%`;
    const ang = c.driftAngle || 0;
    setText(hud.cTag, cb.wall ? 'WALL KISS ×1.5' : ang > 48 ? 'HUGE ANGLE' : cb.time > 8 ? 'ENDLESS DRIFT' : cb.mult >= 3 ? 'ON FIRE' : '');
  }
  if (r.wrongWay && !r.finished) { if ($('msg').innerHTML !== 'WRONG WAY') { $('msg').className = 'msg warn'; $('msg').innerHTML = 'WRONG WAY'; } }
  else if ($('msg').innerHTML === 'WRONG WAY') $('msg').innerHTML = '';
  drawMinimap();
}

// ------------------------------------------------------------------ camera + drawing
let shake = 0;
function snapCamera() {
  const c = race.car;
  cam.x = c.x; cam.y = c.y; cam.a = c.h; cam.z = baseZoom();
}
const ZOOM = Math.min(3, Math.max(0.5, Number(params.get('zoom')) || 1)); // ?zoom=1.6 for close-up screenshots
function baseZoom() { return Math.max(5, Math.min(W, H * 1.25) / 54) * ZOOM; }

function updateCamera(dt) {
  const c = race.car;
  const chase = state !== 'title' && save.settings.camera === 'chase';
  const look = chase ? 0.25 : 0.42;
  const tx = c.x + c.vx * look, ty = c.y + c.vy * look;
  const k = Math.min(1, dt * 5);
  cam.x += (tx - cam.x) * k; cam.y += (ty - cam.y) * k;
  let da = c.h - cam.a; da = Math.atan2(Math.sin(da), Math.cos(da));
  // follow the direction of travel more than the nose, so drifts don't swing the camera
  const travel = c.speed > 4 ? Math.atan2(c.vy, c.vx) : c.h;
  let dt2 = travel - cam.a; dt2 = Math.atan2(Math.sin(dt2), Math.cos(dt2));
  cam.a += (da * 0.35 + dt2 * 0.65) * Math.min(1, dt * 3);
  const zt = baseZoom() * (1 - 0.26 * Math.min(1, c.speed / 50)) * (state === 'title' ? 1.08 : 1);
  cam.z += (zt - cam.z) * Math.min(1, dt * 2);
  shake = Math.max(0, shake - dt * 2);
}

function render() {
  const chase = state !== 'title' && save.settings.camera === 'chase';
  const z = cam.z * dpr;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const sx = (Math.random() - 0.5) * shake * 8 * dpr, sy = (Math.random() - 0.5) * shake * 8 * dpr;
  let view;
  if (chase) {
    ctx.translate(canvas.width / 2 + sx, canvas.height * 0.64 + sy);
    ctx.rotate(-cam.a - Math.PI / 2);
    ctx.scale(z, z);
    ctx.translate(-cam.x, -cam.y);
    const r = Math.hypot(canvas.width, canvas.height) / z;
    view = { x0: cam.x - r, y0: cam.y - r, x1: cam.x + r, y1: cam.y + r };
  } else {
    // on the title screen keep the car clear of the menu on the left
    const shift = state === 'title' && W > 760 ? canvas.width * 0.16 : 0;
    ctx.setTransform(z, 0, 0, z, canvas.width / 2 + shift - cam.x * z + sx, canvas.height / 2 - cam.y * z + sy);
    const hw = canvas.width / 2 / z, hh = canvas.height / 2 / z, so = shift / z;
    view = { x0: cam.x - hw - so - 2, y0: cam.y - hh - 2, x1: cam.x + hw - so + 2, y1: cam.y + hh + 2 };
  }
  track.drawGround(ctx, view);
  fx.drawSkids(ctx, track.theme.skid, view);
  track.drawWalls(ctx);
  track.drawScenery(ctx, view);

  const night = track.theme.night;
  // ghost
  const gh = race.ghostAt(race.time);
  if (gh) {
    ctx.save(); ctx.translate(gh.x, gh.y); ctx.rotate(gh.h); ctx.globalAlpha = 0.38;
    drawCarShape(ctx, race.car.def, '#f2f2f2', { noShadow: true });
    ctx.restore(); ctx.globalAlpha = 1;
  }
  const c = race.car;
  if (night) {
    ctx.save(); ctx.translate(c.x, c.y); ctx.rotate(c.h);
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(c.def.len / 2, 0, 0, c.def.len / 2, 0, 30);
    g.addColorStop(0, 'rgba(255,245,210,0.26)'); g.addColorStop(0.5, 'rgba(255,245,210,0.1)'); g.addColorStop(1, 'rgba(255,245,210,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.moveTo(c.def.len / 2, -0.8); ctx.lineTo(c.def.len / 2 + 30, -11); ctx.lineTo(c.def.len / 2 + 30, 11); ctx.lineTo(c.def.len / 2, 0.8); ctx.closePath(); ctx.fill();
    ctx.restore();
  }
  ctx.save(); ctx.translate(c.x, c.y); ctx.rotate(c.h);
  drawCarShape(ctx, c.def, paint, { steer: c.steer, brake: c.braking || (c.vf < -0.5), night });
  ctx.restore();
  fx.draw(ctx);
}

// tyre smoke and skid marks
const wheels = [];
let smokeAcc = 0;
function effects(dt) {
  const c = race.car;
  c.rearWheels(wheels);
  const slip = c.rearSlip;
  const strength = Math.min(1, Math.max(0, (slip - 2.2) / 7));
  if (!c.onGrass) fx.skid(wheels, strength); else fx.breakSkid();
  smokeAcc += dt * (c.onGrass ? Math.min(30, c.speed * 1.2) : strength * 55);
  const col = c.onGrass ? (track.def.theme === 'dusk' ? [190, 130, 80] : track.theme.night ? [60, 70, 90] : [110, 95, 60]) : track.theme.smoke;
  while (smokeAcc > 1) {
    smokeAcc -= 1;
    const w = wheels[Math.random() < 0.5 ? 0 : 1];
    if (c.onGrass) fx.dust(w.x, w.y, c.vx, c.vy, col);
    else fx.smoke(w.x, w.y, c.vx, c.vy, strength, col);
  }
  fx.update(dt);
}

// ------------------------------------------------------------------ main loop
function frame(now) {
  requestAnimationFrame(frame);
  let dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (state === 'paused') { render(); return; }
  const inp = input.poll();
  acc += dt;
  const assist = ASSIST[save.settings.assist] ?? 0.5;
  const drive = state === 'race' && !params.has('demo') ? inp : {};
  while (acc >= STEP) {
    acc -= STEP;
    race.step(STEP, drive, assist);
  }
  if (state === 'race' || state === 'results') handleEvents();
  else race.events.length = 0;
  effects(dt);
  updateCamera(dt);
  render();
  if (state === 'race' || state === 'results') updateHud();
  sound.car(race.car, state === 'race' || state === 'results');
}

// ------------------------------------------------------------------ start
startAttract();
refreshXp();
if (params.has('demo')) {
  // used to make screenshots: the autopilot drives a real race with the HUD on
  save.track = params.get('track') || save.track;
  save.mode = params.get('mode') || 'drift';
  save.car = params.get('car') || save.car;
  startRace();
  race.auto = true;
  race.state = 'running';
  if (params.has('shot')) $('hud').hidden = true;
} else show('title');
requestAnimationFrame(frame);
