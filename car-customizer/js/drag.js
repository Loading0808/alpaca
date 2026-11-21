// Drag race control: staging beams, the Christmas tree, reaction time, split
// times, trap speed and the time slip. Used for solo time trials and for
// multiplayer head-to-head races (where the server fires the tree).
import { DRAG } from './world.js';

export const DRAG_DISTANCES = [
  { id: 'quarter', name: '1/4 mile', m: DRAG.QUARTER, board: 'drag-quarter' },
  { id: 'eighth', name: '1/8 mile', m: DRAG.EIGHTH, board: 'drag-eighth' },
];
export const TREES = [
  { id: 'sportsman', name: 'Sportsman tree', step: 0.5, desc: 'Three ambers half a second apart, then green.' },
  { id: 'pro', name: 'Pro tree', step: 0, wait: 0.4, desc: 'All ambers at once, green 0.4 s later.' },
];
const SPLITS = [['ft60', DRAG.FT60], ['ft330', DRAG.FT330], ['eighth', DRAG.EIGHTH], ['ft1000', DRAG.FT1000], ['quarter', DRAG.QUARTER]];

export class DragRace {
  constructor(world) { this.world = world; this.onEvent = null; this.onStage = null; this.onResult = null; this.online = false; this.dist = DRAG_DISTANCES[0]; this.tree = TREES[0]; this.lane = 0; this.reset(); }

  configure(distId, treeId, lane, online) {
    this.dist = DRAG_DISTANCES.find(d => d.id === distId) || DRAG_DISTANCES[0]; this.tree = TREES.find(t => t.id === treeId) || TREES[0];
    this.lane = lane ? 1 : 0; this.online = !!online; this.world.setLane(this.lane); this.world.clearBoards(); this.reset();
  }
  reset() {
    this.state = 'staging'; this.t = 0; this.pre = false; this.staged = false; this.stillT = 0; this.tAmber = null; this.tGreen = null;
    this.tLeave = null; this.foul = false; this.prevFront = null; this.splits = {}; this.speeds = {}; this.trapIn = {}; this.result = null; this.deep = false; this.sentStage = false;
    this.other = { pre: false, staged: false, foul: false, green: false };
  }
  _emit(label, kind = 'minor') { if (this.onEvent) this.onEvent(label, kind); }

  /** Multiplayer: the server says when the tree turns green (seconds from now on the shared clock). */
  go(secondsUntilGreen, treeId) {
    if (this.state !== 'staging' && this.state !== 'tree') return;
    this.tree = TREES.find(t => t.id === treeId) || this.tree;
    this.tGreen = this.t + secondsUntilGreen; this.tAmber = this.tGreen - (this.tree.step ? this.tree.step * 3 : this.tree.wait); this.state = 'tree';
  }

  /** How many ambers are lit at time t (0–3), or all three at once on a pro tree. */
  _ambers(t) {
    if (this.tAmber == null || t < this.tAmber || t >= this.tGreen) return 0;
    return this.tree.step ? Math.min(3, 1 + Math.floor((t - this.tAmber) / this.tree.step)) : 3;
  }

