// Tyre smoke, sparks, grass dust and skid marks.

export class FX {
  constructor() {
    this.parts = [];
    this.max = 520;
    // skid marks: a ring buffer of line segments [x1,y1,x2,y2,alpha]
    this.skidCap = 7000;
    this.skids = new Float32Array(this.skidCap * 5);
    this.skidN = 0; this.skidHead = 0;
    this.lastWheels = null;
  }

  clear() { this.parts.length = 0; this.skidN = 0; this.skidHead = 0; this.lastWheels = null; }

  smoke(x, y, vx, vy, amount, color) {
    if (this.parts.length >= this.max) this.parts.shift();
    this.parts.push({ k: 0, x, y, vx: vx * 0.25 + (Math.random() - 0.5) * 2, vy: vy * 0.25 + (Math.random() - 0.5) * 2,
      life: 0, max: 1.2 + Math.random() * 0.9, r: 0.6 + Math.random() * 0.5, grow: 2.2 + amount * 1.6,
      a: Math.min(0.5, 0.16 + amount * 0.18), c: color });
  }

  dust(x, y, vx, vy, color) {
    if (this.parts.length >= this.max) this.parts.shift();
    this.parts.push({ k: 0, x, y, vx: vx * 0.15 + (Math.random() - 0.5) * 3, vy: vy * 0.15 + (Math.random() - 0.5) * 3,
      life: 0, max: 0.6 + Math.random() * 0.5, r: 0.4, grow: 2.5, a: 0.35, c: color });
  }

  sparks(x, y, nx, ny, n) {
    for (let i = 0; i < n; i++) {
      if (this.parts.length >= this.max) this.parts.shift();
      const a = Math.atan2(ny, nx) + (Math.random() - 0.5) * 2.2, s = 6 + Math.random() * 14;
      this.parts.push({ k: 1, x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0, max: 0.25 + Math.random() * 0.3 });
    }
  }

  skid(wheels, strength) {
    if (!this.lastWheels) { this.lastWheels = wheels.map((w) => ({ ...w })); return; }
    if (strength > 0.05) {
      for (let i = 0; i < wheels.length; i++) {
        const a = this.lastWheels[i], b = wheels[i];
        const dx = b.x - a.x, dy = b.y - a.y;
        if (dx * dx + dy * dy > 9) continue; // teleported
        const o = this.skidHead * 5;
        this.skids[o] = a.x; this.skids[o + 1] = a.y; this.skids[o + 2] = b.x; this.skids[o + 3] = b.y;
        this.skids[o + 4] = Math.min(1, strength);
        this.skidHead = (this.skidHead + 1) % this.skidCap;
        this.skidN = Math.min(this.skidCap, this.skidN + 1);
      }
    }
    for (let i = 0; i < wheels.length; i++) { this.lastWheels[i].x = wheels[i].x; this.lastWheels[i].y = wheels[i].y; }
  }

  breakSkid() { this.lastWheels = null; }

  update(dt) {
    const p = this.parts;
    let j = 0;
    for (let i = 0; i < p.length; i++) {
      const q = p[i];
      q.life += dt;
      if (q.life >= q.max) continue;
      q.x += q.vx * dt; q.y += q.vy * dt;
      const drag = q.k ? 0.9 : 0.94;
      q.vx *= Math.pow(drag, dt * 60); q.vy *= Math.pow(drag, dt * 60);
      p[j++] = q;
    }
    p.length = j;
  }

  drawSkids(ctx, color, view) {
    if (!this.skidN) return;
    ctx.strokeStyle = color;
    ctx.lineCap = 'round';
    ctx.lineWidth = 0.32;
    const s = this.skids;
    // two passes: faint and strong marks
    for (const pass of [0, 1]) {
      ctx.globalAlpha = pass ? 0.9 : 0.45;
      ctx.beginPath();
      for (let i = 0; i < this.skidN; i++) {
        const o = i * 5;
        if ((s[o + 4] > 0.55) !== !!pass) continue;
        const x = s[o], y = s[o + 1];
        if (x < view.x0 || x > view.x1 || y < view.y0 || y > view.y1) continue;
        ctx.moveTo(x, y); ctx.lineTo(s[o + 2], s[o + 3]);
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  draw(ctx) {
    for (const q of this.parts) {
      const t = q.life / q.max;
      if (q.k === 1) {
        ctx.strokeStyle = `rgba(255,${(200 - t * 120) | 0},60,${1 - t})`;
        ctx.lineWidth = 0.16;
        ctx.beginPath(); ctx.moveTo(q.x, q.y); ctx.lineTo(q.x - q.vx * 0.03, q.y - q.vy * 0.03); ctx.stroke();
      } else {
        const r = q.r + q.grow * t;
        const c = q.c;
        ctx.fillStyle = `rgba(${c[0]},${c[1]},${c[2]},${q.a * (1 - t) * (t < 0.1 ? t * 10 : 1)})`;
        ctx.beginPath(); ctx.arc(q.x, q.y, r, 0, 6.283); ctx.fill();
      }
    }
  }
}
