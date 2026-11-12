// Fully synthesised engine audio (Web Audio API) — no sample files needed.
//
// How the engine note is built:
//  * Every exhaust pulse is a short burst that rings at the exhaust system's own
//    resonances. Those resonances are FIXED in frequency (as in a real pipe); only
//    the spacing between pulses changes with rpm. That is what makes an engine
//    sound like an engine instead of a pitched-up recording.
//  * Pulses are laid out with the engine's real firing pattern (even-fire, odd-fire
//    V10, cross-plane V8 bank imbalance, unequal-length boxer headers, rotary).
//  * Seven loops are rendered at different rpm and cross-faded, so each loop is only
//    ever pitch-shifted by a small amount.
//  * On top: firing-frequency body tone, valvetrain tick, induction roar, turbo
//    whistle + blow-off, supercharger whine, overrun burble/pops, rev limiter,
//    starter motor, room reverb, and road / wind / tyre noise when driving.

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const smooth = t => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
const TAU = Math.PI * 2;

export class EngineAudio {
  constructor() {
    this.ctx = null; this.cfg = null; this.nodes = null;
    this.volume = 0.8; this.spool = 0; this.prevThrottle = 0; this.prevRpm = 0; this.burble = 1;
    this.onPop = null; this.active = false; this.reverbAmt = 0.22;
  }

