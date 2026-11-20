// Procedural car body.
//
// Every car is described by a handful of real-world dimensions plus a profile
// (see data.js). From those we derive an analytic body surface, loft a shell
// with real cut wheel arches, add a glazed greenhouse and then project lights,
// grilles, shut-lines etc. onto the surface as conformal patches.
//
// Axes: +x = front of the car, +y = up, +z = right-hand side. Origin is on the
// ground at the centre of the wheelbase.
import * as THREE from 'three';
import { PROFILE_DEFAULTS } from './data.js';
import { DESIGNS } from './designs.js';
import { MeshBuilder, loft, pchip, lerp, clamp, smooth, sq, V, gridGeometry } from './geo.js';

const TS = [0.07, 0.16, 0.27, 0.38, 0.48, 0.57, 0.63, 0.66, 0.69, 0.72, 0.78, 0.85, 0.93, 1]; // side wall sample heights
const NS = TS.length;
const NT = 10;   // top surface segments (per half)
const WELL = 0.34;

export function makeSurface(car) {
  const { L, W, H, wb, fo } = car.dims;
  const P = { ...PROFILE_DEFAULTS, ...car.profile };
  const noseX = wb / 2 + fo, tailX = noseX - L, xf = wb / 2, xr = -wb / 2;
  const X = fr => noseX - fr * L;
  const cowlX = X(P.cowl), wsX = X(P.wsTop), rwX = X(P.rwTop), deckX = X(P.deck);
  const R = car.tireR, Ra = R + 0.055, wcY = R, gc = car.gc;

  const hwBase = pchip([tailX, xr, 0, xf, noseX], P.plan.map(v => v * W / 2));
  // wings swell out over the wheels and the body pulls in at the doors, like a real car in plan view
  const hw = x => hwBase(x) + P.haunch * (Math.exp(-sq((x - xf) / 0.55)) + Math.exp(-sq((x - xr) / 0.6)) - 0.55);
  const floor0 = x => {
    if (x > xf + Ra) return gc + P.frontRise * smooth((x - xf - Ra) / (noseX - xf - Ra));
    if (x < xr - Ra) return gc + P.rearRise * smooth((xr - Ra - x) / (xr - Ra - tailX));
    return gc;
  };
  // centreline height of the body (hood / scuttle / deck)
  const Hc0 = x => {
    if (x >= cowlX) return P.noseH + (P.cowlH - P.noseH) * Math.pow(clamp((noseX - x) / (noseX - cowlX), 0, 1), P.hoodPow);
    if (x >= deckX) return lerp(P.cowlH, P.deckH, (cowlX - x) / (cowlX - deckX));
    return lerp(P.deckH, P.tailH, Math.pow(clamp((deckX - x) / (deckX - tailX), 0, 1), 1.4));
  };
  // shoulder line, raised into fender humps where the hood is lower than the arches
  const need = xa => Math.max(0, wcY + Ra + 0.085 - (Hc0(xa) - P.crown));
  const bF = Math.max(P.fender, need(xf)), bR = Math.max(P.fender, need(xr)), gauss = u => Math.exp(-u * u);
  const ys0 = x => Hc0(x) - P.crown + bF * gauss((x - xf) / (Ra * 1.15)) + bR * gauss((x - xr) / (Ra * 1.15));

  // side wall cross-section: tucked sills, widest at mid height, rounded shoulders
  const pf = t => t < 0.36 ? 1 - 0.075 * sq(1 - t / 0.36) : t > 0.66 ? 1 - 0.15 * Math.pow((t - 0.66) / 0.34, 1.7) : 1;
  // sculpted door surface: a scallop that ends in a crisp shoulder crease, fading out into the wheel-arch haunches
  const scT = t => t < 0.3 || t > 0.72 ? 0 : t < 0.66 ? smooth((t - 0.3) / 0.36) : 1 - smooth((t - 0.66) / 0.06);
  const scX = x => P.scallop * smooth((x - (xr + Ra * 0.75)) / 0.45) * smooth((xf - Ra * 0.9 - x) / 0.35);
  const sideZ0 = (x, y) => { const f = floor0(x), s = ys0(x), t = clamp((y - f) / (s - f), 0, 1); return hw(x) * pf(t) - scX(x) * scT(t); };
  const zs0 = x => hw(x) * pf(1);
  const hoodB = x => P.hoodBulge * smooth((x - cowlX) / 0.25) * smooth((noseX - 0.3 - x) / 0.5);
  const topY0 = (x, z) => {
    const s = ys0(x), u = clamp(Math.abs(z) / zs0(x), 0, 1);
    return s + (Hc0(x) - s) * (1 - Math.pow(u, 2.6)) + (x > cowlX ? hoodB(x) * (1 - smooth((u - 0.3) / 0.14)) : 0);
  };

  // rounding of the nose and tail
  const shr = x => {
    let k = 0, amt = 0;
    const dF = noseX - x, dR = x - tailX;
    if (dF < P.noseRound) { const t = 1 - dF / P.noseRound; k = 1 - Math.sqrt(Math.max(0, 1 - t * t)); amt = P.noseTaper; }
    else if (dR < P.tailRound) { const t = 1 - dR / P.tailRound; k = 1 - Math.sqrt(Math.max(0, 1 - t * t)); amt = P.tailTaper; }
    return { sz: 1 - amt * k, sy: 0.16 * k, ym: lerp(floor0(x), ys0(x), 0.45) };
  };
  const pt = (x, y, z) => { const s = shr(x); return V(x, y - (y - s.ym) * s.sy, z * s.sz); };
  const yFwd = (x, y) => { const s = shr(x); return y - (y - s.ym) * s.sy; };
  const yInv = (x, Y) => { const s = shr(x); return s.ym + (Y - s.ym) / (1 - s.sy); };

  // greenhouse
  const roofTop = x => {
    const u = clamp((wsX - x) / (wsX - rwX), 0, 1);
    return u < 0.35 ? H - 0.025 * sq((0.35 - u) / 0.35) : H - P.roofDrop * sq((u - 0.35) / 0.65);
  };
  const roofY = x => {
    if (x >= cowlX || x <= deckX) return Hc0(x);
    const B = Hc0(x);
    if (x > wsX) return B + (roofTop(wsX) - B) * Math.pow(Math.sin(((cowlX - x) / (cowlX - wsX)) * Math.PI / 2), 0.85);
    if (x < rwX) return B + (roofTop(rwX) - B) * Math.pow(Math.sin(((x - deckX) / (rwX - deckX)) * Math.PI / 2), P.rearPow);
    return roofTop(x);
  };
  const gb = x => (zs0(x) - P.shoulder) * (1 - P.cabTaper * smooth((rwX - x) / (rwX - deckX)));

  const S = {
    car, P, noseX, tailX, xf, xr, cowlX, wsX, rwX, deckX, R, Ra, wcY, H, W,
    hw, floor0, ys0, Hc0, sideZ0, zs0, topY0, pt, roofY, gb,
    floorY: x => yFwd(x, floor0(x)),
    shoulderY: x => yFwd(x, ys0(x)),
    topC: x => yFwd(x, Hc0(x)),
    zTop: x => zs0(x) * shr(x).sz,
    sideZ: (x, Y) => sideZ0(x, yInv(x, Y)) * shr(x).sz,
    topY: (x, Z) => yFwd(x, topY0(x, Z / shr(x).sz)),
  };
  const mkEnd = (x, B) => ({ x, B, a: S.floorY(x), b: S.shoulderY(x), h: S.topC(x), zs: S.zTop(x) });
  S.ends = { 1: mkEnd(noseX, P.noseBulge), [-1]: mkEnd(tailX, P.tailBulge) };
  S.capHalf = (end, Y) => {
    const e = S.ends[end];
    return Y <= e.b ? S.sideZ(e.x, Y) : e.zs * Math.pow(clamp(1 - (Y - e.b) / Math.max(1e-4, e.h - e.b), 0, 1), 1 / 2.6);
  };
  S.capX = (end, Y, Z) => {
    const e = S.ends[end];
    const g = (Y <= e.a || Y >= e.h) ? 0 : Math.pow(Math.sin(Math.PI * Math.pow((Y - e.a) / (e.h - e.a), 0.8)), 0.6);  // bumper sticks out most just below mid height
    const Zr = S.capHalf(end, Y), u = Zr > 1e-4 ? clamp(Z / Zr, -1, 1) : 1;
    return e.x + end * e.B * (1 - Math.pow(Math.abs(u), 2.6)) * g;
  };
  return S;
}

