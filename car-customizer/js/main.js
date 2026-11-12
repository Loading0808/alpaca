// APEX GARAGE — application entry point.
import * as THREE from 'three';
import { CARS, SUSPENSIONS, byId, defaultBuild } from './data.js';
import { createStage } from './scene.js';
import { createMaterials, applyAppearance } from './materials.js';
import { Car } from './car.js';
import { EngineAudio } from './audio.js';
import { computeStats, buildSheet, resolve, maxDrop, slamDrop } from './stats.js';
import { initUI } from './ui.js';
import { Drive, TRANSMISSIONS } from './drive.js';
import { WORLDS } from './world.js';
import { Records } from './score.js';

const STORE = 'apex-garage-saves-v2', OLD_STORE = 'apex-garage-build-v1';
const $ = id => document.getElementById(id);

const stage = createStage($('view'));
const M = createMaterials();
const car = new Car(M);
stage.scene.add(car.root);
const audio = new EngineAudio();
const drive = new Drive(stage, car, audio);

const app = {
  build: defaultBuild(CARS[0]),
  toggles: { xray: false, lights: false, turntable: false, dyno: false },
  aired: false, slot: null, driving: false,
  car: () => byId(CARS, app.build.carId),
  stats: () => computeStats(app.build),
  stockStats: () => computeStats(defaultBuild(app.car())),
  sheet: () => buildSheet(app.build),
  statsFor: b => computeStats(b),
};

// ---- engine state
const eng = { running: false, cranking: 0, rpm: 0, throttle: 0, input: 0, cut: 0, boost: 0 };
let airOffset = 0, stats = app.stats();

function rebuild() {
  car.build(app.build);
  applyAppearance(M, app.build);
  car.applyStance(app.build, currentDrop());
  const S = car.S;
  stage.blob.scale.set(S.car.dims.L * 1.12, S.car.dims.W * 1.35, 1);
  audio.configure(resolve(app.build));
}
const currentDrop = () => app.build.susp.drop + airOffset;

/** Apply a mutation to the build. level: 'rebuild' | 'look' | 'stance'. */
app.change = (fn, level = 'rebuild', rerender = true) => {
  fn(app.build);
  if (level === 'rebuild') rebuild();
  else if (level === 'look') applyAppearance(M, app.build);
  else car.applyStance(app.build, currentDrop());
  stats = app.stats();
  ui.refresh(rerender);
};

app.selectCar = id => {
  if (id === app.build.carId) return;
  stopEngine(); app.slot = null;
  app.build = defaultBuild(byId(CARS, id)); app.aired = false; airOffset = 0;
  rebuild(); stats = app.stats(); ui.refresh(); app.view('q');
  ui.toast(`${app.car().brand} ${app.car().name} rolled in`);
};

app.view = (name, dur) => {
  const S = car.S, L = S.car.dims.L, t = [0, 0.6, 0];
  const far = L * 1.75;
  const v = {
    q: [[far * 0.72, 1.75, far * 0.74], t],
    front: [[far * 1.05, 1.05, 0.01], t],
    side: [[0, 0.95, far * 1.08], t],
    rear: [[-far * 1.05, 1.25, 0.01], t],
    top: [[0.01, far * 1.45, 0.02], [0, 0.3, 0]],
    wheel: [[S.xf + 1.5, 0.6, S.W / 2 + 2.3], [S.xf, 0.36, S.W / 2]],
    engine: [[car.engineX + (S.car.layout === 'front' ? 2.4 : -2.4), 2.5, 2.3], [car.engineX, 0.55, 0]],
  }[name];
  if (name === 'engine' && !app.toggles.xray) app.toggle('xray');
  stage.flyTo(v[0], v[1], dur);
};

app.toggle = name => {
  const on = app.toggles[name] = !app.toggles[name];
  if (name === 'xray') car.setXray(on);
  if (name === 'lights') car.setLights(on);
  if (name === 'turntable') stage.controls.autoRotate = on;
  if (name === 'dyno' && on && !eng.running) ui.toast('Dyno armed — start the engine and rev to spin the driven wheels');
  ui.refresh(false);
};

app.toggleAir = () => {
  app.aired = !app.aired;
  if (audio.ensure()) audio._burst({ dur: app.aired ? 0.9 : 0.6, f0: app.aired ? 5200 : 2400, f1: app.aired ? 1200 : 4200, q: 0.9, gain: 0.16 });
};

