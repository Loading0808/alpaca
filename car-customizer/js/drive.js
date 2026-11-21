// Drive mode: takes the car you built out of the garage and onto the road.
//
// Physics is a bicycle model built around one rule: STEERING COMES FIRST.
// Each axle works out the cornering force its tyres are asked for, and only the
// grip that is left over is given to braking (ABS) or to the engine (traction
// control). So you can always steer while braking or accelerating; what you
// lose is a little braking or drive, never the front end.
//
// On top of that: longitudinal and lateral weight transfer, a tyre curve whose
// stiffness and peak depend on the compound, FWD / RWD / AWD torque delivery,
// a drift state (handbrake or power-over) in which traction control lets the
// rear spin while the front keeps full steering authority for counter-steer,
// a power-limited engine with turbo lag, six gears with automatic,
// semi-automatic and manual (clutch) operation, aero drag and downforce.
import * as THREE from 'three';
import { WORLDS } from './world.js';
import { Traffic } from './traffic.js';
import { Score, Records } from './score.js';
import { DragRace } from './drag.js';
import { GEAR_DEFAULT, LAUNCH_STYLES, PARACHUTES, ENGINE_LIMIT, defaultSetup, pressureEffect, byId } from './data.js';

// Driver aids each mode switches on by default. A manual toggle (Z / X / V) overrides the mode until cleared.
export const ASSIST_DEFAULTS = {
  comfort: { abs: true, tcs: true, esp: true }, sport: { abs: true, tcs: true, esp: true }, track: { abs: true, tcs: true, esp: true },
  drift: { abs: true, tcs: false, esp: false }, race: { abs: true, tcs: true, esp: false }, custom: { abs: true, tcs: true, esp: true },
};

const G = 9.81, TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const sq = v => v * v;
const REVERSE = 3.3;
const TYRE_C = 1.4;
const tyre = x => Math.sin(TYRE_C * Math.atan(x));              // normalised force vs (stiffness × slip angle)
const TYRE_B = { street: 13, sport: 15, semi: 19, drag: 11, stretch: 12 };
const ROLL_FRONT = { stock: 0.57, springs: 0.55, coil: 0.52, air: 0.54 };
export const TRANSMISSIONS = [
  { id: 'auto', name: 'Automatic', desc: 'The car changes gear for you. S brakes, then reverses.' },
  { id: 'semi', name: 'Semi-automatic', desc: 'You shift with E (up) and Q (down). No clutch needed.' },
  { id: 'manual', name: 'Manual', desc: 'Hold Left Shift (clutch) and shift with E / Q.' },
];

// Driving modes. Every value feeds the physics in _step():
//  steer   steering speed            thr    throttle response (1/s)      grip   tyre grip scale
//  tcK     how much grip traction control / ABS hold back for cornering (1 = all of it)
//  tcLim   share of the remaining grip the engine may use                 esc    slip angle (rad) where stability control steps in
//  rollF   front share of roll stiffness (lower = more turn-in)           roll   visible body roll / pitch
//  brake   brake force                 shift  gear-change time             rear   rear grip scale
//  drift   0..1: how easily the car is provoked into, and held in, a slide
export const DRIVE_MODES = [
  { id: 'comfort', name: 'Comfort', desc: 'Smooth steering, gentle throttle, soft suspension and early stability control.', steer: 0.72, thr: 3, grip: 0.97, tcK: 1, tcLim: 0.85, esc: 0.2, rollF: 0.02, roll: 1.35, brake: 0.92, shift: 1.35, rear: 1.02, drift: 0 },
  { id: 'sport', name: 'Sport', desc: 'Sharper steering, quick throttle and a little more slip allowed.', steer: 1.1, thr: 9, grip: 1, tcK: 0.92, tcLim: 0.95, esc: 0.3, rollF: 0, roll: 1, brake: 1, shift: 0.9, rear: 1, drift: 0.15 },
  { id: 'track', name: 'Track', desc: 'Stiff, flat and precise with the most cornering grip.', steer: 1.22, thr: 14, grip: 1.05, tcK: 0.9, tcLim: 0.97, esc: 0.36, rollF: -0.03, roll: 0.65, brake: 1.08, shift: 0.7, rear: 1.01, drift: 0.1 },
  { id: 'drift', name: 'Drift', desc: 'Loose rear end, quick lock, traction control off. The car goes sideways on power and is easy to hold there.', steer: 1.35, thr: 16, grip: 1, tcK: 0.75, tcLim: 1, esc: 1.0, rollF: -0.04, roll: 1.1, brake: 1, shift: 0.7, rear: 0.9, drift: 1 },
  { id: 'race', name: 'Race', desc: 'Everything turned up: instant throttle, fastest shifts, strongest brakes, minimal driver aids.', steer: 1.38, thr: 22, grip: 1.06, tcK: 0.8, tcLim: 1, esc: 0.5, rollF: -0.03, roll: 0.55, brake: 1.14, shift: 0.5, rear: 1, drift: 0.3 },
  { id: 'custom', name: 'Custom', desc: 'Your own settings — adjust the sliders.' },
];
export const CUSTOM_DEFAULT = { steer: 50, thr: 50, tc: 60, esc: 60, stiff: 50, brake: 50, drift: 20 };
/** Turn the 0–100 custom sliders into the same physics values the presets use. */
export function customMode(c) {
  const u = k => Math.min(1, Math.max(0, (c[k] ?? CUSTOM_DEFAULT[k]) / 100)), L = (a, b, t) => a + (b - a) * t;
  return { id: 'custom', name: 'Custom', steer: L(0.65, 1.45, u('steer')), thr: L(2.5, 24, u('thr')), grip: 1, tcK: L(0.7, 1, u('tc')), tcLim: L(1, 0.85, u('tc')), esc: L(1.0, 0.18, u('esc')),
    rollF: L(0.03, -0.04, u('stiff')), roll: L(1.4, 0.5, u('stiff')), brake: L(0.85, 1.15, u('brake')), shift: 0.8, rear: L(1.02, 0.9, u('drift')), drift: u('drift') };
}

// Camera modes, cycled with C. Third-person has three distances of its own (B).
export const CAMERA_MODES = [{ id: 'chase', name: 'Third-person' }, { id: 'cockpit', name: 'Cockpit' }, { id: 'hood', name: 'Hood' }];
export const CHASE_VIEWS = [{ id: 'far', name: 'Far' }, { id: 'near', name: 'Near' }, { id: 'top', name: 'Overhead' }];
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _up = new THREE.Vector3(), _m = new THREE.Matrix3();

export class Drive {
  constructor(stage, car, audio) {
    this.stage = stage; this.car = car; this.audio = audio;
    this.worlds = {}; this.active = false; this.camMode = 0; this.chaseView = 0; this.trans = 'auto';
    this.camFrom = 0; this.camT = 1; this.poseCam = new THREE.PerspectiveCamera(); this.sway = new THREE.Vector3(); this.cockpitW = 0;
    this.poses = CAMERA_MODES.map(() => ({ pos: new THREE.Vector3(), quat: new THREE.Quaternion(), fov: 60 }));
    this.camPos = new THREE.Vector3(); this.camHead = 0; this.shake = 0;
    this.score = new Score(); this.onNotice = null;
    this.mode = DRIVE_MODES[1]; this.custom = { ...CUSTOM_DEFAULT };
    this.ride = { f: 0, r: 0, preset: null };                   // live ride height, set every frame by the app
    this.assistOverride = {};                                   // { abs?: bool, tcs?: bool, esp?: bool } set by the player
    this.setup = defaultSetup(); this.chute = { state: 'none', open: 0, t: 0 };
  }

