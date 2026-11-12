// AI traffic for the expressway.
//
// Every vehicle follows its lane using the Intelligent Driver Model (it keeps a
// speed-dependent gap to whatever is in front, including the player), changes
// lane to get round slower traffic when the neighbouring lane is clear, and is
// recycled ahead of / behind the player so the road is always populated without
// simulating the whole loop.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const TYPES = [
  { id: 'sedan', n: 26, len: 4.5, wid: 1.8, vMul: 1 },
  { id: 'van', n: 12, len: 5.0, wid: 1.95, vMul: 0.93 },
  { id: 'truck', n: 8, len: 10.4, wid: 2.5, vMul: 0.8 },
];
const COLORS = [0xe8e8ea, 0xc9ccd1, 0x8a8f98, 0x2b2e34, 0x101114, 0x1d4ed8, 0xb91c1c, 0x0f7a4f, 0xd6c7a1, 0x7c3aed, 0xf2c100, 0x5c4033];
const AHEAD = 620, BEHIND = 230;

function box(w, h, d, x, y, z, taper = 1) {
  const g = new THREE.BoxGeometry(w, h, d);
  if (taper !== 1) { const p = g.attributes.position; for (let i = 0; i < p.count; i++) if (p.getY(i) > 0) p.setX(i, p.getX(i) * taper); }
  g.translate(x, y, z); return g;
}
function wheels(r, w, xs, z) {
  const out = [];
  for (const x of xs) for (const s of [1, -1]) { const c = new THREE.CylinderGeometry(r, r, w, 12); c.rotateX(Math.PI / 2); c.translate(x, r, s * z); out.push(c); }
  return out;
}
/** Geometry parts (x forward) for one vehicle type: [paint, dark, tail lights, head lights]. */
function parts(id) {
  const M = g => mergeGeometries(g.map(x => x.index ? x.toNonIndexed() : x));
  if (id === 'sedan') return [
    M([box(4.5, 0.62, 1.8, 0, 0.56, 0)]),
    M([box(2.5, 0.52, 1.58, -0.25, 1.12, 0, 0.72), ...wheels(0.32, 0.24, [1.4, -1.4], 0.82)]),
    M([box(0.06, 0.14, 0.42, -2.26, 0.68, 0.6), box(0.06, 0.14, 0.42, -2.26, 0.68, -0.6)]),
    M([box(0.06, 0.13, 0.36, 2.26, 0.62, 0.62), box(0.06, 0.13, 0.36, 2.26, 0.62, -0.62)]),
  ];
  if (id === 'van') return [
    M([box(5.0, 1.05, 1.95, 0, 0.82, 0)]),
    M([box(3.7, 0.62, 1.8, -0.4, 1.64, 0, 0.9), ...wheels(0.36, 0.26, [1.55, -1.55], 0.88)]),
    M([box(0.06, 0.5, 0.2, -2.51, 1.05, 0.82), box(0.06, 0.5, 0.2, -2.51, 1.05, -0.82)]),
    M([box(0.06, 0.16, 0.4, 2.51, 0.8, 0.68), box(0.06, 0.16, 0.4, 2.51, 0.8, -0.68)]),
  ];
  return [
    M([box(7.6, 2.75, 2.5, -1.4, 2.25, 0), box(2.2, 1.5, 2.4, 3.9, 1.45, 0)]),
    M([box(2.0, 1.0, 2.3, 3.95, 2.6, 0, 0.86), box(10, 0.3, 2.2, 0, 0.75, 0), ...wheels(0.5, 0.34, [3.9, -2.6, -3.9], 1.05)]),
    M([box(0.06, 0.2, 0.5, -5.21, 1.05, 0.9), box(0.06, 0.2, 0.5, -5.21, 1.05, -0.9), box(0.06, 0.1, 0.3, -5.21, 3.5, 1.05), box(0.06, 0.1, 0.3, -5.21, 3.5, -1.05)]),
    M([box(0.06, 0.18, 0.4, 5.01, 1.0, 0.8), box(0.06, 0.18, 0.4, 5.01, 1.0, -0.8)]),
  ];
}

