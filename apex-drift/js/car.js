// Cars: the line-up, a bicycle-model drift physics, an autopilot and top-down drawing.
// Units: metres, seconds, kilograms, newtons. Heading h: forward = (cos h, sin h).

export const CARS = [
  { id: 'kite', slide: 0.78, name: 'Kite S1', tag: 'Light and forgiving. The car to learn sliding in.', unlock: 0,
    power: 125, mass: 1120, grip: 1.12, drag: 1.3, steer: 0.62, len: 4.15, wid: 1.78, style: 'hatch' },
  { id: 'vandal', slide: 0.7, name: 'Vandal R8', tag: 'Big V8, loose tail. A smoke machine.', unlock: 25000,
    power: 215, mass: 1460, grip: 1.1, drag: 1.18, steer: 0.6, len: 4.7, wid: 1.95, style: 'muscle' },
  { id: 'ronin', slide: 0.8, name: 'Ronin GT', tag: 'Sharp and balanced. Holds long, fast angles.', unlock: 70000,
    power: 195, mass: 1260, grip: 1.24, drag: 1.12, steer: 0.66, len: 4.4, wid: 1.84, style: 'coupe' },
  { id: 'zero', slide: 0.74, name: 'Apex Zero', tag: 'The fastest thing in the garage. Handle with care.', unlock: 160000,
    power: 310, mass: 1300, grip: 1.3, drag: 1.0, steer: 0.62, len: 4.5, wid: 1.96, style: 'hyper' },
];

export const PAINTS = ['#e5202e', '#ff6b1a', '#f2f2f2', '#1c1c21', '#2f7bff', '#19c37d', '#ffd400', '#b63cff'];

export function topSpeed(d) { return Math.cbrt((d.power * 1000) / d.drag); }

// 0..1 ratings for the car-select screen
export function ratings(d) {
  return {
    power: Math.min(1, (d.power * 1000 / d.mass) / 240),
    grip: Math.min(1, (d.grip - 0.9) / 0.45),
    speed: Math.min(1, (topSpeed(d) * 3.6 - 150) / 90),
    drift: Math.min(1, (1 - d.slide) * 2.4 + (d.power / d.mass) * 0.9),
  };
}

const G = 9.81;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

// Arcade drift model. Steering sets how fast the car rotates (limited by grip); sideways friction pulls the
// car's movement back in line with where it points, up to a grip limit. Rotate faster than the grip allows
// (or pull the handbrake) and the car slides. Sliding tyres grip less than rolling ones, so a slide keeps
// going until you straighten up: steer in to hold the angle, let go to straighten, countersteer to catch it.
export class Car {
  constructor(def) {
    this.def = def;
    this.L = def.len * 0.6;            // wheelbase
    this.b = def.len * 0.3;            // centre → rear axle (for skid marks)
    this.a = this.L - this.b;
    this.I = def.mass * (def.len * def.len + def.wid * def.wid) / 12;
    this.top = topSpeed(def);
    this.gearTops = [0.24, 0.4, 0.55, 0.7, 0.85, 1.03].map((f) => f * this.top);
    this.reset(0, 0, 0);
  }

  reset(x, y, h) {
    this.x = x; this.y = y; this.h = h;
    this.vx = 0; this.vy = 0; this.w = 0;
    this.steer = 0; this.steerIn = 0; this.thr = 0;
    this.gear = 1; this.rpm = 900;
    this.spin = 0; this.rearSlip = 0;
    this.surface = 1; this.offDrag = 0;
    this.braking = false; this.throttle = 0; this.handbrake = false;
    this.vf = 0; this.vr = 0; this.speed = 0; this.beta = 0;
    this.drifting = false;
  }

  // the fastest the car can rotate at a given forward speed
  maxYaw(v, drifting = this.drifting) {
    v = Math.abs(v);
    const lock = (v * Math.tan(this.def.steer)) / this.L;
    const grip = (this.def.grip * this.surface * G * 1.22) / Math.max(v, 1);
    return Math.min(lock, grip * (drifting ? 1.75 : 1));
  }

