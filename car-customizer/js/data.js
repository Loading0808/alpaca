// ---------------------------------------------------------------------------
// APEX GARAGE — parts & vehicle catalogue
// All dimensions are in metres, weights in kg, prices in USD.
// ---------------------------------------------------------------------------

export const PROFILE_DEFAULTS = {
  hoodPow: 0.6,      // <1 = bluff nose, ~1 = wedge
  crown: 0.06,       // centreline height above the shoulder line
  shoulder: 0.075,   // greenhouse inset from the body side
  tumble: 0.42,      // side glass lean-in
  noseRound: 0.25, noseTaper: 0.2,
  tailRound: 0.22, tailTaper: 0.15,
  frontRise: 0.04, rearRise: 0.1,
  roofDrop: 0.04, rearPow: 0.9, cabTaper: 0.12,
  plan: [0.93, 1.0, 0.975, 0.99, 0.9], // width factor: tail, rear axle, middle, front axle, nose
  scallop: 0.022,    // depth of the sculpted door surface below the shoulder crease
  noseBulge: 0.12, tailBulge: 0.07, hoodBulge: 0,
};

export const BRANDS = ['Nissan', 'Toyota', 'Honda', 'Mazda', 'Subaru', 'Mitsubishi', 'Lexus', 'BMW', 'Mercedes-AMG', 'Audi', 'Porsche', 'Ford', 'Chevrolet', 'Dodge', 'Aston Martin', 'Lamborghini', 'Ferrari', 'McLaren', 'Bugatti'];