  setMode(id) { const m = DRIVE_MODES.find(x => x.id === id) || DRIVE_MODES[1]; this.mode = m.id === 'custom' ? { ...customMode(this.custom), desc: m.desc } : m; return this.mode; }
  setCustom(c) { Object.assign(this.custom, c); if (this.mode.id === 'custom') this.setMode('custom'); }
  /** Effective driver aids: the mode's defaults, the Custom sliders, then any manual override. */
  assists() {
    const d = { ...(ASSIST_DEFAULTS[this.mode.id] || ASSIST_DEFAULTS.sport) };
    if (this.mode.id === 'custom') { d.tcs = this.custom.tc > 5; d.esp = this.custom.esc > 5; }
    return { ...d, ...this.assistOverride };
  }
  toggleAssist(k) { const now = this.assists()[k]; this.assistOverride[k] = !now; return !now; }
  clearAssistOverrides() { this.assistOverride = {}; }
  /** Per-car drag setup (launch control, gearing, tyre pressures, boost). Safe to call while driving. */
  setSetup(su) { this.setup = { ...defaultSetup(), ...su, gears: (su && su.gears ? su.gears : GEAR_DEFAULT).slice() }; if (this.active) this._applySetup(); }
  _applySetup() {
    const P = this.P, su = this.setup, pf = pressureEffect(su.psiF), pr = pressureEffect(su.psiR);
    P.gears = su.gears.slice(); P.final = P.final0 * su.final; P.pf = pf; P.pr = pr;
    // boost: more pressure = more of the forced-induction gain, until the engine's own limit
    const want = P.fi0 * su.boost, cap = Math.max(P.fi0, ENGINE_LIMIT - 1 - 0);
    P.boostK = P.fi0 > 0 ? Math.min(want, cap) / P.fi0 : 1; P.boostLimited = P.fi0 > 0 && want > cap + 1e-6;
    P.tg = P.tg0 * P.boostK; P.sg = P.sg0 * P.boostK; P.lag = P.lag0 * (0.75 + 0.25 * P.boostK);
    P.powerW = P.power0 * (1 + P.tg + P.sg) / (1 + P.tg0 + P.sg0);
    P.boostPsi = P.psi0 * su.boost * (P.boostLimited ? cap / want : 1);
  }
  /** Parachute: deploy at any speed; repack only at a standstill. Returns a message for the HUD. */
  toggleChute() {
    const c = this.chute, v = Math.abs(this.s.vx);
    if (c.state === 'none') return 'No parachute fitted — install one in Drag Setup';
    if (c.state === 'packed') { c.state = 'open'; c.t = 0; if (this.audio.ctx) { this.audio._burst({ dur: 0.5, f0: 900, f1: 120, q: 0.6, gain: 0.7, type: 'lowpass' }); this.audio._burst({ dur: 0.9, f0: 1800, f1: 500, q: 0.8, gain: 0.25, delay: 0.15 }); } return 'Parachute deployed'; }
    if (c.state === 'open') { if (v > 0.6) return 'Stop the car before repacking the parachute'; c.state = 'repack'; c.t = 0; return 'Repacking parachute…'; }
    return 'Repacking…';
  }

  /** Live suspension height (metres below stock, front / rear) and the active air preset, if any. */
  setRide(f, r, preset) { this.ride.f = f; this.ride.r = r; this.ride.preset = preset; }

  enter(id, stats, r, opts = {}) {
    const { stage, car } = this;
    const def = WORLDS.find(w => w.id === id) || WORLDS[0];
    const key = def.id + (def.id === 'drag' && opts.night ? '-night' : '');
    const world = this.world = this.worlds[key] || (this.worlds[key] = def.build(stage.renderer, opts));
    world.id = def.id;
    if (world.road) {
      // single-player traffic thinks for itself; online traffic runs on the shared server clock so everyone sees the same cars
      if (!world.traffic) { world.traffic = new Traffic(world.road); world.group.add(world.traffic.group); }
      if (opts.net && !world.trafficSync) { world.trafficSync = new Traffic(world.road, { sync: true }); world.group.add(world.trafficSync.group); }
      this.traffic = opts.net ? world.trafficSync : world.traffic;
      world.traffic.group.visible = !opts.net; if (world.trafficSync) world.trafficSync.group.visible = !!opts.net;
      if (opts.net) this.traffic.seed(opts.net.seed);
    } else this.traffic = null;
    this.net = opts.net || null;
    stage.scene.add(world.group);
    stage.driving = true; stage.garageRoot.visible = false; stage.controls.enabled = false;
    stage.scene.environment = world.env; stage.scene.fog = world.fog; stage.scene.background = world.fog.color;
    stage.camera.far = 4000; stage.resize();
    world.sun.castShadow = true; world.sun.shadow.mapSize.set(2048, 2048);
    Object.assign(world.sun.shadow.camera, { left: -16, right: 16, top: 16, bottom: -16, near: 1, far: 190 });
    world.sun.shadow.camera.updateProjectionMatrix(); world.sun.shadow.bias = -0.0005; world.sun.shadow.normalBias = 0.03;

    const c = r.car, L = c.dims.wb, front = c.layout === 'front' ? 0.53 : c.layout === 'mid' ? 0.43 : 0.39;
    const m = stats.weight + 80, vTop = stats.top / 3.6 * 1.06, B = TYRE_B[r.tire.id] || 15;
    const mu = 1.1 * r.tire.grip * (1 + r.susp.handling * 0.004);
    this.P = {
      m, L, a: L * (1 - front), R: c.tireR, h: 0.5, gc: c.gc, Iz: m * L * L * 0.26, len: c.dims.L, wid: c.dims.W,
      powerW: stats.hp * 745.7, power0: stats.hp * 745.7, redline: stats.redline, idle: r.engine.idle, launch: Math.min(stats.redline * 0.55, 4800), rev: r.engine.rev,
      final0: stats.redline * TAU * c.tireR / (60 * GEAR_DEFAULT[5] * vTop),
      mu, muR: mu * 1.04 * Math.sqrt(c.tireW[1] / c.tireW[0]) * (r.tire.id === 'drag' ? 0.9 : 1), launchGrip: r.tire.launch || 1,
      B, aPeak: Math.tan(Math.PI / (2 * TYRE_C)) / B, rollF: ROLL_FRONT[r.susp.id] || 0.56, air: !!r.susp.air,
      split: c.drive === 'AWD' ? 0.38 : c.drive === 'FWD' ? 1 : 0,
      cda: c.cda * (1 + ((r.kit.drag || 0) + (r.spoiler.drag || 0)) * 2.2), down: stats.down,
      tg0: r.turbo.gain, sg0: r.sc.gain * (r.turbo.gain ? 0.6 : 1), lag0: r.turbo.lag || 0.3, spoolAt: r.turbo.spoolAt || 0.3,
      fi0: r.turbo.gain + r.sc.gain * (r.turbo.gain ? 0.6 : 1), psi0: stats.boostPsi, track: c.dims.W * 0.84,
    };
    this.s = { lcHold: false, lcT: 0, absOn: 0, tcsOn: 0, espOn: 0, lockF: false, lockR: false, thrIn: 0, x: 0, y: 0, z: 0, psi: 0, vx: 0, vy: 0, r: 0, st: 0, steer: 0, gear: 1, shiftT: 0, rpm: this.P.idle, rpmFree: this.P.idle, ax: 0, ay: 0, boost: 0, thr: 0, cut: false, slip: 0, driftT: 0, beta: 0, cutT: 0 };
    this._applySetup();
    const ch = byId(PARACHUTES, opts.chute && opts.chute.type); this.P.chuteCda = ch.cda; this.P.chuteCross = !!ch.cross;
    this.chute = { state: ch.cda ? 'packed' : 'none', open: 0, t: 0 };
    this.lap = { start: 0, running: false, last: 0, best: 0, count: 0 };
    // drag strip: race controller for staging, the tree and timing
    this.race = null;
    if (world.drag) {
      const race = this.race = world.race || (world.race = new DragRace(world));
      race.configure(opts.dist, opts.tree, opts.lane || 0, !!opts.net);
      race.onEvent = (label, kind) => this.score._emit(label, 0, kind);
      race.onResult = res => {
        const clean = !res.foul, board = race.dist.board;
        if (clean && !this.net) { const r2 = Records.submitTime(board, { et: +res.et.toFixed(3), rt: +res.rt.toFixed(3), trap: Math.round(res.trap), car: `${c.brand} ${c.name}` }); res.pb = r2.pb; res.rank = r2.rank; }
        this.score._emit(`${race.dist.name}: ${res.et.toFixed(3)} s @ ${Math.round(res.trap)} km/h${res.foul ? ' — red light, run not counted' : res.pb ? ' — new personal best' : ''}`, 0, res.foul ? 'bad' : 'good');
        if (this.onDragResult) this.onDragResult(res);
      };
      race.onStage = v => { if (this.onDragStage) this.onDragStage(v); };
      this.noseX = car.S.noseX;
    }
    this.place(world.spawn); world.reset();
    this.active = true; this.time = 0; this.inTun = false; this.spin = [0, 0];
    this.score.reset(world.id, `${c.brand} ${c.name}`);
    if (this.traffic && !this.traffic.sync) this.traffic.reset(world.surface(this.s.x, this.s.z).s);
    this.lightsWere = car.lights; car.setLights(world.night);
    this.glassBase = car.M.glass.opacity; this.camT = 1; this.cockpitW = 0; this.sway.set(0, 0, 0); this.rig = car.cockpit ? car.cockpit.rig : null;
    if (car.engine) car.engine.visible = false;                  // hidden under the bodywork while driving: fewer draw calls
    this.audio.setReverb(world.night ? 0.12 : 0.04);
    this.camHead = this.s.psi; this.camPos.set(this.s.x - Math.cos(this.s.psi) * 8, 3, this.s.z + Math.sin(this.s.psi) * 8);
    return world;
  }