  /**
   * front = x position of the car's nose (the start line is x = 0), v = forward speed (m/s).
   * Returns the lights for this lane and live timing for the HUD.
   */
  update(dt, front, v, onStrip = true) {
    const t0 = this.t, t1 = (this.t += dt), prev = this.prevFront ?? front; this.prevFront = front;
    const crossed = line => prev < line && front >= line ? t0 + (line - prev) / Math.max(1e-6, front - prev) * dt : null;   // exact crossing time within the frame

    if (this.state === 'staging' || this.state === 'tree') {
      this.pre = front >= DRAG.PRE && front < 0.9; this.staged = front >= 0 && front < DRAG.ROLLOUT; this.deep = front >= DRAG.ROLLOUT && this.state === 'staging';
      const ready = this.staged && Math.abs(v) < 0.35;
      this.stillT = ready ? this.stillT + dt : 0;
      if (this.onStage && ready !== this.sentStage && (ready ? this.stillT > 0.6 : true)) { this.sentStage = ready; this.onStage(ready); }
      if (this.state === 'staging' && !this.online && this.stillT > 1.0) {         // solo: the tree starts itself after a random pause
        this.tAmber = t1 + 0.7 + Math.random() * 1.3; this.tGreen = this.tAmber + (this.tree.step ? this.tree.step * 3 : this.tree.wait); this.state = 'tree';
      }
      if (this.state === 'tree') {
        const leave = crossed(DRAG.ROLLOUT);
        if (leave != null) {
          this.tLeave = leave; this.rt = leave - this.tGreen; this.foul = this.rt < 0; this.state = 'run';
          this._emit(this.foul ? `Red light! Left ${(-this.rt).toFixed(3)} s early` : `Reaction ${this.rt.toFixed(3)} s`, this.foul ? 'bad' : this.rt < 0.1 ? 'good' : 'minor');
        } else if (front < DRAG.PRE - 0.3 && this.tAmber != null && t1 > this.tAmber) { /* rolled back out of the beams during the tree: wait */ }
      } else if (this.deep) { if (!this.deepWarned) this._emit('Rolled through the beams — back up behind the line (hold S)', 'bad'); this.deepWarned = true; this.prevFront = front; }
      else if (front < 0.9) this.deepWarned = false;
    }
    if (this.state === 'run' && !onStrip) { this._emit('Left the racing surface — run aborted', 'bad'); this.reset(); this.world.clearBoards(); }
    if (this.state === 'run') {
      for (const [k, d] of SPLITS) {
        if (d > this.dist.m + 0.01 || this.splits[k] != null) continue;
        const tin = crossed(d - DRAG.TRAP); if (tin != null) this.trapIn[k] = tin;
        const tc = crossed(d);
        if (tc != null) { this.splits[k] = tc - this.tLeave; this.speeds[k] = this.trapIn[k] != null ? DRAG.TRAP / Math.max(1e-4, tc - this.trapIn[k]) * 3.6 : v * 3.6; }
      }
      const key = this.dist.id;
      if (this.splits[key] != null) {
        this.state = 'done';
        this.result = { dist: key, rt: this.rt, et: this.splits[key], trap: this.speeds[key], foul: this.foul, splits: { ...this.splits }, speeds: { ...this.speeds }, lane: this.lane };
        this.world.showResult(this.lane, this.result.et.toFixed(3), String(Math.round(this.result.trap)), !this.foul && !this.online);
        if (this.onResult) this.onResult(this.result);
      }
    }
    const a = this._ambers(t1), me = this.lane, o = 1 - me, L = [0, 0];
    const st = { pre: [...L], stage: [...L], amber: [...L], green: [...L], red: [...L] };
    st.pre[me] = this.pre || this.state === 'run' && t1 - this.tLeave < 0.2; st.stage[me] = this.staged; st.amber[me] = a;
    st.green[me] = this.tGreen != null && t1 >= this.tGreen && !this.foul && this.state !== 'staging'; st.red[me] = this.foul;
    st.pre[o] = this.other.pre; st.stage[o] = this.other.staged; st.amber[o] = this.online ? a : 0; st.green[o] = this.online && st.green[me] || this.other.green; st.red[o] = this.other.foul;
    if (this.online && this.other.foul) st.green[o] = 0;
    this.world.setTree(st);
    return { state: this.state, lights: { pre: st.pre[me], stage: st.stage[me], amber: a, green: st.green[me], red: st.red[me] }, clock: this.state === 'run' ? t1 - this.tLeave : this.result ? this.result.et : 0, rt: this.tLeave != null ? this.rt : null, splits: this.splits, speeds: this.speeds, result: this.result, dist: this.dist };
  }
}