export const CARS = [
  {
    id: 'gtr', brand: 'Nissan', name: 'GT-R (R35)', price: 115000, weight: 1750, drive: 'AWD', layout: 'front', cda: 0.68,
    dims: { L: 4.71, W: 1.895, H: 1.37, wb: 2.78, fo: 0.96 }, gc: 0.13, tireR: 0.355, tireW: [0.255, 0.285], rim: 20,
    profile: { noseH: 0.66, cowlH: 0.98, deckH: 1.0, tailH: 0.97, cowl: 0.33, wsTop: 0.47, rwTop: 0.68, deck: 0.87 },
    style: { front: 'gtr', head: 'swept', tail: 'quad' }, tips: 'quad', color: '#8a8f98',
    stock: { engine: 'vr38', turbo: 'twin', sc: 'none', spoiler: 'gt' },
  },
  {
    id: 's15', brand: 'Nissan', name: 'Silvia S15 Spec-R', price: 28000, weight: 1240, drive: 'RWD', layout: 'front', cda: 0.6,
    dims: { L: 4.445, W: 1.695, H: 1.285, wb: 2.525, fo: 0.93 }, gc: 0.13, tireR: 0.31, tireW: [0.215, 0.225], rim: 17,
    profile: { noseH: 0.58, cowlH: 0.9, deckH: 0.93, tailH: 0.9, cowl: 0.34, wsTop: 0.48, rwTop: 0.69, deck: 0.86 },
    style: { front: 'slot', head: 'swept', tail: 'slim' }, tips: 'dual', color: '#e9e9ea',
    stock: { engine: 'sr20', turbo: 'single', sc: 'none', spoiler: 'lip' },
  },
  {
    id: 'supra', brand: 'Toyota', name: 'GR Supra (A90)', price: 56000, weight: 1540, drive: 'RWD', layout: 'front', cda: 0.6,
    dims: { L: 4.38, W: 1.865, H: 1.29, wb: 2.47, fo: 0.96 }, gc: 0.12, tireR: 0.335, tireW: [0.255, 0.275], rim: 19,
    profile: { noseH: 0.6, cowlH: 0.93, deckH: 0.98, tailH: 0.94, cowl: 0.36, wsTop: 0.5, rwTop: 0.7, deck: 0.9, hoodPow: 0.7, cabTaper: 0.2 },
    style: { front: 'tri', head: 'swept', tail: 'slim' }, tips: 'dual', color: '#c8102e',
    stock: { engine: 'b58', turbo: 'single', sc: 'none', spoiler: 'lip' },
  },
  {
    id: 'gr86', brand: 'Toyota', name: 'GR86', price: 30000, weight: 1275, drive: 'RWD', layout: 'front', cda: 0.58,
    dims: { L: 4.265, W: 1.775, H: 1.31, wb: 2.575, fo: 0.87 }, gc: 0.13, tireR: 0.315, tireW: [0.215, 0.215], rim: 18,
    profile: { noseH: 0.6, cowlH: 0.93, deckH: 0.97, tailH: 0.93, cowl: 0.33, wsTop: 0.47, rwTop: 0.69, deck: 0.88 },
    style: { front: 'slot', head: 'swept', tail: 'slim' }, tips: 'dual', color: '#1d4ed8',
    stock: { engine: 'fa24', turbo: 'none', sc: 'none', spoiler: 'lip' },
  },
  {
    id: 'rx7', brand: 'Mazda', name: 'RX-7 (FD3S)', price: 45000, weight: 1280, drive: 'RWD', layout: 'front', cda: 0.55,
    dims: { L: 4.285, W: 1.76, H: 1.23, wb: 2.425, fo: 0.92 }, gc: 0.125, tireR: 0.31, tireW: [0.225, 0.245], rim: 17,
    profile: { noseH: 0.5, cowlH: 0.86, deckH: 0.9, tailH: 0.86, cowl: 0.35, wsTop: 0.49, rwTop: 0.7, deck: 0.9, hoodPow: 0.75, cabTaper: 0.22, noseTaper: 0.26 },
    style: { front: 'slot', head: 'slit', tail: 'bar' }, tips: 'dual', color: '#f2c100',
    stock: { engine: '13b', turbo: 'twin', sc: 'none', spoiler: 'none' },
  },
  {
    id: 'm4', brand: 'BMW', name: 'M4 Competition (G82)', price: 78000, weight: 1725, drive: 'RWD', layout: 'front', cda: 0.66,
    dims: { L: 4.794, W: 1.887, H: 1.393, wb: 2.857, fo: 0.87 }, gc: 0.125, tireR: 0.345, tireW: [0.275, 0.285], rim: 19,
    profile: { noseH: 0.7, cowlH: 1.0, deckH: 1.03, tailH: 1.0, cowl: 0.33, wsTop: 0.47, rwTop: 0.68, deck: 0.86, hoodPow: 0.5 },
    style: { front: 'kidney', head: 'swept', tail: 'slim' }, tips: 'quad', color: '#0f7a4f',
    stock: { engine: 's58', turbo: 'twin', sc: 'none', spoiler: 'lip' },
  },
  {
    id: 'mustang', brand: 'Ford', name: 'Mustang GT', price: 45000, weight: 1700, drive: 'RWD', layout: 'front', cda: 0.7,
    dims: { L: 4.784, W: 1.916, H: 1.381, wb: 2.72, fo: 0.93 }, gc: 0.135, tireR: 0.345, tireW: [0.255, 0.275], rim: 19,
    profile: { noseH: 0.72, cowlH: 1.0, deckH: 1.02, tailH: 0.99, cowl: 0.37, wsTop: 0.5, rwTop: 0.7, deck: 0.9, hoodPow: 0.45, cabTaper: 0.18 },
    style: { front: 'wide', head: 'box', tail: 'tri' }, tips: 'quad', color: '#e25822',
    stock: { engine: 'coyote', turbo: 'none', sc: 'none', spoiler: 'lip' },
  },
  {
    id: 'challenger', brand: 'Dodge', name: 'Challenger SRT Hellcat', price: 72000, weight: 2000, drive: 'RWD', layout: 'front', cda: 0.8,
    dims: { L: 5.02, W: 1.92, H: 1.45, wb: 2.95, fo: 0.95 }, gc: 0.14, tireR: 0.36, tireW: [0.275, 0.275], rim: 20,
    profile: { noseH: 0.8, cowlH: 1.06, deckH: 1.08, tailH: 1.04, cowl: 0.35, wsTop: 0.48, rwTop: 0.66, deck: 0.82, hoodPow: 0.32, noseTaper: 0.12, tailTaper: 0.1, rearPow: 0.75 },
    style: { front: 'wide', head: 'rounds', tail: 'bar' }, tips: 'dual', color: '#5b21b6',
    stock: { engine: 'hemi', turbo: 'none', sc: 'roots', spoiler: 'lip' },
  },
  {
    id: '911', brand: 'Porsche', name: '911 GT3 (992)', price: 180000, weight: 1435, drive: 'RWD', layout: 'rear', cda: 0.62,
    dims: { L: 4.573, W: 1.852, H: 1.279, wb: 2.457, fo: 1.02 }, gc: 0.115, tireR: 0.345, tireW: [0.255, 0.315], rim: 20,
    profile: { noseH: 0.56, cowlH: 0.88, deckH: 0.84, tailH: 0.72, cowl: 0.31, wsTop: 0.44, rwTop: 0.63, deck: 0.9, hoodPow: 0.7, cabTaper: 0.24, rearPow: 1.15, roofDrop: 0.07, plan: [0.95, 1.0, 0.95, 0.96, 0.86], noseTaper: 0.26, tailTaper: 0.22 },
    style: { front: 'slot', head: 'round', tail: 'bar' }, tips: 'center2', color: '#f4f4f5',
    stock: { engine: 'flat6', turbo: 'none', sc: 'none', spoiler: 'swan' },
  },
  {
    id: 'r8', brand: 'Audi', name: 'R8 V10 Performance', price: 160000, weight: 1595, drive: 'AWD', layout: 'mid', cda: 0.66,
    dims: { L: 4.43, W: 1.94, H: 1.24, wb: 2.65, fo: 1.0 }, gc: 0.115, tireR: 0.34, tireW: [0.245, 0.295], rim: 19,
    profile: { noseH: 0.52, cowlH: 0.84, deckH: 0.9, tailH: 0.86, cowl: 0.28, wsTop: 0.44, rwTop: 0.6, deck: 0.83, hoodPow: 0.75, tumble: 0.5, cabTaper: 0.18 },
    style: { front: 'single', head: 'slit', tail: 'slim' }, tips: 'dual', color: '#374151',
    stock: { engine: 'v10', turbo: 'none', sc: 'none', spoiler: 'lip' },
  },
  {
    id: 'huracan', brand: 'Lamborghini', name: 'Huracán EVO', price: 210000, weight: 1550, drive: 'AWD', layout: 'mid', cda: 0.64,
    dims: { L: 4.52, W: 1.933, H: 1.165, wb: 2.62, fo: 1.06 }, gc: 0.11, tireR: 0.34, tireW: [0.245, 0.305], rim: 20,
    profile: { noseH: 0.46, cowlH: 0.78, deckH: 0.86, tailH: 0.82, cowl: 0.27, wsTop: 0.43, rwTop: 0.57, deck: 0.8, hoodPow: 0.85, tumble: 0.55, cabTaper: 0.2, rearPow: 1.1 },
    style: { front: 'super', head: 'slit', tail: 'slim' }, tips: 'dual', color: '#7ac143',
    stock: { engine: 'v10', turbo: 'none', sc: 'none', spoiler: 'lip' },
  },
  {
    id: 'aventador', brand: 'Lamborghini', name: 'Aventador S', price: 420000, weight: 1700, drive: 'AWD', layout: 'mid', cda: 0.7,
    dims: { L: 4.8, W: 2.03, H: 1.136, wb: 2.7, fo: 1.1 }, gc: 0.11, tireR: 0.35, tireW: [0.255, 0.335], rim: 20,
    profile: { noseH: 0.44, cowlH: 0.76, deckH: 0.86, tailH: 0.84, cowl: 0.26, wsTop: 0.42, rwTop: 0.55, deck: 0.78, hoodPow: 0.9, tumble: 0.58, cabTaper: 0.22, rearPow: 1.15 },
    style: { front: 'super', head: 'slit', tail: 'slim' }, tips: 'center2', color: '#f59e0b',
    stock: { engine: 'v12', turbo: 'none', sc: 'none', spoiler: 'none' },
  },
  {
    id: 'f488', brand: 'Ferrari', name: '488 GTB', price: 260000, weight: 1475, drive: 'RWD', layout: 'mid', cda: 0.63,
    dims: { L: 4.568, W: 1.952, H: 1.213, wb: 2.65, fo: 1.05 }, gc: 0.115, tireR: 0.345, tireW: [0.245, 0.305], rim: 20,
    profile: { noseH: 0.5, cowlH: 0.82, deckH: 0.88, tailH: 0.84, cowl: 0.28, wsTop: 0.44, rwTop: 0.6, deck: 0.84, hoodPow: 0.7, tumble: 0.5, cabTaper: 0.2 },
    style: { front: 'super', head: 'swept', tail: 'dual' }, tips: 'dual', color: '#d40000',
    stock: { engine: 'f154', turbo: 'twin', sc: 'none', spoiler: 'none' },
  },
  {
    id: 'm720', brand: 'McLaren', name: '720S', price: 300000, weight: 1420, drive: 'RWD', layout: 'mid', cda: 0.62,
    dims: { L: 4.543, W: 1.93, H: 1.196, wb: 2.67, fo: 1.07 }, gc: 0.11, tireR: 0.345, tireW: [0.245, 0.305], rim: 20,
    profile: { noseH: 0.47, cowlH: 0.8, deckH: 0.86, tailH: 0.84, cowl: 0.27, wsTop: 0.43, rwTop: 0.6, deck: 0.84, hoodPow: 0.8, tumble: 0.56, cabTaper: 0.24, rearPow: 1.1 },
    style: { front: 'super', head: 'slit', tail: 'slim' }, tips: 'center2', color: '#ff7a00',
    stock: { engine: 'm840', turbo: 'twin', sc: 'none', spoiler: 'lip' },
  },
  {
    id: 'r34', brand: 'Nissan', name: 'Skyline GT-R (R34)', price: 140000, weight: 1560, drive: 'AWD', layout: 'front', cda: 0.68,
    dims: { L: 4.6, W: 1.785, H: 1.36, wb: 2.665, fo: 0.9 }, gc: 0.13, tireR: 0.325, tireW: [0.245, 0.245], rim: 18,
    profile: { noseH: 0.68, cowlH: 0.97, deckH: 1.0, tailH: 0.98, cowl: 0.32, wsTop: 0.45, rwTop: 0.68, deck: 0.84, hoodPow: 0.45, noseTaper: 0.14, tailTaper: 0.1, rearPow: 0.75, hoodBulge: 0.012 },
    style: { front: 'gtr', head: 'box', tail: 'quad' }, tips: 'dual', color: '#1e3a8a',
    stock: { engine: 'rb26', turbo: 'twin', sc: 'none', spoiler: 'gt' },
  },
  {
    id: 'z34', brand: 'Nissan', name: 'Z (RZ34)', price: 43000, weight: 1600, drive: 'RWD', layout: 'front', cda: 0.62,
    dims: { L: 4.38, W: 1.845, H: 1.315, wb: 2.55, fo: 0.87 }, gc: 0.125, tireR: 0.335, tireW: [0.255, 0.275], rim: 19,
    profile: { noseH: 0.62, cowlH: 0.94, deckH: 0.97, tailH: 0.93, cowl: 0.37, wsTop: 0.51, rwTop: 0.71, deck: 0.91, hoodPow: 0.6, cabTaper: 0.2 },
    style: { front: 'single', head: 'swept', tail: 'slim' }, tips: 'dual', color: '#f2c100',
    stock: { engine: 'vr30', turbo: 'twin', sc: 'none', spoiler: 'lip' },
  },
  {
    id: 'supra4', brand: 'Toyota', name: 'Supra MK4 (A80)', price: 95000, weight: 1510, drive: 'RWD', layout: 'front', cda: 0.6,
    dims: { L: 4.515, W: 1.81, H: 1.275, wb: 2.55, fo: 0.98 }, gc: 0.125, tireR: 0.325, tireW: [0.235, 0.255], rim: 18,
    profile: { noseH: 0.56, cowlH: 0.9, deckH: 0.95, tailH: 0.92, cowl: 0.36, wsTop: 0.5, rwTop: 0.69, deck: 0.9, hoodPow: 0.72, cabTaper: 0.2, noseTaper: 0.26, tailTaper: 0.2, rearPow: 1.05, scallop: 0.012 },
    style: { front: 'tri', head: 'swept', tail: 'quad' }, tips: 'dual', color: '#e9e9ea',
    stock: { engine: '2jz', turbo: 'twin', sc: 'none', spoiler: 'gt' },
  },
  {
    id: 'nsx', brand: 'Honda', name: 'NSX (NA1)', price: 120000, weight: 1370, drive: 'RWD', layout: 'mid', cda: 0.56,
    dims: { L: 4.43, W: 1.81, H: 1.17, wb: 2.53, fo: 1.0 }, gc: 0.125, tireR: 0.315, tireW: [0.215, 0.245], rim: 17,
    profile: { noseH: 0.48, cowlH: 0.8, deckH: 0.86, tailH: 0.84, cowl: 0.29, wsTop: 0.44, rwTop: 0.6, deck: 0.78, hoodPow: 0.85, tumble: 0.5, cabTaper: 0.16, noseTaper: 0.24 },
    style: { front: 'slot', head: 'slit', tail: 'bar' }, tips: 'dual', color: '#d40000',
    stock: { engine: 'c30a', turbo: 'none', sc: 'none', spoiler: 'lip' },
  },
  {
    id: 'ctr', brand: 'Honda', name: 'Civic Type R (FK8)', price: 38000, weight: 1380, drive: 'FWD', layout: 'front', cda: 0.7, doors: 4,
    dims: { L: 4.557, W: 1.877, H: 1.434, wb: 2.7, fo: 0.93 }, gc: 0.13, tireR: 0.335, tireW: [0.245, 0.245], rim: 20,
    profile: { noseH: 0.68, cowlH: 0.98, deckH: 1.08, tailH: 1.02, cowl: 0.3, wsTop: 0.43, rwTop: 0.8, deck: 0.96, hoodPow: 0.5, roofDrop: 0.1, rearPow: 0.8, cabTaper: 0.1 },
    style: { front: 'gtr', head: 'swept', tail: 'slim' }, tips: 'center2', color: '#f4f4f5',
    stock: { engine: 'k20', turbo: 'single', sc: 'none', spoiler: 'gt' },
  },
  {
    id: 's2000', brand: 'Honda', name: 'S2000 (AP2)', price: 36000, weight: 1280, drive: 'RWD', layout: 'front', cda: 0.58,
    dims: { L: 4.135, W: 1.75, H: 1.285, wb: 2.4, fo: 0.8 }, gc: 0.13, tireR: 0.31, tireW: [0.215, 0.245], rim: 17,
    profile: { noseH: 0.58, cowlH: 0.9, deckH: 0.93, tailH: 0.9, cowl: 0.42, wsTop: 0.54, rwTop: 0.7, deck: 0.82, hoodPow: 0.65, rearPow: 0.8 },
    style: { front: 'slot', head: 'swept', tail: 'slim' }, tips: 'dual', color: '#c9ccd1',
    stock: { engine: 'f20c', turbo: 'none', sc: 'none', spoiler: 'none' },
  },
  {
    id: 'wrx', brand: 'Subaru', name: 'WRX STI', price: 42000, weight: 1530, drive: 'AWD', layout: 'front', cda: 0.72, doors: 4, scoop: true,
    dims: { L: 4.595, W: 1.795, H: 1.475, wb: 2.65, fo: 0.92 }, gc: 0.135, tireR: 0.33, tireW: [0.245, 0.245], rim: 19,
    profile: { noseH: 0.72, cowlH: 1.02, deckH: 1.07, tailH: 1.04, cowl: 0.3, wsTop: 0.43, rwTop: 0.7, deck: 0.84, hoodPow: 0.45, noseTaper: 0.14, tailTaper: 0.1, rearPow: 0.75, cabTaper: 0.08 },
    style: { front: 'single', head: 'swept', tail: 'slim' }, tips: 'quad', color: '#1d4ed8',
    stock: { engine: 'ej25', turbo: 'single', sc: 'none', spoiler: 'gt' },
  },
  {
    id: 'evo', brand: 'Mitsubishi', name: 'Lancer Evolution X', price: 40000, weight: 1560, drive: 'AWD', layout: 'front', cda: 0.72, doors: 4,
    dims: { L: 4.495, W: 1.81, H: 1.48, wb: 2.65, fo: 0.92 }, gc: 0.135, tireR: 0.33, tireW: [0.245, 0.245], rim: 18,
    profile: { noseH: 0.74, cowlH: 1.03, deckH: 1.08, tailH: 1.05, cowl: 0.3, wsTop: 0.43, rwTop: 0.7, deck: 0.84, hoodPow: 0.4, noseTaper: 0.12, tailTaper: 0.1, rearPow: 0.75, cabTaper: 0.08 },
    style: { front: 'single', head: 'swept', tail: 'slim' }, tips: 'dual', color: '#d40000',
    stock: { engine: '4b11', turbo: 'single', sc: 'none', spoiler: 'gt' },
  },
  {
    id: 'lfa', brand: 'Lexus', name: 'LFA', price: 800000, weight: 1480, drive: 'RWD', layout: 'front', cda: 0.6,
    dims: { L: 4.505, W: 1.895, H: 1.22, wb: 2.605, fo: 0.95 }, gc: 0.115, tireR: 0.345, tireW: [0.265, 0.305], rim: 20,
    profile: { noseH: 0.52, cowlH: 0.86, deckH: 0.92, tailH: 0.9, cowl: 0.4, wsTop: 0.53, rwTop: 0.7, deck: 0.88, hoodPow: 0.75, cabTaper: 0.2, tumble: 0.48 },
    style: { front: 'tri', head: 'slit', tail: 'slim' }, tips: 'center2', color: '#f4f4f5',
    stock: { engine: 'lfa', turbo: 'none', sc: 'none', spoiler: 'lip' },
  },
  {
    id: 'e46', brand: 'BMW', name: 'M3 (E46)', price: 55000, weight: 1570, drive: 'RWD', layout: 'front', cda: 0.64,
    dims: { L: 4.492, W: 1.78, H: 1.37, wb: 2.731, fo: 0.78 }, gc: 0.13, tireR: 0.325, tireW: [0.225, 0.255], rim: 18,
    profile: { noseH: 0.68, cowlH: 0.98, deckH: 1.02, tailH: 1.0, cowl: 0.33, wsTop: 0.46, rwTop: 0.69, deck: 0.84, hoodPow: 0.45, noseTaper: 0.14, tailTaper: 0.1, rearPow: 0.75, hoodBulge: 0.015 },
    style: { front: 'kidney', head: 'box', tail: 'slim' }, tips: 'quad', color: '#c9ccd1',
    stock: { engine: 's54', turbo: 'none', sc: 'none', spoiler: 'lip' },
  },
  {
    id: 'amggt', brand: 'Mercedes-AMG', name: 'GT R', price: 165000, weight: 1630, drive: 'RWD', layout: 'front', cda: 0.66,
    dims: { L: 4.55, W: 1.94, H: 1.285, wb: 2.63, fo: 0.93 }, gc: 0.115, tireR: 0.345, tireW: [0.275, 0.325], rim: 20,
    profile: { noseH: 0.6, cowlH: 0.94, deckH: 0.97, tailH: 0.9, cowl: 0.44, wsTop: 0.56, rwTop: 0.72, deck: 0.93, hoodPow: 0.6, cabTaper: 0.24, rearPow: 1.1, roofDrop: 0.06, hoodBulge: 0.015 },
    style: { front: 'single', head: 'swept', tail: 'slim' }, tips: 'center2', color: '#7ac143',
    stock: { engine: 'm177', turbo: 'twin', sc: 'none', spoiler: 'gt' },
  },
  {
    id: 'cayman', brand: 'Porsche', name: '718 Cayman GT4', price: 105000, weight: 1420, drive: 'RWD', layout: 'mid', cda: 0.6,
    dims: { L: 4.456, W: 1.801, H: 1.269, wb: 2.484, fo: 1.0 }, gc: 0.115, tireR: 0.335, tireW: [0.245, 0.295], rim: 20,
    profile: { noseH: 0.54, cowlH: 0.86, deckH: 0.9, tailH: 0.84, cowl: 0.31, wsTop: 0.45, rwTop: 0.62, deck: 0.88, hoodPow: 0.7, cabTaper: 0.22, rearPow: 1.1, noseTaper: 0.24 },
    style: { front: 'tri', head: 'round', tail: 'slim' }, tips: 'dual', color: '#f2c100',
    stock: { engine: 'flat6', turbo: 'none', sc: 'none', spoiler: 'gt' },
  },
  {
    id: 'fordgt', brand: 'Ford', name: 'GT (2017)', price: 500000, weight: 1385, drive: 'RWD', layout: 'mid', cda: 0.6,
    dims: { L: 4.763, W: 2.004, H: 1.11, wb: 2.71, fo: 1.1 }, gc: 0.1, tireR: 0.345, tireW: [0.245, 0.325], rim: 20,
    profile: { noseH: 0.44, cowlH: 0.74, deckH: 0.82, tailH: 0.8, cowl: 0.28, wsTop: 0.43, rwTop: 0.56, deck: 0.8, hoodPow: 0.9, tumble: 0.62, cabTaper: 0.34, rearPow: 1.15, shoulder: 0.14 },
    style: { front: 'super', head: 'slit', tail: 'dual' }, tips: 'center2', color: '#1d4ed8',
    stock: { engine: 'ecoboost', turbo: 'twin', sc: 'none', spoiler: 'lip' },
  },
  {
    id: 'c8', brand: 'Chevrolet', name: 'Corvette C8 Stingray', price: 68000, weight: 1530, drive: 'RWD', layout: 'mid', cda: 0.64,
    dims: { L: 4.63, W: 1.934, H: 1.234, wb: 2.722, fo: 1.0 }, gc: 0.12, tireR: 0.345, tireW: [0.245, 0.305], rim: 19,
    profile: { noseH: 0.5, cowlH: 0.82, deckH: 0.9, tailH: 0.88, cowl: 0.27, wsTop: 0.42, rwTop: 0.57, deck: 0.8, hoodPow: 0.8, tumble: 0.5, cabTaper: 0.2 },
    style: { front: 'super', head: 'slit', tail: 'slim' }, tips: 'quad', color: '#d40000',
    stock: { engine: 'lt2', turbo: 'none', sc: 'none', spoiler: 'lip' },
  },
  {
    id: 'camaro', brand: 'Chevrolet', name: 'Camaro ZL1', price: 70000, weight: 1760, drive: 'RWD', layout: 'front', cda: 0.74,
    dims: { L: 4.83, W: 1.905, H: 1.344, wb: 2.81, fo: 0.95 }, gc: 0.13, tireR: 0.35, tireW: [0.285, 0.305], rim: 20,
    profile: { noseH: 0.74, cowlH: 1.03, deckH: 1.05, tailH: 1.02, cowl: 0.36, wsTop: 0.5, rwTop: 0.69, deck: 0.87, hoodPow: 0.38, noseTaper: 0.13, tailTaper: 0.1, hoodBulge: 0.03, tumble: 0.5 },
    style: { front: 'wide', head: 'box', tail: 'slim' }, tips: 'quad', color: '#111214',
    stock: { engine: 'lt4', turbo: 'none', sc: 'roots', spoiler: 'lip' },
  },
  {
    id: 'viper', brand: 'Dodge', name: 'Viper ACR', price: 150000, weight: 1540, drive: 'RWD', layout: 'front', cda: 0.72,
    dims: { L: 4.463, W: 1.94, H: 1.246, wb: 2.51, fo: 0.92 }, gc: 0.115, tireR: 0.345, tireW: [0.295, 0.355], rim: 19,
    profile: { noseH: 0.54, cowlH: 0.9, deckH: 0.95, tailH: 0.9, cowl: 0.47, wsTop: 0.59, rwTop: 0.74, deck: 0.92, hoodPow: 0.7, cabTaper: 0.24, rearPow: 1.0, hoodBulge: 0.02 },
    style: { front: 'slot', head: 'swept', tail: 'slim' }, tips: 'dual', color: '#b8f000',
    stock: { engine: 'viper', turbo: 'none', sc: 'none', spoiler: 'swan' },
  },
  {
    id: 'vantage', brand: 'Aston Martin', name: 'Vantage', price: 150000, weight: 1530, drive: 'RWD', layout: 'front', cda: 0.63,
    dims: { L: 4.465, W: 1.942, H: 1.273, wb: 2.704, fo: 0.85 }, gc: 0.12, tireR: 0.345, tireW: [0.255, 0.295], rim: 20,
    profile: { noseH: 0.56, cowlH: 0.92, deckH: 0.97, tailH: 0.95, cowl: 0.38, wsTop: 0.52, rwTop: 0.71, deck: 0.92, hoodPow: 0.65, cabTaper: 0.22, rearPow: 1.05 },
    style: { front: 'single', head: 'slit', tail: 'bar' }, tips: 'quad', color: '#0f7a4f',
    stock: { engine: 'm177', turbo: 'twin', sc: 'none', spoiler: 'lip' },
  },
  {
    id: 'chiron', brand: 'Bugatti', name: 'Chiron', price: 3000000, weight: 1995, drive: 'AWD', layout: 'mid', cda: 0.74,
    dims: { L: 4.544, W: 2.038, H: 1.212, wb: 2.711, fo: 1.0 }, gc: 0.115, tireR: 0.36, tireW: [0.285, 0.355], rim: 20,
    profile: { noseH: 0.52, cowlH: 0.84, deckH: 0.92, tailH: 0.9, cowl: 0.29, wsTop: 0.44, rwTop: 0.6, deck: 0.84, hoodPow: 0.7, tumble: 0.5, cabTaper: 0.24, rearPow: 1.1, noseTaper: 0.26, tailTaper: 0.2 },
    style: { front: 'horseshoe', head: 'slit', tail: 'bar' }, tips: 'center2', color: '#0b1f3a',
    stock: { engine: 'w16', turbo: 'twin', sc: 'none', spoiler: 'lip' },
  },
];