  exit() {
    const { stage, car } = this;
    if (!this.active) return null;
    this.active = false;
    const res = this.score.bank('Run ended');
    stage.scene.remove(this.world.group);
    stage.driving = false; stage.garageRoot.visible = true; stage.controls.enabled = true;
    stage.scene.environment = stage.garageEnv; stage.scene.fog = stage.garageFog; stage.scene.background = stage.garageBg;
    stage.camera.far = 120; stage.camera.fov = 34; stage.resize();
    car.root.position.set(0, 0.05, 0); car.root.rotation.set(0, 0, 0); car.dynRoll = car.dynPitch = 0;
    for (const p of car.wheels) p.rotation.y = 0;
    car.setLights(this.lightsWere); if (car.engine) car.engine.visible = true;
    car.M.glass.opacity = this.glassBase; if (car.cockpit) car.cockpit.setSteer(0); if (car.tray) car.tray.visible = true;
    car.chute.update(0, 0, 0, false); this.race = null;
    this.audio.setRoad(0, 0, 0); this.audio.setReverb(0.22);
    return res;
  }

  place(p) { Object.assign(this.s, { x: p.x, z: p.z, psi: p.psi, vx: 0, vy: 0, r: 0, gear: 1, st: 0, driftT: 0, boost: 0 }); if (this.world && this.world.resetCollision) this.world.resetCollision(p.x, p.z, p.psi); }
  respawn() { this.place(this.world.respawn()); this.score.wall(); this.justReset = 0.4; if (this.chute.state !== 'none') { this.chute.state = 'packed'; this.chute.open = 0; } if (this.race) { this.race.reset(); this.world.clearBoards(); } }
  /** Cycle Third-person → Cockpit → Hood. The view glides from the old pose to the new one. Returns the new mode. */
  nextCamera() { return this.setCamera((this.camMode + 1) % CAMERA_MODES.length); }
  setCamera(i, instant = false) {
    i = ((i % CAMERA_MODES.length) + CAMERA_MODES.length) % CAMERA_MODES.length;
    if (i !== this.camMode) { this.camFrom = this.camMode; this.camMode = i; this.camT = instant || !this.active ? 1 : 0; }
    return CAMERA_MODES[i];
  }
  /** Third-person distance: Far → Near → Overhead. Switches to third-person if another camera is in use. */
  nextChaseView() { if (this.camMode !== 0) this.setCamera(0); else { this.camFrom = 0; this.camT = 0; this.prevChase = this.chaseView; this.chaseView = (this.chaseView + 1) % CHASE_VIEWS.length; } return CHASE_VIEWS[this.chaseView]; }
  cameraLabel() { return CAMERA_MODES[this.camMode].name + (this.camMode === 0 ? ' · ' + CHASE_VIEWS[this.chaseView].name : ''); }
  setTransmission(id) { this.trans = TRANSMISSIONS.some(t => t.id === id) ? id : 'auto'; if (this.active && this.trans === 'auto' && this.s.gear === 0) this.s.gear = 1; }

  /** Gear change request from the player (semi-automatic and manual). dir = +1 / -1. */
  shift(dir, clutch) {
    const s = this.s, P = this.P;
    if (!this.active) return false;
    if (this.trans === 'auto') { this._notice('Automatic gearbox — press T to switch to manual shifting'); return false; }
    const to = clamp(s.gear + dir, -1, 6); if (to === s.gear) return false;
    const deny = msg => { this._notice(msg); if (this.audio.ctx) this.audio._burst({ dur: 0.16, f0: 2400, f1: 900, q: 3, gain: 0.22 }); return false; };
    if (this.trans === 'manual' && !clutch) return deny('Hold the clutch (Left Shift) to change gear');
    if (to === -1 && s.vx > 2) return deny('Stop before selecting reverse');
    if (to >= 1 && s.vx < -2) return deny('Stop before selecting a forward gear');
    if (to >= 1 && dir < 0 && Math.abs(s.vx) * P.gears[to - 1] * P.final * 60 / (TAU * P.R) > P.redline * 1.06) return deny('Too fast for that gear');
    s.gear = to; s.shiftT = this.trans === 'semi' ? 0.11 * this.mode.shift : 0.03;
    return true;
  }
  _notice(msg) { if (this.onNotice) this.onNotice(msg); }