  ensure() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      const ctx = this.ctx = new AC(), sr = ctx.sampleRate;
      this.master = ctx.createGain(); this.master.gain.value = this.volume;
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -16; comp.ratio.value = 5; comp.attack.value = 0.004; comp.release.value = 0.18;
      this.master.connect(comp); comp.connect(ctx.destination);
      this.noise = ctx.createBuffer(1, sr * 2, sr);
      const d = this.noise.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      // room reverb (synthetic impulse response)
      const ir = ctx.createBuffer(2, Math.floor(sr * 1.1), sr);
      for (let c = 0; c < 2; c++) { const a = ir.getChannelData(c); let lp = 0; for (let i = 0; i < a.length; i++) { const t = i / sr; lp += (Math.random() * 2 - 1 - lp) * 0.35; a[i] = lp * Math.exp(-t / 0.22) * (t < 0.004 ? t / 0.004 : 1); } }
      this.reverb = ctx.createConvolver(); this.reverb.buffer = ir;
      this.revSend = ctx.createGain(); this.revSend.gain.value = this.reverbAmt;
      this.bus = ctx.createGain();                      // everything engine-related goes through here
      this.bus.connect(this.master); this.bus.connect(this.revSend); this.revSend.connect(this.reverb); this.reverb.connect(this.master);
      // road layers (silent until driving)
      const layer = (type, f, q) => { const s = this._noiseSrc(), fl = ctx.createBiquadFilter(), g = ctx.createGain(); fl.type = type; fl.frequency.value = f; fl.Q.value = q; g.gain.value = 0; s.connect(fl); fl.connect(g); g.connect(this.master); s.start(); return { f: fl, g }; };
      this.wind = layer('bandpass', 600, 0.5); this.road = layer('lowpass', 260, 0.7); this.squeal = layer('bandpass', 1150, 7); this.skid = layer('bandpass', 420, 1.2);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return true;
  }

  setVolume(v) { this.volume = v; if (this.master) this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.03); }
  setReverb(v) { this.reverbAmt = v; if (this.revSend) this.revSend.gain.setTargetAtTime(v, this.ctx.currentTime, 0.2); }

  /** Road noise while driving: speed in m/s, slip 0..1 (tyres sliding), offroad 0..1. */
  setRoad(speed, slip = 0, offroad = 0) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime, v = Math.abs(speed), set = (p, x) => p.setTargetAtTime(x, t, 0.06);
    set(this.wind.g.gain, Math.min(0.5, v * v / 9000)); set(this.wind.f.frequency, 350 + v * 14);
    set(this.road.g.gain, Math.min(0.35, v / 160) + offroad * Math.min(0.5, v / 30)); set(this.road.f.frequency, 180 + v * 5 + offroad * 500);
    const sq = v > 4 ? smooth((slip - 0.25) / 0.6) : 0;
    set(this.squeal.g.gain, sq * 0.2 * (1 - offroad)); set(this.squeal.f.frequency, 950 + sq * 350 + Math.sin(t * 9) * 40);
    set(this.skid.g.gain, sq * 0.22);
  }

  /** cfg = { engine, turbo, sc, exhaust, intake } (catalogue objects) */
  configure(cfg) {
    const engineChanged = !this.cfg || this.cfg.engine.id !== cfg.engine.id;
    this.cfg = cfg;
    if (engineChanged) this.loops = null;
    if (this.active) { this._teardown(0.05); this._setup(); }
  }

  _firing(e) {
    const n = e.cyl, offs = [];
    if (e.oddfire) { let a = 0; for (let i = 0; i < n; i++) { offs.push(a / 720); a += i % 2 ? 90 : 54; } }
    else for (let i = 0; i < n; i++) offs.push(i / n);
    return offs;
  }

  /** Render one loop of the exhaust note at a fixed rpm. */
  _makeLoop(e, rpm) {
    const ctx = this.ctx, sr = ctx.sampleRate, cyc = 120 / rpm, cycles = Math.max(4, Math.ceil(0.4 / cyc));
    const len = Math.floor(sr * cyc * cycles), buf = ctx.createBuffer(2, len, sr), L = buf.getChannelData(0), R = buf.getChannelData(1);
    const offs = this._firing(e), n = e.cyl, gap = cyc / n, load = clamp(rpm / e.redline, 0, 1);
    const f1 = e.tone, f2 = e.tone * 2.63, f3 = e.tone * 5.1 * (0.9 + 0.3 * load);
    const tau1 = Math.min(0.016, gap * 1.6 + 0.003), tau2 = tau1 * 0.55, tau3 = 0.0022;
    const jit = 0.012 + (e.lump || 0) * 0.03;
    for (let c = 0; c < cycles; c++) for (let k = 0; k < n; k++) {
      const bank = e.pattern ? e.pattern[k % e.pattern.length] : k % 2;
      const amp = (e.amps ? e.amps[k % e.amps.length] : 1) * (bank && e.pattern ? 0.74 : 1) * (1 + (Math.random() - 0.5) * (0.22 + (e.lump || 0) * 0.5));
      const det = (bank ? 1.07 : 1) * (1 + (Math.random() - 0.5) * 0.025), pan = e.kind === 'i' ? 0.5 : (bank ? 0.7 : 0.3);
      const i0 = Math.floor(((c + offs[k]) * cyc + (Math.random() - 0.5) * gap * jit * 2) * sr + len) % len;
      const span = Math.floor(Math.min(tau1 * 6, cyc * 1.5) * sr), ph = Math.random() * 0.5, nz = e.noise * (0.7 + 0.9 * load);
      let lpn = 0;
      for (let i = 0; i < span; i++) {
        const t = i / sr, att = 1 - Math.exp(-t / 0.0004);
        lpn += (Math.random() * 2 - 1 - lpn) * 0.5;
        const s = amp * att * (
          Math.exp(-t / tau1) * Math.sin(TAU * f1 * det * t + ph)
          + 0.6 * Math.exp(-t / tau2) * Math.sin(TAU * f2 * det * t + 1.1)
          + (0.22 + 0.3 * load) * Math.exp(-t / tau3) * Math.sin(TAU * f3 * t)
          + nz * Math.exp(-t / (tau2 * 0.8)) * lpn);
        const idx = (i0 + i) % len; L[idx] += s * (1 - pan) * 2; R[idx] += s * pan * 2;
      }
    }
    let peak = 0; for (let i = 0; i < len; i++) peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
    const kN = 0.8 / (peak || 1); for (let i = 0; i < len; i++) { L[i] *= kN; R[i] *= kN; }
    return buf;
  }

  /** Valvetrain / injector tick loop (one engine cycle at 1000 rpm). */
  _makeTicks(e) {
    const sr = this.ctx.sampleRate, cyc = 0.12, len = Math.floor(sr * cyc * 4), buf = this.ctx.createBuffer(1, len, sr), d = buf.getChannelData(0);
    for (let c = 0; c < 4; c++) for (let k = 0; k < e.cyl * 2; k++) {
      const i0 = Math.floor((c + (k + Math.random() * 0.1) / (e.cyl * 2)) * cyc * sr), a = 0.5 + Math.random() * 0.5;
      for (let i = 0; i < sr * 0.0025; i++) d[(i0 + i) % len] += a * (Math.random() * 2 - 1) * Math.exp(-i / (sr * 0.0006));
    }
    return buf;
  }

  _noiseSrc() { const s = this.ctx.createBufferSource(); s.buffer = this.noise; s.loop = true; s.loopStart = Math.random(); return s; }

  _setup() {
    const ctx = this.ctx, c = this.cfg, e = c.engine, N = {};
    if (!this.loops) {
      const refs = [850, 1500, 2400, 3500, 4800, 6300, 8000].filter((r, i) => i < 3 || r < e.redline * 1.02);
      this.loops = { refs, bufs: refs.map(r => this._makeLoop(e, r)), ticks: this._makeTicks(e) };
    }
    N.out = ctx.createGain(); N.out.gain.value = 0; N.out.connect(this.bus);
    // exhaust chain: load gain -> saturation -> tone filter -> two fixed muffler resonances
    N.pre = ctx.createGain(); N.pre.gain.value = 0.5;
    N.shaper = ctx.createWaveShaper();
    const curve = new Float32Array(2048), drive = c.exhaust.drive;
    for (let i = 0; i < 2048; i++) { const x = i / 1024 - 1; curve[i] = (Math.tanh(x * drive) + 0.12 * Math.tanh(x * drive * 3) * (1 - x * x)) / Math.tanh(drive); }
    N.shaper.curve = curve; N.shaper.oversample = '2x';
    N.lp = ctx.createBiquadFilter(); N.lp.type = 'lowpass'; N.lp.frequency.value = c.exhaust.cutoff; N.lp.Q.value = 0.7;
    N.res1 = ctx.createBiquadFilter(); N.res1.type = 'peaking'; N.res1.frequency.value = e.tone * 1.05; N.res1.Q.value = 1.4; N.res1.gain.value = 6;
    N.res2 = ctx.createBiquadFilter(); N.res2.type = 'peaking'; N.res2.frequency.value = 420 + e.tone * 2.2; N.res2.Q.value = 2; N.res2.gain.value = 3 + c.exhaust.vol * 4;
    N.hp = ctx.createBiquadFilter(); N.hp.type = 'highpass'; N.hp.frequency.value = 28;
    N.eng = ctx.createGain(); N.eng.gain.value = 0;
    N.pre.connect(N.shaper); N.shaper.connect(N.lp); N.lp.connect(N.res1); N.res1.connect(N.res2); N.res2.connect(N.hp); N.hp.connect(N.eng); N.eng.connect(N.out);
    N.bands = this.loops.bufs.map(b => {
      const s = ctx.createBufferSource(); s.buffer = b; s.loop = true; const g = ctx.createGain(); g.gain.value = 0;
      s.connect(g); g.connect(N.pre); s.start(0, Math.random() * b.duration); return { s, g };
    });
    // firing-frequency body tone (adds weight low down)
    N.bO = ctx.createOscillator(); N.bO.type = 'triangle'; N.bG = ctx.createGain(); N.bG.gain.value = 0;
    N.bO.connect(N.bG); N.bG.connect(N.lp); N.bO.start();
    // valvetrain tick
    N.tk = ctx.createBufferSource(); N.tk.buffer = this.loops.ticks; N.tk.loop = true;
    N.tkF = ctx.createBiquadFilter(); N.tkF.type = 'bandpass'; N.tkF.frequency.value = 3800; N.tkF.Q.value = 0.8;
    N.tkG = ctx.createGain(); N.tkG.gain.value = 0; N.tk.connect(N.tkF); N.tkF.connect(N.tkG); N.tkG.connect(N.out); N.tk.start();
    // induction
    N.inS = this._noiseSrc(); N.inF = ctx.createBiquadFilter(); N.inF.type = 'bandpass'; N.inF.Q.value = 1.6;
    N.inF2 = ctx.createBiquadFilter(); N.inF2.type = 'peaking'; N.inF2.frequency.value = 520; N.inF2.Q.value = 3; N.inF2.gain.value = 9;
    N.inG = ctx.createGain(); N.inG.gain.value = 0; N.inS.connect(N.inF); N.inF.connect(N.inF2); N.inF2.connect(N.inG); N.inG.connect(N.out); N.inS.start();
    // turbo
    if (c.turbo.id !== 'none') {
      N.tO = ctx.createOscillator(); N.tO.type = 'sine'; N.tO2 = ctx.createOscillator(); N.tO2.type = 'sine';
      N.tG = ctx.createGain(); N.tG.gain.value = 0; N.tO.connect(N.tG); N.tO2.connect(N.tG); N.tG.connect(N.out); N.tO.start(); N.tO2.start();
      N.tS = this._noiseSrc(); N.tF = ctx.createBiquadFilter(); N.tF.type = 'bandpass'; N.tF.Q.value = 2.2; N.tH = ctx.createGain(); N.tH.gain.value = 0;
      N.tS.connect(N.tF); N.tF.connect(N.tH); N.tH.connect(N.out); N.tS.start();
    }
    // supercharger
    if (c.sc.id !== 'none') {
      N.sO = ctx.createOscillator(); N.sO.type = c.sc.id === 'centri' ? 'triangle' : 'sawtooth';
      N.sO2 = ctx.createOscillator(); N.sO2.type = 'sine';
      N.sF = ctx.createBiquadFilter(); N.sF.type = 'bandpass'; N.sF.Q.value = 3; N.sG = ctx.createGain(); N.sG.gain.value = 0;
      N.sO.connect(N.sF); N.sO2.connect(N.sF); N.sF.connect(N.sG); N.sG.connect(N.out); N.sO.start(); N.sO2.start();
    }
    N.out.gain.setTargetAtTime(1, ctx.currentTime, 0.05);
    this.nodes = N;
  }

  _teardown(fade = 0.25) {
    const N = this.nodes; if (!N) return; this.nodes = null;
    const t = this.ctx.currentTime;
    N.out.gain.cancelScheduledValues(t); N.out.gain.setTargetAtTime(0, t, fade / 3);
    setTimeout(() => {
      for (const n of [...N.bands.map(b => b.s), N.bO, N.tk, N.inS, N.tO, N.tO2, N.tS, N.sO, N.sO2]) { try { n && n.stop(); } catch (_) { /* already stopped */ } }
      N.out.disconnect();
    }, fade * 1000 + 80);
  }

  /** Starter motor: gear whine plus rhythmic compression chug. */
  starter(dur = 0.85) {
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(70, t); o.frequency.linearRampToValueAtTime(128, t + 0.15); o.frequency.setValueAtTime(120, t + dur);
    const o2 = ctx.createOscillator(); o2.type = 'square'; o2.frequency.setValueAtTime(410, t); o2.frequency.linearRampToValueAtTime(760, t + 0.15);
    const g2 = ctx.createGain(); g2.gain.value = 0.05;
    const lfo = ctx.createOscillator(); lfo.type = 'square'; lfo.frequency.value = 11; const lg = ctx.createGain(); lg.gain.value = 14; lfo.connect(lg); lg.connect(o.frequency);
    const lg2 = ctx.createGain(); lg2.gain.value = 60; lfo.connect(lg2); lg2.connect(o2.frequency);
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 700; f.Q.value = 0.7;
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.3, t + 0.04); g.gain.setValueAtTime(0.3, t + dur - 0.05); g.gain.linearRampToValueAtTime(0, t + dur + 0.08);
    o.connect(f); o2.connect(g2); g2.connect(f); f.connect(g); g.connect(this.bus);
    const n = this._noiseSrc(), nf = ctx.createBiquadFilter(); nf.type = 'bandpass'; nf.frequency.value = 1700; nf.Q.value = 1.2;
    const ng = ctx.createGain(); ng.gain.value = 0.11; const am = ctx.createGain(); am.gain.value = 0.11; lfo.connect(am); am.connect(ng.gain);
    n.connect(nf); nf.connect(ng); ng.connect(g);
    for (const s of [o, o2, lfo, n]) { s.start(t); s.stop(t + dur + 0.12); }
  }

  start(silentStarter = false) {
    if (!this.ensure() || !this.cfg) return false;
    this._teardown(0.02);
    if (!silentStarter) this.starter();
    this._setup(); this.active = true; this.spool = 0;
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
    s.connect(f); f.connect(g); g.connect(this.bus); s.start(t); s.stop(t + dur + 0.6);
  }

  blowOff() {
    const k = this.cfg.turbo;
    if (k.bov === 'flutter') this._burst({ dur: 0.6, f0: 2600, f1: 900, q: 2, gain: 0.5, flutter: true });
    else this._burst({ dur: 0.38, f0: 3800, f1: 700, q: 1.4, gain: 0.34 });
  }

  pop(intensity = 1) {
    const ctx = this.ctx, t = ctx.currentTime;
    this._burst({ dur: 0.06 + Math.random() * 0.05, f0: 1500 + Math.random() * 1800, f1: 260, q: 0.7, gain: 0.6 * intensity, type: 'lowpass' });
    const o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.setValueAtTime(120, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.09);
    g.gain.setValueAtTime(0.4 * intensity, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.1); o.connect(g); g.connect(this.bus); o.start(t); o.stop(t + 0.12);
    if (this.onPop) this.onPop(intensity);
  }

  /** Call every frame while the engine runs. Returns the current boost fraction 0..1. */
  update(dt, rpm, throttle, cut = false) {
    const N = this.nodes; if (!N || !this.cfg) return 0;
    const c = this.cfg, e = c.engine, t = this.ctx.currentTime, tc = 0.03, set = (p, v) => p.setTargetAtTime(v, t, tc);
    const r = clamp(rpm / e.redline, 0, 1.1), th = cut ? 0 : throttle, refs = this.loops.refs;
    // equal-power cross-fade between the two loops that bracket the current rpm
    let i = 0; while (i < refs.length - 2 && rpm > refs[i + 1]) i++;
    const x = clamp(Math.log(Math.max(rpm, 200) / refs[i]) / Math.log(refs[i + 1] / refs[i]), 0, 1);
    N.bands.forEach((b, k) => {
      set(b.s.playbackRate, clamp(rpm / refs[k], 0.25, 3));
      set(b.g.gain, k === i ? Math.cos(x * Math.PI / 2) : k === i + 1 ? Math.sin(x * Math.PI / 2) : 0);
    });
    // overrun: closed throttle at speed sounds hollow and burbles
    const overrun = th < 0.06 && rpm > e.idle * 1.5;
    this.burble += ((overrun ? 0.55 + Math.random() * 0.6 : 1) - this.burble) * Math.min(1, dt * 30);
    set(N.pre.gain, 0.3 + 0.9 * th + 0.25 * r);                                  // more load = more saturation = brighter
    set(N.eng.gain, c.exhaust.vol * (0.34 + 0.66 * th) * (0.6 + 0.4 * r) * this.burble * 0.85);
    set(N.lp.frequency, c.exhaust.cutoff * (0.5 + 0.9 * th + 0.45 * r) * (overrun ? 0.7 : 1));
    const ff = rpm / 120 * e.cyl;
    set(N.bO.frequency, Math.max(20, ff * (e.pattern && e.pattern[1] === e.pattern[2] ? 0.5 : 1)));
    set(N.bG.gain, (0.1 + 0.25 * th) * (1 - smooth((rpm - 1500) / 4500)));
    set(N.tk.playbackRate, Math.max(0.2, rpm / 1000)); set(N.tkG.gain, (0.02 + 0.03 * r) * (1 - 0.6 * th));
    set(N.inF.frequency, 160 + rpm * 0.09); set(N.inF2.frequency, 380 + rpm * 0.07);
    set(N.inG.gain, th * c.intake.loud * (0.2 + 0.7 * r) * 0.9);

    let boost = 0;
    if (N.tO) {
      const k = c.turbo, target = th * smooth((r - k.spoolAt) / 0.35);
      const rate = target > this.spool ? 1 / k.lag : 3.5;
      this.spool += (target - this.spool) * (1 - Math.exp(-rate * dt));
      const big = k.id === 'big', f = (big ? 1100 : 1900) + this.spool * (big ? 5200 : 7400);
      set(N.tO.frequency, f); set(N.tO2.frequency, f * 1.503);
      set(N.tG.gain, this.spool * this.spool * (big ? 0.05 : 0.032));
      set(N.tF.frequency, 2500 + this.spool * 4500); set(N.tH.gain, this.spool * (big ? 0.16 : 0.09));
      if (this.prevThrottle > 0.5 && throttle < 0.2 && this.spool > 0.4) { this.blowOff(); this.spool *= 0.25; }
      boost = this.spool;
    }
    if (N.sO) {
      const f = Math.max(60, rpm * c.sc.whine * (c.sc.id === 'centri' ? 1 : 0.9));
      set(N.sO.frequency, f); set(N.sO2.frequency, f * 2.01); set(N.sF.frequency, f * 1.3);
      set(N.sG.gain, c.sc.id === 'centri' ? r * r * (0.05 + 0.12 * th) : 0.03 + (0.05 + 0.12 * th) * r);
      boost = Math.max(boost, c.sc.id === 'centri' ? th * r * r : th * (0.5 + 0.5 * r));
    }
    if (c.exhaust.pops > 0 && th < 0.08 && rpm > e.redline * 0.42 && rpm < this.prevRpm) {
      if (Math.random() < c.exhaust.pops * 9 * dt) this.pop(0.5 + Math.random() * 0.6);
    }
    if (cut && c.exhaust.pops > 0.2 && Math.random() < 14 * dt) this.pop(0.7);
    this.prevThrottle = throttle; this.prevRpm = rpm;
    return boost;
  }
}