// hp / tq are naturally-aspirated base figures; forced induction multiplies them.
// Sound fields: cyl = exhaust pulses per 720° cycle, tone = pulse resonance (Hz), noise = raspiness.
export const ENGINES = [
  { id: 'sr20', name: 'SR20 2.0L Inline-4', kind: 'i', cyl: 4, hp: 178, tq: 215, redline: 7500, idle: 900, weight: 150, price: 6500, rev: 5.5, tone: 118, noise: 0.22, cover: '#b91c1c', desc: 'Lightweight iron-sleeved four. Loves boost.' },
  { id: 'k20', name: 'K20 2.0L Inline-4 VTEC', kind: 'i', cyl: 4, hp: 220, tq: 215, redline: 8800, idle: 950, weight: 140, price: 8900, rev: 6.5, tone: 132, noise: 0.2, cover: '#991b1b', desc: 'High-revving all-aluminium four with a 8,800 rpm scream.' },
  { id: 'fa24', name: 'FA24 2.4L Flat-4 Boxer', kind: 'flat', cyl: 4, hp: 228, tq: 250, redline: 7400, idle: 850, weight: 160, price: 7200, rev: 5, tone: 96, noise: 0.25, amps: [1, 0.55, 0.9, 0.5], cover: '#1f2937', desc: 'Low centre of gravity and the classic boxer rumble.' },
  { id: '13b', name: '13B-REW 1.3L Twin-Rotor', kind: 'rotary', cyl: 4, hp: 170, tq: 190, redline: 9000, idle: 1050, weight: 120, price: 9800, rev: 7, tone: 150, noise: 0.5, lump: 1, cover: '#0f172a', desc: 'Wankel rotary. Tiny, smooth, and it braps at idle.' },
  { id: 'rb26', name: 'RB26 2.6L Inline-6', kind: 'i', cyl: 6, hp: 230, tq: 260, redline: 8000, idle: 950, weight: 255, price: 16500, rev: 5, tone: 112, noise: 0.16, cover: '#7f1d1d', desc: 'The Skyline legend. Iron block, endless headroom.' },
  { id: '2jz', name: '2JZ 3.0L Inline-6', kind: 'i', cyl: 6, hp: 240, tq: 300, redline: 7200, idle: 850, weight: 270, price: 14500, rev: 4.6, tone: 104, noise: 0.15, cover: '#111827', desc: 'Bulletproof straight-six. 1,000 hp on a stock bottom end.' },
  { id: 'b58', name: 'B58 3.0L Inline-6', kind: 'i', cyl: 6, hp: 270, tq: 330, redline: 7000, idle: 800, weight: 190, price: 12000, rev: 5, tone: 108, noise: 0.14, cover: '#1f2937', desc: 'Modern closed-deck six. Smooth and tuneable.' },
  { id: 's58', name: 'S58 3.0L Inline-6', kind: 'i', cyl: 6, hp: 320, tq: 380, redline: 7200, idle: 850, weight: 200, price: 19500, rev: 5.4, tone: 114, noise: 0.16, cover: '#111827', desc: 'Motorsport six with a forged crank.' },
  { id: 'vr38', name: 'VR38 3.8L V6', kind: 'v', cyl: 6, bank: 60, hp: 345, tq: 400, redline: 7100, idle: 850, weight: 275, price: 24000, rev: 5, tone: 98, noise: 0.2, cover: '#b91c1c', desc: 'Hand-built plasma-lined V6 from the GT-R.' },
  { id: 'coyote', name: 'Coyote 5.0L V8', kind: 'v', cyl: 8, bank: 90, hp: 460, tq: 570, redline: 7500, idle: 750, weight: 200, price: 11500, rev: 4.6, tone: 84, noise: 0.26, pattern: [0, 1, 0, 0, 1, 0, 1, 1], cover: '#1e3a8a', desc: 'Quad-cam cross-plane V8 with a 7,500 rpm top end.' },
  { id: 'ls3', name: 'LS3 6.2L V8', kind: 'v', cyl: 8, bank: 90, hp: 430, tq: 575, redline: 6600, idle: 700, weight: 190, price: 9500, rev: 4.2, tone: 76, noise: 0.28, pattern: [0, 1, 0, 0, 1, 0, 1, 1], cover: '#b45309', desc: 'The swap king. Compact pushrod torque.' },
  { id: 'hemi', name: 'HEMI 6.2L V8', kind: 'v', cyl: 8, bank: 90, hp: 470, tq: 600, redline: 6200, idle: 700, weight: 230, price: 13500, rev: 3.8, tone: 70, noise: 0.3, pattern: [0, 1, 0, 0, 1, 0, 1, 1], cover: '#b91c1c', desc: 'Big-bore American muscle with a deep, lumpy idle.' },
  { id: 'f154', name: 'F154 3.9L Flat-Plane V8', kind: 'v', cyl: 8, bank: 90, hp: 420, tq: 470, redline: 8000, idle: 900, weight: 180, price: 48000, rev: 6.5, tone: 124, noise: 0.2, pattern: [0, 1, 0, 1, 0, 1, 0, 1], cover: '#b91c1c', desc: 'Italian flat-plane V8. Razor-sharp response.' },
  { id: 'm840', name: 'M840T 4.0L Flat-Plane V8', kind: 'v', cyl: 8, bank: 90, hp: 440, tq: 480, redline: 8500, idle: 900, weight: 175, price: 52000, rev: 6.5, tone: 128, noise: 0.22, pattern: [0, 1, 0, 1, 0, 1, 0, 1], cover: '#111827', desc: 'Dry-sumped race-derived V8.' },
  { id: 'flat6', name: '4.0L Flat-6', kind: 'flat', cyl: 6, hp: 502, tq: 470, redline: 9000, idle: 900, weight: 185, price: 58000, rev: 7, tone: 136, noise: 0.18, cover: '#0f172a', desc: 'Naturally-aspirated motorsport boxer. 9,000 rpm howl.' },
  { id: 'v10', name: '5.2L V10', kind: 'v', cyl: 10, bank: 90, hp: 620, tq: 565, redline: 8700, idle: 900, weight: 230, price: 68000, rev: 6.5, tone: 132, noise: 0.2, oddfire: true, cover: '#111827', desc: 'Odd-firing V10 with an unmistakable wail.' },
  { id: 'v12', name: '6.5L V12', kind: 'v', cyl: 12, bank: 60, hp: 740, tq: 690, redline: 8700, idle: 950, weight: 260, price: 115000, rev: 6, tone: 140, noise: 0.16, cover: '#111827', desc: 'Twelve cylinders of naturally-aspirated theatre.' },
  { id: 'f20c', name: 'F20C 2.0L Inline-4 VTEC', kind: 'i', cyl: 4, hp: 240, tq: 208, redline: 9000, idle: 950, weight: 148, price: 9500, rev: 7, tone: 138, noise: 0.2, cover: '#991b1b', desc: '120 hp per litre without boost. Lives above 6,000 rpm.' },
  { id: '4b11', name: '4B11T 2.0L Inline-4', kind: 'i', cyl: 4, hp: 208, tq: 260, redline: 7600, idle: 900, weight: 155, price: 7000, rev: 5.5, tone: 120, noise: 0.22, cover: '#7f1d1d', desc: 'Aluminium-block rally four from the Evo X.' },
  { id: 'ej25', name: 'EJ257 2.5L Flat-4 Boxer', kind: 'flat', cyl: 4, hp: 218, tq: 290, redline: 6700, idle: 800, weight: 165, price: 6800, rev: 4.6, tone: 88, noise: 0.28, amps: [1, 0.45, 0.85, 0.4], cover: '#7f1d1d', desc: 'Unequal-length headers give the unmistakable Subaru burble.' },
  { id: 's54', name: 'S54 3.2L Inline-6', kind: 'i', cyl: 6, hp: 343, tq: 365, redline: 8000, idle: 900, weight: 215, price: 15500, rev: 6.2, tone: 122, noise: 0.2, cover: '#111827', desc: 'Individual throttle bodies and a metallic rasp at 8,000 rpm.' },
  { id: 'c30a', name: 'C30A 3.0L V6 VTEC', kind: 'v', cyl: 6, bank: 90, hp: 270, tq: 285, redline: 8000, idle: 850, weight: 185, price: 14000, rev: 6, tone: 118, noise: 0.16, cover: '#991b1b', desc: 'Titanium con-rods and an 8,000 rpm redline.' },
  { id: 'vr30', name: 'VR30 3.0L V6', kind: 'v', cyl: 6, bank: 60, hp: 250, tq: 300, redline: 7000, idle: 800, weight: 220, price: 11000, rev: 5, tone: 100, noise: 0.18, cover: '#b91c1c', desc: 'Compact modern V6 built for twin turbos.' },
  { id: 'ecoboost', name: '3.5L EcoBoost V6 (Ford GT)', kind: 'v', cyl: 6, bank: 60, hp: 400, tq: 460, redline: 7000, idle: 900, weight: 205, price: 45000, rev: 6, tone: 104, noise: 0.24, cover: '#1e3a8a', desc: 'Le Mans-winning race-bred V6.' },
  { id: 'lt2', name: 'LT2 6.2L V8', kind: 'v', cyl: 8, bank: 90, hp: 495, tq: 637, redline: 6600, idle: 700, weight: 210, price: 13000, rev: 4.4, tone: 78, noise: 0.27, pattern: [0, 1, 0, 0, 1, 0, 1, 1], cover: '#b91c1c', desc: 'Dry-sump small-block from the mid-engine Corvette.' },
  { id: 'lt4', name: 'LT4 6.2L V8', kind: 'v', cyl: 8, bank: 90, hp: 435, tq: 590, redline: 6500, idle: 700, weight: 215, price: 14500, rev: 4.2, tone: 74, noise: 0.29, pattern: [0, 1, 0, 0, 1, 0, 1, 1], cover: '#111827', desc: 'Forged small-block designed to live under a blower.' },
  { id: 'm177', name: 'M177 4.0L V8', kind: 'v', cyl: 8, bank: 90, hp: 360, tq: 430, redline: 7000, idle: 750, weight: 209, price: 28000, rev: 5, tone: 82, noise: 0.27, pattern: [0, 1, 0, 0, 1, 0, 1, 1], cover: '#111827', desc: 'Hot-V AMG V8 with a hard-edged bark.' },
  { id: 'viper', name: '8.4L V10 (Viper)', kind: 'v', cyl: 10, bank: 90, hp: 645, tq: 813, redline: 6400, idle: 750, weight: 290, price: 38000, rev: 4, tone: 80, noise: 0.3, oddfire: true, cover: '#b91c1c', desc: 'The biggest production car engine in the world. Pure torque.' },
  { id: 'lfa', name: '1LR-GUE 4.8L V10', kind: 'v', cyl: 10, bank: 72, hp: 553, tq: 480, redline: 9000, idle: 950, weight: 200, price: 120000, rev: 8, tone: 150, noise: 0.14, cover: '#111827', desc: 'Yamaha-tuned V10 that revs from idle to redline in 0.6 s.' },
  { id: 'w16', name: '8.0L W16', kind: 'v', cyl: 16, bank: 90, hp: 925, tq: 1000, redline: 6700, idle: 800, weight: 430, price: 450000, rev: 4.4, tone: 92, noise: 0.22, cover: '#0b1f3a', desc: 'Sixteen cylinders. Add turbos for four-figure power.' },
];

