// Cockpit interior and camera attachment points.
//
// Everything is derived from the car's own body surface (cowl, windscreen,
// roof line, belt line, seat position), so the driver's eye, the dashboard and
// the hood camera sit in the right place on every car. Per-car tweaks come from
// CAMERA in data.js plus an optional `cam` entry on the car.
//
// Body-local axes (same as body.js): +x forward, +y up, +z right.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { cameraConfig } from './data.js';
import { lerp, clamp } from './geo.js';

const RHD = new Set(['Nissan', 'Toyota', 'Honda', 'Mazda', 'Subaru', 'Mitsubishi', 'Lexus']);

/** Where the cameras attach on this car, in body-local coordinates. */
export function cameraRig(S) {
  const car = S.car, cfg = cameraConfig(car), ck = cfg.cockpit, hd = cfg.hood;
  const side = ck.driver === 'left' ? -1 : ck.driver === 'right' ? 1 : RHD.has(car.brand) ? 1 : -1;
  const seatX = lerp(S.wsX, S.rwX, car.layout === 'front' ? 0.55 : 0.7);
  const dz = side * ck.driverZ;
  const ex = seatX - ck.eyeBack;
  const belt = x => S.topY(x, dz), floor = S.floor0(seatX) + 0.05, cushion = S.floor0(seatX) + 0.27;
  // eye height: seated height above the cushion, but never closer to the roof than the headroom allows
  const ey = Math.min(cushion + ck.eyeAboveSeat, S.roofY(ex) - ck.headroom - 0.03);
  // hood camera: just ahead of the windscreen base, a fixed height above the bonnet
  const hx = S.cowlX + hd.ahead, hy = S.topC(hx) + hd.height;
  return {
    side, seatX, belt, floor, cfg,
    eye: new THREE.Vector3(ex, ey, dz),
    hood: new THREE.Vector3(hx, hy, 0),
    hoodLook: new THREE.Vector3(hx + 30, hy + 30 * Math.tan(hd.pitch), 0),
  };
}

function quadStrip(pts) {            // two rows of points → triangle strip geometry
  const [a, b] = pts, pos = [], idx = [];
  for (let i = 0; i < a.length; i++) pos.push(...a[i].toArray(), ...b[i].toArray());
  for (let i = 0; i < a.length - 1; i++) { const k = i * 2; idx.push(k, k + 1, k + 3, k, k + 3, k + 2); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  return g.toNonIndexed();
}
function rod(a, b, r) {               // cylinder between two points
  const d = new THREE.Vector3().subVectors(b, a), g = new THREE.CylinderGeometry(r, r, d.length(), 8, 1);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize()));
  g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2); return g;
}
const boxAt = (w, h, d, x, y, z) => { const g = new THREE.BoxGeometry(w, h, d); g.translate(x, y, z); return g; };
// merge-ready: non-indexed, position + normal only (interior surfaces are plain colours, no textures)
const ni = g => { g = g.index ? g.toNonIndexed() : g; g.deleteAttribute('uv'); if (!g.attributes.normal) g.computeVertexNormals(); return g; };

