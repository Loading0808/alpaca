// Geometry helpers: interpolation, a triangle-soup mesh builder and lofting.
import * as THREE from 'three';
import { toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';

export const lerp = (a, b, t) => a + (b - a) * t;
export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const smooth = t => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
export const sq = v => v * v;
export const V = (x, y, z) => new THREE.Vector3(x, y, z);

/** Monotone cubic interpolation through (xs, ys); xs must be increasing. */
export function pchip(xs, ys) {
  const n = xs.length, h = [], d = [], m = new Array(n);
  for (let i = 0; i < n - 1; i++) { h[i] = xs[i + 1] - xs[i]; d[i] = (ys[i + 1] - ys[i]) / h[i]; }
  m[0] = d[0]; m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (2 * d[i - 1] * d[i]) / (d[i - 1] + d[i]);
  return x => {
    x = clamp(x, xs[0], xs[n - 1]);
    let i = 0; while (i < n - 2 && x > xs[i + 1]) i++;
    const t = (x - xs[i]) / h[i], t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h[i] * m[i] + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * h[i] * m[i + 1];
  };
}

/** Collects triangles into named buckets, then emits one geometry per bucket. */
export class MeshBuilder {
  constructor() { this.b = new Map(); }
  tri(k, a, b, c) {
    // skip degenerate triangles
    const ux = b.x - a.x, uy = b.y - a.y, uz = b.z - a.z, vx = c.x - a.x, vy = c.y - a.y, vz = c.z - a.z;
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    if (nx * nx + ny * ny + nz * nz < 1e-14) return;
    let arr = this.b.get(k); if (!arr) this.b.set(k, arr = []);
    arr.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
  }
  quad(k, a, b, c, d) { this.tri(k, a, b, c); this.tri(k, a, c, d); }
  keys() { return [...this.b.keys()]; }
  geometry(k, crease = 0.75, uvScale = 0) {
    const pos = this.b.get(k);
    if (!pos || !pos.length) return null;
    let g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g = toCreasedNormals(g, crease);
    if (uvScale) planarUV(g, uvScale);
    return g;
  }
}

/** Skin a surface through a list of rings (arrays of Vector3 with equal length). */
export function loft(mb, rings, keyFn, closed = true) {
  const n = rings[0].length, m = closed ? n : n - 1;
  for (let i = 0; i < rings.length - 1; i++) {
    const r0 = rings[i], r1 = rings[i + 1];
    for (let j = 0; j < m; j++) {
      const j1 = (j + 1) % n;
      const k = typeof keyFn === 'function' ? keyFn(i, j) : keyFn;
      if (k) mb.quad(k, r0[j], r1[j], r1[j1], r0[j1]);
    }
  }
}

/** Close a ring with a triangle fan around its centroid. */
export function capRing(mb, key, ring) {
  const c = V(0, 0, 0); ring.forEach(p => c.add(p)); c.multiplyScalar(1 / ring.length);
  for (let j = 0; j < ring.length; j++) mb.tri(key, c, ring[j], ring[(j + 1) % ring.length]);
}

/** Cheap box-projected UVs so tiling textures (carbon weave) work on any mesh. */
export function planarUV(g, s = 8) {
  const p = g.attributes.position, nrm = g.attributes.normal, uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const ax = nrm ? Math.abs(nrm.getX(i)) : 0, ay = nrm ? Math.abs(nrm.getY(i)) : 1, az = nrm ? Math.abs(nrm.getZ(i)) : 0;
    if (ay >= ax && ay >= az) { uv[i * 2] = x * s; uv[i * 2 + 1] = z * s; }
    else if (az >= ax) { uv[i * 2] = x * s; uv[i * 2 + 1] = y * s; }
    else { uv[i * 2] = z * s; uv[i * 2 + 1] = y * s; }
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}

/** Regular grid surface from a point function p(u, v) with u, v in [0, 1]. */
export function gridGeometry(fn, nu = 12, nv = 6, uvScale = 8) {
  const pos = [], uv = [], idx = [];
  for (let i = 0; i <= nu; i++) for (let j = 0; j <= nv; j++) {
    const p = fn(i / nu, j / nv);
    pos.push(p.x, p.y, p.z); uv.push(p.x * uvScale, p.z * uvScale);
  }
  const w = nv + 1;
  for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) {
    const a = i * w + j, b = (i + 1) * w + j;
    idx.push(a, b, b + 1, a, b + 1, a + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export function disposeTree(obj) {
  obj.traverse(o => { if (o.geometry && !o.geometry.userData.shared) o.geometry.dispose(); });
}