export const TURBOS = [
  { id: 'none', name: 'Naturally Aspirated', gain: 0, lag: 0, price: 0, weight: 0, desc: 'No turbocharger. Instant throttle response.' },
  { id: 'single', name: 'Single Turbo — GTX3076', gain: 0.4, lag: 0.28, psi: 14, spoolAt: 0.3, price: 4800, weight: 18, bov: 'whoosh', desc: 'Responsive street turbo, 14 psi. Strong mid-range.' },
  { id: 'twin', name: 'Twin Turbo — 2× GT2860', gain: 0.62, lag: 0.2, psi: 18, spoolAt: 0.24, price: 8900, weight: 30, bov: 'whoosh', desc: 'Two small turbos for fast spool and 18 psi.' },
  { id: 'big', name: 'Big Single — Precision 8385', gain: 1.0, lag: 0.6, psi: 30, spoolAt: 0.48, price: 12500, weight: 26, bov: 'flutter', desc: 'Huge 85 mm turbo. Laggy, violent, 30 psi with compressor flutter.' },
];

export const SUPERCHARGERS = [
  { id: 'none', name: 'No Supercharger', gain: 0, price: 0, weight: 0, desc: 'Not fitted.' },
  { id: 'centri', name: 'Centrifugal — ProCharger F-1', gain: 0.35, psi: 9, whine: 0.9, price: 7200, weight: 22, desc: 'Belt-driven compressor. Boost builds with rpm.' },
  { id: 'roots', name: 'Roots Blower — 2.4L TVS', gain: 0.5, psi: 11, whine: 0.42, price: 9800, weight: 38, desc: 'Positive displacement. Instant torque and the classic whine.' },
  { id: 'screw', name: 'Twin-Screw — Whipple 3.8L', gain: 0.65, psi: 14, whine: 0.6, price: 13500, weight: 45, desc: 'Most efficient blower. Savage boost everywhere.' },
];

