# APEX GARAGE — 3D Car Customization Simulator

A browser-based 3D car customizer built with plain **HTML, CSS, JavaScript and Three.js**.
No build step, no downloads at runtime: Three.js is bundled in `vendor/`, every 3D model is
generated procedurally in code, and every sound is synthesised live with the Web Audio API.

## Run it in VS Code

The app uses JavaScript modules, which browsers only load over `http://` — double-clicking
`index.html` will not work. Use either option below.

### Option A — Live Server (easiest)

1. Open VS Code, then **File → Open Folder…** and choose the `car-customizer` folder.
2. Open the Extensions view (`Ctrl+Shift+X` / `Cmd+Shift+X`), search for **Live Server**
   (by Ritwick Dey) and click **Install**. VS Code will also suggest it automatically.
3. In the Explorer, right-click `index.html` → **Open with Live Server**.
4. Your browser opens at `http://127.0.0.1:5500/index.html`. Done.

### Option B — built-in Node server (no extension)

1. Install [Node.js](https://nodejs.org) if you do not have it.
2. Open the `car-customizer` folder in VS Code.
3. Open the terminal (**Terminal → New Terminal**) and run:

   ```bash
   node server.js
   ```

4. Open <http://localhost:5173> in Chrome, Edge or Firefox.

You can also press **F5** and pick *Run APEX GARAGE* — it starts the server and opens the browser.

## Controls

| Action | How |
| --- | --- |
| Orbit / zoom the camera | Drag / mouse wheel (touch: one finger / pinch) |
| Start or stop the engine | **ENGINE START** button or `E` |
| Rev | Hold the **REV** pedal, `Space` or `W` |
| X-ray view (see engine, turbos, suspension) | **X-Ray** or `X` |
| Headlights and tail lights | **Lights** or `L` |
| Rotating showroom camera | **Turntable** or `T` |
| Spin the driven wheels with engine rpm | **Dyno** |
| Camera presets | 3/4 · Front · Side · Rear · Top · Wheel · Engine |
| Save / load / reset / screenshot | Buttons in the top bar |

Tip: fit the *Straight Pipe* exhaust and a *Big Single* turbo, rev to the limiter and lift off
to hear compressor flutter and see flames from the tips.

## What is in the garage

- **14 cars, 11 brands** — Nissan GT-R & Silvia S15, Toyota GR Supra & GR86, Mazda RX-7,
  BMW M4, Ford Mustang GT, Dodge Challenger Hellcat, Porsche 911 GT3, Audi R8,
  Lamborghini Huracán & Aventador, Ferrari 488 GTB, McLaren 720S.
- **Body kits** — Street Aero, Liberty Walk LB★WORKS (riveted over-fenders),
  LB-Silhouette WORKS GT, Rocket Bunny / Pandem, Time Attack Carbon. Plus five rear wings,
  vented / carbon hoods, roof options and window tint.
- **Paint** — 24 colours + custom picker; gloss, metallic, pearl, satin, matte and chrome.
- **Wheels** — 8 rim designs, 9 finishes, diameter options, caliper colours.
- **Tyres** — touring, UHP summer, semi-slick, drag radial, stretched fitment.
- **Suspension** — factory, lowering springs, coilovers and air suspension (with air-out),
  plus ride height, front/rear camber and wheel offset sliders.
- **Engines** — 17 swaps from a 2.0 L four to a 6.5 L V12, including rotary, boxer,
  cross-plane and flat-plane V8s. Each has its own 3D model and firing-order-based sound.
- **Forced induction** — three turbo setups (whistle, blow-off valve, flutter) and three
  superchargers (whine); they can be combined.
- **Exhausts & intakes** — four of each; they change tone, volume, overrun pops, tip style,
  induction noise and power.
- **Live performance sheet** — power, torque, 0–100, top speed, handling and weight compared
  with factory spec, plus an itemised build cost.

## Project structure

```
car-customizer/
├── index.html          Page shell and UI markup
├── css/style.css       Garage interface styling
├── js/
│   ├── main.js         App entry: state, engine simulation, input, render loop
│   ├── data.js         Catalogue of cars and every part (edit this to add content)
│   ├── scene.js        Renderer, camera, lighting, garage environment
│   ├── materials.js    Paint, glass, carbon, metal materials
│   ├── geo.js          Geometry helpers (lofting, interpolation)
│   ├── body.js         Procedural car body, lights, grilles, shut-lines
│   ├── kit.js          Body kits: flares, splitters, skirts, diffusers, wings
│   ├── wheels.js       Tyres, rims, brakes, struts
│   ├── engine3d.js     Engines, turbos, superchargers, intakes, exhaust piping
│   ├── car.js          Assembles the car; stance, x-ray, lights, flames
│   ├── audio.js        Synthesised engine, starter, turbo, blower and exhaust sound
│   ├── stats.js        Performance model and pricing
│   └── ui.js           Panels, stats bars, tachometer
├── vendor/three/       Three.js r170 (MIT licence) — bundled for offline use
├── server.js           Zero-dependency local web server
└── .vscode/            Recommended extension + F5 launch config
```

## Adding your own content

Everything is data-driven. To add a car, copy an entry in `CARS` inside `js/data.js` and
change its dimensions and profile; the body, kits, wheels and engine bay adapt automatically.
New engines, rims, kits or exhausts are added the same way in their respective lists.

## Notes

- The cars are **procedurally generated approximations** built from each model's real
  dimensions and proportions — they are recognisable in stance and silhouette but are not
  licensed, scan-accurate replicas. Brand and product names are used for identification only.
- Sound needs a user gesture (browser policy), so audio starts when you first press
  **ENGINE START**.
- A discrete or recent integrated GPU is recommended. Tested in current Chrome, Edge and Firefox.