  _step(h, inp, surf) {
    const P = this.P, s = this.s, { m, L, a } = P, b = L - a, auto = this.trans === 'auto', md = this.mode, ride = this.ride;
    // --- ride height: a lower car has a lower centre of gravity and cleaner aero; too low and it grounds out
    const drop = (ride.f + ride.r) / 2, hCg = P.h - drop * 0.65, clear = P.gc - Math.max(ride.f, ride.r);
    const preset = ride.preset, rollF = (preset ? preset.rollF : P.rollF) + md.rollF - (ride.f - ride.r) * 0.6;   // nose-down rake sharpens turn-in
    const scrape = clear < 0.05 && Math.hypot(s.vx, s.vy) > 3 ? 1 - clear / 0.05 : 0;                           // 0..1 as the body touches down
    const lifted = drop < -0.02;
    // --- pedals. Automatic: S brakes, then selects reverse once stopped.
    let thrRaw = inp.fwd, brk = inp.back;
    if (auto) {
      if (s.gear === 0) s.gear = 1;
      // S at a standstill selects reverse — unless the throttle was also pressed during this press of S
      // (a launch-control hold): lifting off the throttle then just keeps the car parked on the brake
      if (inp.back && !s.backWas) s.backFwd = false;
      if (inp.back && inp.fwd) s.backFwd = true;
      s.backWas = inp.back;
      if (s.gear >= 1 && inp.back && !inp.fwd && !s.backFwd && s.vx < 0.6) s.gear = -1;
      if (s.gear === -1) { thrRaw = inp.back; brk = inp.fwd; if (inp.fwd && s.vx > -0.6) { s.gear = 1; thrRaw = inp.fwd; brk = 0; } }
    }
    // throttle response: how quickly the pedal reaches what you asked for
    s.thrIn += clamp(thrRaw - s.thrIn, -md.thr * 1.6 * h, md.thr * h);
    const thr = s.thrIn;
    const v = Math.hypot(s.vx, s.vy), beta = v > 2 ? Math.atan2(s.vy, Math.abs(s.vx)) : 0;
    // tyres: mode grip, grounding out costs grip, long-travel suspension copes better off the road
    let grip = surf.grip * md.grip * (preset ? preset.grip : 1) * (1 - 0.14 * scrape);
    if (lifted && surf.off > 0) grip = Math.max(grip, surf.grip + (0.9 - surf.grip) * 0.6);
    s.beta = beta;

    // --- steering: the lock available is what the tyres can actually use at this speed,
    //     plus extra for counter-steer when the car is sliding
    let dmax = Math.min(0.62, Math.atan(L * P.mu * grip * G / Math.max(16, v * v)) + P.aPeak * 1.15 + 0.02);
    if (s.driftT > 0 || Math.abs(beta) > 0.15) dmax = Math.min(0.62, Math.max(dmax, Math.abs(beta) * 1.15 + 0.22));
    const rate = md.steer * (inp.steer === 0 || inp.steer * s.st < 0 ? 1.7 : 1) / (0.16 + v * 0.0045);
    s.st += clamp(inp.steer - s.st, -rate * h, rate * h);
    const d = s.steer = s.st * dmax, cd = Math.cos(d), sd = Math.sin(d);

    // --- engine and gearbox
    const AS = this.assists(), su = this.setup;
    s.shiftT = Math.max(0, s.shiftT - h);
    const ratio = s.gear === -1 ? -REVERSE : s.gear === 0 ? 0 : P.gears[s.gear - 1];
    const engaged = ratio !== 0 && !(this.trans === 'manual' && inp.clutch) && s.shiftT <= 0;
    const k = Math.abs(ratio) * P.final * 60 / (TAU * P.R), coupled = Math.abs(s.vx) * k;
    // launch control: with the car held on the brake or handbrake, full throttle holds the launch rpm;
    // releasing the brake drops the clutch at that rpm
    const holding = (brk > 0.5 || inp.hand) && v < 0.6;
    s.lcHold = su.lc && s.gear === 1 && thrRaw > 0.5 && holding;
    // after the brake is released the launch logic stays on for a moment — but only while you keep the throttle down
    if (s.lcHold) s.lcT = 1.2; else s.lcT = thrRaw > 0.5 ? Math.max(0, s.lcT - h) : 0;
    const lcLive = su.lc && s.gear === 1 && s.lcT > 0;
    const slipRpm = lcLive ? Math.min(su.lcRpm, P.redline * 0.95) : P.idle + thr * (P.launch - P.idle);
    let rpm, te = thr;
    s.cutT = Math.max(0, s.cutT - h);
    if (engaged && !s.lcHold) {
      // first and reverse slip the clutch: the engine starts at the launch rpm and climbs smoothly with the
      // wheels, never sitting flat while it waits for them, and the clutch is fully locked by lockRpm
      if (s.gear === 1 || s.gear === -1) {
        const S0 = slipRpm, lockRpm = Math.min(1.6 * S0, S0 + 0.6 * (P.redline - S0)), u = Math.min(1, coupled / lockRpm);
        const p0 = lockRpm / (lockRpm - S0), w = 0.5, pw = (p0 - w) / (1 - w);       // meets the wheel speed with matching slope: no kink
        rpm = coupled >= lockRpm ? coupled : S0 + (lockRpm - S0) * ((1 - w) * Math.pow(u, pw) + w * u);
      } else rpm = Math.max(coupled, P.idle * 0.85);
      if (rpm >= P.redline) s.cutT = 0.07;
      rpm = Math.min(rpm, P.redline * 1.01); s.rpmFree = rpm;
    } else {                                                    // clutch in / neutral / mid-shift / launch hold: the engine revs freely
      const lim = s.lcHold ? su.lcRpm : P.redline * 1.04;
      const target = thr > 0.02 && s.cutT <= 0 ? P.idle + thr * (lim - P.idle) : P.idle;
      s.rpmFree += (target - s.rpmFree) * (1 - Math.exp(-(target > s.rpmFree ? P.rev : 2.4) * h));
      if (s.lcHold && s.rpmFree > su.lcRpm - 60) { s.rpmFree = su.lcRpm - 60 + Math.sin(this.time * 70) * 60; s.cutT = 0.03; }   // two-step limiter
      if (s.rpmFree >= P.redline) s.cutT = 0.07;
      rpm = s.rpmFree;
    }
    s.cut = s.cutT > 0; if ((s.cut && !s.lcHold) || s.shiftT > 0) te = 0;
    const x = rpm / P.redline, shape = x < 0.85 ? (x / 0.85) * (0.8 + 0.2 * clamp(x / 0.5, 0, 1)) : 1 - 1.5 * sq(x - 0.85);
    if (P.tg) {                                                 // turbo lag: boost builds with revs and load (the two-step builds it on the line)
      const want = (s.lcHold ? 0.85 : te) * clamp((x - P.spoolAt) / 0.35, 0, 1);
      s.boost += (want - s.boost) * (1 - Math.exp(-(want > s.boost ? 1 / P.lag : 3.5) * h));
    }
    const boostF = (1 + P.sg + P.tg * s.boost) / (1 + P.sg + P.tg);
    let Fd = engaged && !s.lcHold ? te * P.powerW * shape * boostF / (rpm * TAU / 60) * Math.abs(ratio) * P.final * 0.88 / P.R * Math.sign(ratio) : 0;
    if (engaged && coupled > P.idle) Fd -= Math.sign(s.vx) * (1 - te) * 0.05 * m * G * x * Math.min(3, Math.abs(ratio));   // engine braking

    // --- tyre loads: static + longitudinal transfer + downforce; lateral transfer costs a little total grip
    const aero = 0.6 * P.down * 3.2 * v * v * (1 + drop * 3), latG = Math.min(1.3, Math.abs(s.ay) / G);
    const Fzf = Math.max(0.12 * m * G, m * G * b / L - m * s.ax * hCg / L + aero * 0.42);
    const Fzr = Math.max(0.12 * m * G, m * G * a / L + m * s.ax * hCg / L + aero * 0.58);
    const hk = hCg / 0.5;                                        // taller car = more load thrown onto the outside tyres = less total grip
    const baseF = P.mu * grip * Fzf * (1 - 0.16 * rollF * latG * latG * hk);
    const baseR = P.muR * md.rear * grip * Fzr * (1 - 0.16 * (1 - rollF) * latG * latG * hk);
    // tyre pressure splits grip into cornering (lat) and traction / braking (long)
    const capF = baseF * P.pf.lat, capR = baseR * P.pr.lat;
    const lonF = baseF * P.pf.long, lonR = baseR * P.pr.long * (s.gear === 1 && v < 20 ? P.launchGrip : 1);

    // --- cornering force each axle is asked for (slip angles)
    const vyf = s.vy + a * s.r, vyr = s.vy - b * s.r;
    const af = -Math.atan2(-s.vx * sd + vyf * cd, Math.max(2, Math.abs(s.vx * cd + vyf * sd)));
    const ar = -Math.atan2(vyr, Math.max(2, Math.abs(s.vx)));
    let Fyf = capF * tyre(P.B * P.pf.stiff * af), Fyr = capR * tyre(P.B * P.pr.stiff * ar);

    // --- drift state: handbrake starts it, staying sideways on the throttle keeps it going
    const easy = md.drift;                                      // drift mode: any car with driven rear wheels, less provocation needed
    const overPower = easy > 0.05 && (easy > 0.6 ? P.split < 1 : P.split === 0) && thr > 0.9 - 0.2 * easy && Math.abs(s.st) > 0.9 - 0.25 * easy && s.gear >= 1 && s.gear <= (easy > 0.6 ? 3 : 2) && Math.abs(Fd) * (1 - P.split) > lonR * (1.3 - 0.35 * easy);
    s.poT = overPower ? (s.poT || 0) + h : 0;
    if (inp.hand || s.poT > 0.75 - 0.5 * easy) s.driftT = 1;
    else if (s.driftT > 0 && Math.abs(beta) > 0.12 - 0.05 * easy && thr > 0.2 && v > 5) s.driftT = Math.max(s.driftT, 0.35);
    else s.driftT = Math.max(0, s.driftT - h);
    const drifting = s.driftT > 0;

    // --- stability control (ESP): compare the yaw the driver is asking for with the yaw the car has
    let espM = 0, espCut = 1, espBrake = 0;
    if (AS.esp && v > 6 && s.vx > 0) {
      const rMax = P.mu * grip * G / v, rWant = clamp(s.vx * d / (L * (1 + sq(v / 38))), -rMax, rMax), err = s.r - rWant;
      const over = Math.abs(beta) > md.esc * 0.8 || (Math.abs(err) > 0.09 + 0.05 * md.esc * 3 && Math.sign(err) === Math.sign(s.r) && Math.abs(s.r) > Math.abs(rWant));
      const under = !over && Math.abs(af) > P.aPeak * 1.25 && Math.abs(s.r) < Math.abs(rWant) * 0.82 && Math.abs(rWant) > 0.05;
      if (over && !drifting) {                                  // oversteer: brake the outside front wheel to pull the nose back out
        const kO = clamp(Math.max(Math.abs(err) - 0.07, (Math.abs(beta) - md.esc * 0.8) * 1.6), 0, 0.5) / 0.5;
        espM = -Math.sign(s.r || err) * kO * 0.3 * baseF * P.track / 2; espBrake = Math.abs(espM) / (P.track / 2); espCut = 1 - 0.75 * kO;
      } else if (under) {                                        // understeer: brake the inside rear wheel and trim the throttle
        const kU = clamp((Math.abs(rWant) - Math.abs(s.r)) / Math.max(0.05, Math.abs(rWant)), 0, 1);
        espM = Math.sign(rWant) * kU * 0.16 * baseR * P.track / 2; espBrake = Math.abs(espM) / (P.track / 2); espCut = 1 - 0.5 * kU;
      }
      s.espOn = espM !== 0 ? 0.25 : Math.max(0, s.espOn - h);
    } else s.espOn = Math.max(0, s.espOn - h);
    Fd *= Fd * s.vx >= 0 ? espCut : 1;

    // --- grip left over after cornering is what the brakes and the engine may use
    const left = (lon, cap, Fy) => lon * Math.sqrt(Math.max(0.09, 1 - sq(md.tcK * Fy / Math.max(1, cap))));
    const leftF = left(lonF, capF, Fyf), leftR = left(lonR, capR, Fyr);
    const dir = Math.abs(s.vx) > 0.25 ? -Math.sign(s.vx) : 0, Fb = brk * m * G * 1.25 * md.brake;
    // brakes. ABS on: each axle is held just below lock-up, so the tyres keep steering.
    // ABS off: ask for more than the tyres have and the wheels lock — a locked tyre just slides (less grip, no steering).
    let FbF = Fb * 0.66, FbR = Fb * 0.34;
    // (a wheel that has locked stays locked until the pedal is eased, as on a real car)
    const wantLockF = FbF > lonF * (s.lockF ? 0.75 : 1.02) && v > 1.5, wantLockR = FbR > lonR * (s.lockR ? 0.75 : 1.02) && v > 1.5;
    if (AS.abs) { s.absOn = (FbF > leftF * 0.97 || FbR > leftR * 0.97) && v > 2 ? 0.2 : Math.max(0, s.absOn - h); FbF = Math.min(FbF, leftF * 0.97); FbR = Math.min(FbR, leftR * 0.97); s.lockF = s.lockR = false; }
    else { s.absOn = 0; s.lockF = wantLockF; s.lockR = wantLockR; }
    // drive. TCS on: torque is cut to what the surface can take (it acts earlier on loose or wet ground).
    // TCS off: excess torque spins the wheels, which then push less and hold less sideways.
    const reqF = Fd * P.split, reqR = Fd * (1 - P.split), loose = grip < 0.85 ? 0.9 : 1;
    const lcSlip = lcLive ? byId(LAUNCH_STYLES, su.lcStyle).slip : null;       // launch control manages wheelspin itself
    let Fdf, Fdr, rearLat = 1, frontLat = 1, spinF = 0, spinR = 0, tcsHit = false;
    const drive = (req, lon, lft, isRear) => {
      const tcOn = lcSlip != null ? lcSlip < 5 : AS.tcs && !(isRear && drifting);
      const lim = lcSlip != null ? lon * lcSlip : lft * md.tcLim * loose;
      if (tcOn && Math.abs(req) > Math.min(lim, lon * 1.08)) { tcsHit = true; const f = Math.sign(req) * Math.min(lim, lon * 1.08); return [f, Math.abs(f) > lon ? Math.abs(f) / lon - 1 : 0, 1]; }
      if (Math.abs(req) <= lon) return [req, 0, tcOn ? 1 : Math.sqrt(Math.max(0.2, 1 - 0.8 * sq(req / lon)))];   // without TCS, hard drive eats into side grip
      const spin = Math.abs(req) / lon - 1;                      // wheelspin: a spinning tyre pushes ~12 % less and has little side grip left
      return [Math.sign(req) * lon * (0.88 + 0.06 / (1 + spin * 3)), spin, Math.sqrt(Math.max(0.1 + (isRear ? 0.12 * easy : 0), 0.3 - 0.2 * Math.min(1, spin)))];
    };
    [Fdf, spinF, frontLat] = drive(reqF, lonF, leftF, false); [Fdr, spinR, rearLat] = drive(reqR, lonR, leftR, true);
    s.tcsOn = tcsHit && Math.abs(Fd) > 1 ? 0.2 : Math.max(0, s.tcsOn - h);
    if (inp.hand) rearLat *= 0.42;
    Fyr *= rearLat; Fyf *= frontLat;
    if (P.split > 0) Fyf *= 1 - 0.1 * sq(Math.min(1, Fdf / lonF));   // driven front wheels push a little wide under power
    let Fxf = Fdf + dir * FbF, Fxr = Fdr + dir * FbR + dir * inp.hand * lonR * 0.8;
    // locked wheels: pure sliding friction opposite to the direction the tyre is moving
    if (s.lockF) { const sp = Math.hypot(s.vx, vyf) || 1, fr = 0.8 * lonF; Fxf = -fr * s.vx / sp; Fyf = -fr * vyf / sp * cd; }
    if (s.lockR) { const sp = Math.hypot(s.vx, vyr) || 1, fr = 0.8 * lonR; Fxr = -fr * s.vx / sp; Fyr = -fr * vyr / sp; }
    Fxf += dir * espBrake * 0.5; Fxr += dir * espBrake * 0.5;

    // --- parachute: drag grows with the square of speed and with how far the canopy has opened
    const ch = this.chute;
    if (ch.state === 'open') { ch.t += h; const tgt = v > 4 ? 1 : v / 4 * 0.5; ch.open += (tgt * (1 + 0.18 * Math.exp(-ch.t * 3) * Math.sin(ch.t * 22)) - ch.open) * Math.min(1, h * (ch.open < tgt ? (P.chuteCross ? 2.2 : 3.6) : 2)); }
    else if (ch.state === 'repack') { ch.t += h; ch.open = Math.max(0, ch.open - h * 0.8); if (ch.t > 1.6) { ch.state = 'packed'; ch.open = 0; } }
    const chuteF = ch.state === 'open' ? 0.6 * P.chuteCda * clamp(ch.open, 0, 1.2) * v * v : 0;

    // --- resistances and gradient
    const fwdDot = surf.tx !== undefined ? Math.cos(s.psi) * surf.tx - Math.sin(s.psi) * surf.tz : 0;
    const offDrag = surf.drag * (lifted ? 0.5 : 1);
    const rollRes = 0.014 * (Fzf * P.pf.roll + Fzr * P.pr.roll) / (m * G);   // soft tyres roll harder
    const drag = 0.6 * P.cda * (1 - drop * 0.9) * s.vx * Math.abs(s.vx) + Math.sign(s.vx) * (m * G * (rollRes + offDrag * 0.14 + scrape * 0.12) + chuteF) + offDrag * m * 0.05 * s.vx + m * G * (surf.slope || 0) * fwdDot;

    // --- integrate
    const axl = (Fxf * cd - Fyf * sd + Fxr - drag) / m, ayl = (Fxf * sd + Fyf * cd + Fyr) / m;
    s.vx += (axl + s.vy * s.r) * h; s.vy += (ayl - s.vx * s.r) * h;
    // the parachute pulls from behind the rear axle, so it also drags the tail back into line
    s.r += (a * (Fxf * sd + Fyf * cd) - b * Fyr + espM - chuteF * (b + 1.2) * Math.sin(beta) * Math.sign(s.vx || 1)) / P.Iz * h;
    if (v < 3) {                                                // parking speeds: blend to a kinematic model
      const w = 1 - v / 3; s.vy *= 1 - Math.min(1, h * 8 * w);
      s.r += (s.vx * Math.tan(d) / L - s.r) * Math.min(1, h * 10 * w);
    }
    if (brk && !thr && Math.abs(s.vx) < 0.35) { s.vx = 0; s.vy *= 0.5; s.r *= 0.5; }
    s.r *= 1 - Math.min(1, h * 0.2);
    // Drift mode has its own gentle catch so a slide can be held at a big angle without going all the way round
    if (md.drift > 0.6 && v > 4) { const ex = clamp((Math.abs(beta) - 0.95) / 0.3, 0, 1); if (ex > 0) { s.vy *= 1 - Math.min(1, h * 3 * ex); s.r *= 1 - Math.min(1, h * 2 * ex); } }
    // ESP's last line of defence: once the slide passes the mode's limit it brakes individual wheels hard enough to stop a spin.
    // With ESP off nothing does this, and the car will go round if you let it.
    if (AS.esp && v > 4) {
      const lim = drifting ? Math.max(0.85, md.esc) : md.esc, ex = clamp((Math.abs(beta) - lim) / 0.3, 0, 1);
      if (ex > 0) { s.vy *= 1 - Math.min(1, h * (drifting ? 3 : 5) * ex); s.r *= 1 - Math.min(1, h * 2.5 * ex); s.vx *= 1 - Math.min(1, h * 0.25 * ex); s.espOn = 0.25; }
    }
    s.psi += s.r * h;
    const cp = Math.cos(s.psi), sp = Math.sin(s.psi);
    s.x += (s.vx * cp - s.vy * sp) * h; s.z += (-s.vx * sp - s.vy * cp) * h;
    s.ax += (axl - s.ax) * Math.min(1, h * 12); s.ay += (ayl - s.ay) * Math.min(1, h * 12);

    // --- automatic gearbox
    if (auto && s.gear >= 1 && s.shiftT <= 0) {
      if (Math.max(coupled, rpm) > P.redline * 0.965 && s.gear < 6) { s.gear++; s.shiftT = 0.18 * md.shift; }
      else if (s.gear > 1 && coupled * P.gears[s.gear - 2] / P.gears[s.gear - 1] < P.redline * (thr > 0.7 ? 0.8 : 0.52)) { s.gear--; s.shiftT = 0.13 * md.shift; }
    }
    s.rpm += (rpm - s.rpm) * Math.min(1, h * 22); s.thr = te;
    const sv = clamp(v / 8, 0, 1);
    s.slip = Math.max(s.slip * (1 - h * 6), Math.min(1.5, Math.max(spinF, spinR) * 0.8), clamp((Math.abs(ar) - P.aPeak) / 0.25, 0, 1) * sv, clamp((Math.abs(af) - P.aPeak * 1.25) / 0.25, 0, 1) * sv, (s.lockF || s.lockR) && v > 3 ? 1 : 0);
    this.spin = [spinF, spinR]; s.scrape = scrape;
  }

