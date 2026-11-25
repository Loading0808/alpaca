// One race: countdown, laps, walls, grass, drift scoring, ghost recording. No drawing here.
import { Car, autopilot } from './car.js';

export const MODES = {
  drift: { name: 'Drift Attack', laps: 3, blurb: 'Three laps. Chain drifts for the highest score.' },
  time: { name: 'Time Attack', laps: 3, blurb: 'Three laps against the clock and your best-lap ghost.' },
  free: { name: 'Free Drift', laps: Infinity, blurb: 'No laps, no clock. Practise and chase your best combo.' },
};

export const SCORE = {
  minAngle: 12,      // degrees of slide before it counts as a drift
  maxAngle: 105,
  minSpeed: 7,       // m/s
  grace: 1.1,        // seconds you can straighten up before the combo is banked
  multEvery: 2.2,    // seconds of drifting per extra multiplier
  maxMult: 5,
  wallBonus: 1.5,    // points × this while the rear is close to a wall
  crashSpeed: 4.5,   // impact speed (m/s) that loses the combo
  grassTime: 0.6,    // seconds on the grass that lose the combo
};

const GHOST_DT = 0.05;

export class Race {
  constructor(track, carDef, mode, opt = {}) {
    this.track = track;
    this.mode = mode;
    this.laps = MODES[mode].laps;
    this.car = new Car(carDef);
    this.ghostBest = opt.ghost || null; // { dt, pts: [x,y,h,...] }
    this.auto = !!opt.auto;             // driven by the autopilot (title-screen demo)
    this.events = [];
    this.loc = {};
    this.corners = [];
    this.reset();
  }

  reset() {
    const t = this.track, i = t.n - 5;
    this.car.reset(t.x[i], t.y[i], t.heading(i));
    t.locate(this.car.x, this.car.y, -1, this.loc);
    this.lastI = this.loc.i;
    this.prog = this.loc.i - t.n;
    this.state = this.auto ? 'running' : 'countdown';
    this.count = 3.2;
    this.time = 0;
    this.lap = 1;
    this.lapStart = 0;
    this.lapTimes = [];
    this.bestLap = Infinity;
    this.score = 0;
    this.bestCombo = 0;
    this.combo = { pts: 0, time: 0, grace: 0, mult: 1, active: false, wall: false };
    this.grass = 0;
    this.wrong = 0;
    this.wrongWay = false;
    this.rec = [];
    this.recT = 0;
    this.finished = false;
    this.events.length = 0;
    this.wallHits = 0;
  }

  emit(type, data = {}) { data.type = type; this.events.push(data); }

  respawn() {
    const t = this.track, i = this.loc.i;
    this.car.reset(t.x[i], t.y[i], t.heading(i));
    if (this.combo.active) this.loseCombo('RESET');
  }

  step(dt, inp, assist) {
    const car = this.car, t = this.track;
    if (this.state === 'countdown') {
      const before = Math.ceil(this.count);
      this.count -= dt;
      const after = Math.ceil(this.count);
      if (after !== before) this.emit('count', { n: after });
      if (this.count <= 0) { this.state = 'running'; this.emit('go'); }
      // you can rev on the line
      car.rpm += ((inp.throttle ? 6800 : 900) - car.rpm) * Math.min(1, dt * 6);
      return;
    }

    let input = inp;
    if (this.auto || this.finished) input = autopilot(car, t, this.loc, { drift: this.auto });
    if (this.finished) { input.throttle *= 0.4; if (car.speed > 14) input.brake = 0.4; }
    car.step(dt, input, this.auto ? 0.6 : assist);

    // where are we on the track
    t.locate(car.x, car.y, this.loc.i, this.loc);
    let dd = this.loc.i - this.lastI;
    if (dd > t.n / 2) dd -= t.n;
    if (dd < -t.n / 2) dd += t.n;
    this.prog += dd;
    this.lastI = this.loc.i;

    // surface: asphalt, kerb or grass
    const off = Math.abs(this.loc.d);
    const onGrass = off > t.half + 0.9;
    car.surface = onGrass ? 0.72 : 1;
    car.offDrag = onGrass ? 650 : 0;
    car.onGrass = onGrass;

    this.collide();

    if (this.finished) return;
    this.time += dt;

    // laps
    if (this.prog >= this.lap * t.n) {
      const lt = this.time - this.lapStart;
      this.lapTimes.push(lt);
      const best = lt < this.bestLap;
      if (best) this.bestLap = lt;
      const ghost = this.recLap();
      this.emit('lap', { lap: this.lap, time: lt, best, ghost });
      this.lap++;
      this.lapStart = this.time;
      if (this.lap > this.laps) this.finish();
    }

    // wrong way
    const along = car.vx * t.tx[this.loc.i] + car.vy * t.ty[this.loc.i];
    this.wrong = along < -2 ? this.wrong + dt : Math.max(0, this.wrong - dt * 2);
    this.wrongWay = this.wrong > 1;

    this.scoreDrift(dt, onGrass);

    // ghost recording (every 50 ms)
    this.recT += dt;
    while (this.recT >= GHOST_DT) {
      this.recT -= GHOST_DT;
      this.rec.push(Math.round(car.x * 100) / 100, Math.round(car.y * 100) / 100, Math.round(car.h * 1000) / 1000);
    }
  }

