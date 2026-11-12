// Procedural drivetrain: engine block for every layout (inline, V, flat, rotary),
// turbochargers, superchargers, intakes and the full exhaust system.
// Engine frame: +x = front of the engine, y = up from the sump, z = lateral.
import * as THREE from 'three';
import { lerp, V } from './geo.js';

const HALF = Math.PI / 2;

function kit(g) {
  const add = (parent, mesh, x, y, z) => { mesh.position.set(x, y, z); parent.add(mesh); return mesh; };
  return {
    box: (w, h, d, mat, x, y, z, parent = g) => add(parent, new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat), x, y, z),
    cylX: (r, len, mat, x, y, z, parent = g, r2 = r) => { const geo = new THREE.CylinderGeometry(r, r2, len, 20); geo.rotateZ(HALF); return add(parent, new THREE.Mesh(geo, mat), x, y, z); },
    cylY: (r, len, mat, x, y, z, parent = g, r2 = r) => add(parent, new THREE.Mesh(new THREE.CylinderGeometry(r, r2, len, 16), mat), x, y, z),
    tube: (pts, r, mat, parent = g) => {
      const c = new THREE.CatmullRomCurve3(pts.map(p => p.isVector3 ? p : V(...p)), false, 'catmullrom', 0.35);
      const m = new THREE.Mesh(new THREE.TubeGeometry(c, Math.max(12, pts.length * 8), r, 10), mat); parent.add(m); return m;
    },
  };
}

function turboUnit(M, scale = 1) {
  const t = new THREE.Group(), k = kit(t);
  const comp = new THREE.Mesh(new THREE.TorusGeometry(0.055, 0.03, 12, 24), M.aluPolished); comp.rotation.y = HALF; comp.position.x = 0.06; t.add(comp);
  k.cylX(0.05, 0.03, M.aluPolished, 0.06, 0, 0); k.cylX(0.036, 0.06, M.aluPolished, 0.1, 0, 0);
  k.cylX(0.03, 0.09, M.alu, 0, 0, 0);
  const turb = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.032, 12, 24), M.hot); turb.rotation.y = HALF; turb.position.x = -0.06; t.add(turb);
  k.cylX(0.045, 0.03, M.hot, -0.06, 0, 0); k.cylX(0.034, 0.07, M.hot, -0.12, 0, 0);
  k.cylY(0.022, 0.07, M.iron, -0.015, 0.06, 0.03); // wastegate actuator
  t.scale.setScalar(scale);
  return t;
}

function coneFilter(M, s = 1) {
  const f = new THREE.Group();
  const c = new THREE.Mesh(new THREE.CylinderGeometry(0.04 * s, 0.065 * s, 0.14 * s, 20), M.filter); c.rotation.z = -HALF; c.position.x = 0.07 * s; f.add(c);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.042 * s, 0.042 * s, 0.012, 20), M.aluPolished); cap.rotation.z = HALF; cap.position.x = 0.145 * s; f.add(cap);
  return f;
}

