// Tracks: definitions, geometry (spline, samples, lookups) and drawing.
// Everything is in metres. x grows to the right, y grows downwards (canvas space).

export const TRACKS = [
  {
    id: 'harbor',
    name: 'Harbor Loop',
    blurb: 'Wide and flowing. Long sweepers between the containers — the place to learn.',
    difficulty: 1,
    theme: 'day',
    width: 16,
    runoff: 5,
    medals: { drift: [15000, 35000, 65000], lap: [48, 43, 39.5] },
    pts: [[0, 0], [120, 0], [220, 0], [275, 25], [295, 80], [270, 135], [210, 150], [160, 175], [150, 230], [110, 265],
      [40, 260], [-10, 225], [-20, 160], [-60, 120], [-110, 110], [-150, 75], [-140, 20], [-90, -5]],
  },
  {
    id: 'canyon',
    name: 'Canyon Hairpins',
    blurb: 'Tight hairpins and dusty switchbacks. Short straights, big angles.',
    difficulty: 2,
    theme: 'dusk',
    width: 14,
    runoff: 4.5,
    medals: { drift: [20000, 45000, 80000], lap: [53, 48, 44] },
    pts: [[0, 0], [90, -10], [150, 10], [170, 55], [140, 85], [90, 80], [60, 110], [80, 150], [140, 160], [200, 140],
      [250, 160], [260, 210], [220, 245], [150, 240], [90, 250], [30, 235], [-20, 200], [-30, 150], [-70, 120],
      [-80, 70], [-50, 20]],
  },
  {
    id: 'neon',
    name: 'Neon Ring',
    blurb: 'A city circuit at night. Square corners, long straights and walls that glow.',
    difficulty: 3,
    theme: 'night',
    width: 15,
    runoff: 4,
    medals: { drift: [20000, 45000, 80000], lap: [54, 49, 45] },
    pts: [[0, 0], [150, 0], [190, 15], [205, 55], [205, 120], [220, 160], [260, 175], [310, 180], [340, 210], [335, 255],
      [300, 280], [200, 285], [100, 285], [40, 270], [10, 235], [30, 190], [70, 165], [80, 125], [50, 95], [0, 90],
      [-35, 65], [-35, 25]],
  },
];

export const THEMES = {
  day: {
    ground: '#3b7034', ground2: '#447c3b', runoff: '#b7a57f', runoff2: '#a8966f', asphalt: '#3a3b40', asphalt2: '#414248',
    line: '#eeeeee', kerbA: '#e5202e', kerbB: '#f4f4f4', wallA: '#e5202e', wallB: '#f4f4f4', skid: 'rgba(15,15,18,0.42)',
    smoke: [235, 235, 235], shadow: 'rgba(0,0,0,0.28)', night: false,
  },
  dusk: {
    ground: '#b8693a', ground2: '#c27443', runoff: '#d9a066', runoff2: '#cf9558', asphalt: '#3b3536', asphalt2: '#433c3c',
    line: '#f3e7d3', kerbA: '#ff6b1a', kerbB: '#f4f0e8', wallA: '#8d8d8d', wallB: '#ff6b1a', skid: 'rgba(25,15,12,0.45)',
    smoke: [230, 200, 170], shadow: 'rgba(40,10,0,0.32)', night: false,
  },
  night: {
    ground: '#0c0e18', ground2: '#121527', runoff: '#171a2a', runoff2: '#1c2033', asphalt: '#1c1e27', asphalt2: '#22242e',
    line: '#29e3ff', kerbA: '#ff2bd6', kerbB: '#29e3ff', wallA: '#ff2bd6', wallB: '#7a2bff', skid: 'rgba(0,0,0,0.55)',
    smoke: [160, 170, 210], shadow: 'rgba(0,0,0,0.5)', night: true,
  },
};

const DS = 2; // spacing between centre-line samples, metres

function dist(a, b) { return Math.hypot(b[0] - a[0], b[1] - a[1]); }

