# APEX DRIFT — the drifting game from the Apex Garage workshop

Apex Drift is built **on top of Apex Garage**: the same 3D garage, the same 32 cars, the same locations,
driving physics, cameras, engine sounds and look. Instead of building cars, you drift them.

- **Any car from Apex Garage**, stock, with a choice of paint, or **your own builds**: every car you saved
  in Apex Garage (Save / My Cars) shows up under *My Builds*, with all its parts, tuning and paint. Engine
  swaps, turbos, tyres and stance all change how it slides.
- **Three locations** from Apex Garage: Apex Raceway (day), Neon District (night city) and the Midnight
  Expressway (with traffic).
- **Drift Attack**: three laps on the raceway, or two minutes in the city or on the expressway, for a
  bronze, silver or gold medal. **Free Drift**: no clock; press Esc to bank your points.
- **Scoring**: points grow with slide angle × speed. Keep sliding and the multiplier climbs to ×5 (one step
  every 2.2 s). Straighten up for about a second and the drift is banked. A hard wall hit, a crash, a
  reset or running off the road loses the drift in progress. On the expressway, drifting close past
  traffic adds a bonus.
- **Records** (best score per location and mode, best single drift, career points) are saved in the browser.

## Play it

From the site folder (the one with `games.js`):

```bash
node server.js
```

Open <http://localhost:5173> and pick **Apex Drift**, or go straight to <http://localhost:5173/apex-drift/>.
It must be served by the site, because it loads Apex Garage's files from `../car-customizer/`.

## Controls

| Action | Keyboard | Gamepad |
| --- | --- | --- |
| Throttle | `W` / `↑` | Right trigger |
| Brake, then reverse | `S` / `↓` | Left trigger |
| Steer | `A` `D` / `←` `→` | Left stick |
| Handbrake (start a drift) | `Space` | A / RB |
| Shift up / down (semi-auto and manual) | `E` / `Q` | |
| Clutch (manual) | `Left Shift` | |
| Camera: third-person / cockpit / hood | `C` | X |
| Third-person distance | `B` | |
| Back on the road | `R` | Y |
| Sound on / off | `M` | |
| End the run, back to the garage | `Esc` | Start |
| Start drifting (in the garage) | `Enter` | Start |

Phones and tablets get on-screen buttons. The car uses Apex Garage's **Drift** driving mode
(traction and stability control off, loose rear end, quick steering).

## Files

```
index.html       garage screen, driving HUD, results
css/drift.css    the extra styles (everything else is Apex Garage's css/style.css)
js/main.js       the game: car and build picking, runs, countdown, laps / timer, HUD, results
js/score.js      drift scoring (plugs into Apex Garage's Drive in place of its Score) and records
```

Shared with Apex Garage (in `../car-customizer/`): `js/data.js` (cars), `scene.js` (garage), `car.js`,
`body.js`, `wheels.js`, `materials.js` … (3D cars), `world.js` (locations), `drive.js` (physics and
cameras), `audio.js` (engine sound), `stats.js`, `vendor/three`. Improvements to Apex Garage's cars,
locations or handling show up in Apex Drift too.

### Changing things

- **Scoring rules:** `RULES` at the top of `js/score.js`. **Medal targets:** `TARGETS` in the same file.
- **Drift Attack length:** `ATTACK_LAPS` and `ATTACK_TIME` near the top of `js/main.js`.
- **Locations offered:** `LOCATIONS` in `js/main.js` (ids from Apex Garage's `WORLDS`).

### Screenshots

`index.html?demo&world=circuit&car=s15` starts a Free Drift where a simple autopilot drives. Add `&shot`
to hide the HUD, `&view=near` for the close chase camera, and `&steps=3` on slow machines (runs extra
physics steps per frame). The pictures in `site/covers/apex-drift*.jpg` were made this way.