// ---- saved cars (any number, stored in this browser)
const readSaves = () => {
  try {
    const list = JSON.parse(localStorage.getItem(STORE)) || [];
    const old = localStorage.getItem(OLD_STORE);                      // migrate the single save from v1
    if (old) { list.push({ id: 'v1', name: 'My first build', build: JSON.parse(old), ts: Date.now() }); localStorage.removeItem(OLD_STORE); localStorage.setItem(STORE, JSON.stringify(list)); }
    return list.filter(s => s && s.build && CARS.some(c => c.id === s.build.carId));
  } catch (_) { return []; }
};
const writeSaves = list => { try { localStorage.setItem(STORE, JSON.stringify(list)); return true; } catch (_) { ui.toast('Browser storage is full or blocked'); return false; } };
const snapshot = () => JSON.parse(JSON.stringify(app.build));
app.saves = readSaves;
app.defaultName = () => { const c = app.car(), n = readSaves().filter(s => s.build.carId === c.id).length; return `${c.name.replace(/\s*\(.*\)/, '')} build ${n + 1}`; };
app.saveNew = name => {
  const list = readSaves(), id = 's' + Date.now().toString(36);
  list.unshift({ id, name: (name || '').trim().slice(0, 40) || app.defaultName(), build: snapshot(), ts: Date.now() });
  if (writeSaves(list)) { app.slot = id; ui.refresh(); ui.toast(`Saved “${list[0].name}” — ${list.length} car${list.length > 1 ? 's' : ''} in your garage`); }
};
app.saveOver = id => {
  const list = readSaves(), s = list.find(x => x.id === id); if (!s) return app.saveNew();
  s.build = snapshot(); s.ts = Date.now();
  if (writeSaves(list)) { app.slot = id; ui.refresh(); ui.toast(`Updated “${s.name}”`); }
};
app.save = () => (app.slot && readSaves().some(s => s.id === app.slot) ? app.saveOver(app.slot) : app.saveNew());
app.loadSave = id => {
  const s = readSaves().find(x => x.id === id); if (!s) return ui.toast('That save no longer exists');
  stopEngine();
  const base = defaultBuild(byId(CARS, s.build.carId));
  app.build = { ...base, ...s.build, paint: { ...base.paint, ...s.build.paint }, rim: { ...base.rim, ...s.build.rim }, susp: { ...base.susp, ...s.build.susp } };
  app.aired = false; airOffset = 0; app.slot = id;
  rebuild(); stats = app.stats(); ui.refresh(); ui.toast(`Loaded “${s.name}”`);
};
app.deleteSave = id => { const list = readSaves().filter(s => s.id !== id); if (writeSaves(list)) { if (app.slot === id) app.slot = null; ui.refresh(); ui.toast('Save deleted'); } };
app.renameSave = (id, name) => { const list = readSaves(), s = list.find(x => x.id === id); if (s && name.trim()) { s.name = name.trim().slice(0, 40); writeSaves(list); } };

// ---- drive mode
const keys = {};
const hud = { root: $('driveHud'), speed: $('hudSpeed'), gear: $('hudGear'), lap: $('hudLap'), last: $('hudLast'), best: $('hudBest'), laps: $('hudLaps'), place: $('hudPlace'),
  score: $('hudScore'), mult: $('hudMult'), bar: $('hudComboBar'), drift: $('hudDrift'), pb: $('hudPb'), feed: $('hudFeed'), trans: $('hudTrans'), gearBox: $('hudGearBox') };
const fmtLap = t => t ? `${Math.floor(t / 60)}:${(t % 60).toFixed(2).padStart(5, '0')}` : '—:——.——';
const num = v => Math.round(v).toLocaleString('en-US');
const PREF = 'apex-garage-drive-v1';
const prefs = (() => { try { return JSON.parse(localStorage.getItem(PREF)) || {}; } catch (_) { return {}; } })();
const savePrefs = () => { try { localStorage.setItem(PREF, JSON.stringify(prefs)); } catch (_) { /* ignore */ } };
drive.setTransmission(prefs.trans || 'auto');
let boardWorld = prefs.world || 'highway';