// centripetal Catmull–Rom (no cusps or loops)
function catmull(p0, p1, p2, p3, t) {
  const k = (a, b) => Math.max(1e-4, Math.sqrt(dist(a, b)));
  const t0 = 0, t1 = t0 + k(p0, p1), t2 = t1 + k(p1, p2), t3 = t2 + k(p2, p3);
  const u = t1 + (t2 - t1) * t;
  const L = (a, b, ta, tb) => {
    const f = (u - ta) / (tb - ta);
    return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
  };
  const A1 = L(p0, p1, t0, t1), A2 = L(p1, p2, t1, t2), A3 = L(p2, p3, t2, t3);
  const B1 = L(A1, A2, t0, t2), B2 = L(A2, A3, t1, t3);
  return L(B1, B2, t1, t2);
}

export class Track {
  constructor(def) {
    this.def = def;
    this.theme = THEMES[def.theme];
    this.half = def.width / 2;
    this.wallOff = this.half + def.runoff;
    this.build();
  }

  build() {
    const P = this.def.pts, n = P.length;
    const dense = [];
    for (let i = 0; i < n; i++) {
      const p0 = P[(i - 1 + n) % n], p1 = P[i], p2 = P[(i + 1) % n], p3 = P[(i + 2) % n];
      for (let s = 0; s < 40; s++) dense.push(catmull(p0, p1, p2, p3, s / 40));
    }
    // resample at an even spacing
    const cum = [0];
    for (let i = 1; i <= dense.length; i++) cum.push(cum[i - 1] + dist(dense[i - 1], dense[i % dense.length]));
    const total = cum[dense.length];
    const count = Math.round(total / DS);
    this.n = count;
    this.length = total;
    this.ds = total / count;
    const x = new Float64Array(count), y = new Float64Array(count);
    let j = 0;
    for (let i = 0; i < count; i++) {
      const s = i * this.ds;
      while (cum[j + 1] < s) j++;
      const f = (s - cum[j]) / (cum[j + 1] - cum[j] || 1);
      const a = dense[j], b = dense[(j + 1) % dense.length];
      x[i] = a[0] + (b[0] - a[0]) * f;
      y[i] = a[1] + (b[1] - a[1]) * f;
    }
    this.x = x; this.y = y;
    const tx = new Float64Array(count), ty = new Float64Array(count);
    for (let i = 0; i < count; i++) {
      const a = (i - 1 + count) % count, b = (i + 1) % count;
      const dx = x[b] - x[a], dy = y[b] - y[a], l = Math.hypot(dx, dy) || 1;
      tx[i] = dx / l; ty[i] = dy / l;
    }
    this.tx = tx; this.ty = ty;
    // signed curvature (positive = turning right), smoothed
    const raw = new Float64Array(count);
    for (let i = 0; i < count; i++) {
      const b = (i + 1) % count;
      const cross = tx[i] * ty[b] - ty[i] * tx[b];
      const dot = tx[i] * tx[b] + ty[i] * ty[b];
      raw[i] = Math.atan2(cross, dot) / this.ds;
    }
    const k = new Float64Array(count), W = 3;
    for (let i = 0; i < count; i++) {
      let s = 0;
      for (let o = -W; o <= W; o++) s += raw[(i + o + count) % count];
      k[i] = s / (2 * W + 1);
    }
    this.k = k;
    // bounds
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (let i = 0; i < count; i++) {
      minX = Math.min(minX, x[i]); maxX = Math.max(maxX, x[i]);
      minY = Math.min(minY, y[i]); maxY = Math.max(maxY, y[i]);
    }
    const m = this.wallOff + 2;
    this.bounds = { minX: minX - m, minY: minY - m, maxX: maxX + m, maxY: maxY + m };
  }

  heading(i) { i = ((i % this.n) + this.n) % this.n; return Math.atan2(this.ty[i], this.tx[i]); }