function stations(S) {
  const { noseX, tailX, xf, xr, Ra } = S, xs = [];
  for (let x = tailX; x <= noseX + 1e-6; x += 0.04) xs.push(x);
  for (let d = 0; d <= 0.5; d += 0.0125) { xs.push(noseX - d, tailX + d); }
  for (const xa of [xf, xr]) {
    for (let i = 1; i < 36; i++) xs.push(xa + Ra * Math.cos(Math.PI * i / 36));
    xs.push(xa + Ra - 0.002, xa + Ra + 0.002, xa - Ra + 0.002, xa - Ra - 0.002);
  }
  xs.push(S.cowlX, S.deckX, noseX, tailX);
  xs.sort((a, b) => a - b);
  const out = [];
  for (const x of xs) if (x >= tailX - 1e-6 && x <= noseX + 1e-6 && (!out.length || x - out[out.length - 1] > 0.0015)) out.push(clamp(x, tailX, noseX));
  out[0] = tailX; out[out.length - 1] = noseX;
  return out;
}

function halfRing(S, x) {
  const f = S.floor0(x), s = S.ys0(x), zS = S.zs0(x);
  let ya = f, inArch = false;
  for (const xa of [S.xf, S.xr]) {
    const d = Math.abs(x - xa);
    if (d < S.Ra) { ya = Math.max(f, S.wcY + Math.sqrt(S.Ra * S.Ra - d * d)); inArch = true; }
  }
  const zo = S.sideZ0(x, ya), zl = zo - 0.03, zi = inArch ? zo - WELL : zl;
  const yc = inArch ? Math.max(f, Math.min(ya + 0.05, s - 0.02, S.topY0(x, zi) - 0.02)) : f;
  const p = [[f, 0], [f, zi], [yc, zi], [yc, zl], [ya, zl], [ya, zo]];
  for (let k = 1; k <= NS; k++) { const y = lerp(ya, s, TS[k - 1]); p.push([y, S.sideZ0(x, y)]); }
  for (let k = 1; k <= NT; k++) { const z = zS * (1 - k / NT); p.push([S.topY0(x, z), z]); }
  return p.map(([y, z]) => S.pt(x, y, z));
}

