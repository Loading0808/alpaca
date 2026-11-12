// Renderer, camera, lighting and the garage environment.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const ACCENT = 0xff5a1f;

function tex(w, h, draw, rx = 1, ry = 1) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rx, ry); t.anisotropy = 8;
  return t;
}

/** Studio light rig rendered into a PMREM so paint and chrome get long soft reflections. */
function makeEnvironment(renderer) {
  const s = new THREE.Scene();
  const room = new THREE.Mesh(new THREE.BoxGeometry(30, 12, 24), new THREE.MeshBasicMaterial({ color: 0x0b0c0f, side: THREE.BackSide }));
  room.position.y = 5; s.add(room);
  const light = (w, h, x, y, z, rx, ry, k) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(k, k, k * 1.04), side: THREE.DoubleSide }));
    m.position.set(x, y, z); m.rotation.set(rx, ry, 0); s.add(m);
  };
  for (const z of [-5.2, -1.8, 1.8, 5.2]) light(16, 0.7, 0, 7.5, z, Math.PI / 2, 0, 11);
  light(12, 2.4, 0, 3.2, -11, 0, 0, 2.2); light(12, 2.4, 0, 3.2, 11, 0, Math.PI, 2.2);
  light(8, 2.2, -14, 3, 0, 0, Math.PI / 2, 1.6); light(8, 2.2, 14, 3, 0, 0, -Math.PI / 2, 1.6);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(30, 24), new THREE.MeshBasicMaterial({ color: 0x1a1b1e })); floor.rotation.x = -Math.PI / 2; floor.position.y = -0.9; s.add(floor);
  const pm = new THREE.PMREMGenerator(renderer);
  const rt = pm.fromScene(s, 0.035);
  pm.dispose();
  return rt.texture;
}