function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
function renderDriveMenu() {
  const worlds = $('dmWorlds'), trans = $('dmTrans'), tabs = $('dmTabs'), board = $('dmBoard');
  worlds.replaceChildren(...WORLDS.map(w => {
    const b = el('button', 'card world'), top = el('div', 'card-top'); top.append(el('b', '', w.name), el('em', '', `Best ${num(Records.best(w.id))}`));
    b.append(top, el('p', '', w.desc)); b.onclick = () => app.drive(w.id); return b;
  }));
  trans.replaceChildren(...TRANSMISSIONS.map(t => { const b = el('button', 'chip' + (drive.trans === t.id ? ' on' : ''), t.name); b.title = t.desc; b.onclick = () => { app.setTransmission(t.id); renderDriveMenu(); }; return b; }));
  $('dmTransDesc').textContent = TRANSMISSIONS.find(t => t.id === drive.trans).desc;
  tabs.replaceChildren(...WORLDS.map(w => { const b = el('button', 'chip' + (boardWorld === w.id ? ' on' : ''), w.name); b.onclick = () => { boardWorld = w.id; renderDriveMenu(); }; return b; }));
  const me = Records.name(), rows = Records.board(boardWorld);
  board.replaceChildren(...rows.map((r, i) => {
    const tr = el('tr', r.target ? 'target' : r.name === me ? 'me' : '');
    tr.append(el('td', '', String(i + 1)), el('td', '', r.name), el('td', '', r.car), el('td', '', num(r.score))); return tr;
  }));
  if (!rows.some(r => !r.target)) { const tr = el('tr', 'empty'), td = el('td', '', 'No runs recorded yet — go and set one.'); td.colSpan = 4; tr.append(td); board.append(tr); }
  $('dmName').value = me;
}
app.setTransmission = id => { drive.setTransmission(id); prefs.trans = drive.trans; savePrefs(); hud.trans.textContent = TRANSMISSIONS.find(t => t.id === drive.trans).name; };
app.openDriveMenu = () => { renderDriveMenu(); $('driveMenu').classList.add('show'); };
$('dmName').addEventListener('change', e => { Records.setName(e.target.value); renderDriveMenu(); });
$('dmClear').addEventListener('click', () => { if (confirm('Clear all saved scores for this map?')) { Records.clear(boardWorld); renderDriveMenu(); } });

const feed = (label, pts, kind) => {
  const d = el('div', 'feed-item ' + kind); d.append(el('span', '', label)); if (pts) d.append(el('b', '', '+' + num(pts)));
  hud.feed.prepend(d); while (hud.feed.children.length > 4) hud.feed.lastChild.remove();
  setTimeout(() => d.classList.add('out'), 2200); setTimeout(() => d.remove(), 2700);
};
drive.score.onEvent = e => feed(e.label, e.pts, e.kind);
drive.onNotice = msg => feed(msg, 0, 'minor');

