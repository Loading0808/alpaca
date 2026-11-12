// Drive mode: takes the car you built out of the garage and onto a circuit or
// into the city. Physics is a bicycle model with load transfer, a tyre curve
// that lets go progressively (so cars can drift), a power-limited drivetrain
// with a six-speed automatic, turbo lag, aero drag and downforce — all derived
// from the build's stats, so every modification changes how the car drives.
import * as THREE from 'three';
import { WORLDS } from './world.js';

const G = 9.81, TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const sq = v => v * v;
const GEARS = [3.4, 2.2, 1.6, 1.25, 1.0, 0.82];
const tyre = a => Math.sin(1.35 * Math.atan(12 * a));        // normalised lateral force vs slip angle

export class Drive {
  constructor(stage, car, audio) {
    this.stage = stage; this.car = car; this.audio = audio;
    this.worlds = {}; this.active = false; this.camMode = 0; this.hud = null;
    this.camPos = new THREE.Vector3(); this.camHead = 0;
  }

  enter(id, stats, r) {
    const { stage, car } = this;
    const def = WORLDS.find(w => w.id === id) || WORLDS[0];
    const world = this.world = this.worlds[def.id] || (this.worlds[def.id] = def.build(stage.renderer));
    stage.scene.add(world.group);
    stage.driving = true; stage.garageRoot.visible = false; stage.controls.enabled = false;
    stage.scene.environment = world.env; stage.scene.fog = world.fog; stage.scene.background = world.fog.color;
    stage.camera.far = 4000; stage.resize();
    world.sun.castShadow = true; world.sun.shadow.mapSize.set(2048, 2048);
    Object.assign(world.sun.shadow.camera, { left: -14, right: 14, top: 14, bottom: -14, near: 1, far: 160 });
    world.sun.shadow.camera.updateProjectionMatrix(); world.sun.shadow.bias = -0.0005; world.sun.shadow.normalBias = 0.03;

    const c = r.car, L = c.dims.wb, front = c.layout === 'front' ? 0.52 : c.layout === 'mid' ? 0.43 : 0.39;
    const m = stats.weight + 80, vTop = stats.top / 3.6 * 1.06;
    this.P = {
      m, L, a: L * (1 - front), R: c.tireR, h: 0.48, Iz: m * L * L * 0.27,
      powerW: stats.hp * 745.7, redline: stats.redline, idle: r.engine.idle, launch: Math.min(stats.redline * 0.55, 4800),
      final: stats.redline * TAU * c.tireR / (60 * GEARS[5] * vTop),
      mu: 1.08 * r.tire.grip * (1 + r.susp.handling * 0.004), launchGrip: r.tire.launch || 1,
      split: c.drive === 'AWD' ? 0.36 : c.drive === 'FWD' ? 1 : 0,
      cda: c.cda * (1 + ((r.kit.drag || 0) + (r.spoiler.drag || 0)) * 2.2), down: stats.down,
      rearBias: 1.05 * Math.sqrt(c.tireW[1] / c.tireW[0]),
      tg: r.turbo.gain, sg: r.sc.gain * (r.turbo.gain ? 0.6 : 1), pops: r.exhaust.pops,
    };
    this.s = { x: 0, z: 0, psi: 0, vx: 0, vy: 0, r: 0, steer: 0, gear: 1, shiftT: 0, rpm: this.P.idle, reverse: false, ax: 0, ay: 0, boost: 0, thr: 0, cut: false, slip: 0 };
    this.lap = { start: 0, running: false, last: 0, best: 0, count: 0 };
    this.place(world.spawn); world.reset();
    this.active = true; this.time = 0;
    this.lightsWere = car.lights; car.setLights(world.night);
    this.audio.setReverb(world.night ? 0.12 : 0.04);
    this.camHead = this.s.psi; this.camPos.set(this.s.x - Math.cos(this.s.psi) * 8, 3, this.s.z + Math.sin(this.s.psi) * 8);
    return world;
  }

  exit() {
    const { stage, car } = this;
    if (!this.active) return;
    this.active = false;
    stage.scene.remove(this.world.group);
    stage.driving = false; stage.garageRoot.visible = true; stage.controls.enabled = true;
    stage.scene.environment = stage.garageEnv; stage.scene.fog = stage.garageFog; stage.scene.background = stage.garageBg;
    stage.camera.far = 120; stage.camera.fov = 34; stage.resize();
    car.root.position.set(0, 0.05, 0); car.root.rotation.set(0, 0, 0); car.dynRoll = car.dynPitch = 0;
    for (const p of car.wheels) p.rotation.y = 0;
    car.setLights(this.lightsWere);
    this.audio.setRoad(0, 0, 0); this.audio.setReverb(0.22);
  }

