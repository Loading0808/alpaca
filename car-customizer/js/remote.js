// Other players' cars. Each remote player gets a full Car built from the
// customised build they sent, with a name tag above it.
import * as THREE from 'three';
import { Car } from './car.js';
import { createMaterials, applyAppearance } from './materials.js';
import { CARS, byId, defaultBuild } from './data.js';

function nameTag(name) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 96; const g = c.getContext('2d');
  g.font = '700 46px Bahnschrift, "DIN Alternate", "Arial Narrow", Arial, sans-serif'; const w = Math.min(492, g.measureText(name).width + 48);
  g.fillStyle = 'rgba(10,11,14,0.78)'; g.beginPath(); g.roundRect((512 - w) / 2, 12, w, 72, 10); g.fill();
  g.fillStyle = '#ff5a1f'; g.fillRect((512 - w) / 2, 12, 6, 72);
  g.fillStyle = '#f3f4f6'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(name, 256, 50);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true })); s.scale.set(3.4, 0.64, 1); s.renderOrder = 20;
  return s;
}

/** Fill in anything missing so a build from the network can always be assembled. */
export function safeBuild(b) {
  const car = CARS.find(c => c.id === (b && b.carId)) || CARS[0], base = defaultBuild(car);
  return { ...base, ...b, carId: car.id, paint: { ...base.paint, ...(b && b.paint) }, rim: { ...base.rim, ...(b && b.rim) }, susp: { ...base.susp, ...(b && b.susp) } };
}

export class RemoteCars {
  constructor(net) { this.net = net; this.group = new THREE.Group(); this.cars = new Map(); }

  add(p) {
    this.remove(p.id);
    const M = createMaterials(), car = new Car(M, { lite: true }), build = safeBuild(p.build);
    car.build(build); applyAppearance(M, build);
    const air = build.susp.air, f = air ? air.f : build.susp.drop, r = air ? air.r : build.susp.drop;
    car.applyStance(build, f, r);
    if (car.engine) car.engine.visible = false;
    car.setLights(true); car.root.visible = false;
    const tag = nameTag(p.name); tag.position.y = car.S.H + 0.75; car.root.add(tag);
    this.group.add(car.root); this.cars.set(p.id, { car, M, build });
  }
  remove(id) {
    const e = this.cars.get(id); if (!e) return;
    this.group.remove(e.car.root); e.car.dispose(); for (const m of Object.values(e.M)) { if (m && m.isMaterial) m.dispose(); }
    this.cars.delete(id);
  }
  clear() { for (const id of [...this.cars.keys()]) this.remove(id); }

  update(dt) {
    for (const [id, e] of this.cars) {
      const p = this.net.players.get(id), s = p && this.net.sample(p);
      if (!s) { e.car.root.visible = false; continue; }
      e.car.root.visible = true; e.car.root.position.set(s.x, s.y, s.z); e.car.root.rotation.set(0, s.psi, 0);
      e.car.setWheels(s.st * 0.4, s.vx / e.car.S.R * dt, s.vx / e.car.S.R * dt);
      e.M.ledRed.emissiveIntensity = s.flags & 1 ? 4 : 1.4;
    }
  }
}
