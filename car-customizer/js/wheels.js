// Wheels: lathe-turned tyres with canvas-drawn tread & sidewall lettering,
// eight rim designs, brake discs and calipers.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { lerp } from './geo.js';

const texCache = new Map();

function tireTexture(tread, lettering) {
  const key = tread + (lettering ? 'L' : '');
  if (texCache.has(key)) return texCache.get(key);
  const W = 2048, H = 256, mk = () => { const c = document.createElement('canvas'); c.width = W; c.height = H; return c; };
  const col = mk(), bump = mk(), g = col.getContext('2d'), b = bump.getContext('2d');
  g.fillStyle = '#131314'; g.fillRect(0, 0, W, H);
  b.fillStyle = '#808080'; b.fillRect(0, 0, W, H);
  const t0 = H * 0.31, t1 = H * 0.69; // tread band
  g.fillStyle = '#19191b'; g.fillRect(0, t0, W, t1 - t0);
  b.fillStyle = '#b0b0b0'; b.fillRect(0, t0, W, t1 - t0);
  const groove = (y, w) => { g.fillStyle = '#050505'; g.fillRect(0, y - w / 2, W, w); b.fillStyle = '#000'; b.fillRect(0, y - w / 2, W, w); };
  const slash = (x, ya, yb, dx, w) => {
    for (const c of [g, b]) { c.strokeStyle = c === g ? '#060606' : '#000'; c.lineWidth = w; c.beginPath(); c.moveTo(x, ya); c.lineTo(x + dx, yb); c.stroke(); }
  };
  const mid = (t0 + t1) / 2, th = t1 - t0;
  if (tread === 'street') {
    [-0.3, -0.1, 0.1, 0.3].forEach(o => groove(mid + o * th, 5));
    for (let x = 0; x < W; x += 22) { slash(x, t0, t0 + th * 0.2, 6, 2); slash(x + 11, t1 - th * 0.2, t1, 6, 2); slash(x, mid - th * 0.1, mid + th * 0.1, 5, 1.5); }
  } else if (tread === 'sport') {
    [-0.22, 0, 0.22].forEach(o => groove(mid + o * th, 6));
    for (let x = 0; x < W; x += 34) { slash(x, t0, mid - th * 0.24, 22, 3); slash(x, t1, mid + th * 0.24, 22, 3); }
  } else if (tread === 'semi') {
    [-0.12, 0.12].forEach(o => groove(mid + o * th, 5));
    for (let x = 0; x < W; x += 64) { slash(x, t0 + 4, t0 + th * 0.28, 26, 3); slash(x + 32, t1 - 4, t1 - th * 0.28, 26, 3); }
  } else if (tread === 'drag') {
    for (let x = 0; x < W; x += 256) { slash(x, mid - 6, mid + 6, 0, 3); }
  }
  // sidewalls
  for (const [ya, yb] of [[0, H * 0.25], [H * 0.75, H]]) {
    g.strokeStyle = '#222224'; g.lineWidth = 1.5;
    for (const f of [0.25, 0.8]) { const y = lerp(ya, yb, f); g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
  }
  const label = { street: 'TOURING A/S', sport: 'APEX SPORT UHP', semi: 'APEX R-COMPOUND', drag: 'APEX DRAG RADIAL' }[tread] || 'APEX';
  g.font = '900 italic 30px Arial, Helvetica, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = lettering ? '#e9e9e9' : '#2c2c2f';
  for (let i = 0; i < 3; i++) {
    const x = W * (i + 0.5) / 3;
    // each sidewall is mirrored differently by the lathe UVs, so pre-flip both
    g.save(); g.translate(x, H * 0.125); g.scale(1, -1); g.fillText(label, 0, 0); g.restore();
    g.save(); g.translate(x, H * 0.875); g.scale(-1, 1); g.fillText(label, 0, 0); g.restore();
  }
  const map = new THREE.CanvasTexture(col); map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 8; map.wrapS = THREE.RepeatWrapping; map.repeat.x = -1;
  const bm = new THREE.CanvasTexture(bump); bm.wrapS = THREE.RepeatWrapping; bm.repeat.x = -1;
  const mat = new THREE.MeshStandardMaterial({ map, bumpMap: bm, bumpScale: 1.2, roughness: 0.88, metalness: 0 });
  texCache.set(key, mat);
  return mat;
}

function tireGeometry(R, rr, w, stretch) {
  const bw = stretch ? w + 0.03 : w - 0.02, tw = stretch ? w - 0.05 : w - 0.03, sw = R - rr;
  const z1 = stretch ? lerp(bw / 2, tw / 2, 0.35) : w / 2, z2 = stretch ? lerp(bw / 2, tw / 2, 0.75) : w / 2 - 0.004;
  const half = [[rr, bw / 2], [rr + sw * 0.32, z1], [rr + sw * 0.72, z2], [R - 0.012, tw / 2], [R - 0.001, tw / 2 - 0.024], [R, tw / 4]];
  const pts = [];
  for (const [r, z] of half) pts.push(new THREE.Vector2(r, -z));
  pts.push(new THREE.Vector2(R + 0.001, 0));
  for (let i = half.length - 1; i >= 0; i--) pts.push(new THREE.Vector2(half[i][0], half[i][1]));
  const g = new THREE.LatheGeometry(pts, 56);
  g.rotateX(Math.PI / 2);
  return { geo: g, bw };
}

const STYLES = {
  stock: { n: 5, pair: 0.024, wH: 0.022, wR: 0.018, th: 0.022, conc: 0.022, dish: 0.018 },
  six: { n: 6, wH: 0.05, wR: 0.034, th: 0.03, conc: 0.045, dish: 0.02 },
  five: { n: 5, wH: 0.075, wR: 0.05, th: 0.032, conc: 0.05, dish: 0.02 },
  mesh: { n: 10, cross: 0.32, wH: 0.014, wR: 0.012, th: 0.018, conc: 0.012, dish: 0.055 },
  multi: { n: 12, wH: 0.022, wR: 0.016, th: 0.024, conc: 0.03, dish: 0.02 },
  split: { n: 5, cross: 0.2, wH: 0.022, wR: 0.02, th: 0.026, conc: 0.055, dish: 0.02 },
  dish: { n: 5, wH: 0.06, wR: 0.05, th: 0.03, conc: 0.0, dish: 0.1 },
  turbine: { n: 10, twist: 0.4, wH: 0.03, wR: 0.042, th: 0.02, conc: 0.025, dish: 0.025 },
};

function spoke(a, twist, off, s, r0, r1, zHub, zFace) {
  const g = new THREE.BoxGeometry(1, 1, 1, 6, 1, 1), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const t = p.getX(i) + 0.5, r = lerp(r0, r1, t), ang = a + twist * t;
    const lat = p.getY(i) * lerp(s.wH, s.wR, t) + off;
    const z = lerp(zHub, zFace, Math.pow(t, 0.8)) + (p.getZ(i) - 0.5) * s.th;
    p.setXYZ(i, r * Math.cos(ang) - lat * Math.sin(ang), r * Math.sin(ang) + lat * Math.cos(ang), z);
  }
  g.computeVertexNormals();
  return g;
}

