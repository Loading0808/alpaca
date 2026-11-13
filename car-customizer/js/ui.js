// DOM user interface: category rail, option panels, stats, tachometer.
import {
  BRANDS, CARS, ENGINES, TURBOS, SUPERCHARGERS, EXHAUSTS, INTAKES, KITS, SPOILERS, HOODS, ROOFS, TINTS,
  PAINT_COLORS, FINISHES, RIMS, RIM_COLORS, CALIPER_COLORS, TIRES, SUSPENSIONS, byId,
} from './data.js';
import { maxDrop, maxRim } from './stats.js';
import { AIR_PRESETS, AIR_LIFT, slamHeight, PARACHUTES, CHUTE_DESIGNS, LAUNCH_STYLES, GEAR_DEFAULT, ENGINE_LIMIT, pressureEffect } from './data.js';

const $ = id => document.getElementById(id);
const money = v => '$' + Math.round(v).toLocaleString('en-US');
const price = (o, stockId) => o.id === stockId ? 'Factory' : o.price ? money(o.price) : 'Free';

function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'style') el.style.cssText = v;
    else if (v !== false && v != null) el.setAttribute(k, v);
  }
  for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid.nodeType ? kid : document.createTextNode(kid));
  return el;
}

const CATS = [
  ['car', 'Vehicle'], ['paint', 'Paint'], ['body', 'Body Kit'], ['wheels', 'Wheels'], ['tires', 'Tyres'], ['susp', 'Stance'],
  ['engine', 'Engine'], ['boost', 'Boost'], ['exhaust', 'Exhaust'], ['intake', 'Intake'], ['dragsetup', 'Drag Setup'], ['sheet', 'Build Sheet'], ['garage', 'My Cars'],
];
const VIEWS = [['q', '3/4'], ['front', 'Front'], ['side', 'Side'], ['rear', 'Rear'], ['top', 'Top'], ['wheel', 'Wheel'], ['engine', 'Engine']];
const TOGGLES = [['xray', 'X-Ray'], ['lights', 'Lights'], ['turntable', 'Turntable'], ['dyno', 'Dyno']];

