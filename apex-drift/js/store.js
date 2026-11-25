// Progress and settings, saved in this browser (localStorage). Works without it too.
const KEY = 'apexDrift.v1';

const DEFAULTS = {
  xp: 0,
  car: 'kite',
  paint: { kite: 0, vandal: 4, ronin: 2, zero: 1 },
  mode: 'drift',
  track: 'harbor',
  best: {},        // best[trackId] = { drift, lap, time, combo, ghost }
  races: 0,
  settings: { sound: true, assist: 1, camera: 'fixed', ghost: true },
};

const clone = (o) => JSON.parse(JSON.stringify(o));
let data = clone(DEFAULTS);

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const d = JSON.parse(raw);
      data = { ...clone(DEFAULTS), ...d, settings: { ...DEFAULTS.settings, ...(d.settings || {}) }, paint: { ...DEFAULTS.paint, ...(d.paint || {}) } };
    }
  } catch (_) { data = clone(DEFAULTS); }
  return data;
}

export function save() { try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (_) { /* private mode: keep going */ } }

export function wipe() { data = clone(DEFAULTS); save(); return data; }

export function get() { return data; }

export function best(trackId) { return (data.best[trackId] = data.best[trackId] || {}); }
