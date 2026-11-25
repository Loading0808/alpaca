// =============================================================================
//  YOUR GAME SITE — settings and game list
//  This is the only file you need to edit to change the site or add a game.
// =============================================================================

window.SITE = {
  name: 'Game Hub',                                   // shown in the top bar and the browser tab
  tagline: 'Free games to play right in your browser.',
  footer: 'All games made by me. Play free in your browser.',
  comingSoon: true,                                   // fill empty space with "Coming soon" tiles (set false to hide them)
};

// -----------------------------------------------------------------------------
//  GAMES — one entry per game.
//
//  To add a game:
//    1. Copy your game's folder into this folder (next to car-customizer).
//    2. Copy the TEMPLATE at the bottom of this file, paste it into the list,
//       and fill it in. `path` is the page that starts your game.
//    3. Put a cover picture in site/covers/ (16:9, e.g. 1280 × 720) and set `cover`.
//       No picture yet? Leave cover out and a coloured tile is drawn for you.
//    4. Save, then refresh the browser.
//
//  featured: true → big tile on the home page (the first featured game is the big banner)
//  category       → the main group it's listed under in the sidebar (Racing, Puzzle, Action …)
//  tags           → extra groups it also appears under
//  badge          → small label on the tile: 'NEW', 'UPDATED', 'HOT' — or leave it out
//  keyboard: true → tells phone visitors it needs a keyboard
// -----------------------------------------------------------------------------
window.GAMES = [
  {
    id: 'apex-garage',                                   // short name used in the web address (letters, numbers, dashes)
    title: 'Apex Garage',
    path: 'car-customizer/index.html',                   // the page that starts the game
    cover: 'site/covers/apex-garage.jpg',
    screenshots: [
      'site/covers/apex-garage-highway.jpg',
      'site/covers/apex-garage-drag.jpg',
      'site/covers/apex-garage-cockpit.jpg',
    ],
    category: 'Racing',
    tags: ['Multiplayer', '3D', 'Car tuning'],
    badge: 'NEW',
    short: 'Build your dream car in a 3D garage, then race it on the highway, the drag strip and the circuit — solo or online.',
    description: [
      'A 3D car-tuning and driving game that runs right in your browser. Pick from 32 cars across 19 brands and make them your own: widebody kits, wheels, paint, air suspension, engine swaps, turbos and exhausts — each with its own engine sound.',
      'Then take your build out: weave through traffic on a night-time expressway, run the quarter mile with launch control and a parachute, set lap times on a race circuit, or cruise a neon city. Race your friends online too.',
    ],
    controls: [
      ['W / S', 'Throttle / brake'],
      ['A / D', 'Steer'],
      ['Space', 'Handbrake'],
      ['E / Q', 'Shift up / down'],
      ['C', 'Change camera'],
      ['P', 'Parachute'],
      ['Esc', 'Back to the garage'],
    ],
    notes: 'Online multiplayer works when the site runs with node server.js.',
    keyboard: true,
    year: 2026,
    featured: true,
  },

  {
    id: 'apex-drift',
    title: 'Apex Drift',
    path: 'apex-drift/index.html',
    cover: 'site/covers/apex-drift.jpg',
    screenshots: [
      'site/covers/apex-drift-hud.jpg',
      'site/covers/apex-drift-neon.jpg',
      'site/covers/apex-drift-harbor.jpg',
    ],
    category: 'Racing',
    tags: ['Arcade', 'Drifting'],
    badge: 'NEW',
    short: 'Top-down arcade drifting: throw it sideways, chain the corners and stack the multiplier.',
    description: [
      'A fast top-down drift racer. Kick the tail out with the handbrake, hold the slide on the throttle and chain corner after corner. Points grow with speed and angle, the multiplier climbs to ×5 the longer you slide, and a hard hit on the wall or a trip onto the grass throws the combo away.',
      'Race three tracks (a harbour loop by day, canyon hairpins at dusk and a neon city ring at night) in Drift Attack, Time Attack against your best-lap ghost, or Free Drift. Win medals, earn XP and unlock four cars, each with its own handling and paint.',
    ],
    controls: [
      ['W / ↑', 'Throttle'],
      ['S / ↓', 'Brake / reverse'],
      ['A D / ← →', 'Steer'],
      ['Space', 'Handbrake (start a drift)'],
      ['R', 'Back on the track'],
      ['C', 'Change camera'],
      ['Esc', 'Pause'],
    ],
    notes: 'Works with a gamepad, and on phones with on-screen buttons (turn the phone sideways).',
    keyboard: false,
    year: 2026,
    featured: true,
  },

  /* ---------------------------------------------------------------------------
  TEMPLATE — copy everything between the curly brackets (including the comma
  after the closing bracket) into the list above, then fill it in.

  {
    id: 'my-new-game',
    title: 'My New Game',
    path: 'my-new-game/index.html',
    cover: 'site/covers/my-new-game.jpg',
    screenshots: [],
    category: 'Puzzle',
    tags: [],
    badge: 'NEW',
    short: 'One sentence that makes people want to play.',
    description: ['A longer paragraph about the game.'],
    controls: [['Mouse', 'Click to play']],
    notes: '',
    keyboard: false,
    year: 2026,
    featured: false,
  },
  --------------------------------------------------------------------------- */
];