  /** inp = { fwd, back, steer (-1 right .. 1 left), hand, clutch }. Returns state for the HUD. */
  update(dt, inp) {
    const { car, world, s, P } = this;
    this.time += dt;
    const surf = world.surface(s.x, s.z);
    const n = Math.max(4, Math.min(48, Math.ceil(dt / 0.006)));   // small fixed-size physics steps however long the frame took
    for (let i = 0; i < n; i++) this._step(dt / n, inp, surf);

    // --- walls and buildings
    if (world.setPose) world.setPose(s.psi, P.len);              // worlds with full-body collision need the car's heading and length
    const hit = world.collide(s.x, s.z);
    if (hit) {
      const cp = Math.cos(s.psi), sp = Math.sin(s.psi);
      let wx = s.vx * cp - s.vy * sp, wz = -s.vx * sp - s.vy * cp;
      const vn = wx * hit.nx + wz * hit.nz;
      if (vn < 0) {
        wx -= 1.2 * vn * hit.nx; wz -= 1.2 * vn * hit.nz; const keep = vn < -3 ? 0.86 : 0.97; wx *= keep; wz *= keep;
        s.vx = wx * cp - wz * sp; s.vy = -wx * sp - wz * cp; s.r *= 0.6;
        if (vn < -2.5) { this.shake = Math.min(0.6, -vn / 20); if (this.audio.ctx) this.audio._burst({ dur: 0.18, f0: 500, f1: 80, q: 0.6, gain: Math.min(0.9, -vn / 14), type: 'lowpass' }); }
        if (vn < -3.5) this.score.wall();
      }
      s.x = hit.x; s.z = hit.z;
    }

    // --- traffic: overtakes and collisions
    const kmh = Math.abs(s.vx) * 3.6;
    if (this.traffic && surf.s !== undefined) {
      const along = s.vx * (Math.cos(s.psi) * surf.tx - Math.sin(s.psi) * surf.tz);
      const res = this.traffic.update(dt, { s: surf.s, lat: surf.lat, v: along, len: P.len, wid: P.wid }, this.net ? this.net.serverNow() / 1000 : 0);
      for (const p of res.passes) this.score.pass(p.gap, p.side, kmh);
      if (res.hit) {
        const { car: tc, ds, dLat, halfL, halfW, fresh } = res.hit, oL = halfL - Math.abs(ds), oW = halfW - Math.abs(dLat);
        const cp = Math.cos(s.psi), sp = Math.sin(s.psi);
        let wx = s.vx * cp - s.vy * sp, wz = -s.vx * sp - s.vy * cp;
        if (oW < oL * 0.6) {                                    // side-swipe: push apart sideways
          const sg = Math.sign(dLat) || 1; s.x += surf.nx * sg * oW; s.z += surf.nz * sg * oW;
          const vl = wx * surf.nx + wz * surf.nz; if (vl * sg < 0) { wx -= 1.3 * vl * surf.nx; wz -= 1.3 * vl * surf.nz; }
          wx *= 0.97; wz *= 0.97;
        } else {                                                // nose-to-tail: match speeds
          const sg = ds > 0 ? -1 : 1; s.x += surf.tx * sg * oL; s.z += surf.tz * sg * oL;
          const va = wx * surf.tx + wz * surf.tz, rel = va - tc.v;
          if (rel * sg < 0) { const nv = tc.v - sg * 1.5; wx += (nv - va) * surf.tx; wz += (nv - va) * surf.tz; if (fresh) tc.v = Math.max(0, tc.v + clamp(rel * 0.3, -6, 6)); }
        }
        s.vx = wx * cp - wz * sp; s.vy = -wx * sp - wz * cp; s.r *= 0.7;
        if (fresh) {
          this.shake = 0.7; if (this.audio.ctx) this.audio._burst({ dur: 0.3, f0: 700, f1: 60, q: 0.6, gain: 0.9, type: 'lowpass' });
          this.score.crash();
        }
      }
    }
    if (!this.race) this.score.tick(dt, kmh, s.vx > 3 ? Math.abs(s.beta) * 57.3 : 0, surf.off < 0.5);
    // staging help: creep into the beams off the throttle and the line-lock stops the car in them
    if (this.race && this.race.state === 'staging' && !inp.fwd) { const f = s.x + this.noseX; if (f >= 0.04 && f < 0.27 && Math.abs(s.vx) < 2.5) { s.vx = 0; s.vy = 0; s.r = 0; } }
    const dragInfo = this.race ? this.race.update(dt, s.x + this.noseX, s.vx, world.onStrip ? world.onStrip(s.x, s.z) : true) : null;
    car.chute.update(dt, this.chute.open, Math.hypot(s.vx, s.vy), this.chute.state === 'open' || this.chute.state === 'repack');

    // --- lap timing
    if (world.hasLaps && surf.line) {
      const Lp = this.lap;
      if (surf.lap && Lp.running) { Lp.last = this.time - Lp.start; Lp.best = Lp.best ? Math.min(Lp.best, Lp.last) : Lp.last; Lp.count++; }
      Lp.start = this.time; Lp.running = true;
    }

    // --- car visuals
    s.y = surf.y || 0;
    const fwdDot = surf.tx !== undefined ? Math.cos(s.psi) * surf.tx - Math.sin(s.psi) * surf.tz : 0;
    car.root.position.set(s.x, s.y, s.z); car.root.rotation.set(0, s.psi, Math.atan((surf.slope || 0) * fwdDot));
    const roll = s.vx / P.R * dt;
    if (car.cockpit) car.cockpit.setSteer(s.steer);
    car.setWheels(s.steer, s.lockF ? 0 : roll + (P.split > 0 ? this.spin[0] * 25 * dt : 0), inp.hand || s.lockR ? 0 : roll + (P.split < 1 ? this.spin[1] * 25 * dt : 0));
    const rollK = this.mode.roll * (this.ride.preset ? this.ride.preset.roll : 1);
    car.dynRoll += (clamp(s.ay * 0.0055 * rollK, -0.09, 0.09) - car.dynRoll) * Math.min(1, dt * 8);
    car.dynPitch += (clamp(s.ax * 0.0032 * rollK, -0.05, 0.05) - car.dynPitch) * Math.min(1, dt * 8);
    const braking = this.trans === 'auto' && s.gear === -1 ? inp.fwd : inp.back;
    car.M.ledRed.emissiveIntensity = braking ? 4 : (world.night ? 1.4 : 0.35);

    world.sun.position.set(s.x, s.y, s.z).addScaledVector(world.sunDir, 80); world.sun.target.position.set(s.x, s.y, s.z);

    // --- audio
    const aBoost = this.audio.update(dt, s.rpm, s.thr, s.cut || s.shiftT > 0.02);
    this.audio.setRoad(Math.hypot(s.vx, s.vy), Math.max(s.slip, (s.scrape || 0) * 0.6), surf.off);
    if (!!surf.tunnel !== this.inTun) { this.inTun = !!surf.tunnel; this.audio.setReverb(this.inTun ? 0.5 : 0.12); }

    this._camera(dt);
    if (car.cockpit && this.cockpitW > 0) car.cockpit.update(dt, { kmh, rpm: s.rpm, redline: P.redline, gear: s.gear === -1 ? 'R' : s.gear === 0 ? 'N' : String(s.gear), shift: s.rpm > P.redline * 0.93 && s.gear >= 1 && s.gear < 6 });
    const sc = this.score;
    return {
      rpm: s.rpm, throttle: s.thr, boost: P.tg ? s.boost : aBoost, kmh, gear: s.gear === -1 ? 'R' : s.gear === 0 ? 'N' : String(s.gear), shiftUp: s.rpm > P.redline * 0.93 && s.gear >= 1 && s.gear < 6,
      camera: this.cameraLabel(), lap: this.lap, time: this.time, hasLaps: world.hasLaps, trans: this.trans, clutch: this.trans === 'manual' && inp.clutch,
      drag: dragInfo, mode: this.mode.name, scrape: s.scrape || 0, assists: this.assists(), active: { abs: s.absOn > 0, tcs: s.tcsOn > 0, esp: s.espOn > 0 }, locked: s.lockF || s.lockR,
      lc: this.setup.lc, lcHold: s.lcHold, chute: this.chute.state, chuteOpen: this.chute.open, boostPsi: P.boostPsi, boostLimited: P.boostLimited,
      score: sc.score, mult: sc.mult, comboT: sc.comboT / 6, drift: sc.drift, best: sc.best, drifting: s.driftT > 0,
    };
  }