export class Cockpit {
  constructor(S, M) {
    const rig = this.rig = cameraRig(S), eye = rig.eye, ck = rig.cfg.cockpit, dz = eye.z;
    this.group = new THREE.Group(); this.group.name = 'cockpit'; this.group.userData.solid = true;
    const dashM = new THREE.MeshStandardMaterial({ color: 0x0a0b0d, roughness: 0.95, metalness: 0, envMapIntensity: 0.15 });
    const trimM = new THREE.MeshStandardMaterial({ color: 0x0a0a0c, roughness: 0.6, metalness: 0.2, envMapIntensity: 0.4 });
    const softM = new THREE.MeshStandardMaterial({ color: 0x18191c, roughness: 0.95, envMapIntensity: 0.4 });
    const alu = new THREE.MeshStandardMaterial({ color: 0x9a9da3, roughness: 0.3, metalness: 1 });
    this.mats = [dashM, trimM, softM, alu];

    // ---- cabin tub: floor, door cards, rear bulkhead, parcel shelf, centre console. It sits under the
    // belt-height lid that closes the cabin from outside; that lid is hidden while you look from inside.
    const fl = rig.floor, xf = S.cowlX + 0.02, xr = eye.x + ck.dashReach, xb = rig.seatX - 0.5, topR = eye.y - ck.dashBelowEye;
    const beltAt = (x, s2) => S.topY(x, s2 * S.gb(x)) - 0.008, wallZ = (x, y, s2) => s2 * (S.sideZ(x, Math.min(y, S.shoulderY(x))) - 0.035);
    const doors = [-1, 1].map(s2 => { const pts = [[], []];
      for (let i = 0; i <= 10; i++) { const x = lerp(xf, xb, i / 10), yt = beltAt(x, s2); pts[0].push(new THREE.Vector3(x, fl, wallZ(x, fl, s2))); pts[1].push(new THREE.Vector3(x, yt, wallZ(x, yt, s2))); }
      return quadStrip(pts); });
    const across = (x, y0, y1) => { const pts = [[], []]; for (let i = 0; i <= 8; i++) { const s2 = -1 + i / 4, sg = s2 < 0 ? -1 : 1, f = Math.abs(s2); pts[0].push(new THREE.Vector3(x, y0, wallZ(x, y0, sg) * f)); pts[1].push(new THREE.Vector3(x, y1, wallZ(x, y1, sg) * f)); } return quadStrip(pts); };
    const bulk = across(xb, fl, Math.min(beltAt(xb, 1), beltAt(xb, -1)));
    const floorG = (() => { const pts = [[], []]; for (let i = 0; i <= 8; i++) { const x = lerp(xf, xb, i / 8); pts[0].push(new THREE.Vector3(x, fl, wallZ(x, fl, -1))); pts[1].push(new THREE.Vector3(x, fl, wallZ(x, fl, 1))); } return quadStrip(pts); })();
    const shelf = (() => { const x1 = Math.max(S.rwX + 0.05, xb - 0.6), pts = [[], []]; for (let i = 0; i <= 4; i++) { const x = lerp(xb, x1, i / 4), y = Math.min(beltAt(x, 1), beltAt(x, -1)); pts[0].push(new THREE.Vector3(x, y, wallZ(x, y, -1))); pts[1].push(new THREE.Vector3(x, y, wallZ(x, y, 1))); } return quadStrip(pts); })();
    const tunnelH = Math.max(0.16, (topR - fl) * 0.45), tunnel = boxAt(xr - xb, tunnelH, 0.24, (xr + xb) / 2, fl + tunnelH / 2, 0);
    const lever = rod(new THREE.Vector3(eye.x + 0.25, fl + tunnelH, -rig.side * 0.03), new THREE.Vector3(eye.x + 0.2, fl + tunnelH + 0.16, -rig.side * 0.03), 0.009);
    const knob = new THREE.SphereGeometry(0.025, 10, 8).translate(eye.x + 0.2, fl + tunnelH + 0.17, -rig.side * 0.03);

    // ---- dashboard: from the windscreen base back to just beyond the steering wheel, closed down to the floor
    const bc = S.topY(xf, 0) - 0.005, dashTop = Math.max(topR, fl + 0.25);
    const halfD = x => Math.min(Math.abs(wallZ(x, Math.min(dashTop, S.shoulderY(x)), 1)), S.gb(x) - Math.max(0, dashTop - beltAt(x, 1)) * S.P.tumble - 0.02);
    const half = Math.max(0.3, Math.min(halfD(xr), halfD(xf)));
    const prof = new THREE.Shape([new THREE.Vector2(xf, fl), new THREE.Vector2(xf, bc), new THREE.Vector2(xr + 0.06, dashTop), new THREE.Vector2(xr, dashTop - 0.025), new THREE.Vector2(xr, fl)]);
    const dash = new THREE.ExtrudeGeometry(prof, { depth: half * 2, bevelEnabled: false }); dash.translate(0, 0, -half);
    // instrument binnacle over the cluster, and a centre screen
    const cx = eye.x + ck.clusterReach, cy = eye.y - ck.clusterBelowEye;
    const hoodG = boxAt(0.15, 0.025, 0.36, cx - 0.01, cy + 0.075, dz);
    const binBack = boxAt(0.04, 0.16, 0.36, cx + 0.03, cy, dz);
    const screen = boxAt(0.02, 0.11, 0.2, xr + 0.09, dashTop + 0.04, 0);
    this.group.add(new THREE.Mesh(mergeGeometries([ni(dash), ni(binBack), ...doors.map(ni), ni(bulk), ni(shelf), ni(tunnel)]), dashM));
    this.group.add(new THREE.Mesh(mergeGeometries([ni(floorG)]), new THREE.MeshStandardMaterial({ color: 0x0c0c0e, roughness: 1, side: THREE.DoubleSide })));
    this.mats.push(this.group.children[this.group.children.length - 1].material);
    this.group.add(new THREE.Mesh(mergeGeometries([ni(hoodG), ni(screen), ni(lever), ni(knob)]), trimM));
    dashM.side = THREE.DoubleSide;

    // ---- windscreen frame, A-pillars, headliner, mirror (all from the greenhouse shape)
    const tum = S.P.tumble, roofAt = x => S.roofY(x);
    const pillarTop = s2 => { const x = S.wsX - 0.02, y0 = S.topY(x, S.gb(x)), yt = roofAt(x) - 0.06; return new THREE.Vector3(x, yt, s2 * Math.max(0.3, S.gb(x) - (yt - y0) * tum - 0.06)); };
    const pillarBot = s2 => { const x = S.cowlX - 0.02; return new THREE.Vector3(x, S.topY(x, S.gb(x) - 0.04) + 0.01, s2 * (S.gb(x) - 0.05)); };
    const pillars = [-1, 1].map(s2 => rod(pillarBot(s2), pillarTop(s2), 0.035));
    const header = rod(pillarTop(-1), pillarTop(1), 0.03);
    const hlA = S.wsX - 0.05, hlB = S.rwX + 0.05, hl = [[], []];
    for (let i = 0; i <= 8; i++) { const x = lerp(hlA, hlB, i / 8), y = roofAt(x) - 0.035, w = Math.max(0.25, S.gb(x) - (y - 0.03 - S.topY(x, S.gb(x))) * tum - 0.015); hl[0].push(new THREE.Vector3(x, y - 0.03, -w)); hl[1].push(new THREE.Vector3(x, y, 0)); }
    const hl2 = [[], []]; for (let i = 0; i <= 8; i++) { hl2[0].push(hl[1][i]); hl2[1].push(hl[0][i].clone().setZ(-hl[0][i].z)); }
    const mirror = boxAt(0.04, 0.07, 0.24, S.wsX - 0.13, roofAt(S.wsX) - 0.12, 0);
    this.group.add(new THREE.Mesh(mergeGeometries([...pillars.map(ni), ni(header), ni(mirror)]), trimM));
    this.group.add(new THREE.Mesh(mergeGeometries([ni(quadStrip(hl)), ni(quadStrip(hl2))]), new THREE.MeshStandardMaterial({ color: 0x26272b, roughness: 1, side: THREE.DoubleSide })));
    this.mats.push(this.group.children[this.group.children.length - 1].material);

    // ---- steering wheel: rim, three spokes and hub, on a column tilted towards the driver
    const R = 0.18;
    const parts = [new THREE.TorusGeometry(R, 0.019, 10, 40)];
    for (const a of [0, Math.PI, -Math.PI / 2]) { const g = new THREE.BoxGeometry(R * 0.95, 0.03, 0.012); g.translate(R * 0.47, 0, 0); g.rotateZ(a); parts.push(g); }
    parts.push(new THREE.CylinderGeometry(0.05, 0.05, 0.035, 18).rotateX(Math.PI / 2));
    const wheel = mergeGeometries(parts.map(ni)); wheel.rotateY(Math.PI / 2);          // face the driver (axis along x)
    const marker = boxAt(0.012, 0.03, 0.026, 0, R, 0);                                // top-centre stripe, shows how far the wheel is turned
    this.wheelSpin = new THREE.Group();
    this.wheelSpin.add(new THREE.Mesh(wheel, softM), new THREE.Mesh(marker, new THREE.MeshStandardMaterial({ color: 0xff5a1f, roughness: 0.6 })));
    this.mats.push(this.wheelSpin.children[1].material);
    this.wheelPivot = new THREE.Group(); this.wheelPivot.position.set(eye.x + ck.wheelReach, eye.y - ck.wheelBelowEye, dz); this.wheelPivot.rotation.z = -ck.wheelTilt;
    const column = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 0.32, 10).rotateZ(Math.PI / 2).translate(0.17, 0, 0), trimM);
    this.wheelPivot.add(this.wheelSpin, column); this.group.add(this.wheelPivot);

    // ---- instrument cluster: canvas texture, redrawn only while the cockpit camera is in use
    const c = this.canvas = document.createElement('canvas'); c.width = 512; c.height = 200;
    this.tex = new THREE.CanvasTexture(c); this.tex.colorSpace = THREE.SRGBColorSpace;
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.133), new THREE.MeshBasicMaterial({ map: this.tex, toneMapped: false }));
    panel.position.set(cx + 0.008, cy, dz); panel.rotation.y = -Math.PI / 2; panel.rotateX(-0.12); this.group.add(panel);
    this.mats.push(panel.material);
    this.drawT = 1; this.last = ''; this.draw({ kmh: 0, rpm: 0, redline: 7000, gear: 'N' });
    // the cabin sits in the roof's shadow like a real interior; nothing in here casts shadows of its own
    for (const m of this.group.children) m.traverse(o => { o.castShadow = false; o.receiveShadow = !!o.isMesh && o.material !== panel.material; });
  }

  /** Road-wheel angle (rad, + = left) → steering-wheel rotation. ratio ≈ a real 14:1 rack. */
  setSteer(roadAngle) { this.wheelSpin.rotation.x = -roadAngle * this.rig.cfg.cockpit.steerRatio; }

  /** Redraw the gauges at most ~15 times a second. */
  update(dt, d) { this.drawT += dt; if (this.drawT < 0.066) return; this.drawT = 0; this.draw(d); }

  draw({ kmh, rpm, redline, gear, shift }) {
    const key = `${Math.round(kmh)}|${Math.round(rpm / 50)}|${gear}|${shift ? 1 : 0}`; if (key === this.last) return; this.last = key;
    const g = this.canvas.getContext('2d'), W = 512, H = 200;
    g.fillStyle = '#050608'; g.fillRect(0, 0, W, H);
    // rev counter: arc on the left, redline zone in red
    const cx = 130, cy = 108, r = 82, a0 = Math.PI * 0.8, a1 = Math.PI * 2.2, maxR = Math.ceil(redline / 1000 + 1) * 1000, ang = v => a0 + (a1 - a0) * clamp(v / maxR, 0, 1);
    g.lineWidth = 12; g.strokeStyle = '#1c1f25'; g.beginPath(); g.arc(cx, cy, r, a0, a1); g.stroke();
    g.strokeStyle = '#6b1408'; g.beginPath(); g.arc(cx, cy, r, ang(redline), a1); g.stroke();
    g.strokeStyle = rpm > redline * 0.93 ? '#ff2a12' : '#ff5a1f'; g.beginPath(); g.arc(cx, cy, r, a0, ang(rpm)); g.stroke();
    g.fillStyle = '#c9ced6'; g.font = '600 18px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
    for (let k = 0; k <= maxR / 1000; k++) { const a = ang(k * 1000); g.fillText(k, cx + Math.cos(a) * (r - 26), cy + Math.sin(a) * (r - 26)); }
    const a = ang(rpm); g.strokeStyle = '#fff'; g.lineWidth = 4; g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(a) * (r - 8), cy + Math.sin(a) * (r - 8)); g.stroke();
    g.fillStyle = '#ff5a1f'; g.beginPath(); g.arc(cx, cy, 7, 0, 7); g.fill();
    g.fillStyle = '#8a92a0'; g.font = '600 13px Arial'; g.fillText('RPM ×1000', cx, cy + 40);
    // gear and speed
    g.fillStyle = shift ? '#ff2a12' : '#ff5a1f'; g.font = '700 64px Arial'; g.fillText(gear, 280, 98);
    g.fillStyle = '#f3f4f6'; g.font = '700 74px Arial'; g.textAlign = 'right'; g.fillText(String(Math.round(kmh)), 490, 92);
    g.fillStyle = '#8a92a0'; g.font = '600 18px Arial'; g.fillText('km/h', 490, 148);
    if (shift) { g.fillStyle = '#ff2a12'; for (let i = 0; i < 5; i++) { g.beginPath(); g.arc(330 + i * 34, 22, 8, 0, 7); g.fill(); } }
    this.tex.needsUpdate = true;
  }

  dispose() { this.tex.dispose(); for (const m of this.mats) m.dispose(); }
}
