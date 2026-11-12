// Body kits: over-fenders, splitters, skirts, diffusers, canards and wings.
// Every part is generated against the analytic body surface so it fits any car.
import * as THREE from 'three';
import { MeshBuilder, loft, capRing, lerp, clamp, V } from './geo.js';

const DEG = Math.PI / 180;

function flare(mb, S, xa, w, style, rivets) {
  const { Ra, wcY } = S, hF = style === 'box' ? 0.15 : style === 'smooth' ? 0.16 : 0.125;
  for (const side of [1, -1]) {
    const rings = [], N = 44;
    for (let i = 0; i <= N; i++) {
      const th = lerp(-30, 210, i / N) * DEG, c = Math.cos(th), s = Math.sin(th);
      const up = clamp(s, 0, 1);
      const wi = w * (style === 'box' ? 0.8 + 0.2 * up : 0.42 + 0.58 * up) * clamp((s + 0.5) / 0.4, 0, 1);
      const at = r => { const x = xa + r * c; const y = Math.max(S.floorY(x) + 0.004, wcY + r * s); return [x, y, S.sideZ(x, Math.min(y, S.shoulderY(x)))]; };
      const [x0, y0, b0] = at(Ra - 0.012), [x1, y1] = at(Ra + 0.032);
      const [xm, ym, bm] = at(Ra + 0.032 + (hF - 0.032) * 0.55), [x3, y3, b3] = at(Ra + hF);
      const bulge = style === 'box' ? 0.96 : style === 'smooth' ? 0.6 : 0.78;
      rings.push([
        V(x0, y0, side * (b0 - 0.025)), V(x0, y0, side * (b0 + wi)), V(x1, y1, side * (b0 + wi)),
        V(xm, ym, side * (bm + wi * bulge)), V(x3, y3, side * (b3 + 0.004)), V(x3, y3, side * (b3 - 0.06)),
      ]);
      if (rivets && style === 'rivet' && i % 3 === 1 && s > -0.15) {
        const [xr2, yr2, br2] = at(Ra + hF - 0.022);
        rivets.push(V(xr2, yr2, side * (br2 + wi * 0.16 + 0.004)));
      }
    }
    loft(mb, rings, 'paint', false);
    capRing(mb, 'paint', rings[0]); capRing(mb, 'paint', rings[rings.length - 1]);
  }
}

/** Front or rear lip that follows the bumper outline, with an optional splitter blade. */
function lip(mb, key, S, end, ext, th = 0.012) {
  const xe = end > 0 ? S.noseX : S.tailX;
  const xa = end > 0 ? S.xf + S.Ra + 0.04 : S.xr - S.Ra - 0.04;
  const edge = x => S.sideZ(x, S.floorY(x) + 0.012);
  const path = [];
  const n = 18;
  for (let i = 0; i <= n; i++) { const x = lerp(xa, xe, i / n); path.push([x, edge(x)]); }
  const ze = edge(xe);
  for (let i = 1; i < 12; i++) path.push([xe, ze * (1 - 2 * i / 12)]);
  for (let i = n; i >= 0; i--) { const x = lerp(xa, xe, i / n); path.push([x, -edge(x)]); }
  const yS = S.floorY(xa) - 0.02, cx = (xa + xe) / 2;
  const rings = path.map(([x, z], i) => {
    const a = path[Math.max(0, i - 1)], b = path[Math.min(path.length - 1, i + 1)];
    let tx = b[0] - a[0], tz = b[1] - a[1]; const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l;
    let nx = tz, nz = -tx; if (nx * (x - cx) + nz * z < 0) { nx = -nx; nz = -nz; }
    const P = (d, y) => V(x + nx * d, y, z + nz * d);
    return [P(-0.012, S.floorY(x) + 0.014), P(0.012, yS + th), P(0.012 + ext, yS + th), P(0.012 + ext, yS), P(-0.13, yS)];
  });
  loft(mb, rings, key, true);
  capRing(mb, key, rings[0]); capRing(mb, key, rings[rings.length - 1]);
}

function skirts(mb, key, S, out) {
  const x0 = S.xr + S.Ra + 0.03, x1 = S.xf - S.Ra - 0.03;
  for (const s of [1, -1]) {
    const rings = [];
    for (let i = 0; i <= 14; i++) {
      const x = lerp(x0, x1, i / 14), f = S.floorY(x), ze = S.sideZ(x, f + 0.03), k = Math.sin(Math.PI * i / 14) * 0.25 + 0.75;
      rings.push([V(x, f + 0.08, s * (ze - 0.004)), V(x, f + 0.055, s * (ze + out * k)), V(x, f - 0.035, s * (ze + out * k)), V(x, f - 0.035, s * (ze - 0.08))]);
    }
    loft(mb, rings, key, true);
    capRing(mb, key, rings[0]); capRing(mb, key, rings[rings.length - 1]);
  }
}

function wing(mb, key, S, o) {
  // inverted aerofoil lofted across the car
  const sec = [], c = o.chord, a = o.aoa * DEG;
  const top = t => 0.05 * c * Math.sin(Math.PI * Math.pow(t, 0.6)) + 0.1 * c * t * t;
  const bot = t => -0.075 * c * Math.sin(Math.PI * Math.pow(t, 0.7)) + 0.1 * c * t * t;
  for (let i = 0; i <= 8; i++) sec.push([i / 8, top(i / 8)]);
  for (let i = 7; i >= 1; i--) sec.push([i / 8, bot(i / 8)]);
  const ring = z => sec.map(([t, y]) => {
    const dx = -(t - 0.5) * c, xx = dx * Math.cos(a) - y * Math.sin(a), yy = dx * Math.sin(a) + y * Math.cos(a);
    return V(o.x + xx, o.y + yy, z);
  });
  loft(mb, [ring(-o.half), ring(0), ring(o.half)], key, true);
}

