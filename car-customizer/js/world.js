// Drivable locations: a race circuit (day) and a city grid (night).
// Each world provides its own lighting, sky/environment, surface query and collision.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

function tex(w, h, draw, rx = 1, ry = 1) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rx, ry); t.anisotropy = 8;
  return t;
}
// deterministic random so the world is the same every visit
function rng(seed) { let s = seed; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

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

  const ribbon = (o0, o1, y, vScale, uA = 0, uB = 1) => {
    const pos = [], uv = [], idx = [];
    for (let i = 0; i <= N; i++) {
      const p = pts[i % N], n = nrm[i % N], v = i / N * len / vScale;
      pos.push(p.x + n.x * o0, y, p.z + n.z * o0, p.x + n.x * o1, y, p.z + n.z * o1); uv.push(uA, v, uB, v);
      if (i < N) { const a = i * 2; idx.push(a, a + 1, a + 3, a, a + 3, a + 2); }
    }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.setIndex(idx); geo.computeVertexNormals();
    return geo;
  };
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

export const WORLDS = [
  { id: 'circuit', name: 'Apex Raceway', desc: 'A 1.5 km race circuit with lap timing. Daylight.', build: buildCircuit },
  { id: 'city', name: 'Neon District', desc: 'Free-roam a city grid at night. Watch the buildings.', build: buildCity },
];