export class Traffic {
  constructor(road) {
    this.road = road; this.group = new THREE.Group(); this.cars = []; this.meshes = [];
    const paint = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.35, metalness: 0.5 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x0b0c0e, roughness: 0.3, metalness: 0.4 });
    const tail = new THREE.MeshBasicMaterial({ color: 0xff2020 }), headM = new THREE.MeshBasicMaterial({ color: 0xfff1c9 });
    for (const t of TYPES) {
      const set = parts(t.id).map((geo, i) => { const m = new THREE.InstancedMesh(geo, [paint, dark, tail, headM][i], t.n); m.frustumCulled = false; m.castShadow = i < 2; this.group.add(m); return m; });
      for (let k = 0; k < t.n; k++) {
        set[0].setColorAt(k, new THREE.Color(COLORS[Math.floor(Math.random() * COLORS.length)]));
        this.cars.push({ type: t, set, k, s: 0, lat: 0, lane: 0, v: 25, vDes: 25, cool: Math.random() * 6, pds: 0, hitT: 0 });
      }
      set[0].instanceColor.needsUpdate = true;
    }
    this.dummy = new THREE.Object3D();
  }

  _wrap(d) { const L = this.road.len; return ((d + L / 2) % L + L) % L - L / 2; }

  _place(c, s, lane) {
    const { lanes } = this.road;
    c.s = s; c.lane = lane ?? Math.floor(Math.random() * lanes.length); c.lat = lanes[c.lane];
    // faster traffic keeps to the higher-numbered lanes
    c.vDes = (22 + c.lane * 2.6 + Math.random() * 5) * c.type.vMul; c.v = c.vDes * (0.85 + Math.random() * 0.15); c.cool = 2 + Math.random() * 6;
  }

  /** Spread the traffic around the player's position. */
  reset(sP) {
    const taken = [];
    for (const c of this.cars) {
      let s, lane, ok, tries = 0;
      do {
        s = sP - BEHIND + Math.random() * (AHEAD + BEHIND); lane = Math.floor(Math.random() * this.road.lanes.length);
        ok = Math.abs(s - sP) > 45 && !taken.some(t => t[1] === lane && Math.abs(t[0] - s) < 34);
      } while (!ok && ++tries < 40);
      taken.push([s, lane]); this._place(c, s, lane); c.pds = this._wrap(c.s - sP);
    }
  }

  _free(c, lane, back, front, pl) {
    const lat = this.road.lanes[lane];
    for (const o of this.cars) { if (o === c || Math.abs(o.lat - lat) > 2.2 && o.lane !== lane) continue; const d = this._wrap(o.s - c.s); if (d > -back && d < front) return false; }
    if (pl) { const d = this._wrap(pl.s - c.s), closing = Math.max(0, pl.v - c.v); if (Math.abs(pl.lat - lat) < 2.6 && d > -(back + closing * 2.8) && d < front) return false; }
    return true;
  }

  /**
   * pl = { s, lat, v, len, wid } in road coordinates.
   * Returns { passes: [{gap, side}], hit: {car, dLat, dLong} | null }.
   */
  update(dt, pl) {
    const { lanes, at } = this.road, cars = this.cars, out = { passes: [], hit: null };
    for (const c of cars) {
      // --- car following (IDM): nearest vehicle ahead in this lane, the player included
      let gap = 1e9, dv = 0, lv = 0;
      const consider = (s, lat, v, len) => { if (Math.abs(lat - c.lat) > 2.1) return; const d = this._wrap(s - c.s) - (len + c.type.len) / 2; if (d > -1 && d < gap) { gap = Math.max(0.5, d); dv = c.v - v; lv = v; } };
      for (const o of cars) if (o !== c) consider(o.s, o.lat, o.v, o.type.len);
      consider(pl.s, pl.lat, pl.v, pl.len);
      const want = 3 + c.v * 1.15 + c.v * dv / (2 * Math.sqrt(1.5 * 2.6));
      let acc = 1.5 * (1 - Math.pow(c.v / c.vDes, 4) - (gap < 200 ? (want / gap) ** 2 : 0));
      c.v = Math.max(0, c.v + Math.max(-7, acc) * dt);
      if (gap < 1.5) c.v = Math.min(c.v, Math.max(0, lv));         // never drive into the vehicle ahead
      c.v = Math.min(c.v, c.vDes * 1.25);
      c.s += c.v * dt;
      // --- lane changes: get round slower traffic, drift back out of the fast lanes when clear
      c.cool -= dt;
      const target = lanes[c.lane];
      if (Math.abs(c.lat - target) > 0.02) c.lat += Math.sign(target - c.lat) * Math.min(Math.abs(target - c.lat), 1.25 * dt);
      else if (c.cool <= 0) {
        let to = -1;
        if (gap < 30 && dv > -0.5) { for (const l of [c.lane + 1, c.lane - 1]) if (l >= 0 && l < lanes.length && this._free(c, l, 16 + c.type.len, 30 + c.type.len, pl)) { to = l; break; } }
        else if (Math.random() < 0.04 * dt * 60 / 60) { const l = c.lane + (Math.random() < 0.5 ? 1 : -1); if (l >= 0 && l < lanes.length && this._free(c, l, 22, 36, pl)) to = l; }
        if (to >= 0) { c.lane = to; c.cool = 5 + Math.random() * 7; } else c.cool = 0.6;
      }
      // --- keep the traffic around the player
      let ds = this._wrap(c.s - pl.s);
      if (ds < -BEHIND || ds > AHEAD + 60) {
        // re-enter out of sight, in a gap; if there is none this frame, try again on the next one
        const ahead = ds < 0, s0 = c.s, l0 = c.lane; let ok = false;
        for (let k = 0; k < 6 && !ok; k++) { this._place(c, ahead ? pl.s + AHEAD - Math.random() * 140 : pl.s - BEHIND + Math.random() * 50); ok = this._free(c, c.lane, 34 + c.type.len, 34 + c.type.len); }
        if (!ok) { c.s = s0; c.lane = l0; c.lat = lanes[l0]; }
        ds = this._wrap(c.s - pl.s); c.pds = ds;
      }
      // --- interaction with the player
      const dLat = pl.lat - c.lat, halfL = (pl.len + c.type.len) / 2, halfW = (pl.wid + c.type.wid) / 2;
      c.hitT = Math.max(0, c.hitT - dt);
      if (Math.abs(ds) < halfL && Math.abs(dLat) < halfW - 0.05) { if (!out.hit || Math.abs(ds) < Math.abs(out.hit.ds)) out.hit = { car: c, ds, dLat, halfL, halfW, fresh: c.hitT <= 0 }; c.hitT = 1.5; }
      else if (c.pds > 0 && ds <= 0 && c.pds - ds < 25 && pl.v - c.v > 3 && c.hitT <= 0) out.passes.push({ gap: Math.abs(dLat) - halfW, side: Math.sign(dLat) || 1 });
      c.pds = ds;
      // --- draw
      const p = at(c.s), d = this.dummy, sl = (at(c.s + 3).y - at(c.s - 3).y) / 6;
      d.position.set(p.x + p.nx * c.lat, p.y, p.z + p.nz * c.lat); d.rotation.set(0, Math.atan2(-p.tz, p.tx) + (target - c.lat) * 0.035, Math.atan(sl)); d.updateMatrix();
      for (const m of c.set) m.setMatrixAt(c.k, d.matrix);
    }
    for (const c of cars) if (c.k === 0) for (const m of c.set) m.instanceMatrix.needsUpdate = true;
    return out;
  }
}