app.drive = id => {
  $('driveMenu').classList.remove('show');
  if (app.toggles.xray) app.toggle('xray');
  if (app.toggles.turntable) app.toggle('turntable');
  airOffset = 0; app.aired = false; car.applyStance(app.build, currentDrop());
  const world = drive.enter(id, stats, car.r);
  prefs.world = boardWorld = world.id; savePrefs();
  app.driving = true; document.body.classList.add('driving');
  hud.place.textContent = world.name; hud.laps.style.display = world.hasLaps ? '' : 'none';
  hud.trans.textContent = TRANSMISSIONS.find(t => t.id === drive.trans).name; hud.feed.replaceChildren();
  if (!eng.running) { audio.start(); eng.running = true; ui.setRunning(true); }
  eng.cranking = 0; eng.input = 0;
  if (drive.trans !== 'auto') feed(drive.trans === 'manual' ? 'Manual: hold Left Shift and press E / Q to change gear' : 'Semi-automatic: E shifts up, Q shifts down', 0, 'minor');
  $('view').focus();
};
app.exitDrive = () => {
  if (!app.driving) return;
  const res = drive.exit(); app.driving = false; document.body.classList.remove('driving');
  for (const k in keys) keys[k] = false;
  eng.throttle = 0; eng.input = 0; eng.rpm = car.r.engine.idle;
  car.applyStance(app.build, currentDrop()); app.view('q', 0.01);
  if (res) ui.toast(`Run banked: ${num(res.total)} pts${res.pb ? ' — new personal best!' : ''}${res.rank ? ` · #${res.rank} on the board` : ''}`);
};
app.reset = () => { app.slot = null; app.build = defaultBuild(app.car()); app.aired = false; airOffset = 0; rebuild(); stats = app.stats(); ui.refresh(); ui.toast('Returned to factory spec'); };
app.copySheet = () => {
  const s = app.sheet(), st = app.stats();
  const txt = [`APEX GARAGE — ${app.car().brand} ${app.car().name}`, `${Math.round(st.hp)} hp · ${Math.round(st.tq)} Nm · ${Math.round(st.weight)} kg · 0-100 ${st.t100.toFixed(2)} s`, '',
    ...s.items.map(i => `${i.cat.padEnd(13)} ${i.name.padEnd(42)} $${i.price.toLocaleString('en-US')}`), '', `TOTAL $${s.total.toLocaleString('en-US')}`].join('\n');
  (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).then(() => ui.toast('Build sheet copied'), () => ui.toast('Clipboard unavailable'));
};
app.shot = () => {
  stage.renderer.render(stage.scene, stage.camera);
  const a = document.createElement('a'); a.download = `apex-garage-${app.build.carId}.png`; a.href = stage.renderer.domElement.toDataURL('image/png'); a.click();
};

// ---- engine control
function startEngine() {
  if (eng.running || eng.cranking > 0) return;
  if (!audio.start()) ui.toast('Audio is unavailable in this browser — running silent');
  eng.cranking = 0.85; eng.running = true; eng.rpm = 220; ui.setRunning(true);
}
function stopEngine() {
  if (!eng.running) return;
  eng.running = false; eng.cranking = 0; eng.throttle = 0; audio.stop(); ui.setRunning(false);
}
audio.onPop = i => car.pop(i);

function stepEngine(dt) {
  if (!eng.running) { eng.rpm += (0 - eng.rpm) * Math.min(1, dt * 4); eng.boost = 0; return; }
  const e = car.r.engine;
  if (eng.cranking > 0) {
    eng.cranking -= dt;
    eng.rpm = 230 + Math.sin(performance.now() / 45) * 40;
    if (eng.cranking <= 0) eng.rpm = e.idle * 1.9;          // catch + flare
    eng.boost = audio.update(dt, eng.rpm, 0.25);
    return;
  }
  eng.throttle += (eng.input - eng.throttle) * Math.min(1, dt * 14);
  eng.cut = Math.max(0, eng.cut - dt);
  if (eng.rpm >= e.redline) eng.cut = 0.075;                 // rev limiter: ignition cut
  const th = eng.cut > 0 ? 0 : eng.throttle;
  const lump = (e.lump || 0) * 90 + 18, t = performance.now() / 1000;
  const idle = e.idle + Math.sin(t * 7.3) * lump * 0.5 + Math.sin(t * 2.1) * lump * 0.5;
  const lag = car.r.turbo.id === 'big' ? 0.8 : 1;
  const target = th > 0.02 ? idle + th * (e.redline * 1.04 - idle) : idle;
  const rate = target > eng.rpm ? e.rev * lag * (0.7 + 0.6 * eng.boost) : (eng.cut > 0 ? 9 : 1.5 + e.rev * 0.22);
  eng.rpm += (target - eng.rpm) * (1 - Math.exp(-rate * dt));
  eng.boost = audio.update(dt, eng.rpm, eng.throttle, eng.cut > 0);
}

// ---- input
const rev = $('btnRev');
const press = on => { eng.input = on && eng.running ? 1 : 0; rev.classList.toggle('down', !!eng.input); };
rev.addEventListener('pointerdown', e => { rev.setPointerCapture(e.pointerId); press(true); });
for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) rev.addEventListener(ev, () => press(false));
$('btnStart').addEventListener('click', () => (eng.running ? stopEngine() : startEngine()));
$('vol').addEventListener('input', e => audio.setVolume(+e.target.value));
$('btnSave').addEventListener('click', app.save); $('btnLoad').addEventListener('click', () => ui.setCategory('garage'));
$('btnDrive').addEventListener('click', () => app.openDriveMenu());
$('driveClose').addEventListener('click', () => $('driveMenu').classList.remove('show'));
$('hudExit').addEventListener('click', () => app.exitDrive()); $('hudReset').addEventListener('click', () => drive.respawn()); $('hudCam').addEventListener('click', () => drive.nextCamera());
$('btnReset').addEventListener('click', app.reset); $('btnShot').addEventListener('click', app.shot);
window.addEventListener('keydown', e => {
  if (e.target.matches('input, textarea')) return;
  if (app.driving) {
    keys[e.code] = true;
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
    if (e.repeat) return;
    if (e.code === 'Escape') app.exitDrive(); else if (e.code === 'KeyR') drive.respawn(); else if (e.code === 'KeyC') drive.nextCamera(); else if (e.code === 'KeyL') app.toggle('lights');
    else if (e.code === 'KeyE') drive.shift(1, !!keys.ShiftLeft); else if (e.code === 'KeyQ') drive.shift(-1, !!keys.ShiftLeft);
    else if (e.code === 'KeyT') { const i = TRANSMISSIONS.findIndex(t => t.id === drive.trans); app.setTransmission(TRANSMISSIONS[(i + 1) % TRANSMISSIONS.length].id); feed('Transmission: ' + TRANSMISSIONS.find(t => t.id === drive.trans).name, 0, 'minor'); }
    return;
  }
  if (e.repeat && e.code !== 'Space') return;
  if (e.code === 'Space' || e.code === 'KeyW') { e.preventDefault(); press(true); }
  else if (e.code === 'KeyE') eng.running ? stopEngine() : startEngine();
  else if (e.code === 'KeyX') app.toggle('xray');
  else if (e.code === 'KeyL') app.toggle('lights');
  else if (e.code === 'KeyT') app.toggle('turntable');
});
window.addEventListener('keyup', e => { keys[e.code] = false; if (!app.driving && (e.code === 'Space' || e.code === 'KeyW')) press(false); });
window.addEventListener('blur', () => { press(false); for (const k in keys) keys[k] = false; });

