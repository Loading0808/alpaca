// Drivable locations: a race circuit (day) and a city grid (night).
// Each world provides its own lighting, sky/environment, surface query and collision.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { pchip, lerp, sq } from './geo.js';

function tex(w, h, draw, rx = 1, ry = 1) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rx, ry); t.anisotropy = 8;
  return t;
}
// deterministic random so the world is the same every visit
function rng(seed) { let s = seed; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

// ---------------------------------------------------------------------------
// Shared road geometry
// ---------------------------------------------------------------------------
const smooth01 = t => { t = Math.min(1, Math.max(0, t)); return t * t * (3 - 2 * t); };

/**
 * A flat band that follows a polyline — the same construction the race circuit uses for its
 * asphalt and kerbs. pts: [{x, z}] (normals are taken from the neighbouring points unless a point
 * carries nx / nz). o0 / o1: lateral offsets in metres, or functions (point, index) → offset.
 */
function bandGeometry(pts, o0, o1, y, { vScale = 10, closed = false, uA = 0, uB = 1 } = {}) {
  const N = pts.length, M = closed ? N : N - 1, pos = [], uv = [], idx = [], off = (o, p, i) => (typeof o === 'function' ? o(p, i) : o);
  let v = 0;
  for (let i = 0; i <= M; i++) {
    const p = pts[i % N];
    let nx = p.nx, nz = p.nz;
    if (nx === undefined) {
      const a = pts[closed ? (i + N - 1) % N : Math.max(0, i - 1)], b = pts[closed ? (i + 1) % N : Math.min(N - 1, i + 1)];
      const tx = b.x - a.x, tz = b.z - a.z, l = Math.hypot(tx, tz) || 1; nx = -tz / l; nz = tx / l;
    }
    if (i > 0) { const q = pts[(i - 1) % N]; v += Math.hypot(p.x - q.x, p.z - q.z) / vScale; }
    const a0 = off(o0, p, i), a1 = off(o1, p, i);
    pos.push(p.x + nx * a0, y, p.z + nz * a0, p.x + nx * a1, y, p.z + nz * a1); uv.push(uA, v, uB, v);
    if (i < M) { const k = i * 2; idx.push(k, k + 1, k + 3, k, k + 3, k + 2); }
  }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.setIndex(idx); geo.computeVertexNormals();
  return geo;
}

/**
 * Road centreline from straights ({ len }) and constant-radius arcs ({ r, turn }; turn in radians,
 * negative = clockwise seen from above). Heading h points along (cos h, sin h) in x / z.
 * Points are about `step` metres apart and land exactly on every piece boundary; each carries its
 * distance s, unit tangent (tx, tz) and left normal (nx, nz).
 */
function roadPath([x, z], h, pieces, step = 1) {
  const out = [], push = s => out.push({ x, z, s, tx: Math.cos(h), tz: Math.sin(h), nx: -Math.sin(h), nz: Math.cos(h) });
  let s = 0; push(0);
  for (const pc of pieces) {
    if (pc.len) {
      const n = Math.max(1, Math.round(pc.len / step)), d = pc.len / n;
      for (let i = 0; i < n; i++) { x += Math.cos(h) * d; z += Math.sin(h) * d; s += d; push(s); }
    } else {
      const n = Math.max(2, Math.ceil(pc.r * Math.abs(pc.turn) / step)), dh = pc.turn / n, chord = 2 * pc.r * Math.sin(Math.abs(dh) / 2);
      for (let i = 0; i < n; i++) { const mid = h + dh / 2; x += Math.cos(mid) * chord; z += Math.sin(mid) * chord; h += dh; s += pc.r * Math.abs(dh); push(s); }
    }
  }
  return out;
}

/** Flat mesh for any simple polygon [{x, z}] (triangulated with three's earcut), facing up, world-space UVs. */
function polygonGeometry(outline, y, uvScale) {
  const tris = THREE.ShapeUtils.triangulateShape(outline.map(p => new THREE.Vector2(p.x, p.z)), []), pos = [], uv = [];
  for (let [a, b, c] of tris) {
    const A = outline[a], B = outline[b], C = outline[c];
    if ((B.z - A.z) * (C.x - A.x) - (B.x - A.x) * (C.z - A.z) < 0) [b, c] = [c, b];   // wind every triangle so it faces up
    for (const i of [a, b, c]) { pos.push(outline[i].x, y, outline[i].z); uv.push(outline[i].x * uvScale, outline[i].z * uvScale); }
  }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.computeVertexNormals();
  return geo;
}

/** Even-odd point-in-polygon test. */
function insidePolygon(poly, x, z) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a.z > z) !== (b.z > z) && x < (b.x - a.x) * (z - a.z) / (b.z - a.z) + a.x) inside = !inside;
  }
  return inside;
}

function skyDome(top, mid, bottom, sun) {
  const t = tex(16, 256, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, top); gr.addColorStop(0.47, mid); gr.addColorStop(0.5, bottom); gr.addColorStop(1, bottom);
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  });
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  const dome = new THREE.Mesh(new THREE.SphereGeometry(1800, 24, 16), new THREE.MeshBasicMaterial({ map: t, side: THREE.BackSide, fog: false, depthWrite: false }));
  dome.renderOrder = -10;
  if (sun) {
    const s = new THREE.Mesh(new THREE.SphereGeometry(sun.size, 16, 12), new THREE.MeshBasicMaterial({ color: sun.color, fog: false }));
    s.position.copy(sun.dir).multiplyScalar(1500); dome.add(s);
  }
  return dome;
}

function envFrom(renderer, dome, extra = []) {
  const s = new THREE.Scene(), d = dome.clone(); d.scale.setScalar(0.02); s.add(d);
  extra.forEach(m => s.add(m));
  const pm = new THREE.PMREMGenerator(renderer), rt = pm.fromScene(s, 0.02); pm.dispose();
  return rt.texture;
}

