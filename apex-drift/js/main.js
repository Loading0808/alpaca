// APEX DRIFT — a drifting game built on Apex Garage.
// The garage, the 3D cars, the locations, the driving physics, the cameras and the engine sound are
// Apex Garage's own modules (../car-customizer/js). This file adds the drift game around them:
// picking a car (stock, or one you built and saved in Apex Garage), picking a location and mode,
// drift scoring, a countdown, laps or a timer, records and a results screen.
import * as THREE from 'three';
import { BRANDS, CARS, PAINT_COLORS, AIR_PRESETS, byId, defaultBuild, defaultSetup } from '../../car-customizer/js/data.js';
import { createStage } from '../../car-customizer/js/scene.js';
import { createMaterials, applyAppearance } from '../../car-customizer/js/materials.js';
import { Car } from '../../car-customizer/js/car.js';
import { EngineAudio } from '../../car-customizer/js/audio.js';
import { computeStats, resolve } from '../../car-customizer/js/stats.js';
import { Drive, TRANSMISSIONS, CAMERA_MODES, CHASE_VIEWS } from '../../car-customizer/js/drive.js';
import { safeBuild } from '../../car-customizer/js/remote.js';
import { DriftScore, Records, TARGETS, RULES } from './score.js';

const $ = id => document.getElementById(id);
const params = new URLSearchParams(location.search);
const DEMO = params.has('demo');                         // ?demo: the autopilot drives (used for screenshots)
const num = v => Math.round(v).toLocaleString('en-US');
const fmtLap = t => t ? `${Math.floor(t / 60)}:${(t % 60).toFixed(2).padStart(5, '0')}` : '—:——.——';
const fmtClock = t => { t = Math.max(0, Math.ceil(t)); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`; };
function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'style') el.style.cssText = v;
    else if (v !== false && v != null) el.setAttribute(k, v);
  }
  for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid.nodeType ? kid : document.createTextNode(kid));
  return el;
}

// ------------------------------------------------------------------ locations and modes
const LOCATIONS = [
  { id: 'circuit', name: 'Apex Raceway', desc: 'A 1.5 km race circuit in daylight. Fast sweepers and a hairpin. Drift Attack is three laps.', attack: '3 laps' },
  { id: 'city', name: 'Neon District', desc: 'A city grid at night. Square corners, long blocks, buildings that bite. Drift Attack is two minutes.', attack: '2 minutes' },
  { id: 'highway', name: 'Midnight Expressway', desc: 'A 6.5 km expressway with traffic. Huge sweeping bends; drift close past cars for a bonus. Drift Attack is two minutes.', attack: '2 minutes' },
];
const MODES = [
  { id: 'attack', name: 'Drift Attack', desc: 'A timed run. Score as much as you can for a medal and a place in your records.' },
  { id: 'free', name: 'Free Drift', desc: 'No clock and no laps. Practise, then press Esc to bank your points.' },
];
const ATTACK_LAPS = 3, ATTACK_TIME = 120;

// ------------------------------------------------------------------ stage, car, physics (Apex Garage)
const stage = createStage($('view'));
const M = createMaterials();
const car = new Car(M);
stage.scene.add(car.root);
const audio = new EngineAudio();
audio.onPop = i => car.pop(i);
const drive = new Drive(stage, car, audio);
const score = drive.score = new DriftScore();
drive.setMode('drift');

const rec = Records.get();
const prefs = rec.prefs;
const savePrefs = () => { const d = Records.get(); d.prefs = prefs; Records.put(d); };
const state = {
  build: null, source: prefs.source || 'stock', saveId: prefs.saveId || null,
  world: LOCATIONS.some(l => l.id === prefs.world) ? prefs.world : 'circuit', mode: prefs.mode === 'free' ? 'free' : 'attack',
  driving: false, run: null, cat: 'cars', brand: null,
};
drive.setTransmission(prefs.trans || 'auto');
drive.setCamera(Math.max(0, CAMERA_MODES.findIndex(m => m.id === prefs.cam)), true);
drive.chaseView = Math.max(0, CHASE_VIEWS.findIndex(v => v.id === prefs.chaseView));

// ------------------------------------------------------------------ builds
const GARAGE_SAVES = 'apex-garage-saves-v2';
function garageSaves() {
  try { return (JSON.parse(localStorage.getItem(GARAGE_SAVES)) || []).filter(s => s && s.build && CARS.some(c => c.id === s.build.carId)); }
  catch (_) { return []; }
}
function stockBuild(carId) {
  const c = byId(CARS, carId), b = defaultBuild(c), paint = (prefs.paint || {})[c.id];
  if (paint) b.paint = { ...b.paint, color: paint };
  return b;
}
function pickInitialBuild() {
  if (state.source === 'save') { const s = garageSaves().find(x => x.id === state.saveId); if (s) return safeBuild(s.build); state.source = 'stock'; }
  return stockBuild(params.get('car') || prefs.carId || 's15');
}
const statCache = {};
const stockStats = c => statCache[c.id] || (statCache[c.id] = computeStats(defaultBuild(c)));

/** Ride height from the build: fixed drop, or the air suspension's heights and preset. */
function rideFor(build) {
  const r = resolve(build), a = r.susp.air && build.susp.air;
  if (a) return { f: a.f, r: a.r, preset: a.preset !== 'custom' ? byId(AIR_PRESETS, a.preset) : null };
  return { f: build.susp.drop || 0, r: build.susp.drop || 0, preset: null };
}

let stats = null;
function rebuild() {
  const b = state.build;
  car.build(b); applyAppearance(M, b);
  const ride = rideFor(b);
  car.applyStance(b, ride.f, ride.r);
  stage.blob.scale.set(car.S.car.dims.L * 1.12, car.S.car.dims.W * 1.35, 1);
  audio.configure(resolve(b));
  stats = computeStats(b);
}
function viewCar(dur = 0.9) {
  const L = car.S.car.dims.L, far = L * 1.75;
  stage.flyTo([far * 0.72, 1.75, far * 0.74], [0, 0.6, 0], dur);
}
function selectBuild(build, source, saveId = null) {
  state.build = build; state.source = source; state.saveId = saveId;
  prefs.source = source; prefs.saveId = saveId; if (source === 'stock') prefs.carId = build.carId; savePrefs();
  rebuild(); refreshGarage();
}

// ------------------------------------------------------------------ garage UI
const CATS = [['cars', 'Cars'], ['builds', 'My Builds'], ['where', 'Location'], ['records', 'Records'], ['help', 'How to Drift']];
const catBtns = CATS.map(([id, label], i) => h('button', { class: 'cat', onclick: () => { state.cat = id; $('panelBody').scrollTop = 0; renderPanel(); } }, h('i', {}, String(i + 1).padStart(2, '0')), h('span', {}, label)));
$('cats').append(...catBtns);

const sec = (title, value) => h('div', { class: 'sec' }, title, value != null ? h('b', {}, value) : null);
const card = (title, right, desc, on, onPick, tags = []) => h('button', { class: 'card' + (on ? ' on' : ''), onclick: onPick, 'aria-pressed': on },
  h('div', { class: 'card-top' }, h('b', {}, title), h('em', {}, right)), desc ? h('p', {}, desc) : null,
  tags.length ? h('div', { class: 'tags' }, tags.map(t => h('span', { class: 'tag ' + (t[1] || '') }, t[0]))) : null);
const chips = (list, cur, onPick) => h('div', { class: 'chip-row' }, list.map(o => h('button', { class: 'chip' + (o.id === cur ? ' on' : ''), onclick: () => onPick(o.id) }, o.name)));
const driveTag = c => [c.drive, 'drivetag ' + c.drive.toLowerCase()];

const panels = {
  cars() {
    const cur = state.source === 'stock' ? state.build.carId : null;
    const brand = state.brand || byId(CARS, state.build.carId).brand;
    const c = byId(CARS, state.build.carId);
    const paint = state.build.paint.color;
    return [
      h('div', { class: 'note' }, 'Every car from Apex Garage, as it leaves the factory. ', h('b', {}, 'RWD'), ' cars drift the easiest; AWD can drift with commitment; FWD cars mostly grip.'),
      sec('Manufacturer'),
      h('div', { class: 'chip-row' }, BRANDS.map(b => h('button', { class: 'chip' + (b === brand ? ' on' : ''), onclick: () => { state.brand = b; renderPanel(); } }, b))),
      sec('Model'),
      CARS.filter(x => x.brand === brand).map(x => {
        const st = stockStats(x);
        return card(x.name, `${Math.round(st.hp)} hp`, `${Math.round(st.weight)} kg · 0–100 km/h ${st.t100.toFixed(1)} s · ${Math.round(st.top)} km/h`, x.id === cur,
          () => { state.brand = x.brand; selectBuild(stockBuild(x.id), 'stock'); viewCar(); }, [driveTag(x), ...(x.drive === 'RWD' ? [['Drift pick', 'up']] : [])]);
      }),
      state.source === 'stock' ? [
        sec('Paint', c.name),
        h('div', { class: 'swatches' }, [c.color, ...PAINT_COLORS.filter(p => p !== c.color)].map(col => h('button', {
          class: 'swatch' + (col.toLowerCase() === String(paint).toLowerCase() ? ' on' : ''), style: `background:${col}`, 'aria-label': col,
          onclick: () => { prefs.paint = prefs.paint || {}; prefs.paint[c.id] = col; savePrefs(); state.build.paint = { ...state.build.paint, color: col }; applyAppearance(M, state.build); renderPanel(); },
        }))),
      ] : null,
    ];
  },
  builds() {
    const saves = garageSaves();
    const intro = h('div', { class: 'note' }, 'Cars you built and saved in ', h('b', {}, 'Apex Garage'), ' — with every part, tune and paint job. Engine swaps, turbos, tyres and stance all change how they slide.');
    if (!saves.length) return [intro, h('div', { class: 'note' }, 'No saved builds yet. Build a car in Apex Garage, press Save, and it shows up here.'),
      h('a', { class: 'btn wide-btn hot', href: '../play.html?game=apex-garage', target: '_top', style: 'display:grid;place-items:center;text-decoration:none' }, 'Open Apex Garage')];
    return [intro, sec('Saved builds', String(saves.length)), saves.sort((a, b) => (b.ts || 0) - (a.ts || 0)).map(s => {
      const b = safeBuild(s.build), c = byId(CARS, b.carId), st = computeStats(b);
      return card(s.name || 'Build', `${Math.round(st.hp)} hp`, `${c.brand} ${c.name} · ${Math.round(st.weight)} kg · 0–100 km/h ${st.t100.toFixed(1)} s`,
        state.source === 'save' && state.saveId === s.id, () => { selectBuild(b, 'save', s.id); viewCar(); }, [driveTag(c)]);
    })];
  },
  where() {
    return [
      sec('Location'),
      LOCATIONS.map(l => card(l.name, l.attack, l.desc, l.id === state.world, () => { state.world = l.id; prefs.world = l.id; savePrefs(); refreshGarage(); })),
      sec('Mode'),
      MODES.map(m => card(m.name, '', m.desc, m.id === state.mode, () => { state.mode = m.id; prefs.mode = m.id; savePrefs(); refreshGarage(); })),
      sec('Medal targets', LOCATIONS.find(l => l.id === state.world).name), targetsRow(state.world, Records.best(state.world, 'attack')),
      sec('Transmission'),
      chips(TRANSMISSIONS, drive.trans, id => { drive.setTransmission(id); prefs.trans = drive.trans; savePrefs(); renderPanel(); }),
      h('p', { class: 'dm-note' }, TRANSMISSIONS.find(t => t.id === drive.trans).desc),
    ];
  },
  records() {
    const d = Records.get();
    return [
      sec('Career'), h('table', { class: 'records' }, h('tbody', {},
        h('tr', {}, h('td', {}, 'Drift points'), h('td', {}, num(d.points))),
        h('tr', {}, h('td', {}, 'Runs'), h('td', {}, num(d.runs))))),
      LOCATIONS.map(l => {
        const b = d.best[l.id] || {};
        return [sec(l.name), h('table', { class: 'records' }, h('tbody', {},
          h('tr', {}, h('td', {}, 'Drift Attack', b.attackCar ? h('small', {}, b.attackCar) : null), h('td', {}, b.attack ? num(b.attack) : '—')),
          h('tr', {}, h('td', {}, 'Free Drift', b.freeCar ? h('small', {}, b.freeCar) : null), h('td', {}, b.free ? num(b.free) : '—')),
          h('tr', {}, h('td', {}, 'Best single drift'), h('td', {}, b.combo ? num(b.combo) : '—')))),
          targetsRow(l.id, b.attack || 0)];
      }),
      h('p', { class: 'dm-note' }, 'Records are saved in this browser.'),
    ];
  },
  help() {
    return [
      sec('How to drift'),
      h('ol', { class: 'steps' },
        h('li', {}, 'Come into a corner with speed and ', h('b', {}, 'tap the handbrake (Space)'), ' as you turn in — or, in a powerful RWD car, just floor it.'),
        h('li', {}, 'Once the tail is out, ', h('b', {}, 'stay on the throttle'), ' and steer into the slide to hold the angle. Lift a little to tighten it, add throttle to widen it.'),
        h('li', {}, 'Points grow with ', h('b', {}, 'angle × speed'), '. Keep sliding and the multiplier climbs to ', h('b', {}, '×5'), ' — one step every 2.2 s.'),
        h('li', {}, 'Straighten up for about a second and the drift is ', h('b', {}, 'banked'), '. Hit a wall, crash, reset or run off the road and it is ', h('b', {}, 'lost'), '.'),
        h('li', {}, 'On the expressway, drift close past traffic for a bonus.')),
      sec('Controls'),
      h('div', { class: 'keys-help' },
        ...[['W / ↑', 'Throttle'], ['S / ↓', 'Brake, then reverse'], ['A D / ← →', 'Steer'], ['Space', 'Handbrake'], ['E / Q', 'Shift up / down (semi-auto and manual)'],
          ['Left Shift', 'Clutch (manual)'], ['C', 'Camera: third-person / cockpit / hood'], ['B', 'Third-person distance'], ['R', 'Back on the road'], ['M', 'Sound on / off'], ['Esc', 'End the run, back to the garage'], ['Enter', 'Start drifting (in the garage)']]
          .flatMap(([k, v]) => [h('b', {}, k), h('span', {}, v)])),
      h('p', { class: 'dm-note' }, 'Gamepads work: left stick steers, triggers for throttle and brake, A for the handbrake. On a phone, use the on-screen buttons.'),
    ];
  },
};

function targetsRow(world, best) {
  const t = TARGETS[world];
  return h('div', { class: 'targets' }, ['Bronze', 'Silver', 'Gold'].map((n, i) => h('span', { class: best >= t[i] ? 'got' : '' }, n, h('b', {}, num(t[i])))));
}

function renderPanel() {
  const i = CATS.findIndex(c => c[0] === state.cat);
  catBtns.forEach((b, k) => b.classList.toggle('on', k === i));
  $('panelIndex').textContent = String(i + 1).padStart(2, '0') + ' / ' + CATS.length;
  $('panelTitle').textContent = CATS[i][1];
  const body = $('panelBody'), top = body.scrollTop;
  body.replaceChildren(...[panels[state.cat]()].flat(4).filter(Boolean));
  body.scrollTop = top;
}

const TIPS = [
  'Tap <b>Space</b> as you turn in, then catch the slide with the throttle.',
  'Lift off the throttle slightly to tighten a drift; add throttle to widen it.',
  'The multiplier only grows while you are sideways — link corners without straightening up.',
  'Drift with your bumper near a wall, but don’t touch: a hit loses the drift.',
  'Press <b>C</b> for the cockpit camera, <b>B</b> for a higher chase view.',
  'Build a car in Apex Garage and save it — it shows up under My Builds.',
];
let tipI = Math.floor(Math.random() * TIPS.length);

function refreshGarage() {
  const c = byId(CARS, state.build.carId), saves = garageSaves(), sv = saves.find(s => s.id === state.saveId);
  $('carBrand').textContent = state.source === 'save' && sv ? `${sv.name} · ${c.brand}` : c.brand;
  $('carName').textContent = c.name;
  $('points').textContent = num(Records.get().points);
  const l = LOCATIONS.find(x => x.id === state.world);
  $('goWorld').textContent = l.name;
  $('goMode').textContent = state.mode === 'attack' ? `Drift Attack · ${l.attack}` : 'Free Drift';
  const best = Records.best(state.world, state.mode);
  $('goBest').textContent = best ? num(best) : '—';
  $('tip').innerHTML = TIPS[tipI];
  // stats card: Apex Garage's stat rows
  const st = stats, bars = [
    ['Power', st.hp, 1000, `${Math.round(st.hp)} hp`], ['Torque', st.tq, 1100, `${Math.round(st.tq)} Nm`], ['Weight', st.weight, 2400, `${Math.round(st.weight)} kg`],
    ['0–100', 10 - st.t100, 8, `${st.t100.toFixed(2)} s`], ['Top speed', st.top, 420, `${Math.round(st.top)} km/h`], ['Handling', st.handling, 100, `${Math.round(st.handling)}`],
  ];
  $('stats').replaceChildren(h('div', { class: 'sec', style: 'margin-top:0' }, 'Car', h('b', {}, `${c.drive} · ${c.layout === 'mid' ? 'mid-engine' : c.layout === 'rear' ? 'rear-engine' : 'front-engine'}`)),
    ...bars.map(([k, v, max, txt]) => h('div', { class: 'stat' }, h('span', {}, k), h('div', { class: 'bar' }, h('u', { style: `width:${Math.max(3, Math.min(100, v / max * 100))}%` })), h('b', {}, txt))));
  renderPanel();
}

// ------------------------------------------------------------------ input
const keys = {};
const touch = { left: false, right: false, fwd: false, back: false, hand: false };
const touchMode = matchMedia('(hover: none) and (pointer: coarse)').matches || params.has('touch');
if (touchMode) document.body.classList.add('touch-mode');
for (const b of document.querySelectorAll('[data-touch]')) {
  const k = b.dataset.touch, set = v => e => { e.preventDefault(); touch[k] = v; b.classList.toggle('on', v); };
  b.addEventListener('pointerdown', e => { b.setPointerCapture?.(e.pointerId); set(true)(e); });
  for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) b.addEventListener(ev, set(false));
  b.addEventListener('contextmenu', e => e.preventDefault());
}
const padPrev = {};
function readInput() {
  let fwd = keys.KeyW || keys.ArrowUp || touch.fwd ? 1 : 0, back = keys.KeyS || keys.ArrowDown || touch.back ? 1 : 0;
  let steer = (keys.KeyA || keys.ArrowLeft || touch.left ? 1 : 0) - (keys.KeyD || keys.ArrowRight || touch.right ? 1 : 0);
  let hand = keys.Space || touch.hand ? 1 : 0;
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  for (const p of pads) {
    if (!p || !p.connected) continue;
    const b = i => (p.buttons[i] ? p.buttons[i].value || (p.buttons[i].pressed ? 1 : 0) : 0), ax = p.axes[0] || 0;
    if (Math.abs(ax) > 0.12) steer = -Math.sign(ax) * Math.min(1, (Math.abs(ax) - 0.12) / 0.8);
    fwd = Math.max(fwd, b(7)); back = Math.max(back, b(6)); if (b(0) > 0.5 || b(5) > 0.5) hand = 1;
    const edge = (i, fn) => { const v = b(i) > 0.5; if (v && !padPrev[i]) fn(); padPrev[i] = v; };
    edge(3, () => state.driving && respawn()); edge(2, () => state.driving && nextCamera()); edge(9, () => (state.driving ? endRun(false) : startRun()));
    break;
  }
  return { fwd, back, steer, hand, clutch: keys.ShiftLeft ? 1 : 0 };
}

// ------------------------------------------------------------------ HUD helpers
const hud = {};
for (const id of ['hudPlace', 'hudTrans', 'hudScore', 'hudMult', 'hudComboBar', 'hudPb', 'hudDrift', 'hudAngle', 'hudAngleTxt', 'hudFeed', 'hudLap', 'hudLast', 'hudBest', 'hudLapLbl', 'hudLastLbl', 'hudBestLbl', 'hudSpeed', 'hudGear', 'hudGearBox', 'hudCount', 'hudCamName', 'aidABS', 'aidTCS', 'aidESP']) hud[id] = $(id);
const setText = (e, v) => { if (e._v !== v) { e._v = v; e.textContent = v; } };
function feed(label, pts, kind) {
  const d = h('div', { class: 'feed-item ' + kind }, h('span', {}, label), pts ? h('b', {}, (pts > 0 ? '+' : '−') + num(Math.abs(pts))) : null);
  hud.hudFeed.prepend(d); while (hud.hudFeed.children.length > 4) hud.hudFeed.lastChild.remove();
  setTimeout(() => d.classList.add('out'), 2200); setTimeout(() => d.remove(), 2700);
}
score.onEvent = e => {
  feed(e.label, e.pts, e.kind);
  if (!audio.ctx) return;
  if (e.kind === 'good') audio._burst({ dur: 0.18, f0: 1400 + Math.min(4, score.mult) * 200, f1: 2200, q: 8, gain: 0.25 });
  if (e.kind === 'bad') audio._burst({ dur: 0.35, f0: 600, f1: 150, q: 2, gain: 0.3 });
};
drive.onNotice = msg => feed(msg, 0, 'minor');
let toastTimer;
function toast(msg) { const t = $('toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2600); }
function count(text, cls = '', sub = '') { hud.hudCount.className = 'hud-count ' + cls; hud.hudCount.innerHTML = text + (sub ? `<small>${sub}</small>` : ''); }
const beep = go => { if (audio.ctx) audio._burst({ dur: go ? 0.5 : 0.22, f0: go ? 1760 : 880, f1: go ? 1760 : 880, q: 30, gain: 0.35 }); };

function nextCamera() { const m = drive.nextCamera(); prefs.cam = m.id; savePrefs(); setText(hud.hudCamName, drive.cameraLabel()); feed(`Camera: ${drive.cameraLabel()}`, 0, 'minor'); }
function nextChase() { drive.nextChaseView(); prefs.cam = 'chase'; prefs.chaseView = CHASE_VIEWS[drive.chaseView].id; savePrefs(); setText(hud.hudCamName, drive.cameraLabel()); feed(`Camera: ${drive.cameraLabel()}`, 0, 'minor'); }
function respawn() { if (state.run && state.run.count > 0) return; drive.respawn(); }

// ------------------------------------------------------------------ runs
function startRun() {
  if (state.driving) return;
  $('results').classList.remove('show');
  stage.controls.autoRotate = false;
  drive.setMode('drift');
  drive.setSetup(defaultSetup());
  score.mode = state.mode;
  const world = drive.enter(state.world, stats, car.r, {});
  const ride = rideFor(state.build);
  drive.setRide(ride.f, ride.r, ride.preset);
  score.enabled = true;
  score.best = Records.best(state.world, state.mode);
  state.driving = true;
  state.run = { world: state.world, mode: state.mode, count: DEMO ? 0 : 3.4, t: 0, done: 0, laps: world.hasLaps, lastCount: 4 };
  document.body.classList.add('driving');
  $('touch').hidden = !touchMode;
  hud.hudFeed.replaceChildren();
  setText(hud.hudPlace, world.name);
  setText(hud.hudCamName, drive.cameraLabel());
  hud.hudPlace.parentElement.querySelector('small').textContent = state.mode === 'attack' ? 'Drift Attack' : 'Free Drift';
  if (!audio.active) audio.start();
  audio.setVolume(prefs.mute ? 0 : 0.8);
  count('');
  $('view').focus();
}

function finishRun() {
  const run = state.run;
  if (!run || run.done) return;
  score.bank();
  score.enabled = false;
  run.done = 1.8;
  count('FINISH', 'go');
  if (audio.ctx) [0, 0.12, 0.24].forEach((d, i) => audio._burst({ dur: 0.3, f0: 1046 + i * 262, f1: 1046 + i * 262, q: 30, gain: 0.3, delay: d }));
}

function endRun(completed) {
  if (!state.driving) return;
  const run = state.run, c = byId(CARS, state.build.carId);
  const res = drive.exit() || { total: 0, combo: 0, drifts: 0 };
  state.driving = false; state.run = null;
  document.body.classList.remove('driving');
  for (const k in keys) keys[k] = false;
  for (const k in touch) touch[k] = false;
  audio.stop();
  const ride = rideFor(state.build); car.applyStance(state.build, ride.f, ride.r);
  stage.controls.autoRotate = true; viewCar(0.01);
  tipI = (tipI + 1) % TIPS.length;
  const counts = completed || run.mode === 'free';
  if (counts && !DEMO && res.total > 0) {
    const name = `${c.brand} ${c.name}`;
    const nb = Records.submit(run.world, run.mode, res.total, res.combo, name);
    showResults(run, res, nb);
  } else if (!counts) toast('Run abandoned — Drift Attack only counts when you finish it');
  else if (!DEMO) toast('No points banked this time');
  refreshGarage();
}

function showResults(run, res, nb) {
  const l = LOCATIONS.find(x => x.id === run.world), t = TARGETS[run.world];
  let medal = 0;
  if (run.mode === 'attack') for (let i = 0; i < 3; i++) if (res.total >= t[i]) medal = i + 1;
  const names = ['none', 'bronze', 'silver', 'gold'];
  $('resMedal').className = 'medal ' + names[medal];
  $('resMedal').textContent = medal ? 'BSG'[medal - 1] : '—';
  $('resMedal').hidden = run.mode !== 'attack';
  $('resKicker').textContent = run.mode === 'attack' ? 'DRIFT ATTACK COMPLETE' : 'FREE DRIFT';
  $('resTitle').textContent = run.mode === 'attack' ? (medal ? `${names[medal][0].toUpperCase()}${names[medal].slice(1)} medal` : 'No medal this time') : 'Session banked';
  const next = run.mode === 'attack' ? t.find(v => v > res.total) : 0;
  $('resSub').textContent = `${l.name} · ${byId(CARS, state.build.carId).brand} ${byId(CARS, state.build.carId).name}` + (next ? ` · ${num(next - res.total)} more for the next medal` : '');
  const cells = [['Score', num(res.total), nb.best], ['Best drift', num(res.combo), nb.combo], ['Drifts', num(res.drifts)], ['Time', fmtLap(run.t)]];
  $('resStats').replaceChildren(...cells.map(([k, v, n]) => h('div', { class: n ? 'new' : '' }, h('small', {}, k), h('b', {}, v))));
  $('results').classList.add('show');
  $('resAgain').focus();
}
$('resAgain').addEventListener('click', () => startRun());
$('resClose').addEventListener('click', () => { $('results').classList.remove('show'); $('view').focus(); });

// demo autopilot for screenshots: follow the road the world reports as nearest, throw the car sideways into bends
function autopilot() {
  const s = drive.s, w = drive.world, p = w.respawn();
  const kmh = Math.abs(s.vx) * 3.6, look = 10 + Math.abs(s.vx) * 0.55;
  const tx = Math.cos(p.psi), tz = -Math.sin(p.psi);
  const gx = p.x + tx * look, gz = p.z + tz * look;
  const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
  const want = Math.atan2(-(gz - s.z), gx - s.x);
  // steer by where the car is going, not where it points: that countersteers a slide by itself
  const cp = Math.cos(s.psi), sp = Math.sin(s.psi), wx = s.vx * cp - s.vy * sp, wz = -s.vx * sp - s.vy * cp;
  const velPsi = kmh > 15 ? Math.atan2(-wz, wx) : s.psi;
  const diffV = wrap(want - velPsi), slip = wrap(velPsi - s.psi);
  const steer = Math.max(-1, Math.min(1, diffV * 2.2 + slip * 1.1));
  const sliding = Math.abs(slip) > 0.2, tight = Math.abs(diffV) > 0.28;
  const target = tight ? 58 : 88;
  const over = Math.abs(slip) > 0.6;                        // too sideways: lift and let it straighten
  return { fwd: over ? 0 : kmh < target ? 1 : sliding ? 0.55 : 0.2, back: kmh > target + 18 ? 1 : 0, steer, hand: tight && kmh > 62 && Math.abs(slip) < 0.08 ? 1 : 0, clutch: 0 };
}

// ------------------------------------------------------------------ keys
window.addEventListener('keydown', e => {
  if (e.target.matches && e.target.matches('input, textarea')) return;
  if (state.driving) {
    keys[e.code] = true;
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
    if (e.repeat) return;
    if (e.code === 'Escape') { if (state.run && state.run.done) endRun(true); else endRun(state.run && state.run.mode === 'free'); }
    else if (e.code === 'KeyR') respawn();
    else if (e.code === 'KeyC') nextCamera();
    else if (e.code === 'KeyB') nextChase();
    else if (e.code === 'KeyE') drive.shift(1, !!keys.ShiftLeft);
    else if (e.code === 'KeyQ') drive.shift(-1, !!keys.ShiftLeft);
    else if (e.code === 'KeyM') { prefs.mute = !prefs.mute; savePrefs(); audio.setVolume(prefs.mute ? 0 : 0.8); feed(prefs.mute ? 'Sound off' : 'Sound on', 0, 'minor'); }
    return;
  }
  if ($('results').classList.contains('show')) {
    if (e.code === 'Escape') $('results').classList.remove('show');
    return;
  }
  if (e.code === 'Enter' && document.activeElement === document.body || e.code === 'Enter' && document.activeElement === $('view')) startRun();
});
window.addEventListener('keyup', e => { keys[e.code] = false; });
window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; });
$('btnGo').addEventListener('click', startRun);
$('btnStart').addEventListener('click', startRun);
$('btnGarage').addEventListener('click', () => { window.top.location.href = new URL('../play.html?game=apex-garage', location.href).href; });
$('hudExit').addEventListener('click', () => endRun(state.run && (state.run.mode === 'free' || state.run.done)));
$('hudReset').addEventListener('click', respawn);
$('hudCam').addEventListener('click', nextCamera);
for (const b of document.querySelectorAll('.hud-btns .btn')) { b.addEventListener('mousedown', e => e.preventDefault()); b.addEventListener('click', () => { b.blur(); $('view').focus(); }); }

// ------------------------------------------------------------------ boot
state.build = pickInitialBuild();
state.brand = byId(CARS, state.build.carId).brand;
rebuild();
refreshGarage();
viewCar(0.01);
stage.controls.autoRotate = true;
requestAnimationFrame(() => $('loader').classList.add('hide'));
if (DEMO) {
  if (params.get('view')) drive.chaseView = Math.max(0, CHASE_VIEWS.findIndex(v => v.id === params.get('view')));
  state.world = params.get('world') || 'circuit';
  state.mode = params.get('mode') || 'free';
  startRun();
  if (params.has('shot')) $('driveHud').style.visibility = 'hidden';
}

const clock = new THREE.Clock();
function frame() {
  const dt = Math.min(0.1, clock.getDelta());
  if (state.driving) {
    const run = state.run;
    let inp = DEMO ? autopilot() : readInput();
    // countdown: the car waits on the line
    if (run.count > 0) {
      run.count -= dt;
      const n = Math.ceil(run.count);
      if (n !== run.lastCount && n <= 3) { run.lastCount = n; if (n > 0) { count(String(n)); beep(false); } }
      if (run.count <= 0) { count('GO!', 'go'); beep(true); setTimeout(() => { if (state.run === run && !run.done) count(''); }, 900); }
      inp = { fwd: 0, back: 0, steer: 0, hand: 1, clutch: 0 };
      score.enabled = false;
    } else if (!run.done) {
      score.enabled = true;
      run.t += dt;
    }
    let d;
    // ?demo&steps=N runs N physics steps of 1/30 s per drawn frame (lets slow test machines make screenshots)
    const steps = DEMO ? Math.max(0, Math.min(40, Number(params.get('steps')) || 0)) : 0;
    if (steps) { for (let i = 0; i < steps; i++) { d = drive.update(1 / 30, autopilot()); if (!run.done) run.t += 1 / 30; } }
    else d = drive.update(dt, inp);
    car.update(dt, d.rpm, 0, true, false, stats.redline);

    // end of a Drift Attack
    if (run.mode === 'attack' && !run.done && run.count <= 0) {
      if (run.laps ? d.lap.count >= ATTACK_LAPS : run.t >= ATTACK_TIME) finishRun();
    }
    if (run.done) { run.done -= dt; if (run.done <= 0) { endRun(true); requestAnimationFrame(frame); stage.update(dt); stage.renderer.render(stage.scene, stage.camera); return; } }

    // HUD
    setText(hud.hudSpeed, String(Math.round(d.kmh))); setText(hud.hudGear, d.gear);
    hud.hudGearBox.classList.toggle('shift', d.shiftUp); hud.hudGearBox.classList.toggle('clutch', !!d.clutch);
    setText(hud.hudTrans, `${TRANSMISSIONS.find(t => t.id === d.trans).name} · ${d.mode}`);
    if (d.camera !== hud.camShown) { hud.camShown = d.camera; setText(hud.hudCamName, d.camera); }
    for (const [k, el] of [['abs', hud.aidABS], ['tcs', hud.aidTCS], ['esp', hud.aidESP]]) el.className = d.active[k] ? 'act' : d.assists[k] ? 'on' : 'off';
    setText(hud.hudScore, num(score.score));
    setText(hud.hudMult, '×' + score.mult); hud.hudMult.classList.toggle('hot', score.mult > 1);
    hud.hudComboBar.style.width = Math.max(0, d.comboT * 100) + '%';
    setText(hud.hudPb, num(Math.max(score.best, score.score)));
    const live = Math.round(score.drift);
    if (live >= 5) { hud.hudDrift.innerHTML = `${num(live)}<em>×${score.mult}</em>`; hud.hudDrift._v = null; } else setText(hud.hudDrift, '');
    const ang = score.enabled ? score.angle : 0;
    hud.hudAngle.style.width = `${Math.min(100, ang / 70 * 100)}%`;
    setText(hud.hudAngleTxt, ang > RULES.minAngle ? `${Math.round(ang)}°` : '');
    if (run.laps) {
      setText(hud.hudLapLbl, run.mode === 'attack' ? `Lap ${Math.min(ATTACK_LAPS, d.lap.count + 1)} / ${ATTACK_LAPS}` : `Lap ${d.lap.count + 1}`);
      setText(hud.hudLap, d.lap.running ? fmtLap(d.time - d.lap.start) : 'Cross the line');
      setText(hud.hudLastLbl, 'Last'); setText(hud.hudLast, fmtLap(d.lap.last));
      setText(hud.hudBestLbl, 'Best lap'); setText(hud.hudBest, fmtLap(d.lap.best));
    } else {
      setText(hud.hudLapLbl, run.mode === 'attack' ? 'Time left' : 'Time');
      setText(hud.hudLap, run.mode === 'attack' ? fmtClock(ATTACK_TIME - run.t) : fmtClock(run.t));
      setText(hud.hudLastLbl, 'Drifts'); setText(hud.hudLast, num(score.drifts));
      setText(hud.hudBestLbl, 'Best drift'); setText(hud.hudBest, num(score.bestCombo));
    }
  } else car.update(dt, 0, 0, false, false, stats.redline);
  stage.update(dt);
  stage.renderer.render(stage.scene, stage.camera);
  requestAnimationFrame(frame);
}
frame();

window.apexDrift = { stage, car, drive, score, state, Records };
