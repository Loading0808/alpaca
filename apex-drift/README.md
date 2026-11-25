# APEX DRIFT — top-down arcade drift racer

A fast top-down drifting game in plain **HTML, CSS and JavaScript** (canvas 2D). No libraries,
no build step and no downloaded files: the tracks, cars and scenery are drawn in code, and every
sound is made live with the Web Audio API.

## Play it

It is part of the game site: from the site folder (the one with `games.js`), run

```bash
node server.js
```

and open <http://localhost:5173>, then pick **Apex Drift**. You can also open
<http://localhost:5173/apex-drift/> directly. (The page uses JavaScript modules, so double-clicking
`index.html` won't work; it has to come from a server. VS Code's *Live Server* also works.)

## How to play

| Action | Keyboard | Gamepad |
| --- | --- | --- |
| Throttle | `W` / `↑` | Right trigger |
| Brake, then reverse | `S` / `↓` | Left trigger |
| Steer | `A` `D` / `←` `→` | Left stick |
| Handbrake (starts a drift) | `Space` | A / B / RB |
| Back on the track | `R` | Y |
| Top-down ↔ chase camera | `C` | X |
| Sound on / off | `M` | |
| Pause | `Esc` / `P` | Start |

On phones and tablets, on-screen buttons appear (turn the phone sideways).

**Drifting:** come into a corner fast, tap the handbrake as you turn in, then stay on the throttle
and steer to hold the angle. Let go of the steering to straighten up; steer the other way to catch a
slide. Points grow with speed × angle. Keep sliding and the multiplier climbs to ×5. Straighten up
for about a second and the combo is banked. Hit a wall hard or run onto the grass and it's lost.
Sliding with the rear close to a wall gives a ×1.5 *Wall Kiss* bonus.

**Modes**

- **Drift Attack** — three laps, highest score wins a bronze, silver or gold medal.
- **Time Attack** — three laps against the clock; your best lap on each track comes back as a ghost.
- **Free Drift** — no laps, no clock. End the session from the pause menu to bank your points.

**Tracks:** Harbor Loop (day, wide and flowing), Canyon Hairpins (dusk, tight), Neon Ring (night).

**Cars and XP:** every point you score is XP (plus a bonus for Time Attack and for medals). XP unlocks
the Vandal R8 (25,000), Ronin GT (70,000) and Apex Zero (160,000). Each car has 8 paints.

**Settings:** sound, drift assist (Off / Normal / Strong — helps you countersteer and stops spins),
camera, and the best-lap ghost. Progress and settings are saved in the browser.

## Files

```
index.html       page, HUD and menus
css/style.css    styles (colours at the top)
js/main.js       game loop, camera, drawing, HUD, menus
js/car.js        car list, drift physics, autopilot, car drawing
js/track.js      track list, spline geometry, track and scenery drawing
js/race.js       laps, walls, grass, drift scoring, ghost recording
js/fx.js         tyre smoke, sparks, skid marks
js/audio.js      engine, tyres, hits and UI sounds
js/input.js      keyboard, touch buttons and gamepad
js/store.js      saved progress and settings
```

### Changing things

- **A new track:** add an entry to `TRACKS` in `js/track.js`. `pts` is a list of points (in metres)
  the track passes through, in driving order; it is smoothed into a closed loop. Keep corners gentle
  enough and different parts of the track far enough apart that the walls don't overlap.
- **A new car:** add an entry to `CARS` in `js/car.js`. `power` is in kW, `grip` is tyre grip,
  `slide` (0.6–0.85) is how much grip is left once sliding (lower = longer, easier drifts),
  `unlock` is the XP needed.
- **Scoring:** the numbers are in `SCORE` at the top of `js/race.js`; medal targets are in each track's
  `medals`.

### Screenshots

`index.html?demo&track=neon&car=ronin` starts a race driven by the autopilot (any car, locked or not).
Add `&shot` to hide the HUD and `&zoom=1.8` to move the camera closer. The cover pictures in
`site/covers/apex-drift*.jpg` were made this way.