/** Returns { group, len, collectors: [Vector3], height } in engine-local space. */
export function buildEngine(M, e, turbo, sc, intake, frontIC) {
  const g = new THREE.Group(); g.name = 'engine';
  const k = kit(g);
  const blower = sc.id === 'roots' || sc.id === 'screw', itb = intake.id === 'itb' && !blower;
  let len, plen, collectors = [], turboAt = [], scAt, itbAt = [], top = 0.5;
  M.cover.color.set(e.cover || '#b91c1c');

  if (e.kind === 'i') {
    const n = e.cyl, s = 0.1; len = n * s + 0.08;
    const xi = i => -len / 2 + 0.04 + s * (i + 0.5);
    k.box(len * 0.9, 0.08, 0.2, M.alu, 0, 0.04, 0); k.box(len, 0.24, 0.22, M.iron, 0, 0.2, 0);
    k.box(len, 0.11, 0.2, M.alu, 0, 0.375, 0); k.box(len * 0.96, 0.045, 0.15, M.cover, 0, 0.452, 0);
    for (let i = 0; i < n; i++) {
      k.cylY(0.016, 0.035, M.plastic, xi(i), 0.49, 0);
      if (!itb) k.tube([[xi(i), 0.37, 0.1], [xi(i), 0.4, 0.17], [xi(i), 0.38, 0.22]], 0.02, M.alu);
      else itbAt.push([xi(i), 0.38, 0.13, 0.9]);
      if (turbo.id === 'none') k.tube([[xi(i), 0.37, -0.1], [xi(i), 0.35, -0.18], [lerp(xi(i), -len / 2, 0.6), 0.22, -0.23], [-len / 2 - 0.04, 0.12, -0.21]], 0.019, M.steel);
      else k.tube([[xi(i), 0.37, -0.1], [xi(i), 0.36, -0.17], [xi(i) * 0.8, 0.34, -0.21]], 0.02, M.hot);
    }
    if (turbo.id !== 'none') k.cylX(0.03, len * 0.8, M.hot, 0, 0.34, -0.21);
    plen = [0, 0.38, 0.24];
    collectors = [V(-len / 2 - 0.05, 0.1, -0.2)];
    turboAt = turbo.id === 'twin' ? [[len * 0.22, 0.38, -0.31], [-len * 0.22, 0.38, -0.31]] : turbo.id === 'big' ? [[len * 0.12, 0.42, -0.35]] : [[0, 0.38, -0.31]];
    scAt = [0, 0.47, 0.25];
  } else if (e.kind === 'v' || e.kind === 'flat') {
    const nb = e.cyl / 2, s = 0.105, A = e.kind === 'flat' ? 90 : (e.bank || 90) / 2, flat = e.kind === 'flat';
    len = nb * s + 0.1;
    const xi = i => -len / 2 + 0.05 + s * (i + 0.5);
    k.box(len * 0.9, 0.06, 0.22, M.alu, 0, 0.03, 0); k.box(len, 0.2, flat ? 0.24 : 0.28, flat ? M.alu : M.iron, 0, 0.16, 0);
    for (const sd of [1, -1]) {
      const b = new THREE.Group(); b.position.y = 0.16; b.rotation.x = sd * A * Math.PI / 180; g.add(b);
      k.box(len - 0.04, 0.2, 0.15, flat ? M.alu : M.iron, 0, 0.16, 0, b); k.box(len - 0.02, 0.1, 0.17, M.alu, 0, 0.31, 0, b);
      k.box(len * 0.9, 0.04, 0.13, M.cover, 0, 0.385, 0, b);
      if (!flat) for (let i = 0; i < nb; i++) {
        if (turbo.id === 'none') k.tube([[xi(i), 0.3, sd * 0.09], [xi(i), 0.26, sd * 0.17], [lerp(xi(i), -len / 2, 0.7), 0.1, sd * 0.2], [-len / 2 - 0.03, 0.0, sd * 0.19]], 0.019, M.steel, b);
        else k.tube([[xi(i), 0.3, sd * 0.09], [xi(i), 0.27, sd * 0.16], [xi(i) * 0.8, 0.22, sd * 0.19]], 0.02, M.hot, b);
      }
    }
    const sinA = Math.sin(A * Math.PI / 180), cosA = Math.cos(A * Math.PI / 180);
    top = flat ? 0.36 : 0.16 + 0.4 * cosA + 0.06;
    if (flat) {
      for (const sd of [1, -1]) k.tube([[len / 2 - 0.05, 0.05, sd * 0.3], [0, 0.03, sd * 0.32], [-len / 2 - 0.05, 0.06, sd * 0.26]], 0.024, turbo.id === 'none' ? M.steel : M.hot);
      plen = [0, 0.31, 0];
      collectors = [V(-len / 2 - 0.06, 0.06, 0.26), V(-len / 2 - 0.06, 0.06, -0.26)];
      turboAt = turbo.id === 'twin' ? [[-len / 2 - 0.12, 0.2, 0.3], [-len / 2 - 0.12, 0.2, -0.3]] : [[-len / 2 - 0.14, 0.28, 0]];
      scAt = [0, 0.36, 0];
      if (itb) for (let i = 0; i < nb; i++) for (const sd of [1, -1]) itbAt.push([xi(i), 0.3, sd * 0.07, 0]);
    } else {
      plen = [0, top - 0.04, 0];
      const cz = 0.16 * sinA + 0.3 * cosA + 0.1;
      collectors = [V(-len / 2 - 0.05, 0.08, cz), V(-len / 2 - 0.05, 0.08, -cz)];
      turboAt = turbo.id === 'twin' ? [[-len * 0.15, 0.2, cz + 0.12], [-len * 0.15, 0.2, -cz - 0.12]] : turbo.id === 'big' ? [[len / 2 + 0.12, top + 0.02, -0.16]] : [[-len / 2 - 0.1, top - 0.02, 0]];
      scAt = [0, top + 0.03, 0];
      if (itb) for (let i = 0; i < nb; i++) for (const sd of [1, -1]) itbAt.push([xi(i), top - 0.04, sd * 0.06, sd * 0.25]);
    }
  } else { // rotary
    len = 0.46;
    const disc = (r, w, mat, x, sz) => { const m = k.cylX(r, w, mat, x, 0.2, 0); m.scale.z = sz; return m; };
    for (const x of [-0.19, 0, 0.19]) disc(0.185, 0.045, M.iron, x, 1.28);
    for (const x of [-0.095, 0.095]) { disc(0.175, 0.1, M.alu, x, 1.28); k.cylY(0.014, 0.04, M.plastic, x, 0.39, 0.03); k.cylY(0.014, 0.04, M.plastic, x, 0.39, -0.03); }
    k.box(0.4, 0.06, 0.2, M.alu, 0, 0.0, 0);
    for (const x of [-0.095, 0.095]) {
      if (!itb) k.tube([[x, 0.28, 0.2], [x, 0.36, 0.24], [x * 0.5, 0.4, 0.2]], 0.024, M.alu); else itbAt.push([x, 0.3, 0.2, 1.1]);
      k.tube([[x, 0.2, -0.22], [x, 0.22, -0.28], [x * 0.3, 0.26, -0.3]], 0.026, turbo.id === 'none' ? M.steel : M.hot);
    }
    plen = [0, 0.42, 0.16]; top = 0.46;
    collectors = [V(-0.2, 0.14, -0.3)];
    if (turbo.id === 'none') k.tube([[0, 0.26, -0.3], [-0.12, 0.2, -0.31], [-0.2, 0.14, -0.3]], 0.03, M.steel);
    turboAt = turbo.id === 'twin' ? [[0.11, 0.32, -0.34], [-0.11, 0.32, -0.34]] : [[0, 0.32, -0.34]];
    scAt = [0, 0.48, 0.14];
  }

  // front accessory drive + bellhousing / gearbox
  k.cylX(0.07, 0.03, M.iron, len / 2 + 0.03, 0.12, 0); k.cylX(0.036, 0.03, M.alu, len / 2 + 0.03, 0.3, 0.13);
  const belt = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.006, 6, 28), M.belt); belt.rotation.y = HALF; belt.scale.set(0.75, 1.15, 1); belt.position.set(len / 2 + 0.03, 0.2, 0.06); g.add(belt);
  k.cylX(0.17, 0.2, M.alu, -len / 2 - 0.1, 0.17, 0, g, 0.12); k.box(0.42, 0.2, 0.2, M.alu, -len / 2 - 0.4, 0.17, 0);

  // plenum / throttle
  const tb = [len / 2 - 0.02, plen[1], plen[2]];
  if (!itb && !blower) { k.cylX(0.055, len * 0.78, M.alu, plen[0], plen[1], plen[2]); k.cylX(0.035, 0.08, M.aluPolished, len / 2 - 0.04, plen[1], plen[2]); }
  for (const [x, y, z, tilt] of itbAt) {
    const tr = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.022, 0.09, 16, 1, true), M.aluPolished);
    tr.material.side = THREE.DoubleSide; tr.position.set(x, y + 0.05, z + Math.sin(tilt) * 0.05); tr.rotation.x = tilt; g.add(tr);
  }

  // superchargers
  if (blower) {
    const big = sc.id === 'screw', h = big ? 0.17 : 0.13, w = big ? 0.26 : 0.22, bl = Math.max(0.32, len * 0.78);
    const [sx, sy, sz] = scAt, mat = big ? M.plastic : M.aluPolished;
    k.box(bl, h, w, mat, sx, sy + h / 2, sz);
    for (let i = 0; i < 7; i++) k.box(bl * 0.94, 0.012, 0.012, big ? M.alu : M.alu, sx, sy + h + 0.004, sz + lerp(-w / 2 + 0.02, w / 2 - 0.02, i / 6));
    k.cylX(0.04, 0.16, mat, sx + bl / 2 + 0.08, sy + h * 0.45, sz); k.cylX(0.055, 0.03, M.iron, len / 2 + 0.06, sy + h * 0.45, sz);
    const b2 = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.008, 6, 28), M.belt); b2.rotation.y = HALF;
    const yb = (sy + h * 0.45 + 0.12) / 2; b2.scale.set(0.6 + Math.abs(sz) * 2, (sy + h * 0.45 - 0.12) / 0.2 + 0.6, 1); b2.position.set(len / 2 + 0.065, yb, sz / 2); g.add(b2);
    k.cylX(0.04, 0.08, M.aluPolished, sx - bl / 2 - 0.04, sy + h * 0.5, sz);
    tb[0] = sx - bl / 2 - 0.08; tb[1] = sy + h * 0.5; tb[2] = sz; top = Math.max(top, sy + h);
  } else if (sc.id === 'centri') {
    const u = turboUnit(M, 1.25); u.position.set(len / 2 + 0.08, 0.34, -0.2); g.add(u);
    k.cylX(0.05, 0.03, M.iron, len / 2 + 0.03, 0.34, -0.2);
    k.tube([[len / 2 + 0.1, 0.4, -0.2], [len / 2 + 0.14, plen[1] + 0.08, -0.08], [len / 2 + 0.02, plen[1], plen[2]]], 0.028, M.aluPolished);
  }

  // turbos + charge piping
  if (turbo.id !== 'none') {
    const scale = turbo.id === 'big' ? 1.7 : turbo.id === 'twin' ? 0.9 : 1.15;
    for (const [x, y, z] of turboAt) {
      const u = turboUnit(M, scale); u.position.set(x, y, z); g.add(u);
      const icx = len / 2 + (frontIC ? 0.34 : 0.12);
      k.tube([[x + 0.08 * scale, y + 0.05 * scale, z], [x + 0.2, y + 0.06, z * 1.05], [icx, 0.24, z * 0.7 || 0.15]], 0.026, M.aluPolished);
      k.tube([[icx, 0.3, (z * 0.5) || -0.12], [len / 2 + 0.12, tb[1] + 0.04, tb[2] * 0.6], [tb[0] + 0.02, tb[1], tb[2]]], 0.026, M.aluPolished);
      k.tube([[x - 0.14 * scale, y, z], [x - 0.24 * scale, y - 0.08, z * 0.95], [collectors[0].x, collectors[0].y, z > 0 || collectors.length < 2 ? collectors[0].z : collectors[1].z]], 0.03, M.hot);
    }
    if (frontIC) {
      k.box(0.07, 0.2, 0.6, M.alu, len / 2 + 0.36, 0.26, 0);
      for (let i = 0; i < 12; i++) k.box(0.075, 0.19, 0.004, M.iron, len / 2 + 0.36, 0.26, lerp(-0.27, 0.27, i / 11));
    }
  }

  // air intake (feeds the turbo inlet when boosted, the throttle otherwise)
  if (!itb) {
    const src = turbo.id !== 'none' ? [turboAt[0][0] + 0.13, turboAt[0][1], turboAt[0][2]] : tb;
    const sgn = src[2] >= 0 ? 1 : -1;
    if (intake.id === 'stock') {
      k.box(0.26, 0.15, 0.2, M.plastic, src[0] + 0.3, src[1] - 0.02, src[2] + sgn * 0.08);
      k.tube([src, [src[0] + 0.1, src[1] + 0.01, src[2] + sgn * 0.03], [src[0] + 0.18, src[1] - 0.02, src[2] + sgn * 0.08]], 0.034, M.plastic);
    } else {
      const long = intake.id === 'cold';
      const end = long ? [src[0] + 0.42, Math.max(0.12, src[1] - 0.2), src[2] + sgn * 0.14] : [src[0] + 0.16, src[1] + 0.02, src[2] + sgn * 0.05];
      k.tube([src, [lerp(src[0], end[0], 0.5), src[1] + 0.02, lerp(src[2], end[2], 0.4)], end], 0.032, M.aluPolished);
      k.cylX(0.037, 0.035, M.silicone, src[0] + 0.03, src[1], src[2]);
      const f = coneFilter(M, long ? 1 : 1.25); f.position.set(...end); g.add(f);
    }
  }

  g.traverse(o => { if (o.isMesh) o.castShadow = false; });
  return { group: g, len, collectors, top };
}