export const EXHAUSTS = [
  { id: 'stock', name: 'Factory Exhaust', gain: 0, vol: 0.55, cutoff: 900, drive: 1.2, pops: 0, tips: 'stock', dia: 0.085, mat: 'chrome', muffler: 1, price: 0, weight: 0, desc: 'Quiet, full catalytic converters and resonators.' },
  { id: 'sport', name: 'Cat-Back Sport — Stainless', gain: 0.04, vol: 0.75, cutoff: 1500, drive: 2, pops: 0.25, tips: 'stock', dia: 0.1, mat: 'black', muffler: 0.7, price: 1900, weight: -6, desc: 'Mandrel-bent 3" stainless with a free-flowing muffler.' },
  { id: 'valved', name: 'Valvetronic Titanium', gain: 0.07, vol: 0.9, cutoff: 2400, drive: 3, pops: 0.6, tips: 'quad', dia: 0.1, mat: 'titanium', muffler: 0.5, price: 6400, weight: -14, desc: 'Full titanium with burnt-blue quad tips. Pops on overrun.' },
  { id: 'straight', name: 'Straight Pipe', gain: 0.09, vol: 1.0, cutoff: 3400, drive: 4.5, pops: 1, tips: 'dual', dia: 0.125, mat: 'steel', muffler: 0, price: 1200, weight: -20, desc: 'No muffler, no cats. Loud, crackles and shoots flames.' },
];