  place(p) { Object.assign(this.s, { x: p.x, z: p.z, psi: p.psi, vx: 0, vy: 0, r: 0, gear: 1, reverse: false }); }
  respawn() { this.place(this.world.respawn()); }
  nextCamera() { this.camMode = (this.camMode + 1) % 4; }

  _step(h, inp, surf) {
    const P = this.P, s = this.s, { m, L, a } = P, b = L - a;
    // --- pedals, with automatic reverse
    let thr, brk;
    if (!s.reverse) { thr = inp.fwd; brk = inp.back; if (inp.back && !inp.fwd && s.vx < 0.6) { s.reverse = true; s.gear = 1; } }
    if (s.reverse) { thr = inp.back; brk = inp.fwd; if (inp.fwd && s.vx > -0.6) { s.reverse = false; thr = inp.fwd; brk = 0; } }
    // --- steering: less lock at speed
    // (lock is limited to what the tyres can use, so full keyboard lock gives the limit of grip rather than a spin)
    const v = Math.hypot(s.vx, s.vy), dmax = Math.min(0.56, Math.atan(L * P.mu * G * 1.1 / Math.max(1, v * v)) + 0.075);
    s.steer += (inp.steer * dmax - s.steer) * Math.min(1, h * (inp.steer ? 6 : 10));
    const d = s.steer, cd = Math.cos(d), sd = Math.sin(d);

    // --- engine and gearbox
    const ratio = s.reverse ? -3.3 : GEARS[s.gear - 1], k = Math.abs(ratio) * P.final * 60 / (TAU * P.R);
    const coupled = Math.abs(s.vx) * k, slipRpm = P.idle + thr * (P.launch - P.idle);
    let rpm = Math.max(coupled, s.gear === 1 || s.reverse ? slipRpm : P.idle);
    s.shiftT = Math.max(0, s.shiftT - h);
    s.cut = rpm >= P.redline; rpm = Math.min(rpm, P.redline * 1.01);
    const te = (s.shiftT > 0 || s.cut) ? 0 : thr, x = rpm / P.redline;
    const shape = x < 0.85 ? (x / 0.85) * (0.8 + 0.2 * clamp(x / 0.5, 0, 1)) : 1 - 1.5 * sq(x - 0.85);
    const boostF = (1 + P.sg + P.tg * s.boost) / (1 + P.sg + P.tg);
    let Fd = te * P.powerW * shape * boostF / (rpm * TAU / 60) * Math.abs(ratio) * P.final * 0.88 / P.R * Math.sign(ratio);
    if (coupled > P.idle) Fd -= Math.sign(s.vx) * (1 - te) * 0.05 * m * G * x * Math.min(3, Math.abs(ratio));   // engine braking

    // --- vertical loads (static + load transfer + downforce)
    const aero = 0.6 * P.down * 3.2 * v * v;
    const Fzf = Math.max(0.1 * m * G, m * G * b / L - m * s.ax * P.h / L + aero * 0.42);
    const Fzr = Math.max(0.1 * m * G, m * G * a / L + m * s.ax * P.h / L + aero * 0.58);
    const mu = P.mu * surf.grip, capF = mu * Fzf, capR = mu * Fzr * P.rearBias * (s.gear === 1 && v < 20 ? P.launchGrip : 1);
    // traction control: keep some grip in reserve for cornering (released with the handbrake, so you can still drift)
    if (!inp.hand) { const lim = 0.86 * (P.split * capF + (1 - P.split) * capR); Fd = clamp(Fd, -lim, lim); }

    // --- longitudinal tyre forces
    const dir = Math.abs(s.vx) > 0.25 ? -Math.sign(s.vx) : 0, Fb = brk * mu * m * G;
    let Fxf = Fd * P.split + dir * Fb * 0.68, Fxr = Fd * (1 - P.split) + dir * Fb * 0.32 + dir * inp.hand * capR * 0.9;
    const spinF = Math.max(0, Math.abs(Fxf) / capF - 1), spinR = Math.max(0, Math.abs(Fxr) / capR - 1);
    Fxf = clamp(Fxf, -capF, capF); Fxr = clamp(Fxr, -capR, capR);
    const latF = Math.sqrt(Math.max(0.12, 1 - 0.7 * sq(Fxf / capF))), latR = Math.sqrt(Math.max(0.12, 1 - 0.7 * sq(Fxr / capR))) * (inp.hand ? 0.4 : 1) / (1 + spinR * 0.6);

    // --- lateral tyre forces from slip angles
    const vyf = s.vy + a * s.r, vyr = s.vy - b * s.r;
    const af = -Math.atan2(-s.vx * sd + vyf * cd, Math.max(1.5, Math.abs(s.vx * cd + vyf * sd)));
    const ar = -Math.atan2(vyr, Math.max(1.5, Math.abs(s.vx)));
    const Fyf = capF * latF * tyre(af), Fyr = capR * latR * tyre(ar);

    // --- resistances
    const drag = 0.6 * P.cda * s.vx * Math.abs(s.vx) + Math.sign(s.vx) * m * G * (0.014 + surf.drag * 0.14) + surf.drag * m * 0.05 * s.vx;

    // --- integrate
    const fxB = Fxf * cd - Fyf * sd + Fxr - drag, fyB = Fxf * sd + Fyf * cd + Fyr;
    const axl = fxB / m, ayl = fyB / m;
    s.vx += (axl + s.vy * s.r) * h; s.vy += (ayl - s.vx * s.r) * h;
    s.r += (a * (Fxf * sd + Fyf * cd) - b * Fyr) / P.Iz * h;
    if (v < 3) {                                                // parking speeds: blend to a kinematic model
      const w = 1 - v / 3; s.vy *= 1 - Math.min(1, h * 8 * w);
      s.r += (s.vx * Math.tan(d) / L - s.r) * Math.min(1, h * 10 * w);
    }
    if (brk && !thr && Math.abs(s.vx) < 0.35) { s.vx = 0; s.vy *= 0.5; s.r *= 0.5; }
    s.r *= 1 - Math.min(1, h * 0.35);                          // a little yaw damping
    // stability control: catches slides before they become spins. Pull the handbrake to switch it off for a moment and drift.
    s.driftT = inp.hand ? 1.6 : Math.max(0, (s.driftT || 0) - h);
    if (v > 4) {
      const ex = clamp((Math.abs(Math.atan2(s.vy, Math.abs(s.vx))) - 0.07) / 0.28, 0, 1) * (s.driftT > 0 ? 0.15 : 1);
      s.vy *= 1 - Math.min(1, h * 4 * ex); s.r *= 1 - Math.min(1, h * 2 * ex);
    }
    s.psi += s.r * h;
    const cp = Math.cos(s.psi), sp = Math.sin(s.psi);
    s.x += (s.vx * cp - s.vy * sp) * h; s.z += (-s.vx * sp - s.vy * cp) * h;
    s.ax += (axl - s.ax) * Math.min(1, h * 12); s.ay += (ayl - s.ay) * Math.min(1, h * 12);

    // --- automatic gearbox
    if (!s.reverse && s.shiftT <= 0) {
      if (coupled > P.redline * 0.965 && s.gear < 6) { s.gear++; s.shiftT = 0.2; }
      else if (s.gear > 1 && coupled * GEARS[s.gear - 2] / GEARS[s.gear - 1] < P.redline * (thr > 0.7 ? 0.8 : 0.52)) { s.gear--; s.shiftT = 0.14; }
    }
    s.rpm += (rpm - s.rpm) * Math.min(1, h * 20); s.thr = te;
    s.slip = Math.max(s.slip * (1 - h * 6), Math.min(1.5, Math.max(spinF, spinR) * 0.8), clamp((Math.abs(ar) - 0.1) / 0.3, 0, 1) * clamp(v / 8, 0, 1), clamp((Math.abs(af) - 0.14) / 0.3, 0, 1) * clamp(v / 8, 0, 1));
    this.spin = [spinF, spinR];
  }

