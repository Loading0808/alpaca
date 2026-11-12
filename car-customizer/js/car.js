// Assembles a complete vehicle from a build description and drives its
// runtime behaviour (stance, x-ray view, lights, engine shake, exhaust flames).
import * as THREE from 'three';
import { makeSurface, buildShell, buildDetails } from './body.js';
import { buildKit } from './kit.js';
import { buildWheel, buildStrut } from './wheels.js';
import { buildEngine, buildExhaust } from './engine3d.js';
import { resolve } from './stats.js';
import { disposeTree, clamp } from './geo.js';

const DEG = Math.PI / 180;

export class Car {
  constructor(M) {
    this.M = M;
    this.root = new THREE.Group(); this.root.position.y = 0.05;
    this.body = new THREE.Group(); this.root.add(this.body);
    this.wheels = []; this.struts = []; this.flames = [];
    this.xray = false; this.lights = false; this.flameT = 0; this.roll = 0; this.time = 0;
    this.flameLight = new THREE.PointLight(0xff8a30, 0, 5, 2); this.root.add(this.flameLight);
    this.beams = [1, -1].map(() => { const s = new THREE.SpotLight(0xdfe8ff, 0, 16, 0.5, 0.6, 1.2); this.root.add(s, s.target); return s; });
  }

  build(build) {
    const M = this.M, r = resolve(build), car = r.car;
    disposeTree(this.body); this.body.clear();
    for (const w of [...this.wheels, ...this.struts]) { disposeTree(w); this.root.remove(w); }
    this.wheels = []; this.struts = []; this.flames = [];
    const S = this.S = makeSurface(car); this.r = r;

    // shell, details, kit
    this.shell = new THREE.Group(); buildShell(S, M).forEach(m => this.shell.add(m)); this.body.add(this.shell);
    this.details = buildDetails(S, M, build, r.exhaust); this.body.add(this.details);
    this.kit = buildKit(S, M, r.kit, build.spoiler); this.body.add(this.kit);

    // drivetrain
    const eng = buildEngine(M, r.engine, r.turbo, r.sc, r.intake, car.layout === 'front');
    let xc;
    if (car.layout === 'front') xc = Math.min(S.cowlX + 0.05 + eng.len / 2, S.noseX - 0.62 - eng.len / 2);
    else if (car.layout === 'mid') xc = S.xr + 0.34 + eng.len / 2;
    else { xc = S.xr - 0.16 - eng.len / 2; eng.group.rotation.y = Math.PI; }
    eng.group.position.set(xc, S.floor0(xc) + 0.045, 0);
    const room = S.Hc0(xc) - 0.05 - eng.group.position.y;            // keep it under the hood
    if (eng.top > room) eng.group.scale.setScalar(Math.max(0.72, room / eng.top));
    eng.group.updateMatrix();
    eng.group.userData.solid = true; this.engine = eng.group; this.engineX = xc; this.body.add(eng.group);
    const tips = this.details.userData.tips;
    const cols = eng.collectors.map(c => c.clone().applyMatrix4(eng.group.matrix));
    const ex = buildExhaust(S, M, cols, tips, r.exhaust); ex.userData.solid = true; this.body.add(ex);

    // exhaust flames
    const fg = new THREE.ConeGeometry(this.details.userData.tipRadius * 1.15, 0.5, 12, 1, true); fg.rotateZ(Math.PI / 2); fg.translate(-0.25, 0, 0);
    for (const t of tips) { const f = new THREE.Mesh(fg, M.flame); f.position.copy(t); f.userData.solid = true; f.renderOrder = 5; this.body.add(f); this.flames.push(f); }
    this.flameLight.position.set(S.tailX - 0.3, tips[0].y, 0);

    // wheels + suspension
    const maxIn = Math.floor((car.tireR - 0.042) * 2 / 0.0254), rimIn = clamp(build.rim.size, 15, maxIn);
    for (const [ax, side] of [[0, 1], [0, -1], [1, 1], [1, -1]]) {
      const width = car.tireW[ax] + (r.tire.id === 'drag' ? (ax ? 0.035 : 0) : r.tire.dW);
      const w = buildWheel({ R: car.tireR, width, rimIn, style: build.rim.style, tire: r.tire, M });
      const pivot = new THREE.Group(); w.position.y = car.tireR; if (side < 0) w.rotation.y = Math.PI;
      pivot.add(w); pivot.userData = { ax, side, width: Math.max(width, w.userData.bw), spin: w.userData.spin };
      this.root.add(pivot); this.wheels.push(pivot);
      const st = buildStrut(M, !!r.susp.air); st.userData = { ax, side }; this.root.add(st); this.struts.push(st);
    }
    M.spring.color.set(r.susp.color);

    for (const [i, s] of this.beams.entries()) {
      const side = i ? -1 : 1, z = side * S.zTop(S.noseX - 0.2) * 0.7;
      s.position.set(S.noseX - 0.05, S.topC(S.noseX - 0.1) - 0.05, z); s.target.position.set(S.noseX + 8, 0, z * 1.3);
    }
    this.setXray(this.xray); this.setLights(this.lights);
  }

