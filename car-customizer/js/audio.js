// Fully synthesised engine audio (Web Audio API) — no sample files needed.
//
// The engine note is built from individual exhaust pulses laid out according
// to the engine's cylinder count and firing pattern, rendered into two looping
// buffers (low-rpm and high-rpm character) that are pitch-shifted with rpm and
// cross-faded. On top of that: starter motor, turbo whistle and blow-off,
// supercharger whine, induction roar, overrun pops and the rev limiter.

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const smooth = t => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };

export class EngineAudio {
  constructor() {
    this.ctx = null; this.cfg = null; this.nodes = null;
    this.volume = 0.8; this.spool = 0; this.prevThrottle = 0; this.prevRpm = 0;
    this.onPop = null; this.active = false;
  }

  ensure() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      this.ctx = new AC();
      this.master = this.ctx.createGain(); this.master.gain.value = this.volume;
      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -14; comp.ratio.value = 5; comp.attack.value = 0.004; comp.release.value = 0.15;
      this.master.connect(comp); comp.connect(this.ctx.destination);
      const sr = this.ctx.sampleRate; this.noise = this.ctx.createBuffer(1, sr * 2, sr);
      const d = this.noise.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return true;
  }

  setVolume(v) { this.volume = v; if (this.master) this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.03); }

  /** cfg = { engine, turbo, sc, exhaust, intake } (catalogue objects) */
  configure(cfg) {
    const engineChanged = !this.cfg || this.cfg.engine.id !== cfg.engine.id;
    this.cfg = cfg;
    if (this.ctx && engineChanged) this.loops = null;
    if (this.active) { this._teardown(0.05); this._setup(); }
  }

  _firing(e) {
    const n = e.cyl, offs = [];
    if (e.oddfire) { let a = 0; for (let i = 0; i < n; i++) { offs.push(a / 720); a += i % 2 ? 90 : 54; } }
    else for (let i = 0; i < n; i++) offs.push(i / n);
    return offs;
  }

  _makeLoop(e, refRpm, hi) {
    const ctx = this.ctx, sr = ctx.sampleRate, cycles = 4, cyc = 120 / refRpm, len = Math.floor(sr * cyc * cycles);
    const buf = ctx.createBuffer(2, len, sr), L = buf.getChannelData(0), R = buf.getChannelData(1);
    const offs = this._firing(e), n = e.cyl, ff = n / cyc;
    for (let c = 0; c < cycles; c++) for (let k = 0; k < n; k++) {
      const bank = e.pattern ? e.pattern[k % e.pattern.length] : k % 2;
      const amp = (e.amps ? e.amps[k % e.amps.length] : 1) * (bank && e.pattern ? 0.78 : 1) * (1 + (Math.random() - 0.5) * (0.2 + (e.lump || 0) * 0.5));
      const f1 = (hi ? ff * 2 : e.tone) * (bank ? 1.09 : 1) * (1 + (Math.random() - 0.5) * 0.03);
      const tau = (cyc / n) * (hi ? 0.75 : 1.5), pan = e.kind === 'i' ? 0.5 : (bank ? 0.72 : 0.28);
      const i0 = Math.floor((c + offs[k]) * cyc * sr), span = Math.floor(tau * 6 * sr);
      const ph = Math.random() * 0.6, nz = e.noise * (hi ? 1.3 : 1);
      for (let i = 0; i < span; i++) {
        const tt = i / sr, env = Math.exp(-tt / tau) * (1 - Math.exp(-tt / 0.0005));
        const s = env * amp * (Math.sin(6.2832 * f1 * tt + ph) + 0.55 * Math.sin(6.2832 * f1 * 2.02 * tt + 1) + 0.3 * Math.sin(6.2832 * f1 * 3.07 * tt) + nz * (Math.random() * 2 - 1));
        const idx = (i0 + i) % len; L[idx] += s * (1 - pan) * 2; R[idx] += s * pan * 2;
      }
    }
    let peak = 0; for (let i = 0; i < len; i++) peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
    const kNorm = 0.85 / (peak || 1); for (let i = 0; i < len; i++) { L[i] *= kNorm; R[i] *= kNorm; }
    return buf;
  }

  _noiseSrc() { const s = this.ctx.createBufferSource(); s.buffer = this.noise; s.loop = true; s.loopStart = Math.random(); return s; }

  _setup() {
    const ctx = this.ctx, c = this.cfg, e = c.engine, N = {};
    if (!this.loops) this.loops = { lo: this._makeLoop(e, 1000, false), hi: this._makeLoop(e, 4000, true) };
    N.out = ctx.createGain(); N.out.gain.value = 0; N.out.connect(this.master);
    // engine core
    N.shaper = ctx.createWaveShaper();
    const curve = new Float32Array(1024), drive = c.exhaust.drive;
    for (let i = 0; i < 1024; i++) { const x = i / 512 - 1; curve[i] = Math.tanh(x * drive) / Math.tanh(drive); }
    N.shaper.curve = curve;
    N.lp = ctx.createBiquadFilter(); N.lp.type = 'lowpass'; N.lp.frequency.value = c.exhaust.cutoff; N.lp.Q.value = 0.9;
    N.body = ctx.createBiquadFilter(); N.body.type = 'peaking'; N.body.frequency.value = 160; N.body.gain.value = 5; N.body.Q.value = 0.8;
    N.eng = ctx.createGain(); N.eng.gain.value = 0;
    N.shaper.connect(N.lp); N.lp.connect(N.body); N.body.connect(N.eng); N.eng.connect(N.out);
    N.src = {};
    for (const key of ['lo', 'hi']) {
      const s = ctx.createBufferSource(); s.buffer = this.loops[key]; s.loop = true;
      const g = ctx.createGain(); g.gain.value = 0; s.connect(g); g.connect(N.shaper); s.start();
      N.src[key] = { s, g };
    }
    // induction
    N.inS = this._noiseSrc(); N.inF = ctx.createBiquadFilter(); N.inF.type = 'bandpass'; N.inF.Q.value = 1.1;
    N.inG = ctx.createGain(); N.inG.gain.value = 0; N.inS.connect(N.inF); N.inF.connect(N.inG); N.inG.connect(N.out); N.inS.start();
    // turbo
    if (c.turbo.id !== 'none') {
      N.tO = ctx.createOscillator(); N.tO.type = 'sine'; N.tG = ctx.createGain(); N.tG.gain.value = 0; N.tO.connect(N.tG); N.tG.connect(N.out); N.tO.start();
      N.tS = this._noiseSrc(); N.tF = ctx.createBiquadFilter(); N.tF.type = 'bandpass'; N.tF.Q.value = 2.5; N.tH = ctx.createGain(); N.tH.gain.value = 0;
      N.tS.connect(N.tF); N.tF.connect(N.tH); N.tH.connect(N.out); N.tS.start();
    }
    // supercharger
    if (c.sc.id !== 'none') {
      N.sO = ctx.createOscillator(); N.sO.type = c.sc.id === 'centri' ? 'triangle' : 'sawtooth';
      N.sF = ctx.createBiquadFilter(); N.sF.type = 'bandpass'; N.sF.Q.value = 3.5; N.sG = ctx.createGain(); N.sG.gain.value = 0;
      N.sO.connect(N.sF); N.sF.connect(N.sG); N.sG.connect(N.out); N.sO.start();
    }
    N.out.gain.setTargetAtTime(1, ctx.currentTime, 0.05);
    this.nodes = N;
  }

  _teardown(fade = 0.25) {
    const N = this.nodes; if (!N) return; this.nodes = null;
    const t = this.ctx.currentTime;
    N.out.gain.cancelScheduledValues(t); N.out.gain.setTargetAtTime(0, t, fade / 3);
    setTimeout(() => {
      for (const n of [N.src.lo.s, N.src.hi.s, N.inS, N.tO, N.tS, N.sO]) { try { n && n.stop(); } catch (_) { /* already stopped */ } }
      N.out.disconnect();
    }, fade * 1000 + 80);
  }

  /** Starter motor: whine plus rhythmic compression chug. */
  starter(dur = 0.85) {
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(70, t); o.frequency.linearRampToValueAtTime(125, t + 0.15); o.frequency.setValueAtTime(118, t + dur);
    const lfo = ctx.createOscillator(); lfo.type = 'square'; lfo.frequency.value = 11; const lg = ctx.createGain(); lg.gain.value = 14; lfo.connect(lg); lg.connect(o.frequency);
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 650; f.Q.value = 0.8;
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.32, t + 0.04); g.gain.setValueAtTime(0.32, t + dur - 0.05); g.gain.linearRampToValueAtTime(0, t + dur + 0.08);
    o.connect(f); f.connect(g); g.connect(this.master);
    const n = this._noiseSrc(), nf = ctx.createBiquadFilter(); nf.type = 'bandpass'; nf.frequency.value = 1700; nf.Q.value = 1.2;
    const ng = ctx.createGain(); ng.gain.value = 0.11; const am = ctx.createGain(); am.gain.value = 0.11; lfo.connect(am); am.connect(ng.gain);
    n.connect(nf); nf.connect(ng); ng.connect(g);
    for (const s of [o, lfo, n]) { s.start(t); s.stop(t + dur + 0.12); }
  }

  start() {
    if (!this.ensure() || !this.cfg) return false;
    this._teardown(0.02);
    this.starter(); this._setup(); this.active = true; this.spool = 0;
    return true;
  }

  stop() { this.active = false; this._teardown(0.35); }

  _burst({ dur, f0, f1, q = 1.2, gain, type = 'bandpass', flutter = false, delay = 0 }) {
    const ctx = this.ctx, t = ctx.currentTime + delay;
    const s = this._noiseSrc(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    f.type = type; f.Q.value = q; f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(Math.max(40, f1), t + dur);
    g.gain.setValueAtTime(0, t);
    if (flutter) {
      let tt = t, a = gain, gap = 0.045;
      for (let i = 0; i < 9; i++) { g.gain.setValueAtTime(a, tt); g.gain.exponentialRampToValueAtTime(0.001, tt + gap * 0.8); tt += gap; a *= 0.8; gap *= 1.13; }
    } else { g.gain.linearRampToValueAtTime(gain, t + 0.006); g.gain.exponentialRampToValueAtTime(0.001, t + dur); }
    s.connect(f); f.connect(g); g.connect(this.master); s.start(t); s.stop(t + dur + 0.6);
  }

  blowOff() {
    const k = this.cfg.turbo;
    if (k.bov === 'flutter') this._burst({ dur: 0.6, f0: 2600, f1: 900, q: 2, gain: 0.5, flutter: true });
    else this._burst({ dur: 0.38, f0: 3800, f1: 700, q: 1.4, gain: 0.34 });
  }

  pop(intensity = 1) {
    const ctx = this.ctx, t = ctx.currentTime;
    this._burst({ dur: 0.07 + Math.random() * 0.05, f0: 1400 + Math.random() * 1500, f1: 300, q: 0.7, gain: 0.55 * intensity, type: 'lowpass' });
    const o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.setValueAtTime(110, t); o.frequency.exponentialRampToValueAtTime(45, t + 0.09);
    g.gain.setValueAtTime(0.35 * intensity, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.1); o.connect(g); g.connect(this.master); o.start(t); o.stop(t + 0.12);
    if (this.onPop) this.onPop(intensity);
  }

  /** Call every frame while the engine runs. Returns the current boost fraction 0..1. */
  update(dt, rpm, throttle, cut = false) {
    const N = this.nodes; if (!N || !this.cfg) return 0;
    const c = this.cfg, e = c.engine, t = this.ctx.currentTime, tc = 0.025, set = (p, v) => p.setTargetAtTime(v, t, tc);
    const r = clamp(rpm / e.redline, 0, 1.1), th = cut ? 0 : throttle;
    set(N.src.lo.s.playbackRate, Math.max(0.1, rpm / 1000)); set(N.src.hi.s.playbackRate, Math.max(0.1, rpm / 4000));
    set(N.src.lo.g.gain, 1 - 0.8 * smooth((rpm - 1600) / 2600)); set(N.src.hi.g.gain, smooth((rpm - 1200) / 2800));
    set(N.eng.gain, c.exhaust.vol * (0.3 + 0.7 * th) * (0.55 + 0.45 * r) * 0.9);
    set(N.lp.frequency, c.exhaust.cutoff * (0.45 + 0.75 * th + 0.5 * r));
    set(N.body.frequency, 110 + 260 * r);
    set(N.inF.frequency, 180 + rpm * 0.11); set(N.inG.gain, th * c.intake.loud * (0.15 + 0.5 * r));

    // turbo spool
    let boost = 0;
    if (N.tO) {
      const k = c.turbo, target = th * smooth((r - k.spoolAt) / 0.35);
      const rate = target > this.spool ? 1 / k.lag : 3.5;
      this.spool += (target - this.spool) * (1 - Math.exp(-rate * dt));
      const big = k.id === 'big';
      set(N.tO.frequency, (big ? 1100 : 1900) + this.spool * (big ? 5200 : 7400));
      set(N.tG.gain, this.spool * this.spool * (big ? 0.06 : 0.04));
      set(N.tF.frequency, 2500 + this.spool * 4500); set(N.tH.gain, this.spool * (big ? 0.16 : 0.09));
      if (this.prevThrottle > 0.5 && throttle < 0.2 && this.spool > 0.4) { this.blowOff(); this.spool *= 0.25; }
      boost = this.spool;
    }
    if (N.sO) {
      const f = Math.max(60, rpm * c.sc.whine * (c.sc.id === 'centri' ? 1 : 0.9));
      set(N.sO.frequency, f); set(N.sF.frequency, f * 1.02);
      const g = c.sc.id === 'centri' ? r * r * (0.05 + 0.12 * th) : 0.03 + (0.05 + 0.12 * th) * r;
      set(N.sG.gain, g);
      boost = Math.max(boost, c.sc.id === 'centri' ? th * r * r : th * (0.5 + 0.5 * r));
    }
    // overrun crackle
    if (c.exhaust.pops > 0 && th < 0.08 && rpm > e.redline * 0.42 && rpm < this.prevRpm) {
      if (Math.random() < c.exhaust.pops * 9 * dt) this.pop(0.5 + Math.random() * 0.6);
    }
    if (cut && c.exhaust.pops > 0.2 && Math.random() < 14 * dt) this.pop(0.7);
    this.prevThrottle = throttle; this.prevRpm = rpm;
    return boost;
  }
}
