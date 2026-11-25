// Keyboard, touch buttons and gamepad, merged into one { steer, throttle, brake, handbrake }.

const KEYS = {
  left: ['KeyA', 'ArrowLeft'], right: ['KeyD', 'ArrowRight'],
  up: ['KeyW', 'ArrowUp'], down: ['KeyS', 'ArrowDown'],
  hand: ['Space'],
};
const ACTIONS = { KeyR: 'reset', Escape: 'pause', KeyP: 'pause', KeyC: 'camera', KeyM: 'mute', Enter: 'enter' };

export class Input {
  constructor() {
    this.down = new Set();
    this.touch = { left: false, right: false, up: false, down: false, hand: false };
    this.handlers = {};
    this.state = { steer: 0, throttle: 0, brake: 0, handbrake: false };
    this.usedTouch = false;
    window.addEventListener('keydown', (e) => {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
      if (!e.repeat && ACTIONS[e.code]) this.fire(ACTIONS[e.code], e);
      this.down.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.down.delete(e.code));
    window.addEventListener('blur', () => { this.down.clear(); for (const k in this.touch) this.touch[k] = false; this.fire('blur'); });
    this.padPrev = {};
  }

  on(name, fn) { this.handlers[name] = fn; }
  fire(name, e) { if (this.handlers[name]) this.handlers[name](e); }

  // on-screen buttons: elements with data-touch="left|right|up|down|hand"
  bindTouch(root) {
    for (const el of root.querySelectorAll('[data-touch]')) {
      const k = el.dataset.touch;
      const set = (v) => (e) => { e.preventDefault(); this.touch[k] = v; el.classList.toggle('on', v); if (v) this.usedTouch = true; };
      el.addEventListener('pointerdown', (e) => { el.setPointerCapture?.(e.pointerId); set(true)(e); });
      el.addEventListener('pointerup', set(false));
      el.addEventListener('pointercancel', set(false));
      el.addEventListener('lostpointercapture', set(false));
      el.addEventListener('contextmenu', (e) => e.preventDefault());
    }
  }

  key(name) { return KEYS[name].some((c) => this.down.has(c)) || this.touch[name]; }

  poll() {
    const s = this.state;
    let steer = (this.key('right') ? 1 : 0) - (this.key('left') ? 1 : 0);
    let throttle = this.key('up') ? 1 : 0;
    let brake = this.key('down') ? 1 : 0;
    let hand = this.key('hand');
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const p of pads) {
      if (!p || !p.connected) continue;
      const ax = p.axes[0] || 0;
      if (Math.abs(ax) > 0.12) steer = Math.sign(ax) * Math.min(1, (Math.abs(ax) - 0.12) / 0.8);
      const b = (i) => (p.buttons[i] ? p.buttons[i].value || (p.buttons[i].pressed ? 1 : 0) : 0);
      throttle = Math.max(throttle, b(7));
      brake = Math.max(brake, b(6));
      if (b(0) > 0.5 || b(1) > 0.5 || b(5) > 0.5) hand = true;
      const edge = (i, name) => { const v = b(i) > 0.5; if (v && !this.padPrev[i]) this.fire(name); this.padPrev[i] = v; };
      edge(9, 'pause'); edge(3, 'reset'); edge(2, 'camera');
      break;
    }
    s.steer = steer; s.throttle = throttle; s.brake = brake; s.handbrake = hand;
    return s;
  }
}
