// Drag parachute: the pack bolted to the rear of the car, and the canopy that
// streams out behind it. The canopy's size follows the physics (how far it has
// opened), so what you see is what is slowing the car.
import * as THREE from 'three';
import { PARACHUTES, CHUTE_DESIGNS, byId } from './data.js';

const texCache = new Map();
function canopyTexture(design, cross) {
  const key = design.id + (cross ? 'x' : '');
  if (texCache.has(key)) return texCache.get(key);
  const c = document.createElement('canvas'); c.width = 512; c.height = 64; const g = c.getContext('2d'), n = cross ? 8 : 16, w = 512 / n;
  for (let i = 0; i < n; i++) {
    if (cross && i % 2) { g.clearRect(i * w, 0, w, 64); continue; }                 // cross-form: four arms with open gaps between them
    g.fillStyle = (cross ? i / 2 : i) % 2 ? design.b : design.a; g.fillRect(i * w, 0, w, 64);
    g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(i * w, 0, 1.5, 64);
  }
  g.fillStyle = design.b; g.fillRect(0, 0, 512, 5);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.RepeatWrapping;
  texCache.set(key, t); return t;
}

export class Chute {
  /** S = body surface (for the mounting point); build.chute = { type, design }. */
  constructor(S, build) {
    const def = this.def = byId(PARACHUTES, build.chute && build.chute.type), design = byId(CHUTE_DESIGNS, build.chute && build.chute.design);
    this.group = new THREE.Group(); this.pack = new THREE.Group(); this.canopies = []; this.open = 0; this.t = 0; this.installed = def.n > 0;
    if (!this.installed) return;
    const e = S.ends[-1], y = e.a + (e.b - e.a) * 0.9, dark = new THREE.MeshStandardMaterial({ color: 0x141518, roughness: 0.6, metalness: 0.5 });
    const cover = new THREE.MeshStandardMaterial({ color: design.a, roughness: 0.75 }), steel = new THREE.MeshStandardMaterial({ color: 0xb9bcc2, roughness: 0.35, metalness: 1 });
    this.mount = [];
    for (let i = 0; i < def.n; i++) {
      const z = def.n === 1 ? 0 : (i ? 1 : -1) * 0.2, x = S.capX(-1, y, z);
      const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.26, 16), dark); tube.rotation.z = Math.PI / 2; tube.position.set(x - 0.1, y, z);
      const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.088, 0.07, 0.05, 16), cover); lid.rotation.z = Math.PI / 2; lid.position.set(x - 0.25, y, z); lid.userData.lid = true;
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.03, 0.05), steel); bar.position.set(x + 0.02, y - 0.1, z); bar.rotation.z = -0.5;
      this.pack.add(tube, lid, bar); this.mount.push(new THREE.Vector3(x - 0.24, y, z));
    }
    const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.5, 6), steel); cable.position.set(this.mount[0].x + 0.3, y + 0.18, this.mount[0].z + 0.06); cable.rotation.z = 0.9; this.pack.add(cable);
    for (const m of this.pack.children) m.castShadow = true;
    // canopy: a dome with its mouth towards the car
    const R = def.r, pts = []; for (let i = 0; i <= 10; i++) { const a = i / 10 * Math.PI * 0.5; pts.push(new THREE.Vector2(Math.sin(a) * R, -Math.cos(a) * R * 0.62)); }
    const geo = new THREE.LatheGeometry(pts, 32); geo.rotateZ(-Math.PI / 2);                    // apex now points away from the car (-x)
    const mat = new THREE.MeshStandardMaterial({ map: canopyTexture(design, def.cross), side: THREE.DoubleSide, roughness: 0.85, transparent: !!def.cross, alphaTest: def.cross ? 0.5 : 0 });
    const lineM = new THREE.LineBasicMaterial({ color: 0xd9dadd });
    for (let i = 0; i < def.n; i++) {
      const mesh = new THREE.Mesh(geo, mat); mesh.castShadow = true;
      const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(12 * 2 * 3), 3));
      const lines = new THREE.LineSegments(lg, lineM); lines.frustumCulled = false;
      this.canopies.push({ mesh, lines, side: def.n === 1 ? 0 : (i ? 1 : -1), R });
      this.group.add(mesh, lines);
    }
    this.group.visible = false;
  }

  /** open = 0..1.2 from the physics, speed in m/s, deployed = canopy is out of the pack. */
  update(dt, open, speed, deployed) {
    if (!this.installed) return;
    this.t += dt; this.open += (open - this.open) * Math.min(1, dt * 14);
    this.group.visible = deployed; for (const m of this.pack.children) if (m.userData.lid) m.visible = !deployed;
    if (!deployed) { this.out = 0; return; }
    this.out = Math.min(1, (this.out || 0) + dt * 2.6);                                       // lines paying out
    const o = Math.max(0, Math.min(1.15, this.open)), flying = Math.min(1, speed / 6), pos = new THREE.Vector3();
    for (const [i, c] of this.canopies.entries()) {
      const m = this.mount[i], line = 5.2 * this.out, sway = Math.sin(this.t * 3.1 + i * 2) * 0.25 * flying, bob = Math.sin(this.t * 4.3 + i) * 0.12 * flying;
      const radial = 0.14 + 0.86 * o, breathe = 1 + Math.sin(this.t * 9 + i) * 0.03 * flying;
      pos.set(m.x - line - 0.4, m.y * flying + (0.9 + 0.5 * o) * flying + (1 - flying) * 0.18 + bob, m.z + c.side * (0.5 + 1.1 * o) + sway);
      c.mesh.position.copy(pos); c.mesh.scale.set(0.55 + 0.45 * o + (1 - flying) * -0.3, radial * breathe * (0.35 + 0.65 * flying), radial * breathe);
      c.mesh.rotation.set(0, sway * 0.12, (1 - flying) * -0.5);
      const p = c.lines.geometry.attributes.position, rr = c.R * radial * breathe;
      for (let k = 0; k < 12; k++) { const a = k / 12 * Math.PI * 2; p.setXYZ(k * 2, m.x, m.y, m.z); p.setXYZ(k * 2 + 1, pos.x, pos.y + Math.cos(a) * rr * (0.35 + 0.65 * flying), pos.z + Math.sin(a) * rr); }
      p.needsUpdate = true;
    }
  }
}