export function buildKit(S, M, kit, spoilerId) {
  const g = new THREE.Group(); g.name = 'kit';
  const mb = new MeshBuilder();
  const key = kit.mat === 'carbon' ? 'carbon' : 'blackGloss';
  const rivets = [];

  if (kit.flareF) { flare(mb, S, S.xf, kit.flareF, kit.flareStyle, rivets); flare(mb, S, S.xr, kit.flareR, kit.flareStyle, rivets); }
  if (kit.splitter) lip(mb, key, S, 1, kit.splitter);
  if (kit.rearLip) lip(mb, key, S, -1, kit.rearLip * 0.6);
  if (kit.skirts) skirts(mb, key, S, kit.skirts);

  // ---- spoilers / wings
  const tx = S.tailX, zw = S.zTop(tx + 0.12) * 0.9;
  if (spoilerId === 'lip' || spoilerId === 'ducktail') {
    const hgt = spoilerId === 'lip' ? 0.035 : 0.11, len = spoilerId === 'lip' ? 0.16 : 0.34, rings = [];
    for (let i = 0; i <= 20; i++) {
      const z = lerp(-zw, zw, i / 20), k = 1 - 0.35 * Math.pow(Math.abs(z / zw), 3);
      rings.push([V(tx + len, S.topY(tx + len, z) - 0.006, z), V(tx + 0.03, S.topY(tx + 0.05, z) + hgt * k, z),
        V(tx + 0.015, S.topY(tx + 0.05, z) + hgt * k - 0.014, z), V(tx + 0.03, S.topY(tx + 0.04, z) - 0.02, z)]);
    }
    loft(mb, rings, 'paint', true);
    capRing(mb, 'paint', rings[0]); capRing(mb, 'paint', rings[rings.length - 1]);
  }
  if (spoilerId === 'gt' || spoilerId === 'swan') {
    const big = spoilerId === 'swan';
    const xw = tx + (big ? 0.1 : 0.2), deckY = S.topY(tx + 0.25, 0.3);
    const o = { x: xw, y: Math.min(deckY + (big ? 0.4 : 0.27), S.H + 0.06), chord: big ? 0.36 : 0.27, aoa: big ? 12 : 8, half: S.W / 2 * (big ? 1.0 : 0.9) };
    wing(mb, 'carbon', S, o);
    for (const s of [1, -1]) {
      // end plates
      const ep = new THREE.Mesh(new THREE.BoxGeometry(o.chord * 1.25, big ? 0.24 : 0.17, 0.008), M.carbon);
      ep.position.set(o.x, o.y - (big ? 0.03 : 0.01), s * o.half); ep.castShadow = true; g.add(ep);
      // uprights
      const zu = s * 0.34, yb = S.topY(tx + 0.22, zu) - 0.02;
      if (big) {
        const yTop = o.y + 0.075, hh = yTop - yb;
        const up = new THREE.Mesh(new THREE.BoxGeometry(0.11, hh, 0.012), M.alu); up.position.set(tx + 0.3, yb + hh / 2, zu); up.rotation.z = -0.25; g.add(up);
        const neck = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.03, 0.012), M.alu); neck.position.set(o.x + 0.1, yTop - 0.01, zu); neck.rotation.z = 0.25; g.add(neck);
      } else {
        const hh = o.y - yb; const up = new THREE.Mesh(new THREE.BoxGeometry(0.1, hh, 0.012), M.alu); up.position.set(tx + 0.22, yb + hh / 2, zu); g.add(up);
      }
    }
  }

  for (const k of mb.keys()) {
    const geo = mb.geometry(k, 0.7, k === 'carbon' ? 9 : 0);
    if (!geo) continue;
    const m = new THREE.Mesh(geo, M[k]); m.castShadow = true; g.add(m);
  }

  // ---- rivets on bolt-on arches
  if (rivets.length) {
    const im = new THREE.InstancedMesh(new THREE.SphereGeometry(0.007, 8, 6), M.rivet, rivets.length), mt = new THREE.Matrix4();
    rivets.forEach((p, i) => { mt.makeTranslation(p.x, p.y, p.z); im.setMatrixAt(i, mt); });
    g.add(im);
  }

  // ---- canards
  const kitMat = M[key];
  for (let i = 0; i < (kit.canards || 0); i++) {
    const x = S.noseX - 0.3 + i * 0.04, y = S.floorY(x) + 0.17 + i * 0.12;
    for (const s of [1, -1]) {
      const c = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.006, 0.13), kitMat);
      c.position.set(x, y, s * (S.sideZ(x, y) + 0.035)); c.rotation.set(s * -0.12, s * 0.22, -0.3); c.castShadow = true; g.add(c);
    }
  }
  // ---- diffuser strakes
  if (kit.fins) {
    const len = Math.min(0.5, S.xr - S.Ra - S.tailX - 0.05), zmax = S.zTop(S.tailX + 0.2) * 0.7;
    for (let i = 0; i < kit.fins; i++) {
      const z = lerp(-zmax, zmax, i / (kit.fins - 1)), x = S.tailX + len / 2 - 0.02;
      const f = new THREE.Mesh(new THREE.BoxGeometry(len, 0.1, 0.008), kitMat);
      f.position.set(x, S.floorY(x) - 0.02, z); f.rotation.z = -Math.atan2(S.floorY(S.tailX) - S.floorY(S.tailX + len), len) * 0.8; g.add(f);
    }
  }
  return g;
}