const fullRing = half => {
  const out = half.slice();
  for (let j = half.length - 2; j >= 1; j--) out.push(V(half[j].x, half[j].y, -half[j].z));
  return out;
};

/** Build the painted shell + glazed greenhouse. Returns { meshes, S }. */
export function buildShell(S, M) {
  const mb = new MeshBuilder();
  const xs = stations(S), n = 6 + NS + NT, Mring = 2 * n - 2;
  const halves = xs.map(x => halfRing(S, x)), rings = halves.map(fullRing);
  loft(mb, rings, (i, j) => {
    const hs = j < n - 1 ? j : Mring - 1 - j;
    if (hs < 5) return 'under';
    if (hs < 5 + NS) return 'paint';
    const k = hs - (5 + NS), xm = (xs[i] + xs[i + 1]) / 2;
    if (xm < S.cowlX - 0.03 && xm > S.deckX + 0.03 && S.zs0(xm) * (1 - k / NT) <= S.gb(xm) + 0.005) return 'interior';
    return 'paint';
  });
  // bulged end caps
  const NC = 20;
  for (const end of [1, -1]) {
    const half = end > 0 ? halves[halves.length - 1] : halves[0];
    const rows = half.map(p => { const r = []; for (let c = 0; c <= NC; c++) { const z = p.z * (1 - 2 * c / NC); r.push(V(S.capX(end, p.y, z), p.y, z)); } return r; });
    loft(mb, rows, 'paint', false);
  }

  // greenhouse
  const gx = [];
  for (let x = S.deckX; x <= S.cowlX; x += 0.035) gx.push(x);
  const four = S.car.doors === 4, bpX = lerp(S.wsX, S.rwX, four ? 0.46 : 0.6), cpX = lerp(S.rwX, S.wsX, four ? 0.04 : 0.1);
  gx.push(S.cowlX, S.wsX, S.rwX, bpX - 0.035, bpX + 0.035, cpX);
  gx.sort((a, b) => a - b);
  const NR = 9, P = S.P, midX = (S.wsX + S.rwX) / 2;
  const gHalf = x => {
    // the screens are bowed in plan view: their corners sit further back (front) / forward (rear) than the centre
    const bow = x > midX ? P.bowF : -P.bowR, topAt = u => S.roofY(x + bow * u * u);
    const g = S.gb(x), y0 = S.topY0(x, g) - 0.012, top = topAt(0), topE = topAt(1), hc = Math.max(0, topE - y0);
    const yE = topE - 0.06 * Math.min(1, hc / 0.3), hs = Math.max(0, yE - y0), tum = P.tumble;
    const zr = g - hs * tum - 0.03 * Math.min(1, hs / 0.15), yr = y0 + hs * 0.99;
    const p = [[y0, g], [y0 + 0.08 * hs, g - 0.08 * hs * tum], [y0 + 0.45 * hs, g - 0.45 * hs * tum], [y0 + 0.86 * hs, g - 0.86 * hs * tum], [yr, zr]];
    for (let k = 1; k <= NR; k++) { const z = zr * (1 - k / NR), u = zr > 1e-4 ? z / zr : 0; p.push([yr + (Math.max(yr, topAt(u)) - yr) * (1 - u * u), z]); }
    return p.map(([y, z]) => S.pt(x, y, z));
  };
  const gHalves = gx.filter((x, i) => i === 0 || x - gx[i - 1] > 0.002).map(x => ({ x, h: gHalf(x) }));
  const gn = 5 + NR, gM = 2 * gn - 2;
  // open ring (closed = false): the greenhouse is only the glass, pillars and roof — no panel across the cabin at belt height
  loft(mb, gHalves.map(o => fullRing(o.h)), (i, j) => {
    const hs = j < gn - 1 ? j : gM - 1 - j, xm = (gHalves[i].x + gHalves[i + 1].x) / 2;
    if (hs === 0) return 'trim';                                   // belt-line window surround
    if (hs < 3) return xm < cpX ? 'gpaint' : Math.abs(xm - bpX) < 0.035 ? 'trim' : 'glass';   // C-pillar / B-pillar / side glass
    if (hs === 3) return 'gpaint';                                    // A-pillar and cant rail
    return (xm > S.wsX || xm < S.rwX) ? 'glass' : 'roof';
  }, false);

  const meshes = [];
  for (const k of mb.keys()) {
    const g = mb.geometry(k, k === 'glass' ? 0.5 : 0.8, k === 'roof' ? 9 : k === 'paint' ? 26 : 0);
    if (!g) continue;
    if (k === 'gpaint') {
      // pillars are painted outside only: work out which face winding points away from the cabin, so the
      // inside can be culled and the trim lining below shows instead of body colour
      const p = g.attributes.position, a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(); let out = 0;
      for (let i = 0; i < p.count; i += 3) {
        a.fromBufferAttribute(p, i); b.fromBufferAttribute(p, i + 1); c.fromBufferAttribute(p, i + 2);
        const n = b.clone().sub(a).cross(c.clone().sub(a)), cen = a.add(b).add(c).multiplyScalar(1 / 3);
        out += Math.sign(n.y * (cen.y - S.H * 0.55) + n.z * cen.z);
      }
      M.gpaintSide = out >= 0 ? THREE.FrontSide : THREE.BackSide;
    }
    const m = new THREE.Mesh(g, k === 'gpaint' ? M.gpaint : M[k]);
    m.name = k === 'gpaint' ? 'paint' : k; m.castShadow = k !== 'glass'; m.receiveShadow = false;
    if (k === 'glass') m.renderOrder = 2;
    meshes.push(m);
    if (k === 'gpaint') {
      // the same pillars seen from inside the cabin: a dark trim lining just inboard of the paint
      const inner = g.clone(), p = inner.attributes.position;
      for (let i = 0; i < p.count; i++) { const z = p.getZ(i); p.setZ(i, z - Math.sign(z) * 0.008); p.setY(i, p.getY(i) - 0.004); }
      const im = new THREE.Mesh(inner, M.interior); im.name = 'pillarTrim'; meshes.push(im);
    }
  }
  return meshes;
}

