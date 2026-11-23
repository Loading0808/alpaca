# Game Hub

A website for your browser games. It has a home page with every game (search and tags) and a
play page for each one with a built-in player, fullscreen button, screenshots and controls.
**Apex Garage** is the first game on it; its own files and instructions are in
[`car-customizer/`](car-customizer/README.md).

## Run it in VS Code

1. **File → Open Folder…** and open this folder (the one with `index.html`, `games.js` and `server.js`).
2. **Terminal → New Terminal**, then run:

   ```bash
   node server.js
   ```

3. Open <http://localhost:5173>. The terminal must stay open while you use the site;
   **Ctrl + C** in it stops the server.

`node server.js` here runs the whole site **and** Apex Garage's online multiplayer. (Running
`node server.js` inside `car-customizer` still works too, for the game on its own.)

## Add a game

1. Copy your game's folder into this folder, next to `car-customizer`. The game must start from an
   HTML page, e.g. `my-game/index.html`, and use relative paths for its files (`js/game.js`, not
   `/js/game.js`).
2. Open `games.js`. At the bottom there is a **TEMPLATE** — copy it into the `GAMES` list and fill
   it in: `id`, `title`, `path` (e.g. `my-game/index.html`), a short line, a description, tags
   and controls.
3. Optional: put a 16:9 cover picture (1280 × 720 works well) in `site/covers/` and set `cover`.
   Without one, a coloured tile with the game's initials is shown. Extra pictures go in `screenshots`.
4. Save and refresh the browser. Set `featured: true` on the game you want shown big at the top.

The dashed **Add a game** card on the home page is only visible on your own computer.

Change the site name, tagline and footer at the top of `games.js` (`window.SITE`).

## Put it online

**With multiplayer (recommended):** deploy this folder to a host that runs Node.js, such as
Render, Railway, Fly.io or a VPS. Start command: `node server.js`. No packages to install; it
reads the port from `PORT`. Everyone then opens your site's address.

**Static hosting (GitHub Pages, Netlify, …):** works for the site and single-player games. Apex
Garage's online multiplayer won't connect there because those hosts can't run its server. With
GitHub Pages: repository **Settings → Pages → Deploy from a branch**, pick your branch and the
root folder.

## Files

```
index.html        home page
play.html         play page (play.html?game=<id>)
games.js          site settings and the list of games  ← the file you edit
site/style.css    site styles
site/app.js       builds the pages from games.js
site/covers/      cover pictures and screenshots
server.js         runs the site + multiplayer (uses car-customizer/server.js)
car-customizer/   Apex Garage
```