  step(dt, inp, assist = 0) {
    const d = this.def, m = d.mass;
    const c = Math.cos(this.h), s = Math.sin(this.h);
    let vf = this.vx * c + this.vy * s;
    let vr = -this.vx * s + this.vy * c;
    const speed = Math.hypot(vf, vr);
    const beta = speed > 2.5 ? Math.atan2(vr, Math.abs(vf)) : 0;
    const mu = d.grip * this.surface;

    // inputs (keyboards only give 0 or 1, so ease them in)
    const sIn = clamp(inp.steer || 0, -1, 1);
    const sRate = Math.abs(sIn) > Math.abs(this.steerIn) && Math.sign(sIn) === Math.sign(this.steerIn) ? 4 : 8;
    this.steerIn += clamp(sIn - this.steerIn, -sRate * dt, sRate * dt);
    const thrIn = inp.handbrake ? 0 : inp.throttle || 0;
    this.thr += clamp(thrIn - this.thr, -8 * dt, 3.5 * dt);
    const thr = thrIn > 0 ? this.thr : 0;
    const hbOn = !!inp.handbrake;

    // ---- longitudinal
    const v = Math.abs(vf);
    const P = d.power * 1000;
    const want = (P / (m * Math.max(v, 4))) * thr;              // what the engine gives
    const traction = mu * G * 0.9;                               // what the tyres can put down
    const spin = Math.max(0, want - traction) / traction;        // wheelspin (smoke, sound, power oversteer)
    let acc = Math.min(want, traction) * (this.drifting ? 0.92 : 1);
    let brakeDec = 0;
    if (inp.brake > 0) {
      if (vf > 0.8) brakeDec = inp.brake * mu * G * 0.95;
      else if (vf > -9) acc = -inp.brake * Math.min(P / (m * 5), 0.42 * G);
    }
    if (hbOn && v > 0.5) brakeDec += mu * G * 0.3;
    const vf0 = vf;
    vf += acc * dt - brakeDec * dt * Math.sign(vf);
    if (brakeDec > 0 && acc <= 0 && vf * vf0 < 0) vf = 0;

    // ---- rotation
    let wt = this.steerIn * this.maxYaw(vf) * (vf >= -0.3 ? 1 : -1);
    // drift assist: stop a slide from going past ~45°, and help it straighten out when you let go
    if (assist > 0 && this.drifting) {
      const over = Math.abs(beta) - 0.8;
      if (over > 0) wt += Math.sign(beta) * over * 7 * assist;
      if (Math.abs(sIn) < 0.1) wt += beta * 1.2 * assist;
    }
    this.w += (wt - this.w) * Math.min(1, dt * (this.drifting ? 3.5 : 9));

    // ---- sideways grip
    let muLat = mu * (this.drifting ? d.slide : 1);
    if (hbOn) muLat *= 0.38;
    if (this.drifting) muLat *= 1 - 0.22 * thr * Math.min(1, d.power / d.mass / 0.12);
    muLat /= 1 + spin * 1.4 * (Math.abs(this.steerIn) > 0.5 ? 1 : 0.2);
    const maxDv = muLat * G * dt * 1.15;
    vr += clamp(-vr * Math.min(1, dt * 14), -maxDv, maxDv);

    // slide state (hysteresis: easy to start, needs straightening to end)
    if (!this.drifting) {
      if ((Math.abs(vr) > 2.4 || (hbOn && Math.abs(this.steerIn) > 0.2)) && speed > 8) this.drifting = true;
    } else if ((Math.abs(beta) < 0.07 && !hbOn) || speed < 4) this.drifting = false;

    // ---- back to the world, with drag
    let vx = vf * c - vr * s, vy = vf * s + vr * c;
    const sp = Math.hypot(vx, vy);
    const k = Math.min(1, ((d.drag * sp + 12 + this.offDrag) / m) * dt);
    vx -= vx * k; vy -= vy * k;
    if (sp < 0.25 && !(thr > 0) && !(inp.brake > 0)) { vx = 0; vy = 0; }
    this.vx = vx; this.vy = vy;
    this.h += this.w * dt;
    this.x += vx * dt;
    this.y += vy * dt;

    // values used by the game, sound and effects
    this.steer = this.steerIn * d.steer;
    this.vf = vf; this.vr = vr; this.speed = sp; this.beta = beta;
    this.spin = spin; this.handbrake = hbOn; this.throttle = thr; this.braking = brakeDec > 0 && !hbOn;
    this.rearSlip = Math.abs(vr) * (this.drifting ? 1 : 0.5) + spin * 12 + (hbOn ? v * 0.35 : 0);

    // gearbox (for the sound and the HUD)
    if (vf < -0.5) this.gear = 0;
    else {
      if (this.gear < 1) this.gear = 1;
      while (this.gear < 6 && v > this.gearTops[this.gear - 1] * 0.97) this.gear++;
      while (this.gear > 1 && v < this.gearTops[this.gear - 2] * 0.82) this.gear--;
    }
    const gt = this.gearTops[Math.max(0, this.gear - 1)];
    let rpm = 1000 + (v / gt) * 6400 + spin * 4000 + (this.drifting ? thr * 900 : 0) + (hbOn && inp.throttle ? 2500 : 0);
    if (v < 1 && thr > 0) rpm = 1000 + thr * 5200;
    this.rpm += (clamp(rpm, 900, 7600) - this.rpm) * Math.min(1, dt * 12);
  }