// ---------------------------------------------------------------------------
// Race circuit
// ---------------------------------------------------------------------------
function buildCircuit(renderer) {
  const g = new THREE.Group(), W = 13, half = W / 2;
  const ctrl = [[0, 0], [150, 0], [240, -38], [258, -118], [196, -178], [112, -152], [56, -198], [-32, -238], [-128, -206], [-164, -128], [-100, -98], [-152, -62], [-196, -22], [-150, 0]];
  const curve = new THREE.CatmullRomCurve3(ctrl.map(([x, z]) => new THREE.Vector3(x, 0, z)), true, 'centripetal');
  const N = 900, pts = curve.getSpacedPoints(N).slice(0, N), len = curve.getLength();
  const nrm = pts.map((p, i) => { const a = pts[(i + N - 1) % N], b = pts[(i + 1) % N], tx = b.x - a.x, tz = b.z - a.z, l = Math.hypot(tx, tz); return { x: -tz / l, z: tx / l, tx: tx / l, tz: tz / l }; });

  // asphalt and kerbs: bands that follow the centreline (shared with the dragway's return road)
  const ribbon = (o0, o1, y, vScale, uA = 0, uB = 1) => bandGeometry(pts.map((p, i) => ({ x: p.x, z: p.z, nx: nrm[i].x, nz: nrm[i].z })), o0, o1, y, { vScale, closed: true, uA, uB });
  const asphalt = tex(256, 256, (c, w, h) => {
    c.fillStyle = '#2b2d31'; c.fillRect(0, 0, w, h);
    for (let i = 0; i < 5000; i++) { const v = 34 + Math.random() * 30; c.fillStyle = `rgba(${v},${v},${v + 2},0.5)`; c.fillRect(Math.random() * w, Math.random() * h, 1.5, 1.5); }
    c.fillStyle = 'rgba(20,20,22,0.35)'; c.fillRect(w * 0.3, 0, w * 0.4, h);                       // rubbered-in racing line
    c.fillStyle = '#e8e8e8'; c.fillRect(3, 0, 5, h); c.fillRect(w - 8, 0, 5, h);                   // edge lines
  });
  const road = new THREE.Mesh(ribbon(-half, half, 0.02, 12), new THREE.MeshStandardMaterial({ map: asphalt, roughness: 0.85, side: THREE.DoubleSide })); road.receiveShadow = true; g.add(road);
  const kerbT = tex(32, 64, (c, w, h) => { c.fillStyle = '#d21f1f'; c.fillRect(0, 0, w, h / 2); c.fillStyle = '#f1f1f1'; c.fillRect(0, h / 2, w, h / 2); });
  const kerbM = new THREE.MeshStandardMaterial({ map: kerbT, roughness: 0.7, side: THREE.DoubleSide });
  for (const s of [1, -1]) { const k = new THREE.Mesh(ribbon(s * half, s * (half + 1.3), 0.035, 4), kerbM); k.receiveShadow = true; g.add(k); }

  const grass = tex(256, 256, (c, w, h) => {
    c.fillStyle = '#3f6a2c'; c.fillRect(0, 0, w, h);
    for (let i = 0; i < 9000; i++) { c.fillStyle = `rgba(${40 + Math.random() * 50},${90 + Math.random() * 70},${30 + Math.random() * 30},0.5)`; c.fillRect(Math.random() * w, Math.random() * h, 2, 3); }
  }, 220, 220);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(2600, 2600), new THREE.MeshStandardMaterial({ map: grass, roughness: 1 })); ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; g.add(ground);

  // start / finish
  const chk = tex(64, 32, (c, w, h) => { for (let x = 0; x < 8; x++) for (let y = 0; y < 4; y++) { c.fillStyle = (x + y) % 2 ? '#111' : '#f4f4f4'; c.fillRect(x * 8, y * 8, 8, 8); } }, 3, 1);
  const line = new THREE.Mesh(new THREE.PlaneGeometry(2, W), new THREE.MeshStandardMaterial({ map: chk, roughness: 0.8 })); line.rotation.x = -Math.PI / 2; line.rotation.z = Math.PI / 2; line.position.set(0, 0.03, 0); g.add(line);
  const M = (c, r = 0.7, m = 0.1) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m });
  const box = (w, h, d, mat, x, y, z, ry = 0) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); b.position.set(x, y, z); b.rotation.y = ry; b.castShadow = b.receiveShadow = true; g.add(b); return b; };
  const steel = M(0x2a2d33, 0.5, 0.6);
  box(0.5, 8, 0.5, steel, 0, 4, half + 3); box(0.5, 8, 0.5, steel, 0, 4, -half - 3); box(1.2, 1.6, W + 7, steel, 0, 8, 0);
  const sign = tex(1024, 128, (c, w, h) => { c.fillStyle = '#0b0c0f'; c.fillRect(0, 0, w, h); c.fillStyle = '#ff5a1f'; c.fillRect(0, h - 10, w, 10); c.fillStyle = '#fff'; c.font = 'italic 900 84px Arial'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('APEX RACEWAY', w / 2, h / 2 - 4); });
  for (const sx of [0.61, -0.61]) { const s = new THREE.Mesh(new THREE.PlaneGeometry(W + 6, 1.5), new THREE.MeshBasicMaterial({ map: sign })); s.position.set(sx, 8, 0); s.rotation.y = sx > 0 ? Math.PI / 2 : -Math.PI / 2; g.add(s); }
  // grandstand + pit building along the main straight
  const stand = M(0x8a8f98, 0.8), seat = M(0x1d4ed8, 0.8), roof = M(0xd9dadd, 0.6);
  for (let i = 0; i < 7; i++) box(110, 1.1, 2.2, i % 2 ? seat : stand, 10, 0.55 + i * 1.1, half + 12 + i * 2.2);
  box(112, 0.4, 18, roof, 10, 11.5, half + 20); for (const x of [-44, -8, 28, 64]) box(0.5, 11.5, 0.5, steel, x, 5.75, half + 27);
  box(120, 6, 12, M(0xe6e7ea, 0.7), 10, 3, -half - 16); box(120, 0.5, 14, M(0x24262b), 10, 6.25, -half - 16);
  for (let i = 0; i < 12; i++) box(7, 3.6, 0.2, M(i % 2 ? 0x2b2f36 : 0xff5a1f, 0.6), -43 + i * 9.6, 1.8, -half - 9.9);
  // tyre barriers on the outside of the first corners, marker boards
  for (let i = 0; i < N; i += 18) { const p = pts[i], n = nrm[i]; if (i % 90 === 0) box(0.3, 1.6, 2.4, M(0xf2c100), p.x + n.x * (half + 6), 0.8, p.z + n.z * (half + 6), Math.atan2(-n.tz, n.tx)); }

  // trees
  const r = rng(7), trunkG = new THREE.CylinderGeometry(0.35, 0.5, 3, 6), leafG = new THREE.ConeGeometry(2.8, 8, 7), spots = [];
  const near = (x, z, d) => { for (let i = 0; i < N; i += 6) if ((pts[i].x - x) ** 2 + (pts[i].z - z) ** 2 < d * d) return true; return false; };
  while (spots.length < 520) {
    const x = -520 + r() * 1120, z = -560 + r() * 880;
    if (!near(x, z, 22) && !(x > -70 && x < 90 && Math.abs(z) < 40)) spots.push([x, z, 0.7 + r() * 0.9]);
  }
  const trunks = new THREE.InstancedMesh(trunkG, M(0x4a3626, 0.9), spots.length), leaves = new THREE.InstancedMesh(leafG, M(0x244a1e, 0.9), spots.length), mt = new THREE.Matrix4();
  spots.forEach(([x, z, s], i) => { mt.makeScale(s, s, s).setPosition(x, 1.5 * s, z); trunks.setMatrixAt(i, mt); mt.makeScale(s, s, s).setPosition(x, 6.5 * s, z); leaves.setMatrixAt(i, mt); });
  leaves.castShadow = true; g.add(trunks, leaves);
  // distant hills
  for (let i = 0; i < 26; i++) { const a = i / 26 * Math.PI * 2, d = 1100 + r() * 300, h = 90 + r() * 170; const m = new THREE.Mesh(new THREE.ConeGeometry(260 + r() * 200, h, 7), M(0x4d6b52, 1)); m.position.set(Math.cos(a) * d, h / 2 - 6, Math.sin(a) * d - 100); g.add(m); }

  const sunDir = new THREE.Vector3(0.45, 0.72, 0.35).normalize();
  const dome = skyDome('#3b78c7', '#bcd9ef', '#6f8f63', { dir: sunDir, size: 60, color: 0xfff6dd }); g.add(dome);
  const hemi = new THREE.HemisphereLight(0xcfe3ff, 0x4a5a3a, 1.0), sun = new THREE.DirectionalLight(0xfff1dc, 2.6);
  g.add(hemi, sun, sun.target);

  let idx = 0, half2 = false;
  const nearest = (x, z) => {
    let best = 1e9, bi = idx;
    for (let k = -40; k <= 40; k++) { const i = (idx + k + N) % N, d = (pts[i].x - x) ** 2 + (pts[i].z - z) ** 2; if (d < best) { best = d; bi = i; } }
    if (best > 900) for (let i = 0; i < N; i += 3) { const d = (pts[i].x - x) ** 2 + (pts[i].z - z) ** 2; if (d < best) { best = d; bi = i; } }
    idx = bi; return Math.sqrt(best);
  };
  return {
    name: 'Apex Raceway', group: g, sun, sunDir, env: envFrom(renderer, dome), fog: new THREE.Fog(0xbcd9ef, 300, 1500), night: false, hasLaps: true,
    spawn: { x: -60, z: -half * 0.35, psi: 0 },
    path: pts,
    reset() { idx = N - Math.round(N * 60 / len); half2 = false; this._prev = idx; },
    /** grip / drag for a point; also advances lap tracking. Returns lap = true when a lap is completed. */
    surface(x, z) {
      const d = nearest(x, z), prev = this._prev ?? idx; this._prev = idx;
      let lap = false, line = false;
      if (idx > N * 0.45 && idx < N * 0.6) half2 = true;
      if (prev > N * 0.9 && idx < N * 0.1) { line = true; lap = half2; half2 = false; }
      if (d <= half + 0.2) return { grip: 1, drag: 0, off: 0, lap, line };
      if (d <= half + 1.5) return { grip: 0.9, drag: 0.2, off: 0.3, lap, line };
      return { grip: 0.58, drag: 1, off: 1, lap, line };
    },
    collide(x, z) { const L = 620; if (Math.abs(x) > L || z > 380 || z < -620) return { x: Math.max(-L, Math.min(L, x)), z: Math.max(-620, Math.min(380, z)), nx: -Math.sign(x) * (Math.abs(x) > L ? 1 : 0), nz: z > 380 ? -1 : z < -620 ? 1 : 0 }; return null; },
    respawn() { const p = pts[idx], n = nrm[idx]; return { x: p.x, z: p.z, psi: Math.atan2(-n.tz, n.tx) }; },
  };
}

