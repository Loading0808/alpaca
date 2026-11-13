// Points, combo multiplier, personal bests and the leaderboard.
//
// Rules (the same for every car, so the board is fair):
//  * Close overtake   60–300 pts by how tight the pass was, scaled by speed.
//  * Weave            +150 when consecutive close overtakes alternate sides within 3 s.
//  * Clean overtake   +25 for passing with room to spare.
//  * High speed       points every second above the map's speed threshold.
//  * Drift            angle × speed while sliding; banked when the drift ends cleanly.
//  * Every scoring manoeuvre raises the multiplier (max ×8). It lasts 6 s and is
//    refreshed by the next manoeuvre; let it run out and it falls back to ×1.
//  * Hitting a wall drops the multiplier and cancels the current drift.
//  * Hitting traffic ends the run: the points earned so far are banked to the board.
const STORE = 'apex-garage-scores-v1';
const MAX_MULT = 8, COMBO_TIME = 6;

// Reference scores to aim for. They are labelled as targets on the board, not real players.
const TARGETS = {
  highway: [['Gold target', 150000], ['Silver target', 60000], ['Bronze target', 20000]],
  circuit: [['Gold target', 40000], ['Silver target', 15000], ['Bronze target', 5000]],
  city: [['Gold target', 40000], ['Silver target', 15000], ['Bronze target', 5000]],
};

function load() { try { return JSON.parse(localStorage.getItem(STORE)) || {}; } catch (_) { return {}; } }
function save(d) { try { localStorage.setItem(STORE, JSON.stringify(d)); } catch (_) { /* storage unavailable */ } }

export const Records = {
  name() { return load().name || 'Player 1'; },
  setName(n) { const d = load(); d.name = (n || '').trim().slice(0, 18) || 'Player 1'; save(d); return d.name; },
  /** Top 10 for a map, merged with the reference targets. */
  board(world) {
    const rows = (load().boards?.[world] || []).map(r => ({ ...r }));
    for (const [name, score] of TARGETS[world] || []) rows.push({ name, score, car: '—', target: true });
    return rows.sort((a, b) => b.score - a.score).slice(0, 12);
  },
  best(world, name = Records.name()) { return Math.max(0, ...(load().boards?.[world] || []).filter(r => r.name === name).map(r => r.score)); },
  /** Store a finished run. Returns { rank, pb } (rank among real entries, 1-based; 0 if it did not make the top 10). */
  submit(world, score, car) {
    score = Math.round(score); if (score <= 0) return { rank: 0, pb: false };
    const d = load(), name = d.name || 'Player 1'; d.boards = d.boards || {};
    const list = d.boards[world] = d.boards[world] || [], prev = Math.max(0, ...list.filter(r => r.name === name).map(r => r.score));
    const row = { name, score, car, ts: Date.now() };
    list.push(row); list.sort((a, b) => b.score - a.score); list.length = Math.min(list.length, 10);
    save(d);
    return { rank: list.indexOf(row) + 1, pb: score > prev };
  },
  clear(world) { const d = load(); if (d.boards) delete d.boards[world]; save(d); },
};

export class Score {
  constructor() { this.onEvent = null; this.reset('highway', ''); }

  reset(world, car) {
    this.world = world; this.car = car; this.speedMin = world === 'highway' ? 140 : 170;
    this.score = 0; this.mult = 1; this.combo = 0; this.comboT = 0; this.drift = 0; this.driftGap = 0; this.lastSide = 0; this.lastPassT = -9; this.t = 0;
    this.best = Records.best(world); this.stats = { close: 0, weave: 0, drift: 0, top: 0 };
  }

  _emit(label, pts, kind = 'good') { if (this.onEvent) this.onEvent({ label, pts: Math.round(pts), kind }); }
  _bump(step) { this.mult = Math.min(MAX_MULT, +(this.mult + step).toFixed(2)); this.combo++; this.comboT = COMBO_TIME; }
  _add(pts) { const p = pts * this.mult; this.score += p; return p; }

  /** Player passed a traffic car. gap = lateral clearance in metres, side = ±1, kmh = player speed. */
  pass(gap, side, kmh) {
    const sp = Math.min(2.2, Math.max(0.5, kmh / 130));
    if (gap < 1.6) {
      const close = 1 - Math.max(0, gap) / 1.6, p = this._add((60 + 240 * close) * sp);
      this.stats.close++; this._emit(close > 0.7 ? 'Razor-close overtake' : 'Close overtake', p);
      if (this.t - this.lastPassT < 3 && side !== this.lastSide && this.lastSide) { this.stats.weave++; this._emit('Weave', this._add(150 * sp)); this._bump(0.3); }
      this._bump(0.2 + 0.2 * close);
      this.lastSide = side; this.lastPassT = this.t;
    } else if (gap < 4.5) { this._emit('Overtake', this._add(25 * sp), 'minor'); this.comboT = Math.max(this.comboT, 3); }
  }

  /** Per-frame scoring. slipDeg = body slip angle in degrees, clean = false while off-road. */
  tick(dt, kmh, slipDeg, clean = true) {
    this.t += dt; this.stats.top = Math.max(this.stats.top, kmh);
    if (clean && kmh > this.speedMin) this.score += (kmh - this.speedMin + 20) * 0.6 * this.mult * dt;
    // drifting
    if (clean && slipDeg > 10 && kmh > 40) { this.drift += dt * slipDeg * kmh * 0.045; this.driftGap = 0; }
    else if (this.drift > 0) {
      this.driftGap += dt;
      if (this.driftGap > 0.7) { if (this.drift >= 40) { this.stats.drift++; this._emit('Drift', this._add(this.drift)); this._bump(0.15 + Math.min(0.5, this.drift / 1500)); } this.drift = 0; }
    }
    if (this.comboT > 0) { this.comboT -= dt; if (this.comboT <= 0) { if (this.mult > 1) this._emit('Combo ended', 0, 'minor'); this.mult = 1; this.combo = 0; } }
  }

  wall() { if (this.mult > 1 || this.drift > 0) this._emit('Wall hit — multiplier lost', 0, 'bad'); this.mult = 1; this.combo = 0; this.comboT = 0; this.drift = 0; }

  /** Ends the run and stores it. Returns the banked result, or null if there was nothing to bank. */
  bank(reason = 'Run banked') {
    const total = Math.round(this.score + (this.drift >= 40 ? this.drift * this.mult : 0));
    const res = total > 0 ? { total, reason, ...Records.submit(this.world, total, this.car), stats: this.stats } : null;
    const w = this.world, c = this.car; this.reset(w, c);
    if (res && this.onBank) this.onBank(res);
    if (res) this._emit(`${reason}: ${res.total.toLocaleString('en-US')} pts${res.pb ? ' — new personal best' : ''}`, 0, res.pb ? 'good' : 'bad');
    return res;
  }

  crash() { return this.bank('Crashed'); }
}
