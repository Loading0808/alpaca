// Shared material library. One instance per material so paint / rim / tint
// changes are instant and never require rebuilding geometry.
import * as THREE from 'three';
import { byId, RIM_COLORS, TINTS } from './data.js';

function canvasTex(w, h, draw, repeat = true) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

export function carbonTexture() {
  return canvasTex(64, 64, (g, w) => {
    g.fillStyle = '#0d0d0f'; g.fillRect(0, 0, w, w);
    const n = 8, s = w / n;
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const over = ((x + y) % 4) < 2;
      const gr = over ? g.createLinearGradient(x * s, 0, (x + 1) * s, 0) : g.createLinearGradient(0, y * s, 0, (y + 1) * s);
      gr.addColorStop(0, '#17181b'); gr.addColorStop(0.5, over ? '#3a3d44' : '#2a2c31'); gr.addColorStop(1, '#141517');
      g.fillStyle = gr; g.fillRect(x * s + 0.5, y * s + 0.5, s - 1, s - 1);
    }
  });
}

export function titaniumTexture() {
  return canvasTex(8, 128, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, '#2a4cff'); gr.addColorStop(0.25, '#7a3cf0'); gr.addColorStop(0.5, '#d9a441');
    gr.addColorStop(0.75, '#b9bcc4'); gr.addColorStop(1, '#a9adb5');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  }, false);
}

export function grilleTexture() {
  const t = canvasTex(64, 56, (g, w, h) => {
    g.fillStyle = '#020203'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#2b2d33'; g.lineWidth = 3;
    const hex = (cx, cy, r) => { g.beginPath(); for (let i = 0; i < 6; i++) { const a = Math.PI / 3 * i + Math.PI / 6; g[i ? 'lineTo' : 'moveTo'](cx + r * Math.cos(a), cy + r * Math.sin(a)); } g.closePath(); g.stroke(); };
    for (const [x, y] of [[0, 0], [64, 0], [0, 56], [64, 56], [32, 28]]) hex(x, y, 18.5);
  });
  t.repeat.set(5, 5); return t;
}

/** Sparkle under the clear-coat for metallic and pearl paint. */
export function flakeTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d'), d = g.createImageData(256, 256);
  for (let i = 0; i < d.data.length; i += 4) { d.data[i] = 128 + (Math.random() - 0.5) * 150; d.data[i + 1] = 128 + (Math.random() - 0.5) * 150; d.data[i + 2] = 255; d.data[i + 3] = 255; }
  g.putImageData(d, 0, 0);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}

export function createMaterials() {
  const DS = THREE.DoubleSide;
  const std = (o) => new THREE.MeshStandardMaterial(o);
  const phys = (o) => new THREE.MeshPhysicalMaterial(o);
  const carbonMap = carbonTexture();
  const M = {
    paint: phys({ color: '#888', side: DS, clearcoat: 1, clearcoatRoughness: 0.04 }),
    roof: phys({ color: '#888', side: DS, clearcoat: 1, clearcoatRoughness: 0.04 }),
    glass: phys({ color: '#06080a', side: DS, roughness: 0.03, metalness: 0, transparent: true, opacity: 0.8, envMapIntensity: 1.4 }),
    trim: phys({ color: '#050506', side: DS, roughness: 0.2, clearcoat: 1 }),
    under: std({ color: '#0a0a0b', side: DS, roughness: 0.95 }),
    interior: std({ color: '#0b0b0d', side: DS, roughness: 0.9 }),
    seat: std({ color: '#1a1a1e', roughness: 0.8 }),
    lens: phys({ color: '#0a0c10', side: DS, roughness: 0.05, clearcoat: 1, metalness: 0.4 }),
    led: std({ color: '#c4ccd8', side: DS, emissive: '#dfeaff', emissiveIntensity: 0.25, roughness: 0.3 }),
    ledRed: std({ color: '#5a0508', side: DS, emissive: '#ff1418', emissiveIntensity: 0.35, roughness: 0.3 }),
    plate: std({ color: '#e8e8e2', side: DS, roughness: 0.6 }),
    grille: std({ color: '#ffffff', map: grilleTexture(), side: DS, roughness: 0.55, metalness: 0.4 }),
    seam: std({ color: '#050505', side: DS, roughness: 0.8 }),
    seamThin: std({ color: '#000', side: DS, roughness: 0.8, wireframe: false, transparent: true, opacity: 0.35 }),
    carbon: phys({ color: '#ffffff', map: carbonMap, side: DS, roughness: 0.3, metalness: 0.2, clearcoat: 1, clearcoatRoughness: 0.08 }),
    blackGloss: phys({ color: '#070708', side: DS, roughness: 0.25, clearcoat: 1 }),
    rivet: std({ color: '#c9ccd1', metalness: 1, roughness: 0.3 }),
    chrome: std({ color: '#f1f1f1', metalness: 1, roughness: 0.06, side: DS }),
    steel: std({ color: '#9a9da3', metalness: 1, roughness: 0.38, side: DS }),
    blackChrome: std({ color: '#1b1c20', metalness: 1, roughness: 0.15, side: DS }),
    titanium: std({ color: '#ffffff', map: titaniumTexture(), metalness: 1, roughness: 0.25, side: DS }),
    tipInner: std({ color: '#050505', roughness: 1, side: THREE.BackSide }),
    alu: std({ color: '#b9bcc2', metalness: 1, roughness: 0.45 }),
    aluPolished: std({ color: '#e3e5e8', metalness: 1, roughness: 0.14 }),
    iron: std({ color: '#3a3c40', metalness: 0.8, roughness: 0.65 }),
    hot: std({ color: '#5a3a2a', metalness: 0.9, roughness: 0.6 }),
    plastic: std({ color: '#0e0e10', roughness: 0.7 }),
    cover: std({ color: '#b91c1c', metalness: 0.4, roughness: 0.35 }),
    filter: std({ color: '#b01212', roughness: 0.85 }),
    silicone: std({ color: '#12327a', roughness: 0.6 }),
    belt: std({ color: '#0a0a0a', roughness: 0.9 }),
    rimFace: std({ color: '#4a4f57', metalness: 1, roughness: 0.35, side: DS }),
    rimLip: std({ color: '#4a4f57', metalness: 1, roughness: 0.35, side: DS }),
    disc: std({ color: '#8d9096', metalness: 1, roughness: 0.42 }),
    caliper: std({ color: '#c81414', metalness: 0.3, roughness: 0.4 }),
    spring: std({ color: '#c81414', metalness: 0.5, roughness: 0.4 }),
    damper: std({ color: '#202226', metalness: 0.8, roughness: 0.4 }),
    ghost: std({ color: '#7fb4ff', transparent: true, opacity: 0.1, depthWrite: false, side: DS, metalness: 0.2, roughness: 0.4 }),
    flame: new THREE.MeshBasicMaterial({ color: '#ffa238', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: DS }),
  };
  M._carbonMap = carbonMap; M._flake = flakeTexture();
  return M;
}