export const INTAKES = [
  { id: 'stock', name: 'Factory Airbox', gain: 0, loud: 0.1, price: 0, weight: 0, desc: 'Sealed paper-filter airbox.' },
  { id: 'cold', name: 'Cold Air Intake', gain: 0.03, loud: 0.3, price: 480, weight: -2, desc: 'Polished pipe drawing cool air from behind the bumper.' },
  { id: 'ram', name: 'Short Ram + Cone Filter', gain: 0.025, loud: 0.45, price: 320, weight: -3, desc: 'Open cone filter. Loud induction noise.' },
  { id: 'itb', name: 'Individual Throttle Bodies', gain: 0.08, loud: 0.85, price: 5200, weight: 1, desc: 'One throttle and velocity stack per cylinder. Savage induction roar.' },
];

export const KITS = [
  { id: 'stock', name: 'Factory Body', price: 0, weight: 0, down: 0, drag: 0, desc: 'OEM bumpers and fenders.' },
  { id: 'street', name: 'Street Aero Lip Kit', price: 2400, weight: 8, down: 0.05, drag: 0.01, splitter: 0.035, skirts: 0.03, rearLip: 0.03, mat: 'gloss', desc: 'Front lip, side skirts and rear valance in gloss black.' },
  { id: 'lbworks', name: 'Liberty Walk LB★WORKS', price: 18500, weight: 22, down: 0.12, drag: 0.04, flareF: 0.05, flareR: 0.07, flareStyle: 'rivet', splitter: 0.08, skirts: 0.05, rearLip: 0.05, fins: 4, spoiler: 'ducktail', mat: 'gloss', desc: 'Bolt-on riveted over-fenders, front diffuser, side diffusers, rear diffuser.' },
  { id: 'lbsil', name: 'Liberty Walk LB-Silhouette WORKS GT', price: 42000, weight: 30, down: 0.3, drag: 0.09, flareF: 0.085, flareR: 0.11, flareStyle: 'box', splitter: 0.14, canards: 2, skirts: 0.07, rearLip: 0.07, fins: 6, spoiler: 'swan', hood: 'vented', mat: 'carbon', desc: 'Super-silhouette race widebody: box flares, canards, deep splitter.' },
  { id: 'pandem', name: 'Rocket Bunny / Pandem V2', price: 14200, weight: 18, down: 0.1, drag: 0.04, flareF: 0.06, flareR: 0.08, flareStyle: 'rivet', splitter: 0.06, canards: 1, skirts: 0.04, rearLip: 0.03, spoiler: 'ducktail', mat: 'gloss', desc: 'Angular bolt-on wide arches with canards and a ducktail.' },
  { id: 'timeattack', name: 'Time Attack Carbon Aero', price: 26800, weight: 6, down: 0.38, drag: 0.1, flareF: 0.03, flareR: 0.035, flareStyle: 'smooth', splitter: 0.16, canards: 2, skirts: 0.06, rearLip: 0.08, fins: 7, spoiler: 'gt', hood: 'carbon', mat: 'carbon', desc: 'Dry-carbon splitter, double canards, moulded arches and a big diffuser.' },
];