// ---------------------------------------------------------------------------
// City at night
// ---------------------------------------------------------------------------
function buildCity(renderer) {
  const g = new THREE.Group(), NB = 6, BLOCK = 70, ROAD = 16, P = BLOCK + ROAD, HALF = NB * P / 2, r = rng(21);
  const ground = tex(1024, 1024, (c, w, h) => {
    const m = w / P;                                         // pixels per metre; the tile spans one road-centre to the next
    c.fillStyle = '#1c1d21'; c.fillRect(0, 0, w, h);
    for (let i = 0; i < 16000; i++) { const v = 24 + Math.random() * 22; c.fillStyle = `rgba(${v},${v},${v + 3},0.5)`; c.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
    c.fillStyle = '#d8a400';
    for (let y = ROAD * m; y < h - ROAD * m; y += 6 * m) { c.fillRect(0, y, 0.12 * m, 3 * m); c.fillRect(w - 0.12 * m, y, 0.12 * m, 3 * m); }
    for (let x = ROAD * m; x < w - ROAD * m; x += 6 * m) { c.fillRect(x, 0, 3 * m, 0.12 * m); c.fillRect(x, h - 0.12 * m, 3 * m, 0.12 * m); }
    c.fillStyle = '#d9d9d9';                                 // crosswalks
    for (let k = 0; k < 7; k++) {
      const o = (1 + k * 1.05) * m;
      for (const yy of [ROAD / 2 * m + 1.5 * m, h - ROAD / 2 * m - 4.5 * m]) { c.fillRect(o, yy, 0.5 * m, 3 * m); c.fillRect(w - o - 0.5 * m, yy, 0.5 * m, 3 * m); }
      for (const xx of [ROAD / 2 * m + 1.5 * m, w - ROAD / 2 * m - 4.5 * m]) { c.fillRect(xx, o, 3 * m, 0.5 * m); c.fillRect(xx, h - o - 0.5 * m, 3 * m, 0.5 * m); }
    }
  }, NB + 4, NB + 4);
  const gp = new THREE.Mesh(new THREE.PlaneGeometry((NB + 4) * P, (NB + 4) * P), new THREE.MeshStandardMaterial({ map: ground, roughness: 0.55, metalness: 0.1 })); gp.rotation.x = -Math.PI / 2; gp.receiveShadow = true; g.add(gp);

  // facades: lit-window textures in a few colour moods
  const facade = (wall, lit, cool) => tex(256, 256, (c, w, h) => {
    c.fillStyle = wall; c.fillRect(0, 0, w, h);
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
      const on = Math.random() < lit; c.fillStyle = on ? (Math.random() < cool ? '#bfe0ff' : '#ffd58a') : '#0b1018';
      c.fillRect(x * 32 + 7, y * 32 + 8, 18, 17);
    }
  });
  const mats = [facade('#15171c', 0.35, 0.2), facade('#1b1a1f', 0.25, 0.7), facade('#101318', 0.5, 0.5)].map(t => new THREE.MeshStandardMaterial({ map: t, emissiveMap: t, emissive: 0xffffff, emissiveIntensity: 0.9, roughness: 0.6, metalness: 0.3 }));
  const geos = [[], [], []], boxes = [], walk = [], neon = [];
  const neonCols = [0xff2d78, 0x22d3ee, 0xff5a1f, 0xa855f7, 0x4ade80];
  for (let bi = 0; bi < NB; bi++) for (let bj = 0; bj < NB; bj++) {
    const cx = -HALF + P / 2 + bi * P, cz = -HALF + P / 2 + bj * P, centre = 1 - Math.hypot(cx, cz) / (HALF * 1.3);
    const sw = new THREE.BoxGeometry(BLOCK, 0.16, BLOCK); sw.translate(cx, 0.08, cz); walk.push(sw);
    if (bi === 2 && bj === 3) continue;                       // an open plaza
    for (let li = 0; li < 2; li++) for (let lj = 0; lj < 2; lj++) {
      const w = 22 + r() * 8, d = 22 + r() * 8, h = 12 + r() * 26 + Math.max(0, centre) * r() * 110;
      const x = cx + (li ? 1 : -1) * 16.5, z = cz + (lj ? 1 : -1) * 16.5;
      const b = new THREE.BoxGeometry(w, h, d), uv = b.attributes.uv;
      for (let f = 0; f < 6; f++) for (let v = 0; v < 4; v++) {
        const i = f * 4 + v;
        if (f === 2 || f === 3) uv.setXY(i, 0.01, 0.01);        // roof: sample the dark wall colour
        else uv.setXY(i, uv.getX(i) * Math.round((f < 2 ? d : w) / 3.2) / 8, uv.getY(i) * Math.round(h / 3.4) / 8);
      }
      b.translate(x, h / 2 + 0.16, z); geos[Math.floor(r() * 3)].push(b);
      boxes.push([x - w / 2, x + w / 2, z - d / 2, z + d / 2]);
      if (r() < 0.45) { const s = new THREE.BoxGeometry(li === lj ? w * 0.6 : 0.25, 1.6, li === lj ? 0.25 : d * 0.6); s.translate(x + (li === lj ? 0 : (li ? 1 : -1) * (w / 2 + 0.2)), 6 + r() * 5, z + (li === lj ? (lj ? 1 : -1) * (d / 2 + 0.2) : 0)); neon.push([s, neonCols[Math.floor(r() * 5)]]); }
    }
  }
  geos.forEach((list, i) => { if (list.length) { const m = new THREE.Mesh(mergeGeometries(list), mats[i]); m.castShadow = true; m.receiveShadow = true; g.add(m); } });
  const sidewalk = new THREE.Mesh(mergeGeometries(walk), new THREE.MeshStandardMaterial({ color: 0x3a3c42, roughness: 0.85 })); sidewalk.receiveShadow = true; g.add(sidewalk);
  for (const c of neonCols) { const list = neon.filter(n => n[1] === c).map(n => n[0]); if (list.length) g.add(new THREE.Mesh(mergeGeometries(list), new THREE.MeshBasicMaterial({ color: c }))); }

  // street lamps with fake light pools
  const lamps = [];
  for (let i = 0; i <= NB; i++) for (let j = 0; j < NB; j++) for (const o of [-22, 22]) {
    lamps.push([-HALF + i * P + ROAD / 2 + 1, -HALF + P / 2 + j * P + o, 1]); lamps.push([-HALF + P / 2 + j * P + o, -HALF + i * P + ROAD / 2 + 1, 0]);
  }
  const pole = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.09, 0.12, 7, 6), new THREE.MeshStandardMaterial({ color: 0x22252b, roughness: 0.6, metalness: 0.6 }), lamps.length);
  const bulb = new THREE.InstancedMesh(new THREE.BoxGeometry(1.5, 0.12, 0.4), new THREE.MeshBasicMaterial({ color: 0xffe2b0 }), lamps.length);
  const poolT = tex(64, 64, (c, w) => { const gr = c.createRadialGradient(w / 2, w / 2, 2, w / 2, w / 2, w / 2); gr.addColorStop(0, 'rgba(255,214,150,0.55)'); gr.addColorStop(1, 'rgba(255,214,150,0)'); c.fillStyle = gr; c.fillRect(0, 0, w, w); });
  const pg = new THREE.PlaneGeometry(17, 17); pg.rotateX(-Math.PI / 2);
  const pool = new THREE.InstancedMesh(pg, new THREE.MeshBasicMaterial({ map: poolT, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }), lamps.length), mt = new THREE.Matrix4();
  lamps.forEach(([x, z, ax], i) => {
    mt.makeTranslation(x, 3.5, z); pole.setMatrixAt(i, mt);
    mt.makeRotationY(ax ? 0 : Math.PI / 2).setPosition(x - (ax ? 0.9 : 0), 7, z - (ax ? 0 : 0.9)); bulb.setMatrixAt(i, mt);
    mt.makeTranslation(x - (ax ? 4 : 0), 0.05, z - (ax ? 0 : 4)); pool.setMatrixAt(i, mt);
  });
  pool.renderOrder = 1; g.add(pole, bulb, pool);

  const dome = skyDome('#04050c', '#1a1430', '#0a0a10'); g.add(dome);
  const hemi = new THREE.HemisphereLight(0x5a6cb0, 0x1c1a24, 0.75), sun = new THREE.DirectionalLight(0x9db4ff, 0.55);
  g.add(hemi, sun, sun.target);
  const glow = [0xff2d78, 0x22d3ee, 0xffd58a, 0xa855f7].map((c, i) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(14, 5), new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(3), side: THREE.DoubleSide })); const a = i * Math.PI / 2 + 0.4; m.position.set(Math.cos(a) * 16, 3 + i, Math.sin(a) * 16); m.lookAt(0, 2, 0); return m; });

  const LIM = HALF + ROAD / 2 - 1.2;
  return {
    name: 'Neon District', group: g, sun, sunDir: new THREE.Vector3(-0.35, 0.8, 0.3).normalize(), env: envFrom(renderer, dome, glow), fog: new THREE.Fog(0x0b0a14, 60, 520), night: true, hasLaps: false,
    spawn: { x: -HALF + 3 * P + 4, z: -HALF + P * 0.5, psi: -Math.PI / 2 },
    reset() { },
    surface() { return { grip: 1, drag: 0, off: 0, lap: false }; },
    collide(x, z, rad = 1.1) {
      if (Math.abs(x) > LIM || Math.abs(z) > LIM) return { x: Math.max(-LIM, Math.min(LIM, x)), z: Math.max(-LIM, Math.min(LIM, z)), nx: Math.abs(x) > LIM ? -Math.sign(x) : 0, nz: Math.abs(z) > LIM ? -Math.sign(z) : 0 };
      for (const [x0, x1, z0, z1] of boxes) {
        if (x < x0 - rad || x > x1 + rad || z < z0 - rad || z > z1 + rad) continue;
        const px = Math.max(x0, Math.min(x1, x)), pz = Math.max(z0, Math.min(z1, z));
        let dx = x - px, dz = z - pz, d = Math.hypot(dx, dz);
        if (d >= rad) continue;
        if (d < 1e-4) {                                        // centre is inside: leave through the nearest face
          const e = [[x - x0, -1, 0], [x1 - x, 1, 0], [z - z0, 0, -1], [z1 - z, 0, 1]].sort((a, b) => a[0] - b[0])[0];
          return { x: x + e[1] * (e[0] + rad), z: z + e[2] * (e[0] + rad), nx: e[1], nz: e[2] };
        }
        dx /= d; dz /= d; return { x: px + dx * rad, z: pz + dz * rad, nx: dx, nz: dz };
      }
      return null;
    },
    respawn() { return this.spawn; },
  };
}