  /** drop: metres below stock ride height. */
  applyStance(build, drop) {
    const S = this.S, kit = this.r.kit;
    this.drop = drop;
    for (const p of this.wheels) {
      const { ax, side, width } = p.userData, xa = ax ? S.xr : S.xf;
      const flare = (ax ? kit.flareR : kit.flareF) || 0, off = (ax ? build.susp.offR : build.susp.offF) / 1000;
      const zc = S.hw(xa) - 0.014 - width / 2 + off + flare * 0.95;
      p.position.set(xa, 0, side * zc);
      p.rotation.x = -side * (ax ? build.susp.camberR : build.susp.camberF) * DEG;
      p.userData.zc = zc;
    }
    for (const st of this.struts) {
      const { ax, side } = st.userData, xa = ax ? S.xr : S.xf, w = this.wheels.find(p => p.userData.ax === ax && p.userData.side === side);
      const z = w.userData.zc - w.userData.width / 2 - 0.09, base = S.R * 0.75, top = S.wcY + S.Ra + 0.03 - drop;
      st.position.set(xa, base, side * z); st.scale.y = Math.max(0.2, top - base); st.rotation.x = side * 0.14;
    }
  }

  setXray(on) {
    this.xray = on;
    const solid = o => { for (let p = o; p && p !== this.body; p = p.parent) if (p.userData.solid) return true; return false; };
    this.body.traverse(o => {
      if (!o.isMesh || solid(o)) return;
      if (o.parent === this.details && !o.castShadow) { o.visible = !on; return; }       // surface patches
      if (!o.userData.mat) o.userData.mat = o.material;
      o.material = on ? this.M.ghost : o.userData.mat;
      o.castShadow = !on && o.name !== 'glass';
    });
  }

  setLights(on) {
    this.lights = on;
    this.M.led.emissiveIntensity = on ? 3.2 : 0.25; this.M.ledRed.emissiveIntensity = on ? 2.6 : 0.35;
    for (const s of this.beams) s.intensity = on ? 60 : 0;
  }

  pop(intensity = 1) { this.flameT = Math.min(1.3, 0.7 + intensity * 0.5); }

  update(dt, rpm, throttle, running, dyno, redline) {
    this.time += dt;
    const k = running ? clamp(rpm / redline, 0, 1) : 0;
    // idle shake + torque roll
    const target = running ? throttle * 0.012 : 0;
    this.roll += (target - this.roll) * Math.min(1, dt * 9);
    const shake = running ? Math.sin(this.time * (20 + k * 90)) * 0.0007 * (1.2 - k) : 0;
    this.body.rotation.x = this.roll + shake * 1.5;
    this.body.position.y = -this.drop + shake;
    // flames
    this.flameT = Math.max(0, this.flameT - dt * 8);
    this.M.flame.opacity = Math.min(1, this.flameT);
    this.flameLight.intensity = this.flameT * 9;
    for (const f of this.flames) { f.visible = this.flameT > 0.01; f.scale.set(0.5 + this.flameT * (0.6 + Math.random() * 0.5), 1, 1); }
    // dyno rollers
    if (dyno && running) {
      const w = (rpm / 60) * Math.PI * 2 / 9 * dt;
      for (const p of this.wheels) if (this.r.car.drive === 'AWD' || p.userData.ax === 1) p.userData.spin.rotation.z -= w * p.userData.side;
    }
  }
}