export const SPOILERS = [
  { id: 'none', name: 'Spoiler Delete', price: 0, weight: 0, down: 0, drag: 0 },
  { id: 'lip', name: 'Trunk Lip', price: 380, weight: 2, down: 0.03, drag: 0.005 },
  { id: 'ducktail', name: 'Ducktail', price: 950, weight: 4, down: 0.08, drag: 0.015 },
  { id: 'gt', name: 'Carbon GT Wing', price: 2600, weight: 7, down: 0.22, drag: 0.05 },
  { id: 'swan', name: 'Swan-Neck Race Wing', price: 5400, weight: 9, down: 0.34, drag: 0.07 },
];

export const HOODS = [
  { id: 'stock', name: 'Factory', price: 0, weight: 0 },
  { id: 'vented', name: 'Vented', price: 1400, weight: -3 },
  { id: 'carbon', name: 'Dry Carbon', price: 3200, weight: -9 },
];

export const ROOFS = [
  { id: 'body', name: 'Body Colour', price: 0, weight: 0 },
  { id: 'black', name: 'Gloss Black', price: 600, weight: 0 },
  { id: 'carbon', name: 'Carbon', price: 2800, weight: -5 },
];

export const TINTS = [
  { id: 'light', name: 'Light Smoke', opacity: 0.55, price: 0 },
  { id: 'dark', name: 'Dark', opacity: 0.8, price: 250 },
  { id: 'limo', name: 'Limo', opacity: 0.94, price: 350 },
];