// ---------------------------------------------------------------------------
// Midnight Expressway — a 6.5 km elevated four-lane loop with a suspension
// bridge, two tunnels, overhead signs and a city on both sides.
// ---------------------------------------------------------------------------
function buildHighway(renderer) {
  const g = new THREE.Group(), LANES = 4, LW = 3.6, SH = 1.3, half = LANES * LW / 2 + SH, r = rng(99);
  const ctrl = [[0, 0], [500, 0], [900, -60], [1250, -260], [1420, -600], [1380, -980], [1120, -1250], [720, -1340], [300, -1300], [-80, -1380], [-460, -1300], [-700, -1040], [-760, -700], [-640, -380], [-380, -140], [-180, -20]];
  const curve = new THREE.CatmullRomCurve3(ctrl.map(([x, z]) => new THREE.Vector3(x, 0, z)), true, 'centripetal');
  const len = curve.getLength(), N = Math.round(len / 4), ds = len / N, raw = curve.getSpacedPoints(N).slice(0, N);
  const elev = pchip([0, 0.06, 0.15, 0.2, 0.27, 0.33, 0.42, 0.5, 0.62, 0.7, 0.8, 0.9, 1], [9, 9, 12, 27, 27, 12, 9, 3.5, 3.5, 9, 14, 9, 9]);
  const TUNNELS = [[0.512, 0.612], [0.845, 0.878]], BRIDGE = [0.165, 0.315];
  const inRange = (t, [a, b]) => t >= a && t <= b;
  const P = raw.map((p, i) => {
    const a = raw[(i + N - 1) % N], b = raw[(i + 1) % N], tx = b.x - a.x, tz = b.z - a.z, l = Math.hypot(tx, tz), t = i / N;
    return { x: p.x, z: p.z, y: elev(t), tx: tx / l, tz: tz / l, nx: -tz / l, nz: tx / l, tun: TUNNELS.some(q => inRange(t, q)), br: inRange(t, BRIDGE) };
  });

  /** Ribbon between two lateral offsets / heights, optionally only where filter(i) is true. */
  const strip = (o0, dy0, o1, dy1, { vs = 10, filter, u0 = 0, u1 = 1 } = {}) => {
    const pos = [], uv = [], idx = [];
    for (let i = 0; i < N; i++) {
      if (filter && !(filter(P[i]) && filter(P[(i + 1) % N]))) continue;
      const a = P[i], b = P[(i + 1) % N], k = pos.length / 3, v0 = i * ds / vs, v1 = (i + 1) * ds / vs;
      pos.push(a.x + a.nx * o0, a.y + dy0, a.z + a.nz * o0, a.x + a.nx * o1, a.y + dy1, a.z + a.nz * o1, b.x + b.nx * o0, b.y + dy0, b.z + b.nz * o0, b.x + b.nx * o1, b.y + dy1, b.z + b.nz * o1);
      uv.push(u0, v0, u1, v0, u0, v1, u1, v1); idx.push(k, k + 1, k + 3, k, k + 3, k + 2);
    }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.setIndex(idx); geo.computeVertexNormals();
    return geo;
  };
  const add = (geo, mat, shadow = false) => { const m = new THREE.Mesh(geo, mat); m.receiveShadow = shadow; g.add(m); return m; };
  const DS = THREE.DoubleSide, open = p => !p.tun, tun = p => p.tun;

  // road surface with lane markings
  const roadT = tex(512, 256, (c, w, h) => {
    const m = w / (half * 2);
    c.fillStyle = '#26282c'; c.fillRect(0, 0, w, h);
    for (let i = 0; i < 9000; i++) { const v = 30 + Math.random() * 26; c.fillStyle = `rgba(${v},${v},${v + 2},0.5)`; c.fillRect(Math.random() * w, Math.random() * h, 1.5, 1.5); }
    for (let l = 0; l < LANES; l++) { c.fillStyle = 'rgba(12,12,14,0.22)'; c.fillRect((SH + l * LW + 0.75) * m, 0, 0.5 * m, h); c.fillRect((SH + l * LW + 2.35) * m, 0, 0.5 * m, h); }
    c.fillStyle = '#e6e6e6'; c.fillRect((SH - 0.15) * m, 0, 0.16 * m, h); c.fillRect((half * 2 - SH) * m, 0, 0.16 * m, h);
    for (let l = 1; l < LANES; l++) c.fillRect((SH + l * LW - 0.07) * m, 0, 0.14 * m, h * 0.5);
  });
  add(strip(-half, 0, half, 0, { vs: 12 }), new THREE.MeshStandardMaterial({ map: roadT, roughness: 0.62, metalness: 0.08, side: DS }), true);

  // barriers, deck fascia and underside
  const wallT = tex(64, 64, (c, w, h) => { c.fillStyle = '#8b8e94'; c.fillRect(0, 0, w, h); c.fillStyle = '#6f7278'; c.fillRect(0, 0, w, 6); c.fillRect(0, h - 10, w, 10); c.fillStyle = '#ffb347'; c.fillRect(28, 22, 8, 8); });
  const wallM = new THREE.MeshStandardMaterial({ map: wallT, roughness: 0.8, side: DS }), conc = new THREE.MeshStandardMaterial({ color: 0x55585e, roughness: 0.9, side: DS });
  for (const s of [1, -1]) {
    add(strip(s * half, 0, s * half, 1.05, { vs: 4, filter: open }), wallM);
    add(strip(s * half, 1.05, s * (half + 0.35), 1.05, { filter: open }), conc);
    add(strip(s * (half + 0.35), 1.05, s * (half + 0.35), -1.3, { filter: open }), conc);
  }
  add(strip(-half - 0.35, -1.3, half + 0.35, -1.3, { filter: open }), conc);

  // tunnels: tiled walls, ceiling, light strips, outer shell
  const tileT = tex(128, 128, (c, w, h) => { c.fillStyle = '#b9b39f'; c.fillRect(0, 0, w, h); c.strokeStyle = 'rgba(0,0,0,0.18)'; for (let i = 0; i <= 8; i++) { c.strokeRect(i * 16, 0, 16, h); c.strokeRect(0, i * 16, w, 16); } c.fillStyle = '#5d6a5a'; c.fillRect(0, h - 26, w, 8); c.fillStyle = '#4a4c50'; c.fillRect(0, h - 14, w, 14); });
  const tileM = new THREE.MeshBasicMaterial({ map: tileT, side: DS, color: 0xbbbbbb }), ceilM = new THREE.MeshBasicMaterial({ color: 0x1d1d20, side: DS });
  const lightT = tex(32, 64, (c, w, h) => { c.fillStyle = '#1d1d20'; c.fillRect(0, 0, w, h); c.fillStyle = '#ffe2b0'; c.fillRect(4, 6, w - 8, h * 0.62); });
  const lightM = new THREE.MeshBasicMaterial({ map: lightT, side: DS });
  const TH = 5.8;
  for (const s of [1, -1]) {
    add(strip(s * half, 0, s * half, TH, { vs: 6, filter: tun }), tileM);
    add(strip(s * (half - 0.9), TH - 0.02, s * (half - 0.2), TH - 0.02, { vs: 5, filter: tun }), lightM);
    add(strip(s * (half + 1.2), -1.3, s * (half + 1.2), TH + 1.3, { filter: tun }), conc);
  }
  add(strip(-half, TH, half, TH, { filter: tun }), ceilM);
  add(strip(-half - 1.2, TH + 1.3, half + 1.2, TH + 1.3, { filter: tun }), conc);
  add(strip(-half, 0.03, half, 0.03, { filter: tun }), new THREE.MeshBasicMaterial({ color: 0xffb060, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false, side: DS })).renderOrder = 1;
  // portals
  const dummy = new THREE.Object3D(), yaw = p => Math.atan2(-p.tz, p.tx);
  const box = (w, h, d, mat, p, o, y, ry) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); b.position.set(p.x + p.nx * o, y, p.z + p.nz * o); b.rotation.y = ry; g.add(b); return b; };
  for (const [a, b] of TUNNELS) for (const t of [a, b]) { const p = P[Math.round(t * N) % N]; box(1.5, 3.2, half * 2 + 4.4, conc, p, 0, p.y + TH + 1.1, yaw(p)); for (const s of [1, -1]) box(1.5, TH + 2.6, 1.9, conc, p, s * (half + 1.1), p.y + TH / 2, yaw(p)); }

  // pillars
  const pil = []; for (let i = 0; i < N; i += 11) if (P[i].y > 2.6) pil.push(P[i]);
  const pilM = new THREE.InstancedMesh(new THREE.BoxGeometry(2.2, 1, half * 1.1), conc, pil.length);
  pil.forEach((p, i) => { const h = p.y - 1.3; dummy.position.set(p.x, h / 2, p.z); dummy.rotation.set(0, yaw(p), 0); dummy.scale.set(1, h, 1); dummy.updateMatrix(); pilM.setMatrixAt(i, dummy.matrix); });
  g.add(pilM);

  // street lamps + fake light pools
  const lamps = []; for (let i = 4; i < N; i += 9) if (!P[i].tun) lamps.push([P[i], (i / 9 | 0) % 2 ? 1 : -1]);
  const poleM = new THREE.MeshStandardMaterial({ color: 0x2a2d33, roughness: 0.5, metalness: 0.7 });
  const pole = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.1, 0.14, 9, 6), poleM, lamps.length), arm = new THREE.InstancedMesh(new THREE.BoxGeometry(0.14, 0.14, 3), poleM, lamps.length);
  const head = new THREE.InstancedMesh(new THREE.BoxGeometry(0.5, 0.14, 1.3), new THREE.MeshBasicMaterial({ color: 0xffd9a0 }), lamps.length);
  const poolT = tex(64, 64, (c, w) => { const gr = c.createRadialGradient(w / 2, w / 2, 2, w / 2, w / 2, w / 2); gr.addColorStop(0, 'rgba(255,205,140,0.5)'); gr.addColorStop(1, 'rgba(255,205,140,0)'); c.fillStyle = gr; c.fillRect(0, 0, w, w); });
  const pg = new THREE.PlaneGeometry(26, 20); pg.rotateX(-Math.PI / 2);
  const pool = new THREE.InstancedMesh(pg, new THREE.MeshBasicMaterial({ map: poolT, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }), lamps.length);
  lamps.forEach(([p, s], i) => {
    const set = (m, o, y) => { dummy.position.set(p.x + p.nx * o, p.y + y, p.z + p.nz * o); dummy.rotation.set(0, yaw(p), 0); dummy.scale.set(1, 1, 1); dummy.updateMatrix(); m.setMatrixAt(i, dummy.matrix); };
    set(pole, s * (half + 0.18), 5.5); set(arm, s * (half - 1.3), 9.9); set(head, s * (half - 2.6), 9.85); set(pool, s * (half * 0.45), 0.045);
  });
  pool.renderOrder = 1; g.add(pole, arm, head, pool);

  // overhead sign gantries
  const boards = ['C1  INNER LOOP', 'BAYSHORE  →  WANGAN', 'TUNNEL  AHEAD', 'HARBOUR  BRIDGE', 'KEEP  LEFT  ·  80'].map(txt => tex(512, 128, (c, w, h) => {
    c.fillStyle = '#0b5a3a'; c.fillRect(0, 0, w, h); c.strokeStyle = '#e9f5ee'; c.lineWidth = 5; c.strokeRect(6, 6, w - 12, h - 12);
    c.fillStyle = '#f2f7f4'; c.font = '700 54px Arial, Helvetica, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(txt, w / 2, h / 2 + 2);
  }));
  let gi = 0;
  for (let i = 60; i < N; i += 150) {
    const p = P[i]; if (p.tun || P[(i + 20) % N].tun) continue;
    for (const s of [1, -1]) box(0.4, 7.6, 0.4, poleM, p, s * (half + 0.6), p.y + 3.8, yaw(p));
    box(0.5, 0.7, half * 2 + 1.6, poleM, p, 0, p.y + 7.4, yaw(p));
    const b = new THREE.Mesh(new THREE.PlaneGeometry(10.5, 2.5), new THREE.MeshBasicMaterial({ map: boards[gi++ % boards.length], color: 0xcccccc }));
    b.position.set(p.x - p.tx * 0.3 + p.nx * (gi % 2 ? 3 : -3), p.y + 6.4, p.z - p.tz * 0.3 + p.nz * (gi % 2 ? 3 : -3)); b.rotation.y = yaw(p) - Math.PI / 2; g.add(b);
  }

  // suspension bridge over the river
  const b0 = Math.round(BRIDGE[0] * N), b1 = Math.round(BRIDGE[1] * N), t1 = Math.round(lerp(b0, b1, 0.26)), t2 = Math.round(lerp(b0, b1, 0.74));
  const towerM = new THREE.MeshStandardMaterial({ color: 0x8f96a3, roughness: 0.6, metalness: 0.3 }), glowM = new THREE.MeshBasicMaterial({ color: 0x4fa8ff }), TOP = 62;
  for (const ti of [t1, t2]) {
    const p = P[ti];
    for (const s of [1, -1]) { box(3, p.y + TOP, 3, towerM, p, s * (half + 2.2), (p.y + TOP) / 2, yaw(p)); box(0.3, TOP - 6, 0.3, glowM, p, s * (half + 0.55), p.y + TOP / 2 + 2, yaw(p)); box(0.8, 0.8, 0.8, new THREE.MeshBasicMaterial({ color: 0xff2a2a }), p, s * (half + 2.2), p.y + TOP + 0.6, yaw(p)); }
    for (const yy of [TOP - 3, TOP * 0.55, 9]) box(2.4, 2.6, half * 2 + 4.4, towerM, p, 0, p.y + yy, yaw(p));
  }
  const cableY = i => {
    if (i <= t1) { const u = (i - b0) / (t1 - b0); return 2 + (TOP - 2) * u * u; }
    if (i >= t2) { const u = (b1 - i) / (b1 - t2); return 2 + (TOP - 2) * u * u; }
    const u = (i - t1) / (t2 - t1); return 7 + (TOP - 7) * sq(2 * u - 1);
  };
  const cabM = new THREE.MeshBasicMaterial({ color: 0x6f86b5 }), hang = [];
  for (const s of [1, -1]) {
    const cp = []; for (let i = b0; i <= b1; i += 3) { const p = P[i]; cp.push(new THREE.Vector3(p.x + p.nx * s * (half + 2.2), p.y + cableY(i), p.z + p.nz * s * (half + 2.2))); if (i % 6 === 0 && cableY(i) > 3) hang.push([p, s, cableY(i)]); }
    g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(cp), cp.length * 2, 0.32, 6), cabM));
  }
  const hangM = new THREE.InstancedMesh(new THREE.BoxGeometry(0.12, 1, 0.12), cabM, hang.length);
  hang.forEach(([p, s, h], i) => { dummy.position.set(p.x + p.nx * s * (half + 2.2), p.y + h / 2 + 0.5, p.z + p.nz * s * (half + 2.2)); dummy.rotation.set(0, 0, 0); dummy.scale.set(1, h - 1, 1); dummy.updateMatrix(); hangM.setMatrixAt(i, dummy.matrix); });
  g.add(hangM);
  const pm = P[Math.round((b0 + b1) / 2)], riverHalf = 250;
  const water = new THREE.Mesh(new THREE.PlaneGeometry(riverHalf * 2, 5200), new THREE.MeshStandardMaterial({ color: 0x0a1a2e, roughness: 0.12, metalness: 0.75 }));
  water.rotation.set(-Math.PI / 2, 0, yaw(pm)); water.position.set(pm.x, 0.2, pm.z); g.add(water);
  const inRiver = (x, z) => Math.abs((x - pm.x) * pm.tx + (z - pm.z) * pm.tz) < riverHalf + 14;

  // city: buildings on both sides of the route
  const CELL = 60, hash = new Map();
  P.forEach((p, i) => { const k = Math.floor(p.x / CELL) + ',' + Math.floor(p.z / CELL); (hash.get(k) || hash.set(k, []).get(k)).push(i); });
  const roadDist = (x, z) => { let best = 1e9; const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL); for (let a = -3; a <= 3; a++) for (let b = -3; b <= 3; b++) { const l = hash.get((cx + a) + ',' + (cz + b)); if (l) for (const i of l) best = Math.min(best, (P[i].x - x) ** 2 + (P[i].z - z) ** 2); } return Math.sqrt(best); };
  const facade = (wall, lit, cool) => tex(256, 256, (c, w, h) => { c.fillStyle = wall; c.fillRect(0, 0, w, h); for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) { c.fillStyle = Math.random() < lit ? (Math.random() < cool ? '#bfe0ff' : '#ffd58a') : '#0b1018'; c.fillRect(x * 32 + 7, y * 32 + 8, 18, 17); } });
  const mats = [facade('#15171c', 0.3, 0.2), facade('#1b1a1f', 0.22, 0.7), facade('#101318', 0.45, 0.5)].map(t => new THREE.MeshStandardMaterial({ map: t, emissiveMap: t, emissive: 0xffffff, emissiveIntensity: 0.85, roughness: 0.6, metalness: 0.3 }));
  const geos = [[], [], []], neon = [], beacons = [], neonCols = [0xff2d78, 0x22d3ee, 0xff5a1f, 0xa855f7, 0x4ade80];
  for (let x = -1100; x <= 1750; x += 44) for (let z = -1700; z <= 330; z += 44) {
    const bx = x + (r() - 0.5) * 16, bz = z + (r() - 0.5) * 16, d = roadDist(bx, bz);
    if (d < 30 || d > 210 || inRiver(bx, bz) || r() < 0.18) continue;
    const down = Math.max(0, 1 - Math.hypot(bx - 330, bz + 660) / 900), w = 20 + r() * 14, dp = 20 + r() * 14, h = 14 + r() * 34 + down * r() * 150 + (d > 120 ? r() * 40 : 0);
    const b = new THREE.BoxGeometry(w, h, dp), uv = b.attributes.uv;
    for (let f = 0; f < 6; f++) for (let v = 0; v < 4; v++) { const i = f * 4 + v; if (f === 2 || f === 3) uv.setXY(i, 0.01, 0.01); else uv.setXY(i, uv.getX(i) * Math.round((f < 2 ? dp : w) / 3.2) / 8, uv.getY(i) * Math.round(h / 3.4) / 8); }
    b.translate(bx, h / 2, bz); geos[Math.floor(r() * 3)].push(b);
    if (h > 90) { const k = new THREE.BoxGeometry(1.2, 1.2, 1.2); k.translate(bx, h + 0.8, bz); beacons.push(k); }
    if (d < 70 && r() < 0.3) { const sgn = new THREE.BoxGeometry(w * 0.7, 2.2, 0.4); sgn.translate(bx, 8 + r() * (h * 0.5), bz + (r() < 0.5 ? 1 : -1) * (dp / 2 + 0.3)); neon.push([sgn, neonCols[Math.floor(r() * 5)]]); }
  }
  geos.forEach((list, i) => { if (list.length) g.add(new THREE.Mesh(mergeGeometries(list), mats[i])); });
  if (beacons.length) g.add(new THREE.Mesh(mergeGeometries(beacons), new THREE.MeshBasicMaterial({ color: 0xff3030 })));
  for (const c of neonCols) { const list = neon.filter(n => n[1] === c).map(n => n[0]); if (list.length) g.add(new THREE.Mesh(mergeGeometries(list), new THREE.MeshBasicMaterial({ color: c }))); }
  const groundT = tex(512, 512, (c, w, h) => {
    c.fillStyle = '#0d0e12'; c.fillRect(0, 0, w, h); c.strokeStyle = '#1c1d24'; c.lineWidth = 10; c.strokeRect(0, 0, w, h);
    for (let i = 0; i < 160; i++) { c.fillStyle = Math.random() < 0.5 ? 'rgba(255,205,140,0.7)' : 'rgba(190,220,255,0.6)'; c.fillRect(Math.random() < 0.5 ? Math.random() * w : (Math.random() < 0.5 ? 2 : w - 5), Math.random() * h, 3, 3); }
  }, 80, 80);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(7000, 7000), new THREE.MeshStandardMaterial({ map: groundT, roughness: 0.9 })); ground.rotation.x = -Math.PI / 2; ground.position.set(330, 0, -690); g.add(ground);

  const dome = skyDome('#050816', '#2b1d44', '#0b0a12'); g.add(dome);
  const hemi = new THREE.HemisphereLight(0x7482c8, 0x1e1b26, 0.95), sun = new THREE.DirectionalLight(0xa9bcff, 0.6);
  g.add(hemi, sun, sun.target);
  const glow = [0xff2d78, 0x22d3ee, 0xffd58a, 0xa855f7, 0xffd58a].map((c, i) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(i === 4 ? 30 : 12, i === 4 ? 1.2 : 5), new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(i === 4 ? 6 : 3), side: DS })); const a = i * Math.PI / 2 + 0.4; if (i === 4) { m.position.set(0, 12, 0); m.rotation.x = Math.PI / 2; } else { m.position.set(Math.cos(a) * 16, 3 + i, Math.sin(a) * 16); m.lookAt(0, 2, 0); } return m; });

  const lanes = Array.from({ length: LANES }, (_, l) => (l - (LANES - 1) / 2) * LW);
  const at = s => { s = ((s % len) + len) % len; const f = s / ds, i = Math.floor(f) % N, a = P[i], b = P[(i + 1) % N], u = f - Math.floor(f); return { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u, z: a.z + (b.z - a.z) * u, tx: a.tx, tz: a.tz, nx: a.nx, nz: a.nz, tun: a.tun }; };
  let idx = 0, last = null;
  const world = {
    id: 'highway', name: 'Midnight Expressway', group: g, sun, sunDir: new THREE.Vector3(-0.3, 0.85, 0.25).normalize(), env: envFrom(renderer, dome, glow), fog: new THREE.Fog(0x0c0b18, 90, 900), night: true, hasLaps: false,
    road: { P, N, ds, len, half, lanes, LW, at },
    get spawn() { const p = at(40); return { x: p.x + p.nx * lanes[1], z: p.z + p.nz * lanes[1], psi: Math.atan2(-p.tz, p.tx) }; },
    reset() { idx = Math.round(40 / ds); },
    surface(x, z) {
      let best = 1e12, bi = idx;
      for (let k = -50; k <= 50; k++) { const i = (idx + k + N) % N, d = (P[i].x - x) ** 2 + (P[i].z - z) ** 2; if (d < best) { best = d; bi = i; } }
      if (best > 3600) for (let i = 0; i < N; i += 4) { const d = (P[i].x - x) ** 2 + (P[i].z - z) ** 2; if (d < best) { best = d; bi = i; } }
      idx = bi; const p = P[bi], rx = x - p.x, rz = z - p.z, along = rx * p.tx + rz * p.tz, lat = rx * p.nx + rz * p.nz;
      const slope = (P[(bi + 1) % N].y - P[(bi + N - 1) % N].y) / (2 * ds);
      last = { p, along, lat };
      return { grip: 1, drag: 0, off: 0, lap: false, line: false, y: p.y + along * slope, slope, tx: p.tx, tz: p.tz, nx: p.nx, nz: p.nz, s: bi * ds + along, lat, tunnel: p.tun };
    },
    collide() {
      const lim = half - 0.95; if (!last || Math.abs(last.lat) <= lim) return null;
      const { p, along, lat } = last, sg = Math.sign(lat);
      return { x: p.x + p.tx * along + p.nx * sg * lim, z: p.z + p.tz * along + p.nz * sg * lim, nx: -sg * p.nx, nz: -sg * p.nz };
    },
    respawn() { const p = P[idx]; let l = lanes[0]; if (last) for (const q of lanes) if (Math.abs(q - last.lat) < Math.abs(l - last.lat)) l = q; return { x: p.x + p.nx * l, z: p.z + p.nz * l, psi: Math.atan2(-p.tz, p.tx) }; },
  };
  return world;
}