// ---------------------------------------------------------------------------
// Conformal patches ("decals") projected onto the analytic surface
// ---------------------------------------------------------------------------
export function patchTop(S, x0, x1, zA, zB, off = 0.006, nu = 16, nv = 6) {
  return gridGeometry((u, v) => { const x = lerp(x0, x1, u), z = lerp(zA(u, x), zB(u, x), v); return V(x, S.topY(x, z) + off, z); }, nu, nv);
}
export function patchSide(S, side, x0, x1, yA, yB, off = 0.004, nu = 12, nv = 6) {
  return gridGeometry((u, v) => { const x = lerp(x0, x1, u), y = lerp(yA(u, x), yB(u, x), v); return V(x, y, side * (S.sideZ(x, y) + off)); }, nu, nv, 8, 'xy');
}
/** Patch on the nose (end = 1) or tail (end = -1) face. z0/z1 in metres; yA/yB return metres. */
export function patchCap(S, end, z0, z1, yA, yB, off = 0.006, nu = 12, nv = 6) {
  return gridGeometry((u, v) => { const z = lerp(z0, z1, u), y = lerp(yA(u), yB(u), v); return V(S.capX(end, y, z) + end * off, y, z); }, nu, nv, 8, 'zy');
}

/** Lights, grilles, shut-lines, mirrors, seats and exhaust tips. */
export function buildDetails(S, M, build, exhaust) {
  const g = new THREE.Group(); g.name = 'details';
  const car = S.car, { noseX, tailX } = S;
  const add = (geo, mat, order = 1) => { const m = new THREE.Mesh(geo, mat); m.renderOrder = order; g.add(m); return m; };
  const mirrorZ = geo => { const c = geo.clone(); c.scale(1, 1, -1); return c; };
  const both = (geo, mat, order) => { add(geo, mat, order); add(mirrorZ(geo), mat, order); };

  // normalised rectangles on an end cap
  const capRect = (end, [z0, z1, y0, y1], mat, off = 0.006) => {
    const e = S.ends[end], Y = t => lerp(e.a, e.b, t), ym = Y((y0 + y1) / 2), Z = S.capHalf(end, ym);
    return add(patchCap(S, end, z0 * Z, z1 * Z, () => Y(y0), () => Y(y1), off), mat);
  };
  const capDisc = (end, zN, yN, r, mat, off = 0.008) => {
    const e = S.ends[end], yc = lerp(e.a, e.b, yN), zc = zN * S.capHalf(end, yc);
    const h = u => r * Math.sqrt(Math.max(0, 1 - sq(2 * u - 1)));
    return add(patchCap(S, end, zc - r, zc + r, u => yc - h(u), u => yc + h(u), off, 20, 4), mat);
  };

  // ---- individual front / rear design for this car (see designs.js)
  const D = DESIGNS[car.id] || DESIGNS.gtr;
  const MAT = { g: M.grille, k: M.trim, l: M.lens, w: M.led, r: M.ledRed, a: M.amber, c: M.chrome, b: M.paint, p: M.plate, x: M.carbon, s: M.seam };
  const layer = (sh, base) => base + 0.0028 * (sh.o || 0);
  const drawCap = (end, shapes) => {
    const e = S.ends[end], Y = t => lerp(e.a, e.b, t), Z = S.capHalf(end, Y(0.45));
    for (const sh of shapes) for (const sg of sh.mir ? [1, -1] : [1]) {
      const mat = MAT[sh.m], off = layer(sh, 0.006);
      if (sh.t === 'c') { capDisc(end, sg * sh.z, sh.y, sh.r, mat, off + 0.001); continue; }
      for (let i = 0; i < sh.p.length - 1; i++) {
        const [za, a0, a1] = sh.p[i], [zb, b0, b1] = sh.p[i + 1];
        add(patchCap(S, end, sg * za * Z, sg * zb * Z, u => Y(lerp(a0, b0, u)), u => Y(lerp(a1, b1, u)), off, 6, 3), mat, 1 + (sh.o || 0));
      }
    }
  };
  // shapes on top of the body, measured back from the nose (end = 1) or forward from the tail (end = -1)
  const drawTop = (end, shapes) => {
    const X = d => end > 0 ? noseX - d : tailX + d;
    for (const sh of shapes) {
      const mat = MAT[sh.m], off = layer(sh, 0.006), ord = 1 + (sh.o || 0);
      if (sh.t === 'c') {
        const xc = X(sh.d), el = k => (u, x) => sh.z * S.zTop(x) + k * sh.rz * Math.sqrt(Math.max(0, 1 - sq(2 * u - 1)));
        both(patchTop(S, xc - sh.rd, xc + sh.rd, el(-1), el(1), off, 16, 3), mat, ord); continue;
      }
      for (let i = 0; i < sh.p.length - 1; i++) {
        let [da, ia, oa] = sh.p[i], [db, ib, ob] = sh.p[i + 1], xa = X(da), xb = X(db);
        if (xa > xb) { [xa, xb] = [xb, xa];[ia, ib] = [ib, ia];[oa, ob] = [ob, oa]; }
        both(patchTop(S, xa, xb, (u, x) => lerp(ia, ib, u) * S.zTop(x), (u, x) => lerp(oa, ob, u) * S.zTop(x), off, 8, 4), mat, ord);
      }
    }
  };
  drawCap(1, D.f); drawTop(1, D.h || []); if (D.ht) drawTop(1, D.ht);
  capRect(1, [-0.93, 0.93, 0.0, 0.055], M.trim, 0.007);                 // chin
  capDisc(1, 0, 0.92, 0.026, M.chrome, 0.012); capDisc(-1, 0, 0.9, 0.026, M.chrome, 0.012);   // badges
  capRect(-1, [-0.8, 0.8, 0.03, 0.3], M.grille);                         // rear valance
  if (D.plate !== null) { const [p0, p1] = D.plate || [0.42, 0.58]; capRect(-1, [-0.2, 0.2, p0, p1], M.plate, 0.012); }
  drawCap(-1, D.r); if (D.rt) drawTop(-1, D.rt);

  // ---- shut-lines and side intakes
  const sill = x => S.floorY(x) + 0.07, belt = x => S.shoulderY(x) - 0.012;
  const four = car.doors === 4, bp = lerp(S.wsX, S.rwX, four ? 0.46 : 0.6);
  const doorF = S.cowlX - 0.04, doorR = four ? Math.max(S.xr + S.Ra * 0.55, S.rwX - 0.1) : bp - 0.1;
  for (const s of [1, -1]) {
    for (const x of four ? [doorF, bp, doorR] : [doorF, doorR]) add(patchSide(S, s, x, x + 0.008, (u, xx) => sill(xx), (u, xx) => belt(xx), 0.003, 1, 10), M.seam);
    add(patchSide(S, s, doorF, doorR + 0.008, (u, x) => sill(x), (u, x) => sill(x) + 0.008, 0.003, 14, 1), M.seam);
    // black rocker panel visually lightens the body side
    add(patchSide(S, s, S.xr + S.Ra + 0.02, S.xf - S.Ra - 0.02, (u, x) => S.floorY(x) + 0.002, (u, x) => S.floorY(x) + 0.062, 0.004, 14, 2), M.trim);
    if (four) add(patchSide(S, s, bp - 0.2, bp - 0.06, (u, x) => belt(x) - 0.1, (u, x) => belt(x) - 0.075, 0.006, 4, 1), M.trim);
    // fuel filler
    if (s > 0) { const xq = S.xr + 0.05, yq = S.wcY + S.Ra + 0.1, rq = 0.065; if (yq + rq < belt(xq)) add(patchSide(S, s, xq - rq, xq + rq, u => yq - rq * Math.sqrt(Math.max(0, 1 - sq(2 * u - 1))), u => yq + rq * Math.sqrt(Math.max(0, 1 - sq(2 * u - 1))), 0.0025, 16, 2), M.seamThin); }
    // door handle
    add(patchSide(S, s, doorR - 0.2, doorR - 0.06, (u, x) => belt(x) - 0.1, (u, x) => belt(x) - 0.075, 0.006, 4, 1), M.trim);
    if (car.layout === 'mid') {
      const x1 = S.xr + S.Ra + 0.12, x0 = x1 + 0.34;
      add(patchSide(S, s, x1, x0, (u, x) => lerp(S.floorY(x), S.shoulderY(x), 0.42 + 0.1 * u), (u, x) => lerp(S.floorY(x), S.shoulderY(x), 0.8 - 0.12 * u), 0.005, 8, 6), M.grille);
    }
  }

  // ---- hood and trunk shut-lines
  const hb = S.cowlX + 0.04, hf = noseX - 0.3, zl = (u, x) => S.zTop(x) * (0.8 - 0.42 * smooth((x - lerp(hb, hf, 0.55)) / ((hf - hb) * 0.45)));
  for (const s of [1, -1]) add(patchTop(S, hb, hf, (u, x) => s * zl(u, x), (u, x) => s * (zl(u, x) - 0.007), 0.004, 30, 1), M.seam);
  add(patchTop(S, hb, hb + 0.007, (u, x) => -zl(0, x), (u, x) => zl(0, x), 0.004, 1, 20), M.seam);
  add(patchTop(S, hf - 0.007, hf, (u, x) => -zl(0, hf), (u, x) => zl(0, hf), 0.004, 1, 14), M.seam);
  if (S.deckX - tailX > 0.45) {
    const tb = S.deckX - 0.04, tf = tailX + 0.1, zt = x => S.zTop(x) * 0.8;
    for (const s of [1, -1]) add(patchTop(S, tf, tb, (u, x) => s * zt(x), (u, x) => s * (zt(x) - 0.007), 0.004, 12, 1), M.seam);
    add(patchTop(S, tb, tb + 0.007, (u, x) => -zt(x), (u, x) => zt(x), 0.004, 1, 20), M.seam);
  }

  // ---- hood variants
  const hoodBack = S.cowlX + 0.05, hoodFront = noseX - 0.3;
  const hood = build.hood;
  if (hood === 'carbon') {
    const zb = (u, x) => S.zTop(x) * (0.8 - 0.42 * smooth((u - 0.55) / 0.45)) - 0.008;
    add(patchTop(S, hoodBack, hoodFront, (u, x) => -zb(u, x), zb, 0.004, 26, 16), M.carbon, 0);
  }
  if (hood === 'vented' || hood === 'carbon') {
    const len = hoodFront - hoodBack, xa = hoodBack + len * 0.3, xb = hoodBack + len * 0.58;
    for (const s of [1, -1]) for (let i = 0; i < 3; i++) {
      const xv = lerp(xa, xb, i / 2);
      add(patchTop(S, xv, xv + 0.045, (u, x) => s * 0.16 * S.zTop(x), (u, x) => s * 0.46 * S.zTop(x), 0.008, 2, 6), M.grille, 2);
    }
  }

  // ---- hood scoop
  if (car.scoop) {
    const xs0 = lerp(hoodBack, hoodFront, 0.42), sc = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.07, 0.5), M.paint);
    sc.position.set(xs0, S.topY(xs0, 0) + 0.02, 0); sc.rotation.z = -0.07; sc.castShadow = true; g.add(sc);
    const mouth = new THREE.Mesh(new THREE.PlaneGeometry(0.44, 0.045), M.grille); mouth.rotation.y = Math.PI / 2; mouth.position.set(xs0 + 0.172, S.topY(xs0, 0) + 0.035, 0); g.add(mouth);
  }
  // ---- wipers
  for (const zw of [0.22, -0.28]) { const w = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.012, 0.46), M.seam); w.position.set(S.cowlX - 0.02, S.topY(S.cowlX, zw) + 0.02, zw); g.add(w); }

  // ---- mirrors
  const mx = S.cowlX - 0.1;
  const mGeo = new THREE.SphereGeometry(1, 16, 12); mGeo.scale(0.075, 0.055, 0.105);
  for (const s of [1, -1]) {
    const zb = S.gb(mx), y = S.topY(mx, zb) + 0.075;
    const m = new THREE.Mesh(mGeo, M.paint); m.position.set(mx, y, s * (zb + 0.12)); m.castShadow = true; g.add(m);
    const st = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.02, 0.12), M.trim); st.position.set(mx + 0.01, y - 0.035, s * (zb + 0.04)); g.add(st);
  }

  // ---- interior
  const seatX = lerp(S.wsX, S.rwX, car.layout === 'front' ? 0.55 : 0.7), fy = S.floor0(seatX);
  for (const s of [1, -1]) {
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.14, 0.44), M.seat); base.position.set(seatX + 0.1, fy + 0.2, s * 0.36);
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.62, 0.44), M.seat); back.position.set(seatX - 0.17, fy + 0.5, s * 0.36); back.rotation.z = 0.3;
    base.userData.solid = back.userData.solid = true; g.add(base, back);
  }
  // (the steering wheel, dashboard and instruments are built by cockpit.js)

  // ---- exhaust tips
  const layout = exhaust.tips === 'stock' ? car.tips : (car.tips.startsWith('center') ? 'center2' : exhaust.tips);
  const r = exhaust.dia / 2, e = S.ends[-1], ty = e.a + 0.06 + r, Zc = S.capHalf(-1, ty);
  const zsList = layout === 'center2' ? [r * 1.25, -r * 1.25]
    : layout === 'quad' ? [0.6 * Zc - r * 1.25, 0.6 * Zc + r * 1.25, -0.6 * Zc + r * 1.25, -0.6 * Zc - r * 1.25]
      : [0.62 * Zc, -0.62 * Zc];
  const tipMat = { chrome: M.chrome, black: M.blackChrome, titanium: M.titanium, steel: M.steel }[exhaust.mat] || M.chrome;
  const stick = exhaust.id === 'straight' ? 0.07 : 0.035, tl = 0.24;
  const tipGeo = new THREE.CylinderGeometry(r, r * 0.96, tl, 24, 1, true); tipGeo.rotateZ(Math.PI / 2);
  const innerGeo = new THREE.CylinderGeometry(r * 0.9, r * 0.86, tl, 24, 1, true); innerGeo.rotateZ(Math.PI / 2);
  const lipGeo = new THREE.TorusGeometry(r * 0.95, r * 0.07, 8, 24); lipGeo.rotateY(Math.PI / 2);
  const tips = [];
  for (const z of zsList) {
    const xe = S.capX(-1, ty, z) - stick;
    const t = new THREE.Group(); t.position.set(xe + tl / 2, ty, z);
    t.add(new THREE.Mesh(tipGeo, tipMat), new THREE.Mesh(innerGeo, M.tipInner));
    const lip = new THREE.Mesh(lipGeo, tipMat); lip.position.x = -tl / 2; t.add(lip);
    t.userData.solid = true; g.add(t); tips.push(V(xe, ty, z));
  }
  g.userData.tips = tips;
  g.userData.tipRadius = r;
  return g;
}