  // corner positions (front-left, front-right, rear-right, rear-left)
  corners(out) {
    const c = Math.cos(this.h), s = Math.sin(this.h);
    const hl = this.def.len / 2, hw = this.def.wid / 2;
    const pts = [[hl, -hw], [hl, hw], [-hl, hw], [-hl, -hw]];
    for (let i = 0; i < 4; i++) {
      const [fx, fy] = pts[i];
      out[i] = out[i] || {};
      out[i].x = this.x + fx * c - fy * s;
      out[i].y = this.y + fx * s + fy * c;
    }
    return out;
  }

  rearWheels(out) {
    const c = Math.cos(this.h), s = Math.sin(this.h);
    const bx = -this.b, hw = this.def.wid / 2 - 0.25;
    out[0] = { x: this.x + bx * c + hw * s, y: this.y + bx * s - hw * c };
    out[1] = { x: this.x + bx * c - hw * s, y: this.y + bx * s + hw * c };
    return out;
  }
}

// Drives a car round a track. drift: throw it into corners with the handbrake.
export function autopilot(car, track, loc, opt = {}) {
  const n = track.n, sp = car.speed;
  const lookDist = 6 + sp * 0.5;
  const ti = (loc.i + Math.round(lookDist / track.ds)) % n;
  // aim a little to the inside of the bend
  const side = Math.sign(track.k[ti]) * Math.min(track.half * 0.45, Math.abs(track.k[ti]) * 300);
  const tx = track.x[ti] - track.ty[ti] * side, ty = track.y[ti] + track.tx[ti] * side;
  const dx = tx - car.x, dy = ty - car.y, D = Math.hypot(dx, dy) || 1;
  let diff = Math.atan2(dy, dx) - car.h;
  diff = Math.atan2(Math.sin(diff), Math.cos(diff));
  // pure pursuit: the rotation rate that arcs onto the target point
  const curv = (2 * Math.sin(diff)) / D;
  let w = curv * Math.max(car.speed, 1) - car.beta * (opt.drift ? 1.2 : 2.5);
  const steer = clamp(w / Math.max(0.05, car.maxYaw(car.vf)), -1, 1);
  // speed limit from the tightest bend ahead
  let kmax = 0;
  const ahead = Math.round((8 + sp * sp / 12) / track.ds);
  for (let o = 0; o < ahead; o++) {
    const k = Math.abs(track.k[(loc.i + o) % n]);
    const distTo = o * track.ds;
    // allowed speed at that point, minus what we can brake in the distance
    const vAt = Math.sqrt((car.def.grip * G * 0.92) / Math.max(k, 1e-4));
    const vNow = Math.sqrt(vAt * vAt + 2 * 7 * distTo);
    kmax = Math.max(kmax, 1 / (vNow * vNow));
  }
  const vt = Math.min(car.top, Math.sqrt(1 / kmax) * (opt.drift ? 1.06 : 1));
  const throttle = sp < vt - 1 ? 1 : sp < vt ? 0.4 : 0;
  const brake = sp > vt + 2 ? Math.min(1, (sp - vt) / 4) : 0;
  const bend = Math.abs(track.k[(loc.i + Math.round(12 / track.ds)) % n]);
  const handbrake = !!opt.drift && bend > 1 / 40 && sp > 15 && !car.drifting;
  return { steer, throttle, brake, handbrake };
}

// ------------------------------------------------------------------ drawing
function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  if (f < 0) { r *= 1 + f; g *= 1 + f; b *= 1 + f; }
  else { r += (255 - r) * f; g += (255 - g) * f; b += (255 - b) * f; }
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, w, h, r);
  else ctx.rect(x, y, w, h);
}