  // Nearest point on the centre line. `hint` = last known sample index (searches nearby only).
  // Returns { i, d (signed lateral offset, + = right of travel), f (0..1 along segment) }.
  locate(px, py, hint = -1, out = {}) {
    const n = this.n;
    let best = Infinity, bi = 0, bf = 0;
    const scan = (i) => {
      const a = i, b = (i + 1) % n;
      const ax = this.x[a], ay = this.y[a];
      const sx = this.x[b] - ax, sy = this.y[b] - ay;
      const l2 = sx * sx + sy * sy || 1;
      let f = ((px - ax) * sx + (py - ay) * sy) / l2;
      f = f < 0 ? 0 : f > 1 ? 1 : f;
      const qx = ax + sx * f - px, qy = ay + sy * f - py;
      const d2 = qx * qx + qy * qy;
      if (d2 < best) { best = d2; bi = a; bf = f; }
    };
    if (hint < 0) for (let i = 0; i < n; i++) scan(i);
    else for (let o = -24; o <= 24; o++) scan(((hint + o) % n + n) % n);
    const b = (bi + 1) % n;
    const cx = this.x[bi] + (this.x[b] - this.x[bi]) * bf, cy = this.y[bi] + (this.y[b] - this.y[bi]) * bf;
    // normal (right of travel) = (-ty, tx)
    const nx = -this.ty[bi], ny = this.tx[bi];
    out.i = bi; out.f = bf;
    out.d = (px - cx) * nx + (py - cy) * ny;
    out.nx = nx; out.ny = ny;
    out.dist = Math.sqrt(best);
    return out;
  }

  // Smallest gap between two parts of the track that are far apart along it (used by the self-test).
  minSeparation() {
    const n = this.n, skip = Math.ceil((this.wallOff * 4) / this.ds);
    let min = Infinity;
    for (let i = 0; i < n; i += 2) {
      for (let j = 0; j < n; j += 2) {
        let di = Math.abs(i - j); di = Math.min(di, n - di);
        if (di < skip) continue;
        min = Math.min(min, Math.hypot(this.x[i] - this.x[j], this.y[i] - this.y[j]));
      }
    }
    return min;
  }

  minRadius() { let m = 0; for (let i = 0; i < this.n; i++) m = Math.max(m, Math.abs(this.k[i])); return 1 / m; }

  // ---------------------------------------------------------------- drawing
  // Path2D objects are built once (needs a browser).
  prepare() {
    if (this.paths) return;
    const n = this.n;
    const poly = (off) => {
      const p = new Path2D();
      for (let i = 0; i <= n; i++) {
        const k = i % n;
        const px = this.x[k] - this.ty[k] * off, py = this.y[k] + this.tx[k] * off;
        i === 0 ? p.moveTo(px, py) : p.lineTo(px, py);
      }
      p.closePath();
      return p;
    };
    const center = poly(0);
    // kerbs on the parts that bend
    const kerb = new Path2D();
    let open = false;
    for (let i = 0; i <= n + 1; i++) {
      const k = i % n;
      const curvy = Math.abs(this.k[k]) > 1 / 70;
      if (curvy) { open ? kerb.lineTo(this.x[k], this.y[k]) : kerb.moveTo(this.x[k], this.y[k]); open = true; }
      else open = false;
    }
    this.paths = {
      center, kerb,
      edgeL: poly(-(this.half - 0.6)), edgeR: poly(this.half - 0.6),
      wallL: poly(-this.wallOff), wallR: poly(this.wallOff),
    };
    this.buildScenery();
    this.buildPattern();
  }

  buildPattern() {
    const t = this.theme, c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d');
    g.fillStyle = t.ground; g.fillRect(0, 0, 128, 128);
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    if (t.night) {
      g.strokeStyle = 'rgba(122,43,255,0.16)'; g.lineWidth = 2;
      g.strokeRect(0, 0, 128, 128);
      for (let i = 0; i < 40; i++) { g.fillStyle = 'rgba(41,227,255,0.06)'; g.fillRect(rnd() * 128, rnd() * 128, 2, 2); }
    } else {
      for (let i = 0; i < 900; i++) {
        g.fillStyle = rnd() < 0.5 ? t.ground2 : 'rgba(0,0,0,0.07)';
        const s = 1 + rnd() * 3;
        g.fillRect(rnd() * 128, rnd() * 128, s, s);
      }
    }
    this.pattern = g.createPattern(c, 'repeat');
    // 128 px tile = 16 m in the world
    if (this.pattern.setTransform) this.pattern.setTransform(new DOMMatrix().scale(16 / 128));
  }

