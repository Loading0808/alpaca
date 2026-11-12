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
import { MeshBuilder, loft, pchip, lerp, clamp, smooth, sq, V, gridGeometry } from './geo.js';

const NS = 8;    // side wall segments
const NT = 10;   // top surface segments (per half)
const WELL = 0.34;

export function makeSurface(car) {
  const { L, W, H, wb, fo } = car.dims;
  const P = { ...PROFILE_DEFAULTS, ...car.profile };
  const noseX = wb / 2 + fo, tailX = noseX - L, xf = wb / 2, xr = -wb / 2;
  const X = fr => noseX - fr * L;
  const cowlX = X(P.cowl), wsX = X(P.wsTop), rwX = X(P.rwTop), deckX = X(P.deck);
  const R = car.tireR, Ra = R + 0.055, wcY = R, gc = car.gc;

  const hw = pchip([tailX, xr, 0, xf, noseX], P.plan.map(v => v * W / 2));
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
  const bF = need(xf), bR = need(xr), gauss = u => Math.exp(-u * u);
  const ys0 = x => Hc0(x) - P.crown + bF * gauss((x - xf) / (Ra * 1.15)) + bR * gauss((x - xr) / (Ra * 1.15));

  // side wall cross-section: tucked sills, widest at mid height, rounded shoulders
  const pf = t => t < 0.3 ? 1 - 0.05 * sq(1 - t / 0.3) : t > 0.55 ? 1 - 0.12 * sq((t - 0.55) / 0.45) : 1;
  const sideZ0 = (x, y) => { const f = floor0(x), s = ys0(x); return hw(x) * pf(clamp((y - f) / (s - f), 0, 1)); };
  const zs0 = x => hw(x) * pf(1);
  const topY0 = (x, z) => { const s = ys0(x), u = clamp(Math.abs(z) / zs0(x), 0, 1); return s + (Hc0(x) - s) * (1 - u * u * u * u); };

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
  S.ends = { 1: mkEnd(noseX, 0.05), [-1]: mkEnd(tailX, 0.04) };
  S.capHalf = (end, Y) => {
    const e = S.ends[end];
    return Y <= e.b ? S.sideZ(e.x, Y) : e.zs * Math.pow(clamp(1 - (Y - e.b) / Math.max(1e-4, e.h - e.b), 0, 1), 0.25);
  };
  S.capX = (end, Y, Z) => {
    const e = S.ends[end];
    const g = (Y <= e.a || Y >= e.h) ? 0 : Math.sqrt(Math.sin(Math.PI * (Y - e.a) / (e.h - e.a)));
    const Zr = S.capHalf(end, Y), u = Zr > 1e-4 ? clamp(Z / Zr, -1, 1) : 1;
    return e.x + end * e.B * (1 - u * u) * g;
  };
  return S;
}