function buildGarage(scene) {
  const g = new THREE.Group(); scene.add(g);
  // polished concrete floor
  const floorTex = tex(512, 512, (c, w, h) => {
    c.fillStyle = '#1f2125'; c.fillRect(0, 0, w, h);
    for (let i = 0; i < 2600; i++) { const v = 26 + Math.random() * 26; c.fillStyle = `rgba(${v},${v},${v + 3},0.35)`; c.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 3, 1 + Math.random() * 3); }
    c.strokeStyle = 'rgba(0,0,0,0.5)'; c.lineWidth = 3; c.strokeRect(0, 0, w, h);
  }, 16, 16);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(64, 64), new THREE.MeshStandardMaterial({ map: floorTex, color: 0x9a9a9a, roughness: 0.42, metalness: 0.1, envMapIntensity: 0.3 }));
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; g.add(floor);

  // turntable
  const tt = new THREE.Mesh(new THREE.CylinderGeometry(3.45, 3.5, 0.05, 96), new THREE.MeshStandardMaterial({ color: 0x15161a, roughness: 0.35, metalness: 0.85, envMapIntensity: 0.8 }));
  tt.position.y = 0.025; tt.receiveShadow = true; g.add(tt);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(3.47, 0.008, 8, 128), new THREE.MeshBasicMaterial({ color: ACCENT }));
  ring.rotation.x = Math.PI / 2; ring.position.y = 0.052; g.add(ring);
  const ring2 = new THREE.Mesh(new THREE.RingGeometry(3.05, 3.07, 96), new THREE.MeshBasicMaterial({ color: 0x3a3d44 })); ring2.rotation.x = -Math.PI / 2; ring2.position.y = 0.0515; g.add(ring2);

  // room shell
  const wallTex = tex(256, 256, (c, w, h) => {
    c.fillStyle = '#24262b'; c.fillRect(0, 0, w, h);
    c.fillStyle = '#1b1d21'; c.fillRect(0, h * 0.72, w, h * 0.28);
    c.strokeStyle = 'rgba(0,0,0,0.45)'; c.lineWidth = 2; c.strokeRect(1, 1, w - 2, h - 2);
    c.fillStyle = '#ff5a1f'; c.fillRect(0, h * 0.715, w, 3);
  }, 1, 1);
  const wallMat = new THREE.MeshStandardMaterial({ map: wallTex, roughness: 0.85, metalness: 0.1 });
  const wall = (w, x, z, ry) => { const t = wallTex.clone(); t.repeat.set(w / 3.5, 1); t.needsUpdate = true; const m = new THREE.Mesh(new THREE.PlaneGeometry(w, 7), wallMat.clone()); m.material.map = t; m.position.set(x, 3.5, z); m.rotation.y = ry; m.receiveShadow = true; g.add(m); };
  wall(30, 0, -11, 0); wall(30, 0, 11, Math.PI); wall(22, -15, 0, Math.PI / 2); wall(22, 15, 0, -Math.PI / 2);
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(30, 22), new THREE.MeshStandardMaterial({ color: 0x101114, roughness: 1 })); ceil.rotation.x = Math.PI / 2; ceil.position.y = 7; g.add(ceil);

  // ceiling light bars
  const barMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  for (const z of [-5.2, -1.8, 1.8, 5.2]) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(16, 0.06, 0.5), barMat); b.position.set(0, 6.9, z); g.add(b);
    const h = new THREE.Mesh(new THREE.BoxGeometry(16.3, 0.12, 0.7), new THREE.MeshStandardMaterial({ color: 0x0c0c0e, roughness: 0.6 })); h.position.set(0, 6.97, z); g.add(h);
  }
  // wall accent strips
  const strip = new THREE.MeshBasicMaterial({ color: ACCENT });
  for (const [w, x, z, ry] of [[30, 0, -10.97, 0], [30, 0, 10.97, 0], [22, -14.97, 0, Math.PI / 2], [22, 14.97, 0, Math.PI / 2]]) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.035, 0.03), strip); m.position.set(x, 0.06, z); m.rotation.y = ry; g.add(m);
  }

  // signage
  const sign = tex(1024, 256, (c, w, h) => {
    c.fillStyle = '#0b0c0f'; c.fillRect(0, 0, w, h);
    c.fillStyle = '#ff5a1f'; c.fillRect(40, 196, w - 80, 6);
    c.fillStyle = '#f2f3f5'; c.font = 'italic 900 128px Arial, Helvetica, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText('APEX GARAGE', w / 2, 108);
    c.fillStyle = '#8b93a1'; c.font = '600 26px Arial, Helvetica, sans-serif'; c.fillText('C U S T O M   W O R K S   ·   W I D E B O D Y   ·   E N G I N E   B U I L D S', w / 2, 228);
  });
  const sg = new THREE.Mesh(new THREE.PlaneGeometry(9, 2.25), new THREE.MeshBasicMaterial({ map: sign })); sg.position.set(-7.5, 4.6, -10.95); g.add(sg);

  // props: tool chests, workbench, tyre stacks
  const mat = (c, r = 0.5, m = 0.4) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m });
  const box = (w, h, d, m, x, y, z) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); b.castShadow = b.receiveShadow = true; g.add(b); return b; };
  const red = mat(0xa5121a, 0.35, 0.5), dark = mat(0x17181b, 0.5, 0.6), steel = mat(0x7d8087, 0.35, 0.9), wood = mat(0x5a4632, 0.8, 0);
  for (const x of [-11.5, -9.6, 9.8]) {
    box(1.7, 1.1, 0.7, red, x, 0.6, -10.4); box(1.7, 0.6, 0.6, red, x, 1.48, -10.45); box(1.74, 0.04, 0.74, steel, x, 1.17, -10.4);
    for (let i = 0; i < 5; i++) box(1.5, 0.02, 0.02, steel, x, 0.25 + i * 0.2, -10.04);
  }
  box(4.4, 0.08, 0.9, wood, 6, 0.95, -10.4); for (const dx of [-2, 2]) box(0.08, 0.9, 0.8, dark, 6 + dx, 0.45, -10.4);
  box(4.4, 1.3, 0.04, dark, 6, 2.0, -10.9);
  const tyreG = new THREE.TorusGeometry(0.24, 0.11, 12, 28), tyreM = mat(0x0c0c0d, 0.9, 0);
  for (const [x, z, n] of [[-13.4, -8.5, 4], [-13.4, -7.6, 3], [13.3, -8.6, 4], [12.4, -9.6, 2], [13.4, 7.5, 4]]) for (let i = 0; i < n; i++) {
    const t = new THREE.Mesh(tyreG, tyreM); t.rotation.x = Math.PI / 2; t.position.set(x + (i % 2) * 0.03, 0.12 + i * 0.225, z); t.castShadow = true; g.add(t);
  }
  // two-post lift in the background
  for (const z of [-1.5, 1.5]) { box(0.28, 3.4, 0.28, mat(0x1d4ed8, 0.4, 0.5), -12.2, 1.7, z + 6.5); box(0.6, 0.06, 0.5, steel, -12.2, 0.03, z + 6.5); }
  box(0.2, 0.14, 3.2, mat(0x1d4ed8, 0.4, 0.5), -12.2, 3.45, 6.5);
  return g;
}