  buildScenery() {
    let seed = this.def.id.length * 977 + 13;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const b = this.bounds, pad = 45, items = [];
    const theme = this.def.theme;
    const ok = (x, y, r) => {
      const loc = this.locate(x, y);
      if (loc.dist < this.wallOff + 2 + r) return false;
      for (const it of items) if (Math.hypot(it.x - x, it.y - y) < it.r + r + 1) return false;
      return true;
    };
    const tries = 1400;
    for (let t = 0; t < tries; t++) {
      const x = b.minX - pad + rnd() * (b.maxX - b.minX + pad * 2);
      const y = b.minY - pad + rnd() * (b.maxY - b.minY + pad * 2);
      const roll = rnd();
      let it;
      if (theme === 'day') {
        if (roll < 0.62) it = { kind: 'tree', r: 2 + rnd() * 2.5 };
        else if (roll < 0.9) it = { kind: 'box', w: 12, h: 2.6, r: 6.5, a: Math.round(rnd() * 2) * Math.PI / 2 + (rnd() - 0.5) * 0.08,
          color: ['#c0392b', '#2471a3', '#d4ac0d', '#1e8449', '#e67e22', '#7d3c98'][Math.floor(rnd() * 6)] };
        else it = { kind: 'tyres', r: 1.6 };
      } else if (theme === 'dusk') {
        if (roll < 0.5) it = { kind: 'rock', r: 1.5 + rnd() * 4, a: rnd() * 6 };
        else if (roll < 0.9) it = { kind: 'shrub', r: 1 + rnd() * 1.4 };
        else it = { kind: 'tyres', r: 1.6 };
      } else {
        if (roll < 0.55) it = { kind: 'building', w: 14 + rnd() * 22, h: 14 + rnd() * 22, a: 0, r: 0,
          color: ['#1a1d33', '#20173a', '#141a2e'][Math.floor(rnd() * 3)], glow: ['#29e3ff', '#ff2bd6', '#ffd400'][Math.floor(rnd() * 3)] };
        else it = { kind: 'lamp', r: 0.8 };
        if (it.kind === 'building') it.r = Math.hypot(it.w, it.h) / 2;
      }
      it.x = x; it.y = y;
      if (it.kind === 'lamp') {
        // lamps go along the walls
        const i = Math.floor(rnd() * this.n), side = rnd() < 0.5 ? -1 : 1, off = this.wallOff + 2.2;
        it.x = this.x[i] - this.ty[i] * off * side; it.y = this.y[i] + this.tx[i] * off * side;
        if (!items.every((o) => Math.hypot(o.x - it.x, o.y - it.y) > 25)) continue;
        if (this.locate(it.x, it.y).dist < this.wallOff + 1.5) continue;
        items.push(it); continue;
      }
      if (ok(it.x, it.y, it.r)) items.push(it);
    }
    // tyre stacks on the outside of corners
    for (let i = 0; i < this.n; i += 9) {
      if (Math.abs(this.k[i]) < 1 / 45) continue;
      const side = this.k[i] > 0 ? -1 : 1, off = this.wallOff + 1.4;
      const x = this.x[i] - this.ty[i] * off * side, y = this.y[i] + this.tx[i] * off * side;
      if (this.locate(x, y).dist > this.wallOff + 0.6) items.push({ kind: theme === 'night' ? 'lamp' : 'tyres', x, y, r: 1.2 });
    }
    this.scenery = items;
  }