function stations(S) {
  const { noseX, tailX, xf, xr, Ra } = S, xs = [];
  for (let x = tailX; x <= noseX + 1e-6; x += 0.04) xs.push(x);
  for (let d = 0; d <= 0.27; d += 0.0125) { xs.push(noseX - d, tailX + d); }
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
  for (let k = 1; k <= NS; k++) { const y = lerp(ya, s, k / NS); p.push([y, S.sideZ0(x, y)]); }
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
  const NC = 12;
  for (const end of [1, -1]) {
    const half = end > 0 ? halves[halves.length - 1] : halves[0];
    const rows = half.map(p => { const r = []; for (let c = 0; c <= NC; c++) { const z = p.z * (1 - 2 * c / NC); r.push(V(S.capX(end, p.y, z), p.y, z)); } return r; });
    loft(mb, rows, 'paint', false);
  }

  // greenhouse
  const gx = [];
  for (let x = S.deckX; x <= S.cowlX; x += 0.035) gx.push(x);
  const bpX = lerp(S.wsX, S.rwX, 0.6);
  gx.push(S.cowlX, S.wsX, S.rwX, bpX - 0.035, bpX + 0.035);
  gx.sort((a, b) => a - b);
  const NR = 7, P = S.P;
  const gHalf = x => {
    const g = S.gb(x), y0 = S.topY0(x, g) - 0.012, top = S.roofY(x), hc = Math.max(0, top - y0);
    const yE = top - 0.06 * Math.min(1, hc / 0.3), hs = Math.max(0, yE - y0), tum = P.tumble;
    const zr = g - hs * tum - 0.03 * Math.min(1, hs / 0.15), yr = y0 + hs * 0.99;
    const p = [[y0, g], [y0 + 0.45 * hs, g - 0.45 * hs * tum], [y0 + 0.86 * hs, g - 0.86 * hs * tum], [yr, zr]];
    for (let k = 1; k <= NR; k++) { const z = zr * (1 - k / NR); p.push([yr + (top - yr) * (1 - sq(z / zr)), z]); }
    return p.map(([y, z]) => S.pt(x, y, z));
  };
  const gHalves = gx.filter((x, i) => i === 0 || x - gx[i - 1] > 0.002).map(x => ({ x, h: gHalf(x) }));
  const gn = 4 + NR, gM = 2 * gn - 2;
  loft(mb, gHalves.map(o => fullRing(o.h)), (i, j) => {
    const hs = j < gn - 1 ? j : gM - 1 - j, xm = (gHalves[i].x + gHalves[i + 1].x) / 2;
    if (hs < 2) return Math.abs(xm - bpX) < 0.035 ? 'trim' : 'glass';
    if (hs === 2) return 'paint';
    return (xm > S.wsX || xm < S.rwX) ? 'glass' : 'roof';
  });

  const meshes = [];
  for (const k of mb.keys()) {
    const g = mb.geometry(k, k === 'glass' ? 0.5 : 0.8, k === 'roof' ? 9 : 0);
    if (!g) continue;
    const m = new THREE.Mesh(g, M[k]);
    m.name = k; m.castShadow = k !== 'glass'; m.receiveShadow = false;
    if (k === 'glass') m.renderOrder = 2;
    meshes.push(m);
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
  return gridGeometry((u, v) => { const x = lerp(x0, x1, u), y = lerp(yA(u, x), yB(u, x), v); return V(x, y, side * (S.sideZ(x, y) + off)); }, nu, nv);
}
/** Patch on the nose (end = 1) or tail (end = -1) face. z0/z1 in metres; yA/yB return metres. */
export function patchCap(S, end, z0, z1, yA, yB, off = 0.006, nu = 12, nv = 6) {
  return gridGeometry((u, v) => { const z = lerp(z0, z1, u), y = lerp(yA(u), yB(u), v); return V(S.capX(end, y, z) + end * off, y, z); }, nu, nv);
}

const FRONT_STYLES = {
  gtr: { c: [[-0.55, 0.55, 0.06, 0.6]], m: [[0.66, 0.9, 0.1, 0.34]] },
  slot: { c: [[-0.6, 0.6, 0.08, 0.3]], m: [[0.68, 0.9, 0.1, 0.3]] },
  tri: { c: [[-0.3, 0.3, 0.08, 0.5]], m: [[0.42, 0.9, 0.1, 0.42]] },
  kidney: { c: [[-0.5, 0.5, 0.05, 0.22]], m: [[0.03, 0.3, 0.28, 0.86], [0.6, 0.9, 0.08, 0.3]] },
  wide: { c: [[-0.9, 0.9, 0.5, 0.84], [-0.6, 0.6, 0.08, 0.36]], m: [] },
  single: { c: [[-0.5, 0.5, 0.1, 0.78]], m: [[0.62, 0.9, 0.12, 0.5]] },
  super: { c: [[-0.22, 0.22, 0.08, 0.3]], m: [[0.3, 0.9, 0.08, 0.5]] },
};

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

  // ---- front fascia
  const fs = FRONT_STYLES[car.style.front] || FRONT_STYLES.slot;
  fs.c.forEach(r => capRect(1, r, M.grille));
  fs.m.forEach(r => { capRect(1, r, M.grille); capRect(1, [-r[1], -r[0], r[2], r[3]], M.grille); });

  // ---- headlights
  const hs = car.style.head;
  if (hs === 'swept' || hs === 'slit') {
    const x0 = noseX - (hs === 'swept' ? 0.52 : 0.46), x1 = noseX - 0.05;
    const outer = (u, x) => 0.9 * S.zTop(x);
    const width = (u, x) => (hs === 'swept' ? 0.1 + 0.3 * Math.pow(u, 0.8) : 0.05 + 0.16 * u) * S.zTop(x);
    const inner = (u, x) => outer(u, x) - width(u, x);
    both(patchTop(S, x0, x1, inner, outer, 0.006, 18, 6), M.lens, 1);
    both(patchTop(S, x0 + 0.04, x1 - 0.01, (u, x) => inner(u, x) + 0.012, (u, x) => inner(u, x) + 0.032, 0.009, 18, 1), M.led, 2);
    if (hs === 'swept') {
      const xc = noseX - 0.19, rz = 0.05, rx = 0.06;
      const zc = x => 0.9 * S.zTop(x) - 0.105;
      both(patchTop(S, xc - rx, xc + rx, (u, x) => zc(x) - rz * Math.sqrt(Math.max(0, 1 - sq(2 * u - 1))), (u, x) => zc(x) + rz * Math.sqrt(Math.max(0, 1 - sq(2 * u - 1))), 0.009, 16, 3), M.led, 2);
    }
  } else if (hs === 'round') {
    const xc = noseX - 0.34, rx = 0.17, rz = 0.14, zc = x => 0.63 * S.zTop(x);
    const ell = (k) => [(u, x) => zc(x) - k * rz * Math.sqrt(Math.max(0, 1 - sq(2 * u - 1))), (u, x) => zc(x) + k * rz * Math.sqrt(Math.max(0, 1 - sq(2 * u - 1)))];
    both(patchTop(S, xc - rx, xc + rx, ...ell(1), 0.006, 24, 6), M.lens, 1);
    both(patchTop(S, xc - rx * 0.62, xc + rx * 0.62, ...ell(0.62), 0.009, 20, 4), M.led, 2);
  } else if (hs === 'box') {
    for (const s of [1, -1]) {
      capRect(1, s > 0 ? [0.52, 0.9, 0.54, 0.8] : [-0.9, -0.52, 0.54, 0.8], M.lens, 0.008);
      capRect(1, s > 0 ? [0.56, 0.86, 0.6, 0.66] : [-0.86, -0.56, 0.6, 0.66], M.led, 0.011);
      capRect(1, s > 0 ? [0.56, 0.86, 0.7, 0.75] : [-0.86, -0.56, 0.7, 0.75], M.led, 0.011);
    }
  } else if (hs === 'rounds') {
    for (const s of [1, -1]) for (const zN of [0.5, 0.78]) {
      capDisc(1, s * zN, 0.67, 0.075, M.lens, 0.008);
      capDisc(1, s * zN, 0.67, 0.05, M.led, 0.011);
    }
  }

  // ---- tail
  capRect(-1, [-0.8, 0.8, 0.03, 0.3], M.grille);
  capRect(-1, [-0.2, 0.2, 0.42, 0.58], M.plate, 0.008);
  const ts = car.style.tail;
  if (ts === 'quad') for (const s of [1, -1]) for (const zN of [0.46, 0.77]) { capDisc(-1, s * zN, 0.7, 0.082, M.lens, 0.007); capDisc(-1, s * zN, 0.7, 0.066, M.ledRed, 0.01); }
  if (ts === 'dual') for (const s of [1, -1]) { capDisc(-1, s * 0.64, 0.7, 0.1, M.lens, 0.007); capDisc(-1, s * 0.64, 0.7, 0.082, M.ledRed, 0.01); }
  if (ts === 'bar') { capRect(-1, [-0.92, 0.92, 0.66, 0.8], M.lens, 0.007); capRect(-1, [-0.9, 0.9, 0.7, 0.76], M.ledRed, 0.01); }
  if (ts === 'tri') for (const s of [1, -1]) for (const [a, b] of [[0.42, 0.54], [0.58, 0.7], [0.74, 0.86]]) capRect(-1, s > 0 ? [a, b, 0.52, 0.84] : [-b, -a, 0.52, 0.84], M.ledRed, 0.009);
  if (ts === 'slim') for (const s of [1, -1]) { capRect(-1, s > 0 ? [0.38, 0.93, 0.64, 0.82] : [-0.93, -0.38, 0.64, 0.82], M.lens, 0.007); capRect(-1, s > 0 ? [0.42, 0.9, 0.7, 0.76] : [-0.9, -0.42, 0.7, 0.76], M.ledRed, 0.01); }

  // ---- shut-lines and side intakes
  const sill = x => S.floorY(x) + 0.07, belt = x => S.shoulderY(x) - 0.012;
  const doorF = S.cowlX - 0.04, doorR = lerp(S.wsX, S.rwX, 0.6) - 0.1;
  for (const s of [1, -1]) {
    for (const x of [doorF, doorR]) add(patchSide(S, s, x, x + 0.008, (u, xx) => sill(xx), (u, xx) => belt(xx), 0.003, 1, 10), M.seam);
    add(patchSide(S, s, doorF, doorR + 0.008, (u, x) => sill(x), (u, x) => sill(x) + 0.008, 0.003, 14, 1), M.seam);
    // black rocker panel visually lightens the body side
    add(patchSide(S, s, S.xr + S.Ra + 0.02, S.xf - S.Ra - 0.02, (u, x) => S.floorY(x) + 0.002, (u, x) => S.floorY(x) + 0.062, 0.004, 14, 2), M.trim);
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
  const sw = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.016, 8, 24), M.seat);
  sw.position.set(seatX + 0.5, fy + 0.52, 0.36); sw.rotation.y = Math.PI / 2; sw.rotation.z = 0; sw.rotateX(0.35); sw.userData.solid = true; g.add(sw);

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