  recLap() { const g = { dt: GHOST_DT, pts: this.rec }; this.rec = []; this.recT = 0; return g; }

  ghostAt(time) {
    const g = this.ghostBest;
    if (!g || !g.pts.length || this.state !== 'running' || this.finished) return null;
    const lt = time - this.lapStart;
    const f = lt / g.dt, i = Math.floor(f), n = g.pts.length / 3;
    if (i >= n - 1) return null;
    const u = f - i, p = g.pts, a = i * 3, b = a + 3;
    let dh = p[b + 2] - p[a + 2];
    dh = Math.atan2(Math.sin(dh), Math.cos(dh));
    return { x: p[a] + (p[b] - p[a]) * u, y: p[a + 1] + (p[b + 1] - p[a + 1]) * u, h: p[a + 2] + dh * u };
  }

  scoreDrift(dt, onGrass) {
    const car = this.car, c = this.combo, t = this.track;
    const ang = Math.abs(car.beta) * 57.2958;
    const drifting = car.vf > 0 && car.speed > SCORE.minSpeed && ang > SCORE.minAngle && ang < SCORE.maxAngle && !onGrass;
    // close to the wall?
    let near = false;
    if (drifting) {
      car.corners(this.corners);
      for (let k = 2; k < 4; k++) {
        const p = this.corners[k];
        const l = t.locate(p.x, p.y, this.loc.i);
        if (t.wallOff - Math.abs(l.d) < 1.6) near = true;
      }
    }
    this.grass = onGrass ? this.grass + dt : 0;
    if (c.active && this.grass > SCORE.grassTime) { this.loseCombo('OFF TRACK'); return; }

    if (drifting) {
      if (!c.active) { c.active = true; c.pts = 0; c.time = 0; c.mult = 1; }
      c.grace = 0;
      c.time += dt;
      c.mult = Math.min(SCORE.maxMult, 1 + Math.floor(c.time / SCORE.multEvery));
      c.wall = near;
      c.pts += dt * car.speed * (ang - 8) * 0.55 * (near ? SCORE.wallBonus : 1);
    } else if (c.active) {
      c.wall = false;
      c.grace += dt;
      if (c.grace > SCORE.grace) this.bankCombo();
    }
    car.driftAngle = drifting ? ang : 0;
  }

  bankCombo() {
    const c = this.combo;
    const total = Math.round(c.pts * c.mult);
    c.active = false;
    if (total < 50) return;
    this.score += total;
    this.bestCombo = Math.max(this.bestCombo, total);
    this.emit('bank', { pts: total, mult: c.mult, time: c.time });
  }

  loseCombo(reason) {
    const c = this.combo;
    const lost = Math.round(c.pts * c.mult);
    c.active = false; c.pts = 0;
    if (lost > 50) this.emit('lost', { pts: lost, reason });
  }

  // walls: push the car out and bounce it (an impulse at the corner that hit, so it also spins)
  collide() {
    const car = this.car, t = this.track;
    car.corners(this.corners);
    let worst = 0, hit = null;
    for (let k = 0; k < 4; k++) {
      const p = this.corners[k];
      const l = t.locate(p.x, p.y, this.loc.i);
      const pen = Math.abs(l.d) - t.wallOff;
      if (pen <= 0) continue;
      const sgn = Math.sign(l.d);
      const nx = -l.nx * sgn, ny = -l.ny * sgn; // points back towards the track
      car.x += nx * pen; car.y += ny * pen;
      const rx = p.x - car.x, ry = p.y - car.y;
      const vpx = car.vx - car.w * ry, vpy = car.vy + car.w * rx;
      const vn = vpx * nx + vpy * ny;
      if (vn >= 0) continue;
      const m = car.def.mass, I = car.I * 1.6;
      const rn = rx * ny - ry * nx;
      const j = (-(1 + 0.25) * vn) / (1 / m + (rn * rn) / I);
      car.vx += (j * nx) / m; car.vy += (j * ny) / m;
      car.w += (rn * j) / I;
      // scrape: lose some speed along the wall
      const fr = Math.min(1, -vn * 0.03 + 0.01);
      car.vx *= 1 - fr; car.vy *= 1 - fr;
      if (-vn > worst) { worst = -vn; hit = { x: p.x, y: p.y, nx, ny }; }
    }
    if (hit) {
      this.wallHits++;
      this.emit('wall', { impact: worst, ...hit });
      if (worst > SCORE.crashSpeed && this.combo.active) this.loseCombo('CRASH');
    }
  }

  finish() {
    if (this.combo.active) this.bankCombo();
    this.finished = true;
    this.emit('finish');
  }

  // Free Drift ends when you choose; bank what you have.
  end() { if (this.combo.active) this.bankCombo(); this.finished = true; }
}
