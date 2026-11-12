// Performance model + build-sheet pricing.
import { CARS, ENGINES, TURBOS, SUPERCHARGERS, EXHAUSTS, INTAKES, KITS, SPOILERS, HOODS, ROOFS, TINTS, FINISHES, RIMS, TIRES, SUSPENSIONS, byId, defaultBuild } from './data.js';

export function resolve(build) {
  const car = byId(CARS, build.carId);
  return {
    car, engine: byId(ENGINES, build.engine), turbo: byId(TURBOS, build.turbo), sc: byId(SUPERCHARGERS, build.sc),
    exhaust: byId(EXHAUSTS, build.exhaust), intake: byId(INTAKES, build.intake), kit: byId(KITS, build.kit),
    spoiler: byId(SPOILERS, build.spoiler), hood: byId(HOODS, build.hood), roof: byId(ROOFS, build.roof), tint: byId(TINTS, build.tint),
    finish: byId(FINISHES, build.paint.finish), rim: byId(RIMS, build.rim.style), tire: byId(TIRES, build.tire), susp: byId(SUSPENSIONS, build.susp.type),
  };
}

export function maxRim(car) { return Math.min(22, Math.floor((car.tireR - 0.042) * 2 / 0.0254)); }
export function maxDrop(car, susp) { return Math.max(0, Math.min(susp.maxDrop, car.gc - 0.05, 0.085)); }
export function slamDrop(car) { return Math.min(car.gc - 0.03, 0.105); }

export function computeStats(build) {
  const r = resolve(build), { car, engine: e } = r;
  const stockE = byId(ENGINES, car.stock.engine);
  const fi = 1 + r.turbo.gain + r.sc.gain * (r.turbo.gain ? 0.6 : 1);
  const breath = 1 + r.exhaust.gain + r.intake.gain;
  const hp = e.hp * fi * breath;
  const tq = e.tq * (1 + (fi - 1) * 1.05) * (1 + (breath - 1) * 0.7);
  const weight = car.weight + (e.weight - stockE.weight) + r.turbo.weight + r.sc.weight + r.exhaust.weight + r.intake.weight
    + r.kit.weight + r.spoiler.weight + r.hood.weight + r.roof.weight + r.rim.weight + r.tire.weight + r.susp.weight;
  const down = (r.kit.down || 0) + (r.spoiler.down || 0), drag = (r.kit.drag || 0) + (r.spoiler.drag || 0);
  const traction = ({ AWD: 1.08, RWD: 1.5, FWD: 1.72 }[car.drive]) / Math.pow(r.tire.grip * (r.tire.launch || 1), 0.6);
  const t100 = Math.max(1.75, 1.15 * Math.pow(weight / hp, 0.75) * traction);
  const top = 3.6 * Math.cbrt((hp * 745.7 * 0.85 * 2) / (1.2 * car.cda * (1 + drag * 2.2))) * 0.92;
  const dropMm = build.susp.drop * 1000;
  const handling = Math.max(10, Math.min(100, 52 + (r.tire.grip - 0.92) * 95 + r.susp.handling + dropMm * 0.08 + down * 40
    - (weight - 1400) / 55 + (car.layout !== 'front' ? 5 : 0) + (car.drive === 'AWD' ? 3 : 0) - Math.max(0, build.susp.camberR - 4) * 1.2));
  const boostPsi = Math.max(r.turbo.psi || 0, r.sc.psi || 0) + (r.turbo.psi && r.sc.psi ? 6 : 0);
  return { hp, tq, weight, t100, top, handling, down, boostPsi, redline: e.redline };
}

export function buildSheet(build) {
  const r = resolve(build), car = r.car, st = defaultBuild(car), items = [];
  const add = (cat, o, stockId) => { if (o.id !== stockId && (o.price || 0) > 0) items.push({ cat, name: o.name, price: o.price }); };
  items.push({ cat: 'Vehicle', name: `${car.brand} ${car.name}`, price: car.price });
  add('Paint', { ...r.finish, name: `${r.finish.name} finish` }, 'metallic');
  add('Roof', { ...r.roof, name: `${r.roof.name} roof` }, st.roof); add('Glass', { ...r.tint, name: `${r.tint.name} tint` }, st.tint);
  add('Body kit', r.kit, st.kit); add('Spoiler', r.spoiler, st.spoiler); add('Hood', { ...r.hood, name: `${r.hood.name} hood` }, st.hood);
  add('Wheels', r.rim, st.rim.style);
  if (build.rim.size !== car.rim) items.push({ cat: 'Wheels', name: `${build.rim.size}" fitment`, price: Math.abs(build.rim.size - car.rim) * 350 });
  add('Tyres', r.tire, st.tire); add('Suspension', r.susp, st.susp.type);
  add('Engine', r.engine, st.engine); add('Turbo', r.turbo, st.turbo); add('Supercharger', r.sc, st.sc);
  add('Exhaust', r.exhaust, st.exhaust); add('Intake', r.intake, st.intake);
  return { items, total: items.reduce((s, i) => s + i.price, 0) };
}