// ---------------------------------------------------------------------------
// Apex Dragway — quarter-mile strip with staging lanes, a Christmas tree,
// timing boards and a long shutdown area. Built for day or night.
// ---------------------------------------------------------------------------
export const DRAG = { FT60: 18.288, FT330: 100.584, EIGHTH: 201.168, FT1000: 304.8, QUARTER: 402.336, ROLLOUT: 0.33, PRE: -0.18, TRAP: 20.1168, LANE: 4.5 };
function buildDrag(renderer, opts = {}) {
  const night = !!opts.night, g = new THREE.Group(), HALF = 9.6, X0 = -75, X1 = 1150, r = rng(5);
  const M = (c, ro = 0.7, me = 0.1) => new THREE.MeshStandardMaterial({ color: c, roughness: ro, metalness: me });
  const box = (w, h, d, mat, x, y, z, ry = 0) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); b.position.set(x, y, z); b.rotation.y = ry; b.castShadow = b.receiveShadow = true; g.add(b); return b; };
  const flat = (w, d, mat, x, z, y = 0.02) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat); m.rotation.x = -Math.PI / 2; m.position.set(x, y, z); m.receiveShadow = true; g.add(m); return m; };

  // strip: prepared surface with a rubbered groove in each lane
  const stripT = tex(256, 512, (c, w, h) => {
    c.fillStyle = '#2a2c30'; c.fillRect(0, 0, w, h);
    for (let i = 0; i < 9000; i++) { const v = 32 + Math.random() * 26; c.fillStyle = `rgba(${v},${v},${v + 2},0.5)`; c.fillRect(Math.random() * w, Math.random() * h, 1.5, 1.5); }
    for (const zc of [0.265, 0.735]) for (const o of [-0.045, 0.045]) { c.fillStyle = 'rgba(8,8,9,0.55)'; c.fillRect(0, (zc + o) * h - 9, w, 18); }
    c.fillStyle = '#e8e8e8'; c.fillRect(0, h / 2 - 2, w, 4);                 // lane divider (edge lines are separate decals)
  }, 60, 1);

  const white = new THREE.MeshBasicMaterial({ color: night ? 0xbfc3c9 : 0xf1f1f1 });
  // ---- road layout: the strip, plus one continuous return road that leaves the shutdown area through a
  // turn-off in the south wall, runs back along the pits side, swings round behind the start and opens
  // out into the staging lanes, which meet the strip edge-to-edge at its start (x = X0).
  const XM = 820, RW = 4.5, R1 = 16, R2 = 8, RZ = -(HALF + 46);          // turn-off centre, road half-width, corner radii, return road line
  const AX = XM - RW - R1, DX = XM + RW + R2;                               // the turn-off mouth spans AX..DX along the strip's south edge
  const path = roadPath([XM, -HALF], -Math.PI / 2, [
    { len: -RZ - HALF - 20 },                 // out of the strip, straight away from the wall
    { r: 20, turn: -Math.PI / 2 },            // onto the return road
    { len: XM - 20 + 110 },                   // back along the return road
    { r: -RZ / 2, turn: -Math.PI },           // round behind the start area
    { len: X0 + 110 },                        // staging approach
  ], 1);
  const S = path[path.length - 1].s, FLARE = 30;
  const wOf = p => RW + (HALF - RW) * smooth01((p.s - (S - FLARE)) / FLARE);   // widens to the full strip in the staging lanes
  const at = (p, k) => ({ x: p.x + p.nx * k, z: p.z + p.nz * k });
  const arc = (cx, cz, r, a0, a1, n = 24) => Array.from({ length: n + 1 }, (_, i) => { const a = a0 + (a1 - a0) * i / n; return { x: cx + r * Math.cos(a), z: cz + r * Math.sin(a) }; });
  // outline, anticlockwise: west corner radius, inner edge of the loop, across the staging end, outer edge back, east corner radius
  const outline = [
    ...arc(AX, -HALF - R1, R1, Math.PI / 2, 0),
    ...path.filter(p => p.s > R1 + 1e-6).map(p => at(p, -wOf(p))),
    ...path.filter(p => p.s >= R2 - 1e-6).reverse().map(p => at(p, wOf(p))),
    ...arc(DX, -HALF - R2, R2, Math.PI, Math.PI / 2).slice(1),
  ];
  let bx0 = 1e9, bx1 = -1e9, bz0 = 1e9, bz1 = -1e9; for (const p of outline) { bx0 = Math.min(bx0, p.x); bx1 = Math.max(bx1, p.x); bz0 = Math.min(bz0, p.z); bz1 = Math.max(bz1, p.z); }
  const onRoad = (x, z) => x >= bx0 && x <= bx1 && z >= bz0 && z <= bz1 && insidePolygon(outline, x, z);
  const onStrip = (x, z) => x >= X0 && x <= X1 && Math.abs(z) <= HALF;

  // strip surface, with vertices exactly where the turn-off mouth meets it, so the two surfaces share edges
  {
    const xs = [X0, AX, DX, X1], pos = [], uv = [], idx = [];
    for (const x of xs) { const u = (x - X0) / (X1 - X0); pos.push(x, 0.02, -HALF, x, 0.02, HALF); uv.push(u, 1, u, 0); }
    for (let i = 0; i < xs.length - 1; i++) { const k = i * 2; idx.push(k, k + 1, k + 3, k, k + 3, k + 2); }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.setIndex(idx); geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: stripT, roughness: 0.55, metalness: 0.1, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 })); m.receiveShadow = true; m.name = 'strip'; g.add(m);
  }
  // return road surface: one mesh, same height as the strip, no overlap
  const roadT = tex(256, 256, (c, w, h) => {
    c.fillStyle = '#2c2e33'; c.fillRect(0, 0, w, h);
    for (let i = 0; i < 7000; i++) { const v = 32 + Math.random() * 26; c.fillStyle = `rgba(${v},${v},${v + 2},0.5)`; c.fillRect(Math.random() * w, Math.random() * h, 1.5, 1.5); }
  });
  { const m = new THREE.Mesh(polygonGeometry(outline, 0.02, 1 / 8), new THREE.MeshStandardMaterial({ map: roadT, roughness: 0.62, metalness: 0.08, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 })); m.receiveShadow = true; m.name = 'returnRoad'; g.add(m); }

  // markings (one mesh): strip edge lines — dashed across the turn-off — continuing into the road's edge
  // lines; the road's dashed centre line, which becomes the solid lane divider through the staging lanes
  {
    const IN = 0.31, LW = 0.06, line = [], band = (pts, w = LW) => line.push(bandGeometry(pts, -w, w, 0.03));
    const xLine = (x0, x1, z) => band([{ x: x0, z }, { x: x1, z }]);
    xLine(X0, X1, HALF - IN); xLine(X0, AX, -(HALF - IN)); xLine(DX, X1, -(HALF - IN));
    for (let x = AX + 0.5; x < DX - 0.5; x += 2) xLine(x, Math.min(x + 1, DX - 0.5), -(HALF - IN));
    band([...arc(AX, -HALF - R1, R1 + IN, Math.PI / 2, 0), ...path.filter(p => p.s > R1 + 1e-6).map(p => at(p, -(wOf(p) - IN)))]);
    band([...path.filter(p => p.s >= R2 - 1e-6).reverse().map(p => at(p, wOf(p) - IN)), ...arc(DX, -HALF - R2, R2 + IN, Math.PI, Math.PI / 2).slice(1)]);
    const seg = (s0, s1) => path.filter(p => p.s >= s0 - 1e-6 && p.s <= s1 + 1e-6);
    for (let s0 = 14; s0 + 3 < S - FLARE; s0 += 9) band(seg(s0, s0 + 3));
    band(seg(S - FLARE, S), 0.075);
    const lineM = white.clone(); lineM.polygonOffset = true; lineM.polygonOffsetFactor = -2; lineM.polygonOffsetUnits = -2;
    g.add(new THREE.Mesh(mergeGeometries(line), lineM));
  }
  flat(22, HALF * 2 - 0.4, new THREE.MeshStandardMaterial({ color: 0x0c0d0f, roughness: 0.18, metalness: 0.3 }), -34, 0, 0.025);        // water box
  flat(0.25, HALF * 2, white, 0, 0, 0.03);
  for (const d of [DRAG.FT60, DRAG.FT330, DRAG.EIGHTH, DRAG.FT1000, DRAG.QUARTER]) flat(d === DRAG.EIGHTH || d === DRAG.QUARTER ? 0.5 : 0.12, HALF * 2, white, d, 0, 0.03);
  const chk = tex(64, 32, (c) => { for (let x = 0; x < 8; x++) for (let y = 0; y < 4; y++) { c.fillStyle = (x + y) % 2 ? '#111' : '#f4f4f4'; c.fillRect(x * 8, y * 8, 8, 8); } }, 8, 1);
  const finishLine = flat(1.2, HALF * 2, new THREE.MeshBasicMaterial({ map: chk }), DRAG.QUARTER + 0.9, 0, 0.032); finishLine.rotation.z = Math.PI / 2;
  // sand trap at the very end
  flat(110, HALF * 2, M(0xb7a273, 1), X1 - 55, 0, 0.04);

  // walls: concrete along both sides and across the far end, open at the start (staging lanes) and at the
  // turn-off. This list is what the cars collide with, so what you see is what stops you.
  const wallM = M(0xc9ccd1, 0.8), WZ = HALF + 0.25;
  const walls = [[X0, WZ, X1, WZ, 0.25], [X0, -WZ, AX, -WZ, 0.25], [DX, -WZ, X1, -WZ, 0.25], [X1 + 0.3, -WZ - 0.25, X1 + 0.3, WZ + 0.25, 0.3]];
  for (const [ax, az, bx, bz, t] of walls) { const l = Math.hypot(bx - ax, bz - az); box(l, 1.0, t * 2, wallM, (ax + bx) / 2, 0.5, (az + bz) / 2, -Math.atan2(bz - az, bx - ax)); }
  for (const s of [1, -1]) {
    for (const [d, label] of [[DRAG.FT60, "60'"], [DRAG.FT330, "330'"], [DRAG.EIGHTH, '1/8'], [DRAG.FT1000, "1000'"], [DRAG.QUARTER, '1/4']]) {
      const t = tex(128, 64, (c, w, h) => { c.fillStyle = '#ff5a1f'; c.fillRect(0, 0, w, h); c.fillStyle = '#111'; c.font = '900 44px Arial'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(label, w / 2, h / 2 + 2); });
      const b = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.2), new THREE.MeshBasicMaterial({ map: t, color: night ? 0xb0b0b0 : 0xffffff })); b.position.set(d, 1.9, s * (HALF + 0.3)); b.rotation.y = s > 0 ? Math.PI : 0; g.add(b);
      box(0.12, 1.3, 0.12, M(0x2a2d33), d, 1.3, s * (HALF + 0.3));
    }
  }

  // Christmas tree: per lane — 2 pre-stage, 2 stage, 3 ambers, green, red
  const tree = new THREE.Group(); tree.position.set(13, 0, 0); g.add(tree);
  tree.add(new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 4.2, 10), M(0x1b1c20, 0.5, 0.6))).position.y = 2.1;
  const bulbs = [[], []], bulbG = new THREE.SphereGeometry(0.11, 14, 10), small = new THREE.SphereGeometry(0.06, 10, 8);
  const COLS = { pre: 0xffd24a, stage: 0xffd24a, amber: 0xffa200, green: 0x2bff4a, red: 0xff2424 };
  const rows = [['pre', 3.95], ['stage', 3.7], ['amber', 3.3], ['amber', 2.95], ['amber', 2.6], ['green', 2.2], ['red', 1.85]];
  for (let lane = 0; lane < 2; lane++) {
    const zs = lane ? 0.34 : -0.34; box(0.16, 2.5, 0.3, M(0x101114, 0.5), 13, 2.9, zs);
    rows.forEach(([kind, y]) => {
      const mat = new THREE.MeshBasicMaterial({ color: 0x1a1a1a }), set = [];
      for (const dz of kind === 'pre' || kind === 'stage' ? [-0.07, 0.07] : [0]) { const b = new THREE.Mesh(kind === 'pre' || kind === 'stage' ? small : bulbG, mat); b.position.set(-0.11, y, zs + dz); tree.add(b); set.push(b); }
      bulbs[lane].push({ kind, mat, on: new THREE.Color(COLS[kind]), off: new THREE.Color(COLS[kind]).multiplyScalar(0.08) });
    });
  }
  const treeLight = new THREE.PointLight(0xffffff, 0, 30, 2); treeLight.position.set(11, 2.6, 0); g.add(treeLight);
  /** st = { pre:[bool,bool], stage:[bool,bool], amber:[n,n] (0-3 lit, top down), green:[..], red:[..] } */
  const setTree = st => {
    let glow = 0, col = 0xffa200;
    for (let lane = 0; lane < 2; lane++) { let ai = 0; for (const b of bulbs[lane]) {
      const lit = b.kind === 'amber' ? (st.amberMask ? !!(st.amberMask[lane] & (1 << ai++)) : ai++ < st.amber[lane]) : !!st[b.kind][lane];
      b.mat.color.copy(lit ? b.on : b.off); if (lit && b.kind !== 'pre' && b.kind !== 'stage') { glow = 1; col = b.on.getHex(); }
    } }
    treeLight.intensity = glow * (night ? 60 : 12); treeLight.color.set(col);
  };
  setTree({ pre: [0, 0], stage: [0, 0], amber: [0, 0], green: [0, 0], red: [0, 0] });

  // finish-line scoreboards (one per lane)
  const boards = [0, 1].map(lane => {
    const c = document.createElement('canvas'); c.width = 512; c.height = 256; const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    const draw = (et, spd, win) => { const x = c.getContext('2d'); x.fillStyle = '#060607'; x.fillRect(0, 0, 512, 256); x.strokeStyle = '#2a2d33'; x.lineWidth = 8; x.strokeRect(4, 4, 504, 248);
      x.font = '900 104px "Courier New", monospace'; x.textAlign = 'right'; x.fillStyle = win ? '#2bff4a' : '#ffb300'; x.fillText(et, 480, 110); x.fillStyle = '#ff5a1f'; x.fillText(spd, 480, 224);
      x.font = '700 26px Arial'; x.textAlign = 'left'; x.fillStyle = '#8a92a0'; x.fillText('E.T.', 26, 60); x.fillText('KM/H', 26, 176); t.needsUpdate = true; };
    draw('-.---', '---', false);
    const zs = (lane ? 1 : -1) * (HALF + 5);
    box(0.5, 8, 0.5, M(0x1b1c20, 0.5, 0.6), DRAG.QUARTER + 45, 4, zs);
    const b = new THREE.Mesh(new THREE.PlaneGeometry(9, 4.5), new THREE.MeshBasicMaterial({ map: t })); b.position.set(DRAG.QUARTER + 44.6, 8, zs); b.rotation.y = -Math.PI / 2; g.add(b);
    return draw;
  });

  // start-line tower, grandstands, pit building, light poles
  const stand = M(0x8a8f98, 0.8), seat = M(0xb91c1c, 0.8), dark = M(0x23262b, 0.6), glass = M(0x0b1622, 0.2, 0.6);
  for (const s of [1, -1]) {
    for (let i = 0; i < 8; i++) box(190, 1.0, 2.0, i % 2 ? seat : stand, 105, 0.5 + i * 1.0, s * (HALF + 7 + i * 2.0));
    box(192, 0.4, 18, M(0xd9dadd, 0.6), 105, 10.5, s * (HALF + 15));
  }
  box(9, 11, 7, M(0xe6e7ea, 0.7), -22, 5.5, -(HALF + 9)); box(9.4, 2.6, 7.4, glass, -22, 9.2, -(HALF + 9)); box(10, 0.5, 8, dark, -22, 11.2, -(HALF + 9));
  const sign = tex(1024, 128, (c, w, h) => { c.fillStyle = '#0b0c0f'; c.fillRect(0, 0, w, h); c.fillStyle = '#ff5a1f'; c.fillRect(0, h - 10, w, 10); c.fillStyle = '#fff'; c.font = 'italic 900 84px Arial'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('APEX DRAGWAY', w / 2, h / 2 - 4); });
  for (const sx of [1, -1]) { box(0.5, 9, 0.5, dark, -52, 4.5, sx * (HALF + 1)); }
  box(1.2, 1.8, HALF * 2 + 3, dark, -52, 9, 0);
  const sg = new THREE.Mesh(new THREE.PlaneGeometry(HALF * 2 + 2, 1.6), new THREE.MeshBasicMaterial({ map: sign })); sg.position.set(-52.62, 9, 0); sg.rotation.y = -Math.PI / 2; g.add(sg);
  const sg2 = sg.clone(); sg2.position.x = -51.38; sg2.rotation.y = Math.PI / 2; g.add(sg2);
  // floodlights
  const poles = []; for (let x = -60; x <= 640; x += 70) for (const s of [1, -1]) poles.push([x, s]);
  const poleM = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.16, 0.22, 16, 8), M(0x2a2d33, 0.5, 0.7), poles.length), headM = new THREE.InstancedMesh(new THREE.BoxGeometry(1.4, 0.5, 2.6), new THREE.MeshBasicMaterial({ color: night ? 0xfff3d6 : 0x9a9da3 }), poles.length), dm = new THREE.Object3D();
  poles.forEach(([x, s], i) => { dm.position.set(x, 8, s * (HALF + 3)); dm.updateMatrix(); poleM.setMatrixAt(i, dm.matrix); dm.position.set(x, 16.2, s * (HALF + 2.4)); dm.updateMatrix(); headM.setMatrixAt(i, dm.matrix); });
  g.add(poleM, headM);
  if (night) {
    const poolT = tex(64, 64, (c, w) => { const gr = c.createRadialGradient(w / 2, w / 2, 2, w / 2, w / 2, w / 2); gr.addColorStop(0, 'rgba(255,240,210,0.42)'); gr.addColorStop(1, 'rgba(255,240,210,0)'); c.fillStyle = gr; c.fillRect(0, 0, w, w); });
    const pg = new THREE.PlaneGeometry(74, 30); pg.rotateX(-Math.PI / 2);
    const pool = new THREE.InstancedMesh(pg, new THREE.MeshBasicMaterial({ map: poolT, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }), 11);
    for (let i = 0; i < 11; i++) { dm.position.set(-60 + i * 70, 0.05, 0); dm.updateMatrix(); pool.setMatrixAt(i, dm.matrix); }
    pool.renderOrder = 1; g.add(pool);
  }
  // surroundings
  const grass = tex(256, 256, (c, w, h) => { c.fillStyle = night ? '#16261a' : '#3f6a2c'; c.fillRect(0, 0, w, h); for (let i = 0; i < 9000; i++) { c.fillStyle = night ? `rgba(${20 + Math.random() * 20},${40 + Math.random() * 30},${20 + Math.random() * 20},0.5)` : `rgba(${40 + Math.random() * 50},${90 + Math.random() * 70},${30 + Math.random() * 30},0.5)`; c.fillRect(Math.random() * w, Math.random() * h, 2, 3); } }, 200, 200);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(3200, 3200), new THREE.MeshStandardMaterial({ map: grass, roughness: 1 })); ground.rotation.x = -Math.PI / 2; ground.position.set(500, -0.01, 0); ground.receiveShadow = true; g.add(ground);
  const nearRoad = (x, z, d) => { for (let i = 0; i < path.length; i += 3) if ((path[i].x - x) ** 2 + (path[i].z - z) ** 2 < d * d) return true; return false; };
  const spots = []; while (spots.length < 320) { const x = -300 + r() * 1700, z = (r() < 0.5 ? 1 : -1) * (60 + r() * 380); if (!nearRoad(x, z, RW + 9)) spots.push([x, z, 0.7 + r() * 0.9]); }
  const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.35, 0.5, 3, 6), M(0x4a3626, 0.9), spots.length), leaves = new THREE.InstancedMesh(new THREE.ConeGeometry(2.8, 8, 7), M(night ? 0x12261a : 0x244a1e, 0.9), spots.length), mt = new THREE.Matrix4();
  spots.forEach(([x, z, sc], i) => { mt.makeScale(sc, sc, sc).setPosition(x, 1.5 * sc, z); trunks.setMatrixAt(i, mt); mt.makeScale(sc, sc, sc).setPosition(x, 6.5 * sc, z); leaves.setMatrixAt(i, mt); });
  g.add(trunks, leaves);

  // ---- facility: wall-end crash barrels, signs, junction lights and a perimeter fence
  const FX0 = -190, FX1 = 1210, FZ0 = -95, FZ1 = 72;
  const posts = [];                                                       // round obstacles [x, z, r]
  const yb = tex(32, 64, (c, w, h) => { for (let i = 0; i < 4; i++) { c.fillStyle = i % 2 ? '#111' : '#f2c100'; c.fillRect(0, i * h / 4, w, h / 4); } });
  const barrelG = new THREE.CylinderGeometry(0.32, 0.32, 0.95, 14), barrelM = new THREE.MeshStandardMaterial({ map: yb, roughness: 0.6 });
  for (const [x, z] of [[X0 - 0.34, WZ], [X0 - 0.34, -WZ], [AX - 0.34, -WZ], [DX + 0.34, -WZ]]) { const b = new THREE.Mesh(barrelG, barrelM); b.position.set(x, 0.475, z); b.castShadow = true; g.add(b); posts.push([x, z, 0.32]); }
  const signBoard = (text, sub, x, z, ry) => {
    const t = tex(512, 160, (c, w, h) => { c.fillStyle = '#0b0c0f'; c.fillRect(0, 0, w, h); c.fillStyle = '#ff5a1f'; c.fillRect(0, h - 12, w, 12); c.fillStyle = '#fff'; c.font = '900 58px Arial'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(text, w / 2, 58); c.fillStyle = '#c9ced6'; c.font = '700 30px Arial'; c.fillText(sub, w / 2, 112); });
    const grp = new THREE.Group(); grp.position.set(x, 0, z); grp.rotation.y = ry; g.add(grp);
    const b = new THREE.Mesh(new THREE.PlaneGeometry(4.8, 1.5), new THREE.MeshBasicMaterial({ map: t, side: THREE.DoubleSide, color: night ? 0xb8b8b8 : 0xffffff })); b.position.y = 2.6; grp.add(b);
    for (const dx of [-1.9, 1.9]) { const pst = new THREE.Mesh(new THREE.BoxGeometry(0.12, 2.6, 0.12), M(0x2a2d33, 0.5, 0.6)); pst.position.set(dx, 1.3, 0.02); grp.add(pst); posts.push([x + dx * Math.cos(ry), z - dx * Math.sin(ry), 0.12]); }
  };
  signBoard('RETURN ROAD', 'Exit here · back to staging', DX + 7, -HALF - 5, -Math.PI / 2);
  signBoard('STAGING LANES', 'Burnout box · then stage', X0 - 26, HALF + 3.5, -Math.PI / 2);
  // junction floodlights (lit at night)
  for (const [x, z, px, pz] of [[X0 - 22, -HALF - 4.5, X0 - 22, 0], [-110 - 39, -27.8, -110 - 28, -27.8], [XM + 16, -HALF - 30, XM - 2, -HALF - 30]]) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.22, 14, 8), M(0x2a2d33, 0.5, 0.7)); pole.position.set(x, 7, z); g.add(pole); posts.push([x, z, 0.22]);
    const hd = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.45, 1.2), new THREE.MeshBasicMaterial({ color: night ? 0xfff3d6 : 0x9a9da3 })); hd.position.set(x + (px - x) * 0.08, 14.1, z + (pz - z) * 0.08); g.add(hd);
    if (night) { const pt = tex(64, 64, (c, w) => { const gr = c.createRadialGradient(w / 2, w / 2, 2, w / 2, w / 2, w / 2); gr.addColorStop(0, 'rgba(255,240,210,0.42)'); gr.addColorStop(1, 'rgba(255,240,210,0)'); c.fillStyle = gr; c.fillRect(0, 0, w, w); });
      const pool = new THREE.Mesh(new THREE.PlaneGeometry(34, 34), new THREE.MeshBasicMaterial({ map: pt, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })); pool.rotation.x = -Math.PI / 2; pool.position.set(px, 0.05, pz); pool.renderOrder = 1; g.add(pool); }
  }
  // perimeter fence
  const fence = [[FX0, FZ0, FX1, FZ0], [FX1, FZ0, FX1, FZ1], [FX1, FZ1, FX0, FZ1], [FX0, FZ1, FX0, FZ0]];
  {
    const fM = M(0x3a3d44, 0.6, 0.6), fp = []; for (const [ax, az, bx, bz] of fence) { const l = Math.hypot(bx - ax, bz - az), n = Math.ceil(l / 5); for (let i = 0; i < n; i++) fp.push([ax + (bx - ax) * i / n, az + (bz - az) * i / n]); }
    const im = new THREE.InstancedMesh(new THREE.BoxGeometry(0.1, 1.4, 0.1), fM, fp.length), d = new THREE.Object3D();
    fp.forEach(([x, z], i) => { d.position.set(x, 0.7, z); d.updateMatrix(); im.setMatrixAt(i, d.matrix); }); g.add(im);
    for (const [ax, az, bx, bz] of fence) for (const y of [0.55, 1.3]) { const l = Math.hypot(bx - ax, bz - az); box(l, 0.06, 0.06, fM, (ax + bx) / 2, y, (az + bz) / 2, -Math.atan2(bz - az, bx - ax)); }
    for (const [ax, az, bx, bz] of fence) walls.push([ax, az, bx, bz, 0.1]);
  }
  // other solid things near where cars can now drive
  const boxes = [[-26.5, -17.5, -(HALF + 12.5), -(HALF + 5.5)]];             // timing tower
  for (const sd of [1, -1]) boxes.push([10, 200, sd > 0 ? HALF + 6 : -(HALF + 22), sd > 0 ? HALF + 22 : -(HALF + 6)]);   // grandstands
  for (const sd of [1, -1]) { posts.push([-52, sd * (HALF + 1), 0.25], [DRAG.QUARTER + 45, sd * (HALF + 5), 0.25]); }
  for (const [x, sd] of poles) posts.push([x, sd * (HALF + 3), 0.22]);
  for (const [x, z, sc] of spots) if (x > FX0 && x < FX1 && z > FZ0 && z < FZ1) posts.push([x, z, 0.5 * sc]);

  // ---- collision: the car is three circles along its length; walls are capsules (so wall ends are
  // rounded and nothing snags), and a move that crosses a wall's centre line since the last frame is
  // caught even at very low frame rates.
  const CR = 0.95, pose = { psi: 0, len: 4.5 }; let last = null;
  const crossT = (p0x, p0z, p1x, p1z, ax, az, bx, bz) => {
    const rx = p1x - p0x, rz = p1z - p0z, sx = bx - ax, sz = bz - az, den = rx * sz - rz * sx; if (Math.abs(den) < 1e-12) return false;
    const t = ((ax - p0x) * sz - (az - p0z) * sx) / den, u = ((ax - p0x) * rz - (az - p0z) * rx) / den; return t >= 0 && t <= 1 && u >= 0 && u <= 1;
  };
  const collide = (x, z) => {
    const psi = pose.psi, k = Math.max(0, pose.len / 2 - CR), offs = k ? [0, k, -k] : [0];
    const prev = last && Math.hypot(last.x - x, last.z - z) < 400 ? last : null;  // resets call resetCollision(), so this only guards against nonsense
    let cx = x, cz = z, sx = 0, sz = 0;
    const shove = (dx, dz) => { cx += dx; cz += dz; sx += dx; sz += dz; };
    for (let iter = 0; iter < 3; iter++) {
      let moved = false;
      for (const o of offs) {
        const fx = Math.cos(psi) * o, fz = -Math.sin(psi) * o;
        const qx = prev ? prev.x + Math.cos(prev.psi) * o : null, qz = prev ? prev.z - Math.sin(prev.psi) * o : null;
        for (const [ax, az, bx, bz, t] of walls) {
          const px = cx + fx, pz = cz + fz, c = t + CR, wx = bx - ax, wz = bz - az, wl = Math.hypot(wx, wz), nx = -wz / wl, nz = wx / wl;
          if (prev && crossT(qx, qz, px, pz, ax, az, bx, bz)) {                // went through the wall: put it back on its own side
            const side = Math.sign((qx - ax) * nx + (qz - az) * nz) || 1, d = (px - ax) * nx + (pz - az) * nz;
            shove(nx * (side * c - d), nz * (side * c - d)); moved = true; continue;
          }
          const L2 = wl * wl, tt = Math.max(0, Math.min(1, ((px - ax) * wx + (pz - az) * wz) / L2)), qx2 = ax + wx * tt, qz2 = az + wz * tt;
          let dx = px - qx2, dz = pz - qz2, d = Math.hypot(dx, dz);
          if (d < c) { if (d < 1e-6) { const side = prev ? Math.sign((qx - ax) * nx + (qz - az) * nz) || 1 : 1; dx = nx * side; dz = nz * side; d = 1; shove(dx * c, dz * c); } else shove(dx / d * (c - d), dz / d * (c - d)); moved = true; }
        }
        for (const [x0, x1, z0, z1] of boxes) {
          const px = cx + fx, pz = cz + fz; if (px < x0 - CR || px > x1 + CR || pz < z0 - CR || pz > z1 + CR) continue;
          const qx2 = Math.max(x0, Math.min(x1, px)), qz2 = Math.max(z0, Math.min(z1, pz)); let dx = px - qx2, dz = pz - qz2, d = Math.hypot(dx, dz);
          if (d >= CR) continue;
          if (d < 1e-6) { const e = [[px - x0, -1, 0], [x1 - px, 1, 0], [pz - z0, 0, -1], [z1 - pz, 0, 1]].sort((a, b) => a[0] - b[0])[0]; shove(e[1] * (e[0] + CR), e[2] * (e[0] + CR)); }
          else shove(dx / d * (CR - d), dz / d * (CR - d));
          moved = true;
        }
        for (const [ox, oz, r] of posts) {
          const px = cx + fx, pz = cz + fz, dx = px - ox, dz = pz - oz, d = Math.hypot(dx, dz), c = r + CR;
          if (d < c && d > 1e-6) { shove(dx / d * (c - d), dz / d * (c - d)); moved = true; }
        }
      }
      if (!moved) break;
    }
    last = { x: cx, z: cz, psi };
    const sl = Math.hypot(sx, sz); return sl > 1e-9 ? { x: cx, z: cz, nx: sx / sl, nz: sz / sl } : null;
  };

  const sunDir = night ? new THREE.Vector3(-0.3, 0.85, 0.3).normalize() : new THREE.Vector3(-0.4, 0.75, 0.4).normalize();
  const dome = night ? skyDome('#03040a', '#141a33', '#0a0d0b') : skyDome('#3b78c7', '#bcd9ef', '#6f8f63', { dir: sunDir, size: 60, color: 0xfff6dd }); g.add(dome);
  const hemi = night ? new THREE.HemisphereLight(0x8c9ad0, 0x20242a, 1.15) : new THREE.HemisphereLight(0xcfe3ff, 0x4a5a3a, 1.0);
  const sun = new THREE.DirectionalLight(night ? 0xfff0d8 : 0xfff1dc, night ? 1.3 : 2.6); g.add(hemi, sun, sun.target);
  const glow = night ? [0, 1, 2].map(i => { const m = new THREE.Mesh(new THREE.PlaneGeometry(26, 1.4), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xfff0d0).multiplyScalar(7), side: THREE.DoubleSide })); m.position.set(0, 11, (i - 1) * 7); m.rotation.x = Math.PI / 2; return m; }) : [];

  let lane = 0;
  return {
    name: night ? 'Apex Dragway · Night' : 'Apex Dragway', group: g, sun, sunDir, env: envFrom(renderer, dome, glow), fog: night ? new THREE.Fog(0x070a12, 160, 1300) : new THREE.Fog(0xbcd9ef, 400, 2200), night, hasLaps: false, drag: true,
    setTree, showResult: (l, et, spd, win) => boards[l](et, spd, win), clearBoards: () => boards.forEach(b => b('-.---', '---', false)),
    setLane(l) { lane = l ? 1 : 0; },
    get spawn() { return { x: -7, z: (lane ? 1 : -1) * DRAG.LANE, psi: 0 }; },
    reset() { last = null; },
    resetCollision(x, z, psi) { last = x === undefined ? null : { x, z, psi }; },   // placing the car: sweep from where it was put
    setPose(psi, len) { pose.psi = psi; pose.len = len || 4.5; },
    surface(x, z) {
      if (onStrip(x, z)) { const sand = x > X1 - 110; return { grip: sand ? 0.7 : x < 440 ? 1.12 : 1, drag: sand ? 2.6 : 0, off: sand ? 1 : 0, lap: false, line: false }; }
      if (onRoad(x, z)) return { grip: 1, drag: 0, off: 0, lap: false, line: false };
      return { grip: 0.6, drag: 1, off: 1, lap: false, line: false };       // grass
    },
    collide,
    onStrip, onRoad,
    layout: { path, outline, walls, boxes, posts, X0, X1, HALF, XM, AX, DX, RW, RZ, fence: [FX0, FX1, FZ0, FZ1] },
    respawn() { return this.spawn; },
  };
}

export const WORLDS = [
  { id: 'highway', name: 'Midnight Expressway', desc: 'A 6.5 km four-lane expressway loop with traffic, a bridge and tunnels. Score points by weaving through traffic.', build: buildHighway },
  { id: 'drag', name: 'Apex Dragway', desc: 'Quarter-mile and eighth-mile drag strip with a Christmas tree, full timing and time boards. Day or night.', build: buildDrag },
  { id: 'circuit', name: 'Apex Raceway', desc: 'A 1.5 km race circuit with lap timing. Daylight.', build: buildCircuit },
  { id: 'city', name: 'Neon District', desc: 'Free-roam a city grid at night. Watch the buildings.', build: buildCity },
];