/** Pipes from the engine collectors to the tips (all in body space). */
export function buildExhaust(S, M, collectors, tips, exhaust) {
  const g = new THREE.Group(); g.name = 'exhaust';
  const k = kit(g), mat = M.steel, r = 0.03;
  const fy = x => S.floorY(x) + 0.075;
  const mx = S.tailX + 0.5, hasMuffler = exhaust.muffler > 0 && collectors[0].x > mx + 0.5;
  tips.forEach(t => {
    const c = collectors.length > 1 ? (t.z >= 0 ? collectors[0] : collectors[1]) : collectors[0];
    const run = collectors.length > 1 ? Math.sign(c.z) * 0.15 : Math.sign(t.z || 1) * 0.1;
    const pts = [c.clone()];
    if (c.x > mx + 0.5) { pts.push(V(c.x - 0.3, fy(c.x - 0.3), run), V((c.x + mx) / 2, fy(0), run), V(mx + 0.15, fy(mx), lerp(run, t.z, 0.6))); }
    pts.push(V(t.x + 0.42, t.y, t.z), V(t.x + 0.1, t.y, t.z));
    k.tube(pts, r, mat);
  });
  if (hasMuffler) {
    const m = new THREE.Mesh(new THREE.CapsuleGeometry(0.06 + 0.05 * exhaust.muffler, 0.5, 6, 16), M.steel);
    m.rotation.x = HALF; m.position.set(mx + 0.05, fy(mx) + 0.02, 0); g.add(m);
  }
  return g;
}