export const PAINT_COLORS = [
  '#f4f4f5', '#c9ccd1', '#8a8f98', '#3b4048', '#111214', '#0b1f3a', '#1d4ed8', '#0ea5e9',
  '#0f7a4f', '#7ac143', '#b8f000', '#f2c100', '#f59e0b', '#ff7a00', '#e25822', '#d40000',
  '#8b0000', '#be185d', '#f472b6', '#5b21b6', '#7c3aed', '#5c4033', '#d6c7a1', '#2dd4bf',
];

export const FINISHES = [
  { id: 'gloss', name: 'Gloss', price: 0 },
  { id: 'metallic', name: 'Metallic', price: 900 },
  { id: 'pearl', name: 'Pearl', price: 2200 },
  { id: 'satin', name: 'Satin', price: 1800 },
  { id: 'matte', name: 'Matte', price: 2400 },
  { id: 'chrome', name: 'Chrome Wrap', price: 6500 },
];

export const RIMS = [
  { id: 'stock', name: 'Factory Twin-Spoke', price: 0, weight: 0, desc: 'OEM cast alloy.' },
  { id: 'six', name: 'RS-6 Forged', price: 3600, weight: -12, desc: 'Six-spoke forged monoblock, motorsport classic.' },
  { id: 'five', name: 'Star-5', price: 2800, weight: -6, desc: 'Bold concave five-spoke.' },
  { id: 'mesh', name: 'LM Mesh 2-Piece', price: 5200, weight: -4, desc: 'Cross-lace mesh with a polished step lip.' },
  { id: 'multi', name: 'Multi-12', price: 3100, weight: -8, desc: 'Twelve thin spokes, lightweight flow-formed.' },
  { id: 'split', name: 'Split-5 Twin', price: 3400, weight: -7, desc: 'Five split spokes, deep concave.' },
  { id: 'dish', name: 'Deep Dish 3-Piece', price: 6800, weight: 4, desc: 'Three-piece with a deep polished lip. Stance essential.' },
  { id: 'turbine', name: 'Aero Turbine', price: 3900, weight: -3, desc: 'Directional swept blades.' },
];

export const RIM_COLORS = [
  { id: 'silver', name: 'Hyper Silver', color: '#c8ccd2', metal: 1, rough: 0.28 },
  { id: 'gunmetal', name: 'Gunmetal', color: '#4a4f57', metal: 1, rough: 0.35 },
  { id: 'black', name: 'Gloss Black', color: '#0c0c0e', metal: 0.6, rough: 0.25 },
  { id: 'matteblack', name: 'Matte Black', color: '#141416', metal: 0.3, rough: 0.8 },
  { id: 'bronze', name: 'Bronze', color: '#8a6238', metal: 1, rough: 0.35 },
  { id: 'gold', name: 'Gold', color: '#c9a227', metal: 1, rough: 0.25 },
  { id: 'white', name: 'Rally White', color: '#eeeeee', metal: 0.1, rough: 0.4 },
  { id: 'chrome', name: 'Chrome', color: '#f2f2f2', metal: 1, rough: 0.04 },
  { id: 'red', name: 'Candy Red', color: '#b00d18', metal: 0.9, rough: 0.25 },
];

export const CALIPER_COLORS = ['#c81414', '#f2c100', '#1d4ed8', '#111214', '#c9ccd1', '#7ac143', '#ff7a00'];

export const TIRES = [
  { id: 'street', name: 'Touring All-Season', grip: 0.92, price: 0, weight: 0, dW: 0, tread: 'street', desc: 'Long-life compound, quiet and comfortable.' },
  { id: 'sport', name: 'Ultra-High-Performance Summer', grip: 1.0, price: 1400, weight: 0, dW: 0.01, tread: 'sport', desc: 'Directional tread, sticky in the dry.' },
  { id: 'semi', name: 'Semi-Slick Track (R-Compound)', grip: 1.14, price: 2200, weight: -2, dW: 0.015, tread: 'semi', lettering: true, desc: 'Barely road-legal. Huge lateral grip when warm.' },
  { id: 'drag', name: 'Drag Radial', grip: 1.08, launch: 1.3, price: 1800, weight: 3, dW: 0.03, tread: 'drag', lettering: true, desc: 'Soft sidewall slick for brutal launches.' },
  { id: 'stretch', name: 'Stretched Stance Fitment', grip: 0.88, price: 1100, weight: -1, dW: -0.02, stretch: true, tread: 'sport', desc: 'Narrow tyre on a wide rim for fender clearance.' },
];

export const SUSPENSIONS = [
  { id: 'stock', name: 'Factory Suspension', price: 0, weight: 0, handling: 0, maxDrop: 0, maxCamber: 1, color: '#22252b', desc: 'OEM springs and dampers. Fixed ride height.' },
  { id: 'springs', name: 'Lowering Springs', price: 420, weight: 0, handling: 4, maxDrop: 0.035, maxCamber: 2, color: '#c81414', desc: 'Progressive springs, up to 35 mm drop.' },
  { id: 'coil', name: 'Coilovers — 32-way', price: 2400, weight: -4, handling: 10, maxDrop: 0.075, maxCamber: 6, color: '#d4a017', desc: 'Height, damping and camber adjustable.' },
  { id: 'air', name: 'Air Suspension — Air Lift 3P', price: 5200, weight: 14, handling: 5, maxDrop: 0.2, maxCamber: 10, air: true, color: '#1f6feb', desc: 'Adjustable on the fly. Lay frame at the press of a button.' },
];

export const byId = (list, id) => list.find(o => o.id === id) || list[0];

export function defaultBuild(car) {
  return {
    carId: car.id,
    paint: { color: car.color, finish: 'metallic' },
    roof: 'body', hood: 'stock', tint: 'dark',
    kit: 'stock', spoiler: car.stock.spoiler || 'none',
    rim: { style: 'stock', size: car.rim, color: 'gunmetal' }, caliper: '#c81414',
    tire: 'sport',
    susp: { type: 'stock', drop: 0, camberF: 0.5, camberR: 0.5, offF: 0, offR: 0 },
    engine: car.stock.engine, turbo: car.stock.turbo, sc: car.stock.sc,
    exhaust: 'stock', intake: 'stock',
  };
}