  drawGround(ctx, view) {
    const t = this.theme, P = this.paths;
    ctx.fillStyle = this.pattern || t.ground;
    ctx.fillRect(view.x0, view.y0, view.x1 - view.x0, view.y1 - view.y0);
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    // run-off
    ctx.strokeStyle = t.runoff; ctx.lineWidth = this.wallOff * 2;
    ctx.stroke(P.center);
    ctx.strokeStyle = t.runoff2; ctx.lineWidth = this.def.width + 3.2;
    ctx.stroke(P.center);
    // kerbs
    ctx.lineCap = 'butt';
    ctx.strokeStyle = t.kerbB; ctx.lineWidth = this.def.width + 2;
    ctx.stroke(P.kerb);
    ctx.setLineDash([2.5, 2.5]);
    ctx.strokeStyle = t.kerbA;
    ctx.stroke(P.kerb);
    ctx.setLineDash([]);
    ctx.lineCap = 'round';
    // asphalt
    ctx.strokeStyle = t.asphalt; ctx.lineWidth = this.def.width;
    ctx.stroke(P.center);
    ctx.strokeStyle = t.asphalt2; ctx.lineWidth = this.def.width * 0.45;
    ctx.stroke(P.center);
    // edge lines
    if (t.night) {
      ctx.lineWidth = 1.6; ctx.strokeStyle = 'rgba(41,227,255,0.18)';
      ctx.stroke(P.edgeL); ctx.stroke(P.edgeR);
    }
    ctx.strokeStyle = t.line; ctx.lineWidth = 0.28;
    ctx.stroke(P.edgeL); ctx.stroke(P.edgeR);
    // start / finish line
    const i0 = 0, hx = this.tx[i0], hy = this.ty[i0];
    ctx.save();
    ctx.translate(this.x[i0], this.y[i0]);
    ctx.rotate(Math.atan2(hy, hx));
    const cells = 10, cw = this.def.width / cells;
    for (let r = 0; r < 2; r++) for (let c = 0; c < cells; c++) {
      ctx.fillStyle = (r + c) % 2 ? '#111' : '#f4f4f4';
      ctx.fillRect(-1.2 + r * 1.2, -this.half + c * cw, 1.2, cw);
    }
    // grid boxes behind the line
    ctx.strokeStyle = t.line; ctx.lineWidth = 0.22; ctx.globalAlpha = 0.6;
    for (let g = 1; g <= 3; g++) { ctx.strokeRect(-g * 9 - 4.5, -2.6 + (g % 2 ? -3 : 3), 4.5, 5.2); }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  drawWalls(ctx) {
    const t = this.theme, P = this.paths;
    ctx.lineCap = 'butt';
    ctx.strokeStyle = t.shadow; ctx.lineWidth = 1.6;
    ctx.save(); ctx.translate(0.5, 0.7); ctx.stroke(P.wallL); ctx.stroke(P.wallR); ctx.restore();
    if (t.night) {
      ctx.strokeStyle = 'rgba(255,43,214,0.16)'; ctx.lineWidth = 3.2;
      ctx.stroke(P.wallL); ctx.stroke(P.wallR);
    }
    ctx.lineWidth = 1;
    ctx.strokeStyle = t.wallB; ctx.stroke(P.wallL); ctx.stroke(P.wallR);
    ctx.setLineDash([3, 3]);
    ctx.strokeStyle = t.wallA; ctx.stroke(P.wallL); ctx.stroke(P.wallR);
    ctx.setLineDash([]);
  }

  drawScenery(ctx, view, shadowsOnly) {
    const t = this.theme;
    for (const it of this.scenery) {
      if (it.x + it.r + 30 < view.x0 || it.x - it.r - 30 > view.x1 || it.y + it.r + 30 < view.y0 || it.y - it.r - 30 > view.y1) continue;
      switch (it.kind) {
        case 'tree':
          ctx.fillStyle = t.shadow; ctx.beginPath(); ctx.arc(it.x + 1.4, it.y + 1.8, it.r, 0, 7); ctx.fill();
          ctx.fillStyle = '#2c5a27'; ctx.beginPath(); ctx.arc(it.x, it.y, it.r, 0, 7); ctx.fill();
          ctx.fillStyle = '#3d7a33'; ctx.beginPath(); ctx.arc(it.x - it.r * 0.25, it.y - it.r * 0.25, it.r * 0.62, 0, 7); ctx.fill();
          break;
        case 'shrub':
          ctx.fillStyle = t.shadow; ctx.beginPath(); ctx.arc(it.x + 0.7, it.y + 0.9, it.r, 0, 7); ctx.fill();
          ctx.fillStyle = '#6f7a33'; ctx.beginPath(); ctx.arc(it.x, it.y, it.r, 0, 7); ctx.fill();
          break;
        case 'rock': {
          ctx.save(); ctx.translate(it.x, it.y); ctx.rotate(it.a);
          ctx.fillStyle = t.shadow; ctx.beginPath(); ctx.ellipse(1.2, 1.4, it.r, it.r * 0.7, 0, 0, 7); ctx.fill();
          ctx.fillStyle = '#8a4a2a'; ctx.beginPath(); ctx.ellipse(0, 0, it.r, it.r * 0.7, 0, 0, 7); ctx.fill();
          ctx.fillStyle = '#a65d36'; ctx.beginPath(); ctx.ellipse(-it.r * 0.2, -it.r * 0.18, it.r * 0.6, it.r * 0.4, 0, 0, 7); ctx.fill();
          ctx.restore(); break;
        }
        case 'box':
          ctx.save(); ctx.translate(it.x, it.y); ctx.rotate(it.a);
          ctx.fillStyle = t.shadow; ctx.fillRect(-it.w / 2 + 1.2, -it.h / 2 + 1.5, it.w, it.h);
          ctx.fillStyle = it.color; ctx.fillRect(-it.w / 2, -it.h / 2, it.w, it.h);
          ctx.fillStyle = 'rgba(0,0,0,0.18)';
          for (let s = -it.w / 2 + 0.8; s < it.w / 2; s += 1.1) ctx.fillRect(s, -it.h / 2, 0.35, it.h);
          ctx.restore(); break;
        case 'tyres':
          ctx.fillStyle = t.shadow; ctx.beginPath(); ctx.arc(it.x + 0.5, it.y + 0.6, 1.1, 0, 7); ctx.fill();
          ctx.fillStyle = '#18181b'; ctx.beginPath(); ctx.arc(it.x, it.y, 1.05, 0, 7); ctx.fill();
          ctx.strokeStyle = t.night ? '#29e3ff' : '#f4f4f4'; ctx.lineWidth = 0.25; ctx.beginPath(); ctx.arc(it.x, it.y, 0.7, 0, 7); ctx.stroke();
          break;
        case 'building':
          ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(it.x - it.w / 2 + 3, it.y - it.h / 2 + 4, it.w, it.h);
          ctx.fillStyle = it.color; ctx.fillRect(it.x - it.w / 2, it.y - it.h / 2, it.w, it.h);
          ctx.strokeStyle = it.glow; ctx.globalAlpha = 0.65; ctx.lineWidth = 0.4;
          ctx.strokeRect(it.x - it.w / 2 + 0.6, it.y - it.h / 2 + 0.6, it.w - 1.2, it.h - 1.2);
          ctx.globalAlpha = 0.35; ctx.fillStyle = it.glow;
          for (let wx = it.x - it.w / 2 + 2.5; wx < it.x + it.w / 2 - 2; wx += 3.2)
            for (let wy = it.y - it.h / 2 + 2.5; wy < it.y + it.h / 2 - 2; wy += 3.2)
              if (((wx * 7 + wy * 13) | 0) % 3 === 0) ctx.fillRect(wx, wy, 1.2, 1.2);
          ctx.globalAlpha = 1;
          break;
        case 'lamp': {
          const g = ctx.createRadialGradient(it.x, it.y, 0, it.x, it.y, 11);
          g.addColorStop(0, 'rgba(255,220,160,0.32)'); g.addColorStop(1, 'rgba(255,220,160,0)');
          ctx.fillStyle = g; ctx.beginPath(); ctx.arc(it.x, it.y, 11, 0, 7); ctx.fill();
          ctx.fillStyle = '#ffe9b8'; ctx.beginPath(); ctx.arc(it.x, it.y, 0.55, 0, 7); ctx.fill();
          break;
        }
      }
    }
  }

  // Small outline for menus and the minimap.
  drawOutline(ctx, w, h, pad, opts = {}) {
    const b = this.bounds, sx = (w - pad * 2) / (b.maxX - b.minX), sy = (h - pad * 2) / (b.maxY - b.minY);
    const s = Math.min(sx, sy);
    const ox = (w - (b.maxX - b.minX) * s) / 2 - b.minX * s, oy = (h - (b.maxY - b.minY) * s) / 2 - b.minY * s;
    ctx.beginPath();
    for (let i = 0; i <= this.n; i += 2) {
      const k = i % this.n;
      const px = ox + this.x[k] * s, py = oy + this.y[k] * s;
      i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.lineJoin = 'round';
    ctx.strokeStyle = opts.under || 'rgba(255,255,255,0.15)'; ctx.lineWidth = opts.width ? opts.width + 3 : 6; ctx.stroke();
    ctx.strokeStyle = opts.color || '#f6f6f7'; ctx.lineWidth = opts.width || 3; ctx.stroke();
    // start mark
    ctx.fillStyle = '#ff6b1a';
    ctx.beginPath(); ctx.arc(ox + this.x[0] * s, oy + this.y[0] * s, (opts.width || 3) * 1.1, 0, 7); ctx.fill();
    return { s, ox, oy };
  }
}
