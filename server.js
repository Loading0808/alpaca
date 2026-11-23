// Runs the whole game site: the hub pages, every game folder, and Apex Garage's
// online multiplayer — all on one address.
//
//   node server.js          → http://localhost:5173   (set PORT to change it)
//
// It reuses the game's own server, telling it to serve this whole folder.
process.env.STATIC_ROOT = __dirname;
require('./car-customizer/server.js');