const FIN = {
  gloss: { metalness: 0.0, roughness: 0.38, clearcoat: 1, iridescence: 0 },
  metallic: { metalness: 0.75, roughness: 0.42, clearcoat: 1, iridescence: 0 },
  pearl: { metalness: 0.55, roughness: 0.35, clearcoat: 1, iridescence: 1 },
  satin: { metalness: 0.5, roughness: 0.5, clearcoat: 0.25, iridescence: 0 },
  matte: { metalness: 0.2, roughness: 0.82, clearcoat: 0, iridescence: 0 },
  chrome: { metalness: 1, roughness: 0.05, clearcoat: 0, iridescence: 0 },
};

/** Push the appearance part of the build (paint, tint, rims…) into the materials. */
export function applyAppearance(M, build) {
  const f = FIN[build.paint.finish] || FIN.gloss;
  M.paint.color.set(build.paint.color);
  Object.assign(M.paint, f);
  M.paint.iridescenceIOR = 1.6;
  const flake = build.paint.finish === 'metallic' || build.paint.finish === 'pearl';
  M.paint.normalMap = flake ? M._flake : null; M.paint.normalScale.set(0.16, 0.16);
  M.paint.clearcoatRoughness = build.paint.finish === 'satin' ? 0.4 : 0.04;

  // roof: body colour / gloss black / carbon
  M.roof.map = null; Object.assign(M.roof, f); M.roof.color.set(build.paint.color);
  if (build.roof === 'black') { M.roof.color.set('#060607'); Object.assign(M.roof, FIN.gloss); M.roof.roughness = 0.2; }
  if (build.roof === 'carbon') { M.roof.color.set('#ffffff'); M.roof.map = M._carbonMap; Object.assign(M.roof, { metalness: 0.2, roughness: 0.3, clearcoat: 1, iridescence: 0 }); }
  M.roof.needsUpdate = true; M.paint.needsUpdate = true;

  M.glass.opacity = byId(TINTS, build.tint).opacity;

  const rc = byId(RIM_COLORS, build.rim.color);
  for (const m of [M.rimFace, M.rimLip]) { m.color.set(rc.color); m.metalness = rc.metal; m.roughness = rc.rough; }
  if (build.rim.style === 'dish' || build.rim.style === 'mesh') { M.rimLip.color.set('#e9eaec'); M.rimLip.metalness = 1; M.rimLip.roughness = 0.08; }
  M.caliper.color.set(build.caliper);
  M.ghost.color.set(build.paint.color).lerp(new THREE.Color('#9cc4ff'), 0.6);
}