export function createStage(canvas) {
  const stage = { driving: false };
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0a0b0d);
  scene.fog = new THREE.Fog(0x0a0b0d, 20, 46);
  scene.environment = makeEnvironment(renderer);

  const camera = new THREE.PerspectiveCamera(34, 1, 0.05, 120);
  camera.position.set(5.4, 1.9, 5.6);
  const controls = new OrbitControls(camera, canvas);
  controls.target.set(0, 0.62, 0); controls.enableDamping = true; controls.dampingFactor = 0.07;
  controls.minDistance = 1.6; controls.maxDistance = 12; controls.maxPolarAngle = Math.PI * 0.495; controls.enablePan = false;
  controls.autoRotateSpeed = 0.9;

  const garageRoot = new THREE.Group(); scene.add(garageRoot);   // everything that belongs to the garage (hidden while driving)
  garageRoot.add(new THREE.HemisphereLight(0xdfe6ff, 0x1a1a1e, 0.55));
  const key = new THREE.DirectionalLight(0xffffff, 1.5);
  key.position.set(3.5, 9, 4.5); key.castShadow = true; key.shadow.mapSize.set(2048, 2048);
  Object.assign(key.shadow.camera, { left: -4.5, right: 4.5, top: 4.5, bottom: -4.5, near: 1, far: 22 });
  key.shadow.bias = -0.0004; key.shadow.normalBias = 0.025; key.shadow.radius = 5;
  garageRoot.add(key);
  const fill = new THREE.DirectionalLight(0xbfd0ff, 0.45); fill.position.set(-6, 5, -5); garageRoot.add(fill);
  const warm = new THREE.PointLight(0xff7a3a, 14, 14, 2); warm.position.set(-9, 1.2, -8); garageRoot.add(warm);
  const warm2 = new THREE.PointLight(0xff7a3a, 10, 14, 2); warm2.position.set(10, 1.2, 8); garageRoot.add(warm2);

  buildGarage(garageRoot);

  // soft contact shadow under the car
  const blob = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({
    map: tex(128, 128, (c, w) => { const gr = c.createRadialGradient(w / 2, w / 2, 4, w / 2, w / 2, w / 2); gr.addColorStop(0, 'rgba(0,0,0,0.85)'); gr.addColorStop(0.6, 'rgba(0,0,0,0.5)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = gr; c.fillRect(0, 0, w, w); }),
    transparent: true, depthWrite: false,
  }));
  blob.rotation.x = -Math.PI / 2; blob.position.y = 0.054; blob.renderOrder = 1; garageRoot.add(blob);

  const resize = () => {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false); camera.aspect = w / h;
    // keep the car centred in the free area between the UI panels
    if (w > 900 && !stage.driving) camera.setViewOffset(w, h, 120, 46, w, h); else camera.clearViewOffset();
    camera.updateProjectionMatrix();
  };
  window.addEventListener('resize', resize); resize();

  // smooth camera moves
  let tween = null;
  const flyTo = (pos, target, dur = 0.9) => {
    tween = { p0: camera.position.clone(), t0: controls.target.clone(), p1: new THREE.Vector3(...pos), t1: new THREE.Vector3(...target), t: 0, dur };
  };
  const update = dt => {
    if (tween) {
      tween.t = Math.min(1, tween.t + dt / tween.dur);
      const k = tween.t * tween.t * (3 - 2 * tween.t);
      // interpolate on an arc around the target so the camera never cuts through the car
      const a = tween.p0.clone().sub(tween.t0), b = tween.p1.clone().sub(tween.t1);
      const sa = new THREE.Spherical().setFromVector3(a), sb = new THREE.Spherical().setFromVector3(b);
      let dth = sb.theta - sa.theta; if (dth > Math.PI) dth -= Math.PI * 2; if (dth < -Math.PI) dth += Math.PI * 2;
      const s = new THREE.Spherical(sa.radius + (sb.radius - sa.radius) * k, sa.phi + (sb.phi - sa.phi) * k, sa.theta + dth * k);
      controls.target.lerpVectors(tween.t0, tween.t1, k);
      camera.position.setFromSpherical(s).add(controls.target);
      if (tween.t >= 1) tween = null;
    }
    if (!stage.driving) controls.update();
  };
  canvas.addEventListener('pointerdown', () => { tween = null; });

  Object.assign(stage, { renderer, scene, camera, controls, blob, flyTo, update, resize, garageRoot, garageEnv: scene.environment, garageFog: scene.fog, garageBg: scene.background });
  return stage;
}