// ---- boot
const ui = initUI(app);
rebuild();
ui.refresh();
app.view('q');
requestAnimationFrame(() => $('loader').classList.add('hide'));

const clock = new THREE.Clock();
function frame() {
  const dt = Math.min(0.1, clock.getDelta());
  // air suspension animation
  const susp = byId(SUSPENSIONS, app.build.susp.type);
  const airTarget = susp.air && app.aired ? Math.max(0, slamDrop(app.car()) - app.build.susp.drop) : 0;
  if (Math.abs(airTarget - airOffset) > 1e-4) {
    airOffset += Math.sign(airTarget - airOffset) * Math.min(Math.abs(airTarget - airOffset), dt * 0.06);
    car.applyStance(app.build, currentDrop());
  }
  if (app.driving) {
    const d = drive.update(dt, {
      fwd: keys.KeyW || keys.ArrowUp ? 1 : 0, back: keys.KeyS || keys.ArrowDown ? 1 : 0,
      steer: (keys.KeyA || keys.ArrowLeft ? 1 : 0) - (keys.KeyD || keys.ArrowRight ? 1 : 0), hand: keys.Space ? 1 : 0, clutch: keys.ShiftLeft ? 1 : 0,
    });
    eng.rpm = d.rpm; eng.throttle = d.throttle; eng.boost = d.boost;
    car.update(dt, eng.rpm, 0, true, false, stats.redline);
    hud.speed.textContent = Math.round(d.kmh); hud.gear.textContent = d.gear;
    hud.gearBox.classList.toggle('shift', d.shiftUp); hud.gearBox.classList.toggle('clutch', !!d.clutch);
    hud.score.textContent = num(d.score); hud.mult.textContent = '×' + d.mult.toFixed(1); hud.mult.classList.toggle('hot', d.mult > 1);
    hud.bar.style.width = Math.max(0, d.comboT * 100) + '%'; hud.pb.textContent = num(Math.max(d.best, d.score));
    hud.drift.textContent = d.drift >= 5 ? `Drift ${num(d.drift)}` : '';
    if (d.hasLaps) { hud.lap.textContent = d.lap.running ? fmtLap(d.time - d.lap.start) : 'Cross the line'; hud.last.textContent = fmtLap(d.lap.last); hud.best.textContent = fmtLap(d.lap.best); }
  } else {
    stepEngine(dt);
    car.update(dt, eng.rpm, eng.throttle, eng.running, app.toggles.dyno, stats.redline);
  }
  ui.drawTach(eng.rpm, eng.running, eng.boost, stats);
  stage.update(dt);
  stage.renderer.render(stage.scene, stage.camera);
  requestAnimationFrame(frame);
}
frame();

// handy for tinkering from the DevTools console
window.apex = { app, car, stage, audio, eng, drive, keys, maxDrop, Records };