/**
 * Build one wheel with its axle along +z (outer face at +z).
 * o = { R, width, rimIn, style, tire: {tread, lettering, stretch}, M }
 */
export function buildWheel(o) {
  const { R, M } = o, rr = o.rimIn * 0.0254 / 2;
  const root = new THREE.Group(), spin = new THREE.Group(); root.add(spin);
  const { geo, bw } = tireGeometry(R, rr, o.width, o.tire.stretch);
  const tire = new THREE.Mesh(geo, tireTexture(o.tire.tread, o.tire.lettering)); tire.castShadow = true; spin.add(tire);

  const s = STYLES[o.style] || STYLES.stock, dish = Math.min(s.dish, bw * 0.38), zFace = bw / 2 - dish, zHub = zFace - s.conc;
  const lathe = pts => { const g = new THREE.LatheGeometry(pts.map(([r, z]) => new THREE.Vector2(r, z)), 56); g.rotateX(Math.PI / 2); return g; };
  spin.add(new THREE.Mesh(lathe([[rr + 0.014, bw / 2 + 0.004], [rr + 0.002, bw / 2], [rr - 0.012, bw / 2 - 0.012], [rr - 0.026, zFace - 0.004]]), M.rimLip));
  spin.add(new THREE.Mesh(lathe([[rr - 0.026, zFace - 0.004], [rr - 0.028, -bw / 2 + 0.014], [rr - 0.004, -bw / 2], [rr + 0.012, -bw / 2 - 0.003]]), M.rimFace));

  const parts = [], r0 = 0.05, r1 = rr - 0.024;
  for (let i = 0; i < s.n; i++) {
    const a = (i / s.n) * Math.PI * 2 + Math.PI / 2;
    if (s.pair) { parts.push(spoke(a, 0, s.pair, s, r0, r1, zHub, zFace), spoke(a, 0, -s.pair, s, r0, r1, zHub, zFace)); }
    else if (s.cross) { parts.push(spoke(a, s.cross, 0, s, r0, r1, zHub, zFace), spoke(a, -s.cross, 0, s, r0, r1, zHub, zFace)); }
    else parts.push(spoke(a, s.twist || 0, 0, s, r0, r1, zHub, zFace));
  }
  const cyl = (r, h, z, seg = 24) => { const g = new THREE.CylinderGeometry(r, r, h, seg); g.rotateX(Math.PI / 2); g.translate(0, 0, z); return g; };
  parts.push(cyl(0.072, 0.04, zHub - 0.012), cyl(0.03, 0.012, zHub + 0.012));
  for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2; const g = cyl(0.009, 0.02, zHub + 0.012, 6); g.translate(0.05 * Math.cos(a), 0.05 * Math.sin(a), 0); parts.push(g); }
  const face = new THREE.Mesh(mergeGeometries(parts.map(p => p.index ? p.toNonIndexed() : p)), M.rimFace); face.castShadow = true; spin.add(face);

  // brakes
  const rd = Math.min(rr - 0.045, 0.205), zd = zHub - 0.075;
  spin.add(new THREE.Mesh(cyl(rd, 0.03, zd, 40), M.disc), new THREE.Mesh(cyl(0.085, 0.06, zd + 0.02), M.iron));
  const sh = new THREE.Shape(), a0 = -0.55, a1 = 0.55, ro = rd + 0.014, ri = rd - 0.065;
  sh.absarc(0, 0, ro, a0, a1, false); sh.absarc(0, 0, ri, a1, a0, true);
  const cg = new THREE.ExtrudeGeometry(sh, { depth: 0.08, bevelEnabled: false, curveSegments: 12 }); cg.translate(0, 0, zd - 0.04);
  const cal = new THREE.Mesh(cg, M.caliper); cal.rotation.z = Math.PI * 0.92; root.add(cal);

  root.userData = { spin, bw };
  return root;
}

/** Coil-over / air strut drawn with unit height so it can be scaled to fit. */
export function buildStrut(M, air) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.026, 1, 12), M.damper); body.position.y = 0.5; g.add(body);
  if (air) {
    const bag = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.42, 16), M.plastic); bag.position.y = 0.7; g.add(bag);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.065, 0.05, 16), M.spring); cap.position.y = 0.93; g.add(cap);
  } else {
    const pts = []; for (let i = 0; i <= 120; i++) { const t = i / 120, a = t * Math.PI * 2 * 7; pts.push(new THREE.Vector3(0.05 * Math.cos(a), 0.4 + t * 0.55, 0.05 * Math.sin(a))); }
    g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 160, 0.008, 6), M.spring));
  }
  return g;
}