// Draw a car centred on (0,0), facing +x, in metres.
export function drawCarShape(ctx, def, paint, opt = {}) {
  const L = def.len, W = def.wid, hl = L / 2, hw = W / 2;
  const steer = opt.steer || 0;
  // shadow
  if (!opt.noShadow) {
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    rr(ctx, -hl + 0.25, -hw + 0.35, L, W, 0.6); ctx.fill();
  }
  // wheels
  ctx.fillStyle = '#0d0d0f';
  const wl = 0.68, ww = 0.3, ax = L * 0.31, bx = -L * 0.31;
  for (const [x, y, s] of [[ax, -hw + 0.05, 1], [ax, hw - 0.05, 1], [bx, -hw + 0.05, 0], [bx, hw - 0.05, 0]]) {
    ctx.save(); ctx.translate(x, y); if (s) ctx.rotate(steer);
    ctx.fillRect(-wl / 2, -ww / 2, wl, ww); ctx.restore();
  }
  // body
  const g = ctx.createLinearGradient(0, -hw, 0, hw);
  g.addColorStop(0, shade(paint, 0.22)); g.addColorStop(0.5, paint); g.addColorStop(1, shade(paint, -0.32));
  ctx.fillStyle = g;
  const style = def.style;
  ctx.beginPath();
  if (style === 'hyper') {
    ctx.moveTo(hl, -hw * 0.55); ctx.quadraticCurveTo(hl + 0.05, 0, hl, hw * 0.55);
    ctx.lineTo(hl * 0.55, hw); ctx.lineTo(-hl * 0.9, hw); ctx.lineTo(-hl, hw * 0.8); ctx.lineTo(-hl, -hw * 0.8);
    ctx.lineTo(-hl * 0.9, -hw); ctx.lineTo(hl * 0.55, -hw); ctx.closePath();
  } else if (ctx.roundRect) {
    ctx.roundRect(-hl, -hw + 0.04, L, W - 0.08, style === 'hatch' ? [0.75, 0.75, 0.45, 0.45] : style === 'muscle' ? 0.3 : [0.7, 0.7, 0.5, 0.5]);
  } else ctx.rect(-hl, -hw, L, W);
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.45)'; ctx.lineWidth = 0.06; ctx.stroke();
  // stripes
  if (style === 'muscle' || style === 'hyper') {
    ctx.fillStyle = paint === '#f2f2f2' || paint === '#ffd400' ? 'rgba(20,20,24,0.8)' : 'rgba(255,255,255,0.82)';
    ctx.fillRect(-hl, -0.32, L, 0.2); ctx.fillRect(-hl, 0.12, L, 0.2);
  }
  // glass
  const roofF = style === 'hatch' ? 0.55 : style === 'muscle' ? 0.42 : style === 'hyper' ? 0.62 : 0.5;
  const roofB = style === 'hatch' ? -0.78 : style === 'muscle' ? -0.55 : style === 'hyper' ? -0.45 : -0.6;
  const fx = hl * roofF, bx2 = hl * roofB;
  ctx.fillStyle = '#121620';
  ctx.beginPath();
  ctx.moveTo(fx, -hw * 0.78); ctx.lineTo(fx + 0.35, -hw * 0.6); ctx.lineTo(fx + 0.35, hw * 0.6); ctx.lineTo(fx, hw * 0.78);
  ctx.lineTo(bx2, hw * 0.74); ctx.lineTo(bx2 - 0.25, hw * 0.55); ctx.lineTo(bx2 - 0.25, -hw * 0.55); ctx.lineTo(bx2, -hw * 0.74);
  ctx.closePath(); ctx.fill();
  // roof
  ctx.fillStyle = shade(paint, -0.08);
  const rf = fx - 0.45, rb = bx2 + 0.3;
  rr(ctx, rb, -hw * 0.66, rf - rb, hw * 1.32, 0.3); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  rr(ctx, rb + 0.1, -hw * 0.6, rf - rb - 0.2, hw * 0.4, 0.2); ctx.fill();
  // wing
  if (style === 'hyper' || style === 'coupe') {
    ctx.fillStyle = '#16161a';
    ctx.fillRect(-hl + 0.05, -hw * 0.92, 0.32, W * 0.92);
  }
  // lights
  ctx.fillStyle = opt.night ? '#fffbe6' : '#f7f3d8';
  ctx.fillRect(hl - 0.14, -hw * 0.82, 0.14, 0.42); ctx.fillRect(hl - 0.14, hw * 0.82 - 0.42, 0.14, 0.42);
  ctx.fillStyle = opt.brake ? '#ff2a2a' : '#8a1018';
  ctx.fillRect(-hl, -hw * 0.82, 0.12, 0.42); ctx.fillRect(-hl, hw * 0.82 - 0.42, 0.12, 0.42);
  if (opt.brake) {
    ctx.fillStyle = 'rgba(255,40,40,0.3)';
    ctx.beginPath(); ctx.arc(-hl - 0.2, -hw * 0.6, 0.6, 0, 7); ctx.arc(-hl - 0.2, hw * 0.6, 0.6, 0, 7); ctx.fill();
  }
}