  /** inp = { fwd, back, steer (-1 right .. 1 left), hand }. Returns state for the HUD / tachometer. */
  update(dt, inp) {
    const { car, world, s, P, stage } = this;
    this.time += dt;
    const surf = world.surface(s.x, s.z);
    const n = 4; for (let i = 0; i < n; i++) this._step(dt / n, inp, surf);

    // collisions
    const hit = world.collide(s.x, s.z);
    if (hit) {
      const cp = Math.cos(s.psi), sp = Math.sin(s.psi);
      let wx = s.vx * cp - s.vy * sp, wz = -s.vx * sp - s.vy * cp;
      const vn = wx * hit.nx + wz * hit.nz;
      if (vn < 0) {
        wx -= 1.25 * vn * hit.nx; wz -= 1.25 * vn * hit.nz; wx *= 0.82; wz *= 0.82;
        s.vx = wx * cp - wz * sp; s.vy = -wx * sp - wz * cp; s.r *= 0.5;
        if (vn < -2.5 && this.audio.ctx) this.audio._burst({ dur: 0.18, f0: 500, f1: 80, q: 0.6, gain: Math.min(0.9, -vn / 14), type: 'lowpass' });
      }
      s.x = hit.x; s.z = hit.z;
    }

    // lap timing
    if (world.hasLaps && surf.line) {
      const L = this.lap;
      if (surf.lap && L.running) { L.last = this.time - L.start; L.best = L.best ? Math.min(L.best, L.last) : L.last; L.count++; }
      L.start = this.time; L.running = true;
    }

    // car visuals
    car.root.position.set(s.x, 0, s.z); car.root.rotation.y = s.psi;
    const roll = s.vx / P.R * dt;
    car.setWheels(s.steer, roll + (P.split > 0 ? this.spin[0] * 25 * dt : 0), inp.hand ? 0 : roll + (P.split < 1 ? this.spin[1] * 25 * dt : 0));
    car.dynRoll += (clamp(s.ay * 0.0045, -0.06, 0.06) - car.dynRoll) * Math.min(1, dt * 8);
    car.dynPitch += (clamp(s.ax * 0.0028, -0.035, 0.035) - car.dynPitch) * Math.min(1, dt * 8);
    car.M.ledRed.emissiveIntensity = (s.reverse ? inp.fwd : inp.back) ? 4 : (world.night ? 1.4 : 0.35);

    // sun / moon shadow follows the car
    world.sun.position.set(s.x, 0, s.z).addScaledVector(world.sunDir, 70); world.sun.target.position.set(s.x, 0, s.z);

    // audio
    s.boost = this.audio.update(dt, s.rpm, s.thr, s.cut || s.shiftT > 0.02);
    this.audio.setRoad(Math.hypot(s.vx, s.vy), s.slip, surf.off);

    this._camera(dt);
    return { rpm: s.rpm, throttle: s.thr, boost: s.boost, kmh: Math.abs(s.vx) * 3.6, gear: s.reverse ? 'R' : String(s.gear), lap: this.lap, time: this.time, hasLaps: world.hasLaps };
  }

