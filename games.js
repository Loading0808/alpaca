// =============================================================================
//  YOUR GAME SITE — settings and game list
//  This is the only file you need to edit to change the site or add a game.
// =============================================================================

window.SITE = {
  name: 'Game Hub',                                   // shown in the header and the browser tab
  tagline: 'Games I build. Pick one and play.',       // line under the name on the home page
  footer: 'Made with HTML, CSS, JavaScript and Three.js.',
};

// -----------------------------------------------------------------------------
//  GAMES — one entry per game. The first game with `featured: true` is shown
//  big at the top of the home page.
//
//  To add a game:
//    1. Copy your game's folder into this folder (next to car-customizer).
//    2. Copy the TEMPLATE at the bottom of this file, paste it into the list,
//       and fill it in. `path` is the page that starts your game.
//    3. Put a cover picture in site/covers/ (16:9, e.g. 1280 × 720) and set `cover`.
//       No picture yet? Leave cover out and a coloured tile is drawn for you.
//    4. Save, then refresh the browser.
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
    color: '#ff5a1f',                                     // accent colour for this game's page
    short: 'Build your dream car in a 3D garage, then race it on the highway, the drag strip and the circuit — solo or online.',
    description: [
      'A 3D car-tuning and driving game that runs right in your browser. Pick from 32 cars across 19 brands and make them your own: widebody kits, wheels, paint, air suspension, engine swaps, turbos and exhausts — each with its own engine sound.',
      'Then take your build out: weave through traffic on a night-time expressway, run the quarter mile with launch control and a parachute, set lap times on a race circuit, or cruise a neon city. Race your friends online too.',
    ],
    tags: ['Racing', '3D', 'Car tuning', 'Multiplayer'],
    controls: [
      ['W / S', 'Throttle / brake'],
      ['A / D', 'Steer'],
      ['Space', 'Handbrake'],
      ['E / Q', 'Shift up / down'],
      ['C', 'Change camera'],
      ['P', 'Parachute'],
      ['Esc', 'Back to the garage'],
    ],
    notes: 'Online multiplayer works when the site runs with node server.js. Best with a keyboard on a computer.',
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
    color: '#38bdf8',
    short: 'One sentence that makes people want to play.',
    description: ['A longer paragraph about the game.'],
    tags: ['Puzzle'],
    controls: [['Mouse', 'Click to play']],
    notes: '',
    year: 2026,
    featured: false,
  },
  --------------------------------------------------------------------------- */
];
