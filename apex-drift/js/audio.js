// All sound is made live with the Web Audio API: engine, tyre squeal, grass rumble, hits and UI blips.

export class Sound {
  constructor() { this.ctx = null; this.on = true; this.vol = 0.8; }

  // browsers only allow audio after a click or key press
  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const c = (this.ctx = new AC());
    this.master = c.createGain();
    this.master.gain.value = this.on ? this.vol : 0;
    const comp = c.createDynamicsCompressor();
    this.master.connect(comp); comp.connect(c.destination);

    // engine: two detuned oscillators through a low-pass filter
    this.engGain = c.createGain(); this.engGain.gain.value = 0;
    this.engFilter = c.createBiquadFilter(); this.engFilter.type = 'lowpass'; this.engFilter.frequency.value = 900; this.engFilter.Q.value = 3;
    this.o1 = c.createOscillator(); this.o1.type = 'sawtooth';
    this.o2 = c.createOscillator(); this.o2.type = 'square';
    this.o3 = c.createOscillator(); this.o3.type = 'sine';
    const g2 = c.createGain(); g2.gain.value = 0.35;
    const g3 = c.createGain(); g3.gain.value = 0.6;
    this.o1.connect(this.engFilter); this.o2.connect(g2); g2.connect(this.engFilter); this.o3.connect(g3); g3.connect(this.engGain);
    this.engFilter.connect(this.engGain); this.engGain.connect(this.master);
    this.o1.start(); this.o2.start(); this.o3.start();

    // noise for tyres and grass
    const len = c.sampleRate * 2, buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noiseBuf = buf;
    const n1 = c.createBufferSource(); n1.buffer = buf; n1.loop = true;
    this.tyreFilter = c.createBiquadFilter(); this.tyreFilter.type = 'bandpass'; this.tyreFilter.frequency.value = 1700; this.tyreFilter.Q.value = 6;
    this.tyreGain = c.createGain(); this.tyreGain.gain.value = 0;
    n1.connect(this.tyreFilter); this.tyreFilter.connect(this.tyreGain); this.tyreGain.connect(this.master);
    n1.start();
    const n2 = c.createBufferSource(); n2.buffer = buf; n2.loop = true; n2.playbackRate.value = 0.5;
    this.grassFilter = c.createBiquadFilter(); this.grassFilter.type = 'lowpass'; this.grassFilter.frequency.value = 320;
    this.grassGain = c.createGain(); this.grassGain.gain.value = 0;
    n2.connect(this.grassFilter); this.grassFilter.connect(this.grassGain); this.grassGain.connect(this.master);
    n2.start();
  }

  setOn(on) {
    this.on = on;
    if (this.master) this.master.gain.setTargetAtTime(on ? this.vol : 0, this.ctx.currentTime, 0.05);
  }

  pause(p) { if (!this.ctx) return; p ? this.ctx.suspend() : this.ctx.resume(); }

  // called every frame while driving
  car(car, active) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime, k = 0.04;
    if (!active) {
      this.engGain.gain.setTargetAtTime(0, t, 0.1); this.tyreGain.gain.setTargetAtTime(0, t, 0.1); this.grassGain.gain.setTargetAtTime(0, t, 0.1);
      return;
    }
    const f = (car.rpm / 60) * 2; // four-cylinder firing frequency
    this.o1.frequency.setTargetAtTime(f, t, k);
    this.o2.frequency.setTargetAtTime(f * 0.5 * 1.006, t, k);
    this.o3.frequency.setTargetAtTime(f * 0.25, t, k);
    const thr = car.throttle || 0;
    this.engFilter.frequency.setTargetAtTime(500 + thr * 1800 + car.rpm * 0.12, t, k);
    this.engGain.gain.setTargetAtTime(0.06 + thr * 0.1 + car.rpm / 90000, t, k);
    const slip = Math.min(1, Math.max(0, (car.rearSlip - 2) / 8));
    const squeal = car.onGrass ? 0 : slip;
    this.tyreGain.gain.setTargetAtTime(squeal * 0.16, t, 0.05);
    this.tyreFilter.frequency.setTargetAtTime(1300 + squeal * 700 + car.speed * 6, t, 0.05);
    this.grassGain.gain.setTargetAtTime(car.onGrass ? Math.min(0.5, car.speed / 40) : 0, t, 0.05);
  }

  hit(power) {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime;
    const src = c.createBufferSource(); src.buffer = this.noiseBuf;
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 600 + power * 120;
    const g = c.createGain(); g.gain.setValueAtTime(Math.min(0.9, 0.15 + power * 0.06), t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t, Math.random()); src.stop(t + 0.4);
  }

  tone(freq, dur = 0.12, type = 'square', vol = 0.12, slide = 0) {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime;
    const o = c.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(freq * slide, t + dur);
    const g = c.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur + 0.02);
  }

  blip() { this.tone(660, 0.06, 'square', 0.06); }
  count(go) { this.tone(go ? 880 : 440, go ? 0.45 : 0.22, 'square', 0.12); }
  bank(mult) { this.tone(520 + mult * 90, 0.12, 'triangle', 0.14); setTimeout(() => this.tone(780 + mult * 120, 0.2, 'triangle', 0.12), 80); }
  lost() { this.tone(300, 0.35, 'sawtooth', 0.1, 0.5); }
  lap(best) { this.tone(best ? 990 : 740, 0.18, 'triangle', 0.14); if (best) setTimeout(() => this.tone(1320, 0.3, 'triangle', 0.12), 120); }
  win() { [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => this.tone(f, 0.25, 'triangle', 0.13), i * 110)); }
}