  /** Body-local point → world, using the car body's current transform (so roll, pitch and ride height follow). */
  _bodyPoint(p, out) { return out.copy(p).applyMatrix4(this.car.body.matrixWorld); }
  /** Point a pose at a world target with a given up vector. */
  _aim(pose, target, up) { const c = this.poseCam; c.position.copy(pose.pos); c.up.copy(up); c.lookAt(target); pose.quat.copy(c.quaternion); }

  _camera(dt) {
    const s = this.s, cam = this.stage.camera, v = Math.hypot(s.vx, s.vy), car = this.car, rig = this.rig;
    const cfg = rig ? rig.cfg : null, fx = Math.cos(s.psi), fz = -Math.sin(s.psi);
    car.root.updateMatrixWorld(true);
    _m.setFromMatrix4(car.body.matrixWorld); const bodyUp = _up.set(0, 1, 0).applyMatrix3(_m).normalize();
    this.shake = Math.max(0, this.shake - dt * 1.6);
    const jx = (Math.random() - 0.5) * this.shake * 0.5, jy = (Math.random() - 0.5) * this.shake * 0.4;
    const [chase, cock, hood] = this.poses, worldUp = new THREE.Vector3(0, 1, 0);

    // ---- third-person: the existing chase camera, trailing the direction of travel so slides are visible
    const cv = CHASE_VIEWS[this.chaseView].id;
    if (cv === 'top') {
      chase.pos.set(s.x - fx * 6, s.y + 46 + v * 0.5, s.z - fz * 6); this._aim(chase, _w.set(s.x + fx * 8, s.y, s.z + fz * 8), worldUp); chase.fov = 50;
    } else {
      const want = s.psi + (v > 4 && s.vx > 0 ? Math.atan2(s.vy, s.vx) * 0.55 : 0);
      let dh = want - this.camHead; dh = Math.atan2(Math.sin(dh), Math.cos(dh));
      this.camHead += dh * Math.min(1, dt * (4.5 + v * 0.05));
      // with the parachute out the camera drops back and climbs so the canopy stays in shot
      const co = this.chute.state === 'open' ? Math.min(1, this.chute.open) : 0; this.camChute = (this.camChute || 0) + (co - (this.camChute || 0)) * Math.min(1, dt * 2.5);
      const V = (cfg ? cfg.chase : { views: { far: { dist: 6.6, height: 2.25 }, near: { dist: 4.6, height: 1.35 } } }).views[cv];
      const dist = V.dist + v * 0.02 + this.camChute * 8.5, up = V.height + this.camChute * 2.4;
      const tx = s.x - Math.cos(this.camHead) * dist, tz = s.z + Math.sin(this.camHead) * dist;
      this.camPos.x += (tx - this.camPos.x) * Math.min(1, dt * 12); this.camPos.z += (tz - this.camPos.z) * Math.min(1, dt * 12);
      this.camPos.y += (s.y + up - this.camPos.y) * Math.min(1, dt * 7);
      chase.pos.copy(this.camPos); chase.pos.x += jx; chase.pos.y += jy; this._aim(chase, _w.set(s.x + fx * 2.2, s.y + 0.95, s.z + fz * 2.2), worldUp);
      chase.fov = 58 + Math.min(20, v * 0.2);
    }

    if (rig) {
      // ---- cockpit: the driver's eye, attached to the body so it rolls and pitches with the car.
      // The head is thrown against acceleration (back under power, forward under braking, outwards in
      // corners), a little road vibration rises with speed, and the view leans into the turn.
      const ck = cfg.cockpit, k = ck.sway;
      const want = _v.set(clamp(-s.ax * 0.0035, -0.035, 0.035), Math.sin(this.time * (9 + v * 0.35)) * 0.0016 * Math.min(1, v / 30) * k, clamp(s.ay * 0.0032, -0.03, 0.03)).multiplyScalar(k);
      this.sway.lerp(want, Math.min(1, dt * 7));
      this._bodyPoint(_v.copy(rig.eye).add(this.sway), cock.pos); cock.pos.x += jx * 0.3; cock.pos.y += jy * 0.3;
      this._bodyPoint(_v.set(rig.eye.x + 20, rig.eye.y - 20 * ck.lookDown, rig.eye.z - s.steer * 7 * k), _w);
      this._aim(cock, _w, bodyUp); cock.fov = ck.fov + Math.min(ck.fovMax, v * ck.fovPerMs);

      // ---- hood: just above the bonnet, ahead of the windscreen. It follows pitch fully and most of the roll.
      const hd = cfg.hood;
      this._bodyPoint(rig.hood, hood.pos); hood.pos.x += jx * 0.4; hood.pos.y += jy * 0.4;
      this._bodyPoint(rig.hoodLook, _w);
      this._aim(hood, _w, _v.copy(worldUp).lerp(bodyUp, hd.rollFollow).normalize()); hood.fov = hd.fov + Math.min(hd.fovMax, v * hd.fovPerMs);
    } else { cock.pos.copy(chase.pos); cock.quat.copy(chase.quat); cock.fov = chase.fov; hood.pos.copy(chase.pos); hood.quat.copy(chase.quat); hood.fov = chase.fov; }

    // ---- glide between the old and the new camera; both keep tracking the car during the move
    const to = this.poses[this.camMode];
    let fov;
    if (this.camT < 1) {
      this.camT = Math.min(1, this.camT + dt / (cfg ? cfg.blend : 0.5));
      const t = this.camT * this.camT * (3 - 2 * this.camT), from = this.poses[this.camFrom];
      cam.position.lerpVectors(from.pos, to.pos, t); cam.quaternion.slerpQuaternions(from.quat, to.quat, t); fov = from.fov + (to.fov - from.fov) * t;
      this.cockpitW = (this.camFrom === 1 ? 1 - t : 0) + (this.camMode === 1 ? t : 0);
    } else { cam.position.copy(to.pos); cam.quaternion.copy(to.quat); fov = to.fov; this.cockpitW = this.camMode === 1 ? 1 : 0; }

    // from inside, tinted glass is much easier to see through than from outside
    car.M.glass.opacity = this.glassBase + (Math.min(this.glassBase, 0.16) - this.glassBase) * this.cockpitW;
    if (car.tray) car.tray.visible = this.cockpitW < 0.5;
    if (Math.abs(cam.fov - fov) > 0.05) { cam.fov += (fov - cam.fov) * Math.min(1, dt * 6); cam.updateProjectionMatrix(); }
  }

}