  _camera(dt) {
    const s = this.s, cam = this.stage.camera, v = Math.hypot(s.vx, s.vy), H = this.car.S.H;
    const fx = Math.cos(s.psi), fz = -Math.sin(s.psi);
    let fov = 58 + Math.min(18, v * 0.22);
    if (this.camMode === 2) {                                   // hood
      cam.position.set(s.x + fx * 0.75, H * 0.92, s.z + fz * 0.75); cam.lookAt(s.x + fx * 30, H * 0.7, s.z + fz * 30); fov = 70 + Math.min(14, v * 0.16);
    } else if (this.camMode === 3) {                            // top-down
      cam.position.set(s.x - fx * 6, 46 + v * 0.5, s.z - fz * 6); cam.lookAt(s.x + fx * 8, 0, s.z + fz * 8); fov = 50;
    } else {
      // chase camera trails the direction of travel, so slides are visible
      const want = s.psi + (v > 4 && s.vx > 0 ? Math.atan2(s.vy, s.vx) * 0.55 : 0);
      let dh = want - this.camHead; dh = Math.atan2(Math.sin(dh), Math.cos(dh));
      this.camHead += dh * Math.min(1, dt * (4.5 + v * 0.05));
      const dist = (this.camMode === 1 ? 4.6 : 6.6) + v * 0.02, up = this.camMode === 1 ? 1.35 : 2.25;
      const tx = s.x - Math.cos(this.camHead) * dist, tz = s.z + Math.sin(this.camHead) * dist;
      this.camPos.x += (tx - this.camPos.x) * Math.min(1, dt * 12); this.camPos.z += (tz - this.camPos.z) * Math.min(1, dt * 12);
      this.camPos.y += (up - this.camPos.y) * Math.min(1, dt * 5);
      cam.position.copy(this.camPos); cam.lookAt(s.x + fx * 2.2, 0.95, s.z + fz * 2.2);
    }
    if (Math.abs(cam.fov - fov) > 0.05) { cam.fov += (fov - cam.fov) * Math.min(1, dt * 4); cam.updateProjectionMatrix(); }
  }
}