export function initUI(app) {
  let cat = 'car', brand = byId(CARS, app.build.carId).brand, lastCar = app.build.carId, toastTimer;
  const body = $('panelBody');

  const sec = (title, value) => h('div', { class: 'sec' }, title, value != null ? h('b', {}, value) : null);
  const card = (o, on, right, onPick, tags = []) => h('button', { class: 'card' + (on ? ' on' : ''), onclick: onPick, 'aria-pressed': on },
    h('div', { class: 'card-top' }, h('b', {}, o.name), h('em', {}, right)),
    o.desc ? h('p', {}, o.desc) : null,
    tags.length ? h('div', { class: 'tags' }, tags.map(t => h('span', { class: 'tag ' + (t[1] || '') }, t[0]))) : null);
  const chips = (list, cur, onPick, label = o => o.name) => h('div', { class: 'chip-row' }, list.map(o => h('button', { class: 'chip' + ((o.id ?? o) === cur ? ' on' : ''), onclick: () => onPick(o.id ?? o) }, label(o))));
  const swatches = (colors, cur, onPick) => h('div', { class: 'swatches' }, colors.map(c => {
    const col = c.color || c, id = c.id || c;
    return h('button', { class: 'swatch' + (id.toLowerCase?.() === String(cur).toLowerCase() ? ' on' : ''), style: `background:${col}`, title: c.name || col, 'aria-label': c.name || col, onclick: () => onPick(id) });
  }));
  const slider = (label, min, max, step, value, fmt, onInput, disabled) => {
    const out = h('b', {}, fmt(value));
    return h('div', { class: 'slider' }, h('div', { class: 'slider-top' }, h('span', {}, label), out),
      h('input', { type: 'range', min, max, step, value, disabled: disabled || null, 'aria-label': label, oninput: e => { const v = +e.target.value; out.textContent = fmt(v); onInput(v); } }));
  };
  const pct = v => (v >= 0 ? '+' : '') + Math.round(v * 100) + '%';

  const panels = {
    car() {
      const cur = app.build.carId;
      return [
        sec('Manufacturer'), chips(BRANDS, brand, b => { brand = b; renderPanel(); }, b => b),
        sec('Model'),
        CARS.filter(c => c.brand === brand).map(c => {
          const e = byId(ENGINES, c.stock.engine);
          return card({ name: c.name, desc: `${e.name}${c.stock.turbo !== 'none' ? ' · turbocharged' : c.stock.sc !== 'none' ? ' · supercharged' : ''}` }, c.id === cur, money(c.price), () => app.selectCar(c.id),
            [[c.drive], [c.doors === 4 ? '4-door' : '2-door'], [c.layout === 'front' ? 'Front-engine' : c.layout === 'mid' ? 'Mid-engine' : 'Rear-engine'], [c.weight + ' kg']]);
        }),
        h('div', { class: 'note' }, 'Switching vehicle starts a fresh factory build. Save first if you want to keep the current one.'),
      ];
    },
    paint() {
      const b = app.build;
      return [
        sec('Colour'), swatches(PAINT_COLORS, b.paint.color, c => app.change(x => { x.paint.color = c; }, 'look')),
        h('label', { class: 'custom-color' }, h('input', { type: 'color', value: b.paint.color, oninput: e => app.change(x => { x.paint.color = e.target.value; }, 'look', false) }), 'Custom colour'),
        sec('Finish'), chips(FINISHES, b.paint.finish, v => app.change(x => { x.paint.finish = v; }, 'look')),
        sec('Roof'), chips(ROOFS, b.roof, v => app.change(x => { x.roof = v; }, 'look')),
        sec('Window tint'), chips(TINTS, b.tint, v => app.change(x => { x.tint = v; }, 'look')),
      ];
    },
    body() {
      const b = app.build;
      return [
        sec('Aero / widebody kit'),
        KITS.map(k => card(k, k.id === b.kit, price(k, 'stock'), () => app.change(x => { x.kit = k.id; if (k.spoiler) x.spoiler = k.spoiler; if (k.hood) x.hood = k.hood; }, 'rebuild'),
          [k.flareF ? [`+${Math.round((k.flareF + k.flareR) * 1000)} mm track`] : null, k.down ? [`Downforce ${pct(k.down)}`, 'up'] : null, k.weight ? [`${k.weight > 0 ? '+' : ''}${k.weight} kg`, k.weight > 0 ? 'down' : 'up'] : null].filter(Boolean))),
        sec('Rear wing'), chips(SPOILERS, b.spoiler, v => app.change(x => { x.spoiler = v; }, 'rebuild')),
        sec('Hood'), chips(HOODS, b.hood, v => app.change(x => { x.hood = v; }, 'rebuild')),
      ];
    },
    wheels() {
      const b = app.build, car = app.car(), sizes = [];
      for (let s = Math.max(15, car.rim - 2); s <= maxRim(car); s++) sizes.push(s);
      return [
        sec('Rim design'),
        RIMS.map(r => card(r, r.id === b.rim.style, price(r, 'stock'), () => app.change(x => { x.rim.style = r.id; }, 'rebuild'), r.weight ? [[`${r.weight > 0 ? '+' : ''}${r.weight} kg`, r.weight > 0 ? 'down' : 'up']] : [])),
        sec('Diameter', b.rim.size + '"'), chips(sizes, b.rim.size, v => app.change(x => { x.rim.size = v; }, 'rebuild'), s => s + '"'),
        sec('Rim finish'), swatches(RIM_COLORS, b.rim.color, v => app.change(x => { x.rim.color = v; }, 'look')),
        sec('Brake calipers'), swatches(CALIPER_COLORS, b.caliper, v => app.change(x => { x.caliper = v; }, 'look')),
      ];
    },
    tires() {
      const b = app.build;
      return [sec('Compound & fitment'), TIRES.map(t => card(t, t.id === b.tire, price(t, 'sport'), () => app.change(x => { x.tire = t.id; }, 'rebuild'),
        [[`Grip ${t.grip.toFixed(2)}`, t.grip > 1 ? 'up' : t.grip < 0.95 ? 'down' : ''], t.launch ? ['Launch +30%', 'up'] : null].filter(Boolean)))];
    },
    susp() {
      const b = app.build, car = app.car(), s = byId(SUSPENSIONS, b.susp.type), md = Math.round(maxDrop(car, s) * 1000);
      const stance = fn => v => app.change(x => fn(x.susp, v), 'stance', false);
      return [
        sec('Suspension system'),
        SUSPENSIONS.map(o => card(o, o.id === b.susp.type, price(o, 'stock'), () => app.change(x => {
          x.susp.type = o.id; const m = maxDrop(car, o);
          x.susp.drop = Math.min(x.susp.drop, m); if (o.id !== 'stock' && x.susp.drop === 0) x.susp.drop = Math.min(m, 0.03);
          x.susp.camberF = Math.min(x.susp.camberF, o.maxCamber); x.susp.camberR = Math.min(x.susp.camberR, o.maxCamber);
          if (o.air) { app.restoreAir(x); x.susp.drop = 0; }
        }, 'rebuild'), o.handling ? [[`Handling +${o.handling}`, 'up']] : [])),
        ...(s.air ? (() => {
          const air = b.susp.air || { preset: 'street', f: 0, r: 0 }, info = app.rideInfo(), slam = Math.round(slamHeight(car) * 1000), lift = Math.round(AIR_LIFT * 1000);
          const mm = v => `${Math.round(car.gc * 1000 - v)} mm clearance`;
          return [
            sec('Air suspension preset', air.preset === 'custom' ? 'Custom' : byId(AIR_PRESETS, air.preset).name),
            h('div', { class: 'air-grid' }, AIR_PRESETS.map(p => h('button', { class: 'air-btn' + (air.preset === p.id ? ' on' : ''), title: p.desc, onclick: () => app.setAirPreset(p.id) }, h('b', {}, p.name), h('small', {}, `key ${p.key}`)))),
            h('div', { class: 'note' }, air.preset === 'custom' ? 'Custom heights set with the sliders below.' : byId(AIR_PRESETS, air.preset).desc),
            h('div', { class: 'air-read' }, h('span', {}, 'Ground clearance'), h('b', { id: 'airReadout' }, `Front ${info.f} mm · Rear ${info.r} mm`)),
            slider('Front height', -lift, slam, 1, Math.round(air.f * 1000), mm, v => app.setAirHeight('f', v / 1000)),
            slider('Rear height', -lift, slam, 1, Math.round(air.r * 1000), mm, v => app.setAirHeight('r', v / 1000)),
          ];
        })() : []),
        sec('Alignment & fitment'),
        s.air ? null : slider('Ride height', 0, Math.max(md, 1), 1, Math.round(b.susp.drop * 1000), v => v ? `−${v} mm` : 'Stock', stance((x, v) => { x.drop = v / 1000; }), md === 0),
        slider('Front camber', 0, s.maxCamber, 0.1, b.susp.camberF, v => `−${v.toFixed(1)}°`, stance((x, v) => { x.camberF = v; }), s.id === 'stock'),
        slider('Rear camber', 0, s.maxCamber, 0.1, b.susp.camberR, v => `−${v.toFixed(1)}°`, stance((x, v) => { x.camberR = v; }), s.id === 'stock'),
        slider('Front wheel offset', 0, 50, 1, b.susp.offF, v => `+${v} mm`, stance((x, v) => { x.offF = v; })),
        slider('Rear wheel offset', 0, 50, 1, b.susp.offR, v => `+${v} mm`, stance((x, v) => { x.offR = v; })),
        s.id === 'stock' ? h('div', { class: 'note' }, 'Factory suspension is fixed. Fit springs, coilovers or air to unlock ride height and camber.') : null,
      ];
    },
    engine() {
      const b = app.build, st = app.car().stock.engine;
      return [sec('Engine swap'), ENGINES.map(e => card(e, e.id === b.engine, price(e, st), () => app.change(x => { x.engine = e.id; }, 'rebuild'),
        [[`${e.hp} hp NA`], [`${e.tq} Nm`], [`${e.redline.toLocaleString('en-US')} rpm`], [`${e.weight} kg`]]))];
    },
    boost() {
      const b = app.build, st = app.car().stock;
      return [
        sec('Turbocharger'),
        TURBOS.map(t => card(t, t.id === b.turbo, price(t, st.turbo), () => app.change(x => { x.turbo = t.id; }, 'rebuild'), t.gain ? [[`Power ${pct(t.gain)}`, 'up'], [`${t.psi} psi`], [t.lag > 0.4 ? 'Heavy lag' : 'Fast spool', t.lag > 0.4 ? 'down' : '']] : [])),
        sec('Supercharger'),
        SUPERCHARGERS.map(s => card(s, s.id === b.sc, price(s, st.sc), () => app.change(x => { x.sc = s.id; }, 'rebuild'), s.gain ? [[`Power ${pct(s.gain)}`, 'up'], [`${s.psi} psi`], ['No lag']] : [])),
        b.turbo !== 'none' && b.sc !== 'none' ? h('div', { class: 'note' }, 'Twin-charged: the supercharger fills in below the turbo\'s boost threshold. Gains are compounded at reduced efficiency.') : null,
      ];
    },
    exhaust() {
      const b = app.build;
      return [sec('Exhaust system'), EXHAUSTS.map(e => card(e, e.id === b.exhaust, price(e, 'stock'), () => app.change(x => { x.exhaust = e.id; }, 'rebuild'),
        [e.gain ? [`Power ${pct(e.gain)}`, 'up'] : null, [`Volume ${Math.round(e.vol * 100)}%`], e.pops ? [e.pops >= 1 ? 'Flames' : 'Pops & bangs'] : null, e.weight ? [`${e.weight} kg`, 'up'] : null].filter(Boolean))),
      h('div', { class: 'note' }, 'Start the engine, rev high and lift off to hear overrun crackle. Straight pipes spit flames.')];
    },
    intake() {
      const b = app.build;
      return [sec('Air intake'), INTAKES.map(i => card(i, i.id === b.intake, price(i, 'stock'), () => app.change(x => { x.intake = i.id; }, 'rebuild'),
        [i.gain ? [`Power ${pct(i.gain)}`, 'up'] : null, [`Induction ${Math.round(i.loud * 100)}%`]].filter(Boolean))),
      h('div', { class: 'note' }, 'Use the X-Ray toggle or the Engine view to see the intake, turbos and blower on the engine.')];
    },
    dragsetup() {
      const b = app.build, car = app.car(), st = app.stats(), su = app.setup(), TAU = Math.PI * 2;
      const chute = b.chute || { type: 'none', design: 'red' }, hasFI = b.turbo !== 'none' || b.sc !== 'none';
      const lb = st.weight * 2.2046, trap = 234 * Math.cbrt(st.hp / lb) * 1.609, et = 5.825 * Math.cbrt(lb / st.hp);
      const final0 = st.redline * TAU * car.tireR / (60 * GEAR_DEFAULT[5] * (st.top / 3.6 * 1.06));
      const gearKmh = (g, f) => st.redline * TAU * car.tireR / (60 * g * final0 * f) * 3.6;
      const checks = p => {
        const out = [];
        if (!p.n) return out;
        out.push(car.dims.W >= p.minWidth ? ['Rear mount fits this body', ''] : [`Body is ${car.dims.W.toFixed(2)} m wide — needs ${p.minWidth.toFixed(2)} m`, 'no']);
        out.push(car.tips.startsWith('center') || byId(EXHAUSTS, b.exhaust).tips !== 'stock' && car.tips.startsWith('center') ? ['Pack sits above the centre exhaust', 'warn'] : ['Clear of the exhaust tips', '']);
        out.push(trap > 320 && p.id !== 'dual' ? [`Est. trap speed ${Math.round(trap)} km/h — dual parachutes advised`, 'warn'] : trap > 240 ? [`Est. trap speed ${Math.round(trap)} km/h — a parachute is required at this speed`, ''] : [`Est. trap speed ${Math.round(trap)} km/h — optional below 240 km/h`, 'warn']);
        out.push([`Adds ${p.weight} kg`, '']);
        return out;
      };
      const ro = (id, html) => { const d = h('div', { class: 'readout', id }); d.innerHTML = html; return d; };
      const gearText = s2 => s2.gears.map((g, i) => `<b>${i + 1}</b> ${g.toFixed(2)} → <b>${Math.round(gearKmh(g, s2.final))}</b> km/h`).join(' · ') + `<br>Final drive <b>${(final0 * s2.final).toFixed(2)}</b> : 1`;
      const psiText = s2 => { const f = pressureEffect(s2.psiF), r = pressureEffect(s2.psiR), pc = v => (v >= 1 ? '+' : '') + Math.round((v - 1) * 100) + '%';
        return `Front: traction <b>${pc(f.long)}</b>, cornering <b>${pc(f.lat)}</b>, rolling drag <b>${pc(f.roll)}</b><br>Rear: traction <b>${pc(r.long)}</b>, cornering <b>${pc(r.lat)}</b>, rolling drag <b>${pc(r.roll)}</b>`; };
      const fi0 = byId(TURBOS, b.turbo).gain + byId(SUPERCHARGERS, b.sc).gain * (b.turbo !== 'none' ? 0.6 : 1), cap = Math.max(fi0, ENGINE_LIMIT - 1);
      const boostText = s2 => { const want = fi0 * s2.boost, eff = Math.min(want, cap), hp = st.hp * (1 + eff) / (1 + fi0), psi = st.boostPsi * s2.boost * (want > cap ? cap / want : 1);
        return `Boost <b>${psi.toFixed(1)} psi</b> → about <b>${Math.round(hp)} hp</b>${want > cap + 1e-6 ? '<br><b style="color:var(--bad)">Engine limit reached</b> — the wastegate is holding it back. Fit a stronger engine for more.' : ''}`; };
      const upd = () => { const s2 = app.setup(); for (const [id, fn] of [['roGear', gearText], ['roPsi', psiText], ['roBoost', boostText]]) { const n = document.getElementById(id); if (n) n.innerHTML = fn(s2); } };
      const set = patch => { app.setSetup(patch); upd(); };
      return [
        sec('Parachute', byId(PARACHUTES, chute.type).name),
        PARACHUTES.map(p => {
          const ck = checks(p), blocked = ck.some(c => c[1] === 'no');
          const c = card(p, p.id === chute.type, p.price ? money(p.price) : 'Free', () => { if (blocked) return app.toast(ck.find(x => x[1] === 'no')[0]); app.previewChute(false); app.change(x => { x.chute = { ...chute, type: p.id }; }, 'rebuild'); });
          if (ck.length) c.append(h('ul', { class: 'checks' }, ck.map(([t, k]) => h('li', { class: k }, t))));
          return c;
        }),
        chute.type !== 'none' ? [sec('Canopy design'), swatches(CHUTE_DESIGNS.map(d => ({ id: d.id, name: d.name, color: d.a })), chute.design, v => { app.previewChute(false); app.change(x => { x.chute = { ...chute, design: v }; }, 'rebuild'); }),
          h('button', { class: 'btn wide-btn' + (app.chutePreview ? ' hot' : ''), style: 'margin-top:10px', onclick: () => { app.previewChute(!app.chutePreview); renderPanel(); } }, app.chutePreview ? 'Pack the parachute away' : 'Preview deployed'),
          h('div', { class: 'note' }, 'Deploy with P (or the Chute button) while driving. It can only be repacked once the car has stopped.')] : null,

        sec('Launch control', su.lc ? 'Armed' : 'Off'),
        chips([{ id: true, name: 'On' }, { id: false, name: 'Off' }], su.lc, v => { app.setSetup({ lc: v }); renderPanel(); }),
        slider('Launch rpm', 2000, Math.round((st.redline - 300) / 100) * 100, 100, Math.min(su.lcRpm, st.redline - 300), v => v.toLocaleString('en-US') + ' rpm', v => set({ lcRpm: v })),
        chips(LAUNCH_STYLES, su.lcStyle, v => { app.setSetup({ lcStyle: v }); renderPanel(); }),
        h('div', { class: 'note' }, `${byId(LAUNCH_STYLES, su.lcStyle).desc} To launch: stop, hold the brake (S) or handbrake (Space), floor the throttle — the engine holds ${su.lcRpm.toLocaleString('en-US')} rpm — then release. Toggle while driving with G.`),

        sec('Gear ratios', 'lower number = longer gear'),
        h('div', { class: 'gear-grid' }, su.gears.map((g, i) => slider(`Gear ${i + 1}`, 0.5, 4.5, 0.01, g, v => v.toFixed(2), v => { const gs = app.setup().gears; gs[i] = v; set({ gears: gs }); }))),
        slider('Final drive', 0.7, 1.35, 0.01, su.final, v => `${(final0 * v).toFixed(2)} : 1`, v => set({ final: v })),
        ro('roGear', gearText(su)),
        h('button', { class: 'btn wide-btn', onclick: () => { app.resetSetup(['gears', 'final']); renderPanel(); } }, 'Reset gearing to factory'),

        sec('Tyre pressure', 'factory 32 psi'),
        slider('Front', 12, 45, 1, su.psiF, v => v + ' psi', v => set({ psiF: v })),
        slider('Rear', 12, 45, 1, su.psiR, v => v + ' psi', v => set({ psiR: v })),
        ro('roPsi', psiText(su)),

        sec('Boost pressure', hasFI ? `${(st.boostPsi * su.boost).toFixed(1)} psi` : 'not fitted'),
        hasFI ? [slider('Boost', 0.6, 1.7, 0.05, su.boost, v => `${(st.boostPsi * v).toFixed(1)} psi (${Math.round(v * 100)}%)`, v => set({ boost: v })), ro('roBoost', boostText(su))]
          : h('div', { class: 'note' }, 'This build is naturally aspirated. Fit a turbocharger or supercharger in the Boost panel to tune boost pressure.'),
        h('div', { class: 'note' }, `Estimated quarter mile with this build: about ${et.toFixed(1)} s at ${Math.round(trap)} km/h. These settings are saved for this car and apply on every map.`),
      ];
    },
    garage() {
      const list = app.saves(), input = h('input', { type: 'text', maxlength: 40, placeholder: app.defaultName(), 'aria-label': 'Name for this save' });
      const save = () => app.saveNew(input.value);
      input.addEventListener('keydown', e => { if (e.key === 'Enter') save(); });
      return [
        sec('Save the car on the turntable'),
        h('div', { class: 'save-row' }, input, h('button', { class: 'btn btn-drive', onclick: save }, 'Save as new')),
        sec('Saved cars', String(list.length)),
        list.length ? list.map(s => {
          const c = byId(CARS, s.build.carId), st = app.statsFor(s.build), on = s.id === app.slot;
          return h('div', { class: 'slot' + (on ? ' on' : '') },
            h('div', { class: 'slot-top' }, h('span', { style: `background:${s.build.paint.color}` }), h('b', {}, s.name)),
            h('p', {}, `${c.brand} ${c.name} · ${Math.round(st.hp)} hp · ${new Date(s.ts).toLocaleDateString()}`),
            h('div', { class: 'chip-row' },
              h('button', { class: 'chip' + (on ? '' : ' on'), onclick: () => app.loadSave(s.id) }, on ? 'Reload' : 'Load'),
              h('button', { class: 'chip', onclick: () => app.saveOver(s.id) }, 'Overwrite'),
              h('button', { class: 'chip', onclick: () => { const n = prompt('Rename this car', s.name); if (n) { app.renameSave(s.id, n); renderPanel(); } } }, 'Rename'),
              h('button', { class: 'chip', onclick: () => { if (confirm(`Delete “${s.name}”?`)) app.deleteSave(s.id); } }, 'Delete')));
        }) : h('div', { class: 'note' }, 'No saved cars yet. Build something, give it a name and press “Save as new”. You can keep as many as you like.'),
        h('div', { class: 'note' }, 'The Save button in the top bar updates the car you last loaded or saved, or creates a new save if there is none.'),
      ];
    },
    sheet() {
      const s = app.sheet();
      return [
        h('table', { class: 'sheet' }, s.items.map(i => h('tr', {}, h('td', {}, i.cat), h('td', {}, i.name), h('td', {}, money(i.price)))),
          h('tr', { class: 'total' }, h('td', {}, 'Total'), h('td', {}), h('td', {}, money(s.total)))),
        h('button', { class: 'btn wide-btn', style: 'margin-top:14px', onclick: app.copySheet }, 'Copy build sheet'),
        h('button', { class: 'btn wide-btn', onclick: app.save }, 'Save build'),
        h('button', { class: 'btn wide-btn btn-drive', onclick: () => app.openDriveMenu() }, 'Drive this car'),
        h('button', { class: 'btn wide-btn', onclick: app.reset }, 'Reset to factory'),
      ];
    },
  };

  function renderPanel() {
    const i = CATS.findIndex(c => c[0] === cat), top = body.scrollTop;
    $('panelIndex').textContent = String(i + 1).padStart(2, '0') + ' / ' + CATS.length;
    $('panelTitle').textContent = CATS[i][1];
    body.replaceChildren(...panels[cat]().flat(3).filter(Boolean));
    body.scrollTop = top;
  }

  // category rail
  const catBtns = CATS.map(([id, label], i) => h('button', { class: 'cat', onclick: () => { cat = id; body.scrollTop = 0; refreshCats(); renderPanel(); } }, h('i', {}, String(i + 1).padStart(2, '0')), h('span', {}, label)));
  $('cats').append(...catBtns);
  const refreshCats = () => catBtns.forEach((b, i) => b.classList.toggle('on', CATS[i][0] === cat));

  // views + toggles
  $('viewBtns').append(...VIEWS.map(([id, label]) => h('button', { class: 'chip', onclick: () => app.view(id) }, label)));
  const togBtns = TOGGLES.map(([id, label]) => h('button', { class: 'chip', 'aria-pressed': 'false', onclick: () => app.toggle(id) }, label));
  $('toggleBtns').append(...togBtns);
  const refreshToggles = () => togBtns.forEach((b, i) => { const on = !!app.toggles[TOGGLES[i][0]]; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); });

  function refreshStats() {
    const s = app.stats(), b = app.stockStats();
    const row = (label, v, base, max, fmt, lowerBetter = false, invert) => {
      const d = v - base, better = lowerBetter ? d < 0 : d > 0, show = Math.abs(d) / (Math.abs(base) || 1) > 0.004;
      const frac = x => Math.max(0.02, Math.min(1, invert ? invert(x) : x / max));
      return h('div', { class: 'stat' }, h('span', {}, label),
        h('div', { class: 'bar' }, h('u', { style: `width:${frac(v) * 100}%` }), h('s', { style: `left:${frac(base) * 100}%` })),
        h('b', {}, fmt(v), show ? h('i', { class: better ? 'up' : 'down' }, (d > 0 ? '▲' : '▼')) : null));
    };
    $('stats').replaceChildren(
      row('Power', s.hp, b.hp, 1600, v => Math.round(v) + ' hp'),
      row('Torque', s.tq, b.tq, 1700, v => Math.round(v) + ' Nm'),
      row('0–100', s.t100, b.t100, 0, v => v.toFixed(2) + ' s', true, v => (8 - v) / 6.2),
      row('Top speed', s.top, b.top, 460, v => Math.round(v) + ' km/h'),
      row('Handling', s.handling, b.handling, 100, v => Math.round(v) + ' / 100'),
      row('Weight', s.weight, b.weight, 2300, v => Math.round(v) + ' kg', true),
    );
  }

  function refresh(rerender = true) {
    const car = app.car();
    $('carBrand').textContent = car.brand; $('carName').textContent = car.name;
    $('cost').textContent = money(app.sheet().total);
    refreshStats(); refreshToggles();
    if (lastCar !== car.id) { lastCar = car.id; brand = car.brand; }
    if (rerender) renderPanel();
  }

  // tachometer
  const tc = $('tach'), g = tc.getContext('2d');
  function drawTach(rpm, running, boost, st) {
    const W = tc.width, cx = W / 2, cy = W / 2, R = W / 2 - 14, a0 = Math.PI * 0.75, a1 = Math.PI * 2.25;
    const maxK = Math.ceil(st.redline / 1000) + 1, ang = v => a0 + (a1 - a0) * Math.min(1, v / (maxK * 1000));
    g.clearRect(0, 0, W, W);
    g.lineCap = 'butt';
    g.beginPath(); g.arc(cx, cy, R, a0, a1); g.strokeStyle = '#262a33'; g.lineWidth = 10; g.stroke();
    g.beginPath(); g.arc(cx, cy, R, ang(st.redline), a1); g.strokeStyle = '#7a1408'; g.stroke();
    if (running) { g.beginPath(); g.arc(cx, cy, R, a0, ang(rpm)); g.strokeStyle = rpm > st.redline * 0.93 ? '#ff2a12' : '#ff5a1f'; g.stroke(); }
    g.font = '600 26px Bahnschrift, "DIN Alternate", "Arial Narrow", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    for (let k = 0; k <= maxK; k++) {
      const a = ang(k * 1000), c = Math.cos(a), s = Math.sin(a);
      g.beginPath(); g.moveTo(cx + c * (R - 12), cy + s * (R - 12)); g.lineTo(cx + c * (R + 5), cy + s * (R + 5)); g.strokeStyle = '#8a92a0'; g.lineWidth = 2; g.stroke();
      g.fillStyle = k * 1000 >= st.redline ? '#ff5a1f' : '#c9ced6'; g.fillText(k, cx + c * (R - 34), cy + s * (R - 34));
    }
    const a = ang(running ? rpm : 0);
    g.beginPath(); g.moveTo(cx - Math.cos(a) * 16, cy - Math.sin(a) * 16); g.lineTo(cx + Math.cos(a) * (R - 16), cy + Math.sin(a) * (R - 16)); g.strokeStyle = '#fff'; g.lineWidth = 4; g.lineCap = 'round'; g.stroke();
    g.beginPath(); g.arc(cx, cy, 9, 0, 7); g.fillStyle = '#ff5a1f'; g.fill();
    g.fillStyle = '#e9ebef'; g.font = '700 42px Bahnschrift, "DIN Alternate", "Arial Narrow", sans-serif';
    g.fillText(running ? String(Math.round(rpm / 10) * 10) : '— — —', cx, cy + 58);
    g.fillStyle = '#8a92a0'; g.font = '600 17px Bahnschrift, "DIN Alternate", "Arial Narrow", sans-serif'; g.fillText('RPM × 1000', cx, cy + 88);
    if (st.boostPsi) {
      const bw = 120, x = cx - bw / 2, y = cy + 108;
      g.fillStyle = '#262a33'; g.fillRect(x, y, bw, 6); g.fillStyle = '#38bdf8'; g.fillRect(x, y, bw * Math.max(0, Math.min(1, boost)), 6);
      g.fillStyle = '#8a92a0'; g.fillText(`BOOST ${(boost * st.boostPsi).toFixed(1)} PSI`, cx, y + 22);
    }
  }

  function toast(msg) {
    const t = $('toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
  }
  function setRunning(on) {
    $('btnStart').classList.toggle('on', on); $('startLabel').innerHTML = on ? 'ENGINE<br>STOP' : 'ENGINE<br>START'; $('btnRev').disabled = !on;
  }

  refreshCats();
  app.toast = toast;
  return { refresh, drawTach, toast, setRunning, setCategory: c => { cat = c; refreshCats(); renderPanel(); } };
}
