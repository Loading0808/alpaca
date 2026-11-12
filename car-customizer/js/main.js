// APEX GARAGE — application entry point.
import * as THREE from 'three';
import { CARS, SUSPENSIONS, byId, defaultBuild } from './data.js';
import { createStage } from './scene.js';
import { createMaterials, applyAppearance } from './materials.js';
import { Car } from './car.js';
import { EngineAudio } from './audio.js';
import { computeStats, buildSheet, resolve, maxDrop, slamDrop } from './stats.js';
import { initUI } from './ui.js';

const STORE = 'apex-garage-build-v1';
const $ = id => document.getElementById(id);

const stage = createStage($('view'));
const M = createMaterials();
const car = new Car(M);
stage.scene.add(car.root);
const audio = new EngineAudio();

const app = {
  build: defaultBuild(CARS[0]),
  toggles: { xray: false, lights: false, turntable: false, dyno: false },
  aired: false,
  car: () => byId(CARS, app.build.carId),
  stats: () => computeStats(app.build),
  stockStats: () => computeStats(defaultBuild(app.car())),
  sheet: () => buildSheet(app.build),
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
  stopEngine();
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

app.save = () => { localStorage.setItem(STORE, JSON.stringify(app.build)); ui.toast('Build saved to this browser'); };
app.load = () => {
  try {
    const b = JSON.parse(localStorage.getItem(STORE));
    if (!b || !CARS.some(c => c.id === b.carId)) return ui.toast('No saved build found');
    stopEngine();
    app.build = { ...defaultBuild(byId(CARS, b.carId)), ...b }; app.aired = false; airOffset = 0;
    rebuild(); stats = app.stats(); ui.refresh(); ui.toast('Saved build loaded');
  } catch (_) { ui.toast('Saved build could not be read'); }
};
app.reset = () => { app.build = defaultBuild(app.car()); app.aired = false; airOffset = 0; rebuild(); stats = app.stats(); ui.refresh(); ui.toast('Returned to factory spec'); };
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
$('btnSave').addEventListener('click', app.save); $('btnLoad').addEventListener('click', app.load);
$('btnReset').addEventListener('click', app.reset); $('btnShot').addEventListener('click', app.shot);
window.addEventListener('keydown', e => {
  if (e.target.matches('input, textarea') || e.repeat && e.code !== 'Space') return;
  if (e.code === 'Space' || e.code === 'KeyW') { e.preventDefault(); press(true); }
  else if (e.code === 'KeyE') eng.running ? stopEngine() : startEngine();
  else if (e.code === 'KeyX') app.toggle('xray');
  else if (e.code === 'KeyL') app.toggle('lights');
  else if (e.code === 'KeyT') app.toggle('turntable');
});
window.addEventListener('keyup', e => { if (e.code === 'Space' || e.code === 'KeyW') press(false); });
window.addEventListener('blur', () => press(false));

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
  stepEngine(dt);
  car.update(dt, eng.rpm, eng.throttle, eng.running, app.toggles.dyno, stats.redline);
  ui.drawTach(eng.rpm, eng.running, eng.boost, stats);
  stage.update(dt);
  stage.renderer.render(stage.scene, stage.camera);
  requestAnimationFrame(frame);
}
frame();

// handy for tinkering from the DevTools console
window.apex = { app, car, stage, audio, eng, maxDrop };
