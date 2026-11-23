// Game portal: builds the top bar, sidebar, home page and game pages from games.js.
// Plain script (no modules), so it also opens straight from disk.
(function () {
  const SITE = Object.assign({ name: 'Game Hub', tagline: '', footer: '', comingSoon: true }, window.SITE || {});
  const GAMES = (window.GAMES || []).filter(g => g && g.id && g.title && g.path);
  const byId = id => GAMES.find(g => g.id === id);
  const $ = id => document.getElementById(id);
  const el = (tag, attrs = {}, ...kids) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === 'class') n.className = v; else if (k === 'style') n.style.cssText = v; else if (k === 'html') n.innerHTML = v;
      else if (k.startsWith('on')) n.addEventListener(k.slice(2), v); else n.setAttribute(k, v);
    }
    for (const c of kids.flat()) if (c != null && c !== false) n.append(c.nodeType ? c : document.createTextNode(c));
    return n;
  };
  const playUrl = g => `play.html?game=${encodeURIComponent(g.id)}`;
  const paras = d => (Array.isArray(d) ? d : d ? [d] : []);
  const groupsOf = g => [g.category, ...(g.tags || [])].filter(Boolean);
  const local = /^(localhost|127\.0\.0\.1|\[::1\]|)$/.test(location.hostname);

  // ---- remembered in this browser: recently played and favourites
  const store = {
    get(k, d) { try { return JSON.parse(localStorage.getItem('gamehub-' + k)) ?? d; } catch (_) { return d; } },
    set(k, v) { try { localStorage.setItem('gamehub-' + k, JSON.stringify(v)); } catch (_) { /* private mode */ } },
  };
  const recent = () => store.get('recent', []).filter(byId);
  const addRecent = id => store.set('recent', [id, ...store.get('recent', []).filter(x => x !== id)].slice(0, 12));
  const favs = () => store.get('favs', []).filter(byId);
  const isFav = id => favs().includes(id);
  const toggleFav = id => { const f = favs(); store.set('favs', f.includes(id) ? f.filter(x => x !== id) : [id, ...f]); return !f.includes(id); };

  // ---- icons (inline SVG paths)
  const ICON = {
    home: 'M3 11.5 12 4l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z',
    recent: 'M12 3a9 9 0 1 0 9 9h-2a7 7 0 1 1-2.05-4.95L14 10h7V3l-2.64 2.64A8.97 8.97 0 0 0 12 3zm-1 5h2v4.6l3.2 1.9-1 1.7-4.2-2.5z',
    heart: 'M12 21s-7.5-4.6-9.6-9.2C.9 8.6 2.8 4.5 6.6 4.5c2.2 0 3.7 1.2 5.4 3.2 1.7-2 3.2-3.2 5.4-3.2 3.8 0 5.7 4.1 4.2 7.3C19.5 16.4 12 21 12 21z',
    new: 'M12 2l2.6 6.4L21 9.2l-5 4.4 1.6 6.9L12 17l-5.6 3.5L8 13.6 3 9.2l6.4-.8z',
    racing: 'M5 3h2v18H5zm3 1h11l-2 4 2 4H8z',
    multiplayer: 'M8 11a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm8 0a3 3 0 1 1 0-6 3 3 0 0 1 0 6zM1 20c0-3.9 3.1-7 7-7s7 3.1 7 7zm15.5 0c0-2.3-.9-4.4-2.3-5.9.6-.1 1.2-.1 1.8-.1 3.9 0 7 2.7 7 6z',
    '3d': 'M12 2 3 7v10l9 5 9-5V7zm0 2.3L18.7 8 12 11.7 5.3 8zM5 9.7l6 3.3v6.7l-6-3.4zm8 10V13l6-3.3v6.6z',
    puzzle: 'M10 3a2 2 0 0 1 4 0v2h4a1 1 0 0 1 1 1v4h-2a2 2 0 0 0 0 4h2v4a1 1 0 0 1-1 1h-4v-2a2 2 0 0 0-4 0v2H6a1 1 0 0 1-1-1v-4h2a2 2 0 0 0 0-4H5V6a1 1 0 0 1 1-1h4z',
    action: 'M13 2 4 14h6l-1 8 9-12h-6z',
    shooting: 'M11 2h2v3.07A7 7 0 0 1 18.93 11H22v2h-3.07A7 7 0 0 1 13 18.93V22h-2v-3.07A7 7 0 0 1 5.07 13H2v-2h3.07A7 7 0 0 1 11 5.07zm1 5a5 5 0 1 0 0 10 5 5 0 0 0 0-10zm0 3a2 2 0 1 1 0 4 2 2 0 0 1 0-4z',
    sports: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 2c1 0 2 .2 2.9.6L12 6.7 9.1 4.6A8 8 0 0 1 12 4zm-5.3 2 3.3 2.4-1.2 3.8H4.2A8 8 0 0 1 6.7 6zM4.4 14.2h4l1.2 3.8-1.8 1.4a8 8 0 0 1-3.4-5.2zM12 20c-.6 0-1.2-.1-1.8-.2l1.8-1.4 1.8 1.4c-.6.1-1.2.2-1.8.2zm4.2-.6L14.4 18l1.2-3.8h4a8 8 0 0 1-3.4 5.2zm-.6-7.2-1.2-3.8L17.3 6a8 8 0 0 1 2.5 6.2z',
    tuning: 'M21.7 18.3 13.4 10a6 6 0 0 0-7.8-7.8l3.6 3.6-3.4 3.4L2.2 5.6A6 6 0 0 0 10 13.4l8.3 8.3a2 2 0 0 0 3.4-1.4 2 2 0 0 0 0-2z',
    adventure: 'M12 2 2 21h20zm0 4.5L18.6 19H5.4z',
    arcade: 'M7 6h10a5 5 0 0 1 5 5v3a4 4 0 0 1-7 2.6h-6A4 4 0 0 1 2 14v-3a5 5 0 0 1 5-5zm1 3v2H6v2h2v2h2v-2h2v-2h-2V9zm8 1a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zm2.5 2.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3z',
    random: 'M17 3l4 4-4 4V8h-2.6l-7 9H4v-2h2.6l7-9H17zm0 10 4 4-4 4v-3h-3.4l-2.2-2.8 1.3-1.6 1.9 2.4H17zM4 7h3.4l2.2 2.8-1.3 1.6L6.4 9H4z',
    search: 'M10 3a7 7 0 0 1 5.6 11.2l5.6 5.6-1.4 1.4-5.6-5.6A7 7 0 1 1 10 3zm0 2a5 5 0 1 0 0 10 5 5 0 0 0 0-10z',
    menu: 'M3 6h18v2H3zm0 5h18v2H3zm0 5h18v2H3z',
    play: 'M8 5v14l11-7z',
    share: 'M18 16a3 3 0 0 0-2.4 1.2l-6.7-3.4a3 3 0 0 0 0-1.6l6.7-3.4A3 3 0 1 0 15 7l-6.7 3.4a3 3 0 1 0 0 3.2L15 17a3 3 0 1 0 3-1z',
    full: 'M4 4h6v2H6v4H4zm10 0h6v6h-2V6h-4zM4 14h2v4h4v2H4zm14 0h2v6h-6v-2h4z',
    restart: 'M12 5V2L7 6l5 4V7a5 5 0 1 1-5 5H5a7 7 0 1 0 7-7z',
    tab: 'M14 3h7v7h-2V6.4l-8.3 8.3-1.4-1.4L17.6 5H14zM5 5h6v2H5v12h12v-6h2v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z',
    lock: 'M7 10V7a5 5 0 0 1 10 0v3h1a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1zm2 0h6V7a3 3 0 0 0-6 0z',
    keyboard: 'M3 6h18a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1zm2 3v2h2V9zm4 0v2h2V9zm4 0v2h2V9zm4 0v2h2V9zM7 13v2h10v-2z',
    game: 'M7 6h10a5 5 0 0 1 5 5v3a4 4 0 0 1-7 2.6h-6A4 4 0 0 1 2 14v-3a5 5 0 0 1 5-5z',
  };
  const NS = 'http://www.w3.org/2000/svg';
  const icon = (name, cls = 'ico') => {
    const s = document.createElementNS(NS, 'svg'), p = document.createElementNS(NS, 'path');
    s.setAttribute('class', cls); s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('aria-hidden', 'true');
    p.setAttribute('d', ICON[name] || ICON.game); s.append(p); return s;
  };
  const groupIcon = g => { const k = g.toLowerCase().replace(/\s+/g, ''); return ICON[k] ? k : k.includes('car') ? 'tuning' : k.includes('shoot') ? 'shooting' : 'game'; };

  // ---- top bar + sidebar (same on every page)
  function shell(active) {
    const groups = [...new Set(GAMES.flatMap(groupsOf))];
    const count = name => GAMES.filter(g => groupsOf(g).includes(name)).length;
    const link = (href, ico, label, key, n) => el('a', { class: 'nav-item' + (active === key ? ' on' : ''), href, 'aria-current': active === key ? 'page' : null }, icon(ico), el('span', {}, label), n ? el('em', {}, String(n)) : null);
    const q = new URLSearchParams(location.search).get('q') || '';
    const search = el('form', { class: 'search', role: 'search', action: './', onsubmit: e => { if (document.body.dataset.page === 'home') { e.preventDefault(); go({ q: input.value.trim() }); } } },
      icon('search'), el('label', { class: 'sr', for: 'q' }, 'Search games'));
    const input = el('input', { id: 'q', name: 'q', type: 'search', placeholder: `Search ${GAMES.length} game${GAMES.length === 1 ? '' : 's'}…`, value: q, autocomplete: 'off' });
    search.append(input);
    if (document.body.dataset.page === 'home') input.addEventListener('input', () => go({ q: input.value.trim() }, true));

    const side = el('nav', { class: 'side', id: 'side', 'aria-label': 'Categories' },
      link('./', 'home', 'Home', 'home'),
      link('./?view=recent', 'recent', 'Recently played', 'recent', recent().length),
      link('./?view=favs', 'heart', 'Favourites', 'favs', favs().length),
      link('./?view=new', 'new', 'New', 'new', GAMES.filter(g => g.badge).length),
      el('div', { class: 'nav-sep' }, 'Categories'),
      groups.map(gr => link('./?cat=' + encodeURIComponent(gr), groupIcon(gr), gr, 'cat:' + gr, count(gr))));
    const top = el('header', { class: 'top' },
      el('button', { class: 'icon-btn menu', type: 'button', 'aria-label': 'Menu', 'aria-controls': 'side', 'aria-expanded': 'false', onclick: e => { const o = document.body.classList.toggle('side-open'); e.currentTarget.setAttribute('aria-expanded', String(o)); } }, icon('menu')),
      el('a', { class: 'logo', href: './' }, el('span', { class: 'logo-mark', 'aria-hidden': 'true' }, icon('play', 'logo-play')), el('span', { class: 'logo-name' }, SITE.name)),
      search,
      el('button', { class: 'pill hot random', type: 'button', title: 'Play a random game', disabled: GAMES.length ? null : true, onclick: () => { const g = GAMES[Math.floor(Math.random() * GAMES.length)]; if (g) location.href = playUrl(g); } }, icon('random'), el('span', {}, 'Random')));
    const scrim = el('div', { class: 'scrim', onclick: () => document.body.classList.remove('side-open') });
    $('shell').replaceWith(top, side, scrim);
    document.querySelectorAll('[data-site="footer"]').forEach(n => { n.textContent = SITE.footer || ''; });
  }
  function go(params, replace) {
    const u = new URL(location.href); u.search = '';
    for (const [k, v] of Object.entries(params)) if (v) u.searchParams.set(k, v);
    history[replace ? 'replaceState' : 'pushState'](null, '', u); home(true);
  }

  // ---- tiles
  /** Cover image, or a generated tile (red/orange + initials) when there is no picture or it fails to load. */
  function art(g, src) {
    const box = el('div', { class: 'art' }, el('div', { class: 'art-tile', 'aria-hidden': 'true' }, g.title.split(/\s+/).map(w => w[0]).join('').slice(0, 3).toUpperCase()));
    const s = src || g.cover;
    if (s) { const img = el('img', { src: s, alt: '', loading: 'lazy', decoding: 'async' }); img.addEventListener('load', () => box.classList.add('has-img')); img.addEventListener('error', () => img.remove()); box.append(img); }
    return box;
  }
  function tile(g, size = '') {
    const a = el('a', { class: 'tile ' + size, href: playUrl(g), title: g.title }, art(g),
      el('span', { class: 'tile-name' }, g.title),
      g.badge ? el('span', { class: 'badge' }, g.badge) : null,
      isFav(g.id) ? el('span', { class: 'tile-fav', 'aria-label': 'Favourite' }, icon('heart')) : null);
    // hovering flips through the screenshots, like a preview
    const shots = (g.screenshots || []).filter(Boolean);
    if (shots.length) {
      let t = null, i = 0, layer = null;
      const stop = () => { clearInterval(t); t = null; if (layer) { layer.remove(); layer = null; } };
      a.addEventListener('pointerenter', () => {
        if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
        layer = el('img', { class: 'preview', src: shots[0], alt: '' }); a.querySelector('.art').append(layer); i = 0;
        t = setInterval(() => { i = (i + 1) % shots.length; layer.src = shots[i]; }, 900);
      });
      a.addEventListener('pointerleave', stop);
    }
    return a;
  }
  const soonTile = () => el('div', { class: 'tile soon', 'aria-hidden': 'true' }, el('div', { class: 'art' }, icon('lock', 'soon-lock')), el('span', { class: 'tile-name' }, 'Coming soon'));
  const section = (title, ico, ...kids) => el('section', { class: 'shelf' }, el('h2', {}, icon(ico), title), ...kids);

  // ---- home page
  function home(rerender) {
    const p = new URLSearchParams(location.search), q = (p.get('q') || '').toLowerCase(), cat = p.get('cat'), view = p.get('view');
    const key = q ? '' : cat ? 'cat:' + cat : view || 'home';
    if (!rerender) shell(key); else document.querySelectorAll('.nav-item').forEach(n => { const on = n.getAttribute('href') === (key === 'home' ? './' : key.startsWith('cat:') ? './?cat=' + encodeURIComponent(cat) : './?view=' + view); n.classList.toggle('on', on); });
    const c = $('content'); c.replaceChildren();
    document.title = SITE.name + (cat ? ` — ${cat} games` : view === 'recent' ? ' — Recently played' : view === 'favs' ? ' — Favourites' : '');

    const list = (title, ico, games, empty) => {
      c.append(el('div', { class: 'page-head' }, el('h1', {}, icon(ico), title), el('p', { class: 'muted' }, `${games.length} game${games.length === 1 ? '' : 's'}`)));
      if (!games.length) { c.append(el('p', { class: 'empty' }, empty)); return; }
      c.append(el('div', { class: 'grid' }, games.map(g => tile(g))));
    };
    if (q) return list(`Results for “${p.get('q')}”`, 'search', GAMES.filter(g => [g.title, g.short, ...groupsOf(g), ...paras(g.description)].join(' ').toLowerCase().includes(q)), 'No games match that. Try another word.');
    if (cat) return list(`${cat} games`, groupIcon(cat), GAMES.filter(g => groupsOf(g).includes(cat)), 'Nothing here yet.');
    if (view === 'recent') return list('Recently played', 'recent', recent().map(byId), 'Games you play show up here.');
    if (view === 'favs') return list('Favourites', 'heart', favs().map(byId), 'Tap the ♥ on a game’s page to keep it here.');
    if (view === 'new') return list('New', 'new', GAMES.filter(g => g.badge), 'Nothing new right now.');

    // spotlight banner for the featured game
    const f = GAMES.find(g => g.featured) || GAMES[0];
    if (f) c.append(el('a', { class: 'spotlight', href: playUrl(f) },
      art(f),
      el('div', { class: 'spot-copy' },
        el('span', { class: 'spot-kicker' }, f.badge ? `${f.badge} · ${f.category || 'Featured'}` : f.category || 'Featured'),
        el('h1', {}, f.title),
        el('p', {}, f.short || ''),
        el('span', { class: 'pill hot big' }, icon('play'), 'Play now'))));
    else c.append(el('div', { class: 'page-head' }, el('h1', {}, SITE.name), el('p', { class: 'muted' }, 'No games yet — add one in games.js.')));

    const r = recent();
    if (r.length) c.append(section('Recently played', 'recent', el('div', { class: 'grid' }, r.map(id => tile(byId(id))))));

    // every game: featured ones get a big tile; "Coming soon" fills the rest of the first rows
    const grid = el('div', { class: 'grid mosaic' }, GAMES.map(g => tile(g, g.featured ? 'big' : '')));
    c.append(section('All games', 'game', grid));
    // "Coming soon" tiles only top up the first two rows, however wide the screen is
    if (SITE.comingSoon) {
      const cols = getComputedStyle(grid).gridTemplateColumns.split(' ').filter(Boolean).length || 6;
      const used = GAMES.reduce((n, g) => n + (g.featured ? 4 : 1), 0), rows = Math.max(2, Math.ceil(used / cols));
      for (let i = used; i < cols * rows; i++) grid.append(soonTile());
    }
    if (local) c.append(el('p', { class: 'owner-note' }, 'Only you see this: add a game by copying its folder in here and adding an entry to games.js. Turn the “Coming soon” tiles off with comingSoon: false in games.js.'));
  }
  let rz; window.addEventListener('resize', () => { if (document.body.dataset.page !== 'home') return; clearTimeout(rz); rz = setTimeout(() => home(true), 200); });
  window.addEventListener('popstate', () => { if (document.body.dataset.page === 'home') { const i = $('q'); if (i) i.value = new URLSearchParams(location.search).get('q') || ''; home(true); } });

  // ---- game page
  function play() {
    const g = byId(new URLSearchParams(location.search).get('game'));
    shell(g && g.category ? 'cat:' + g.category : '');
    const c = $('content');
    if (!g) {
      document.title = 'Game not found — ' + SITE.name;
      c.append(el('div', { class: 'missing' }, el('h1', {}, 'Game not found'), el('p', { class: 'muted' }, 'That game isn’t here. It may have been renamed.'), el('a', { class: 'pill hot big', href: './' }, 'See all games')));
      return;
    }
    document.title = `${g.title} — Play free on ${SITE.name}`;
    const touchOnly = matchMedia('(hover: none) and (pointer: coarse)').matches;

    // player with a splash screen; the game only loads when you press Play
    const frame = el('iframe', { title: g.title, allow: 'fullscreen; autoplay; gamepad', allowfullscreen: '' });
    const splash = el('div', { class: 'splash' },
      g.cover ? el('img', { class: 'splash-bg', src: g.cover, alt: '' }) : null,
      el('div', { class: 'splash-card' },
        el('div', { class: 'splash-thumb' }, art(g)),
        el('h1', {}, g.title),
        el('button', { class: 'pill hot huge', type: 'button', id: 'playBtn' }, icon('play'), 'Play'),
        g.keyboard && touchOnly ? el('p', { class: 'splash-warn' }, icon('keyboard'), 'This game needs a keyboard — best on a computer.') : null,
        location.protocol === 'file:' ? el('p', { class: 'splash-warn' }, 'Run the site with node server.js to play.') : null));
    const stage = el('div', { class: 'stage' }, frame, splash);
    const load = () => {
      if (stage.classList.contains('running')) return;
      frame.src = g.path; stage.classList.add('running'); splash.hidden = true; addRecent(g.id);
      frame.addEventListener('load', () => frame.focus(), { once: true });
      for (const b of document.querySelectorAll('.need-run')) b.disabled = false;
    };
    splash.querySelector('#playBtn').addEventListener('click', load);
    stage.addEventListener('pointerdown', () => { if (stage.classList.contains('running')) frame.focus(); });

    const favBtn = el('button', { class: 'tool' + (isFav(g.id) ? ' on' : ''), type: 'button', 'aria-pressed': String(isFav(g.id)), title: 'Favourite' }, icon('heart'), el('span', {}, 'Favourite'));
    favBtn.addEventListener('click', () => { const on = toggleFav(g.id); favBtn.classList.toggle('on', on); favBtn.setAttribute('aria-pressed', String(on)); toast(on ? 'Added to favourites' : 'Removed from favourites'); refreshCounts(); });
    const tools = el('div', { class: 'tools' },
      favBtn,
      el('button', { class: 'tool', type: 'button', title: 'Copy link', onclick: () => { (navigator.clipboard ? navigator.clipboard.writeText(location.href) : Promise.reject()).then(() => toast('Link copied — send it to a friend'), () => toast(location.href)); } }, icon('share'), el('span', {}, 'Share')),
      el('button', { class: 'tool need-run', type: 'button', title: 'Restart', disabled: true, onclick: () => { frame.src = 'about:blank'; requestAnimationFrame(() => { frame.src = g.path; frame.focus(); }); } }, icon('restart'), el('span', {}, 'Restart')),
      el('a', { class: 'tool', href: g.path, target: '_blank', rel: 'noopener', title: 'Open in its own tab' }, icon('tab'), el('span', {}, 'New tab')),
      el('button', { class: 'tool need-run', type: 'button', title: 'Fullscreen', disabled: true, onclick: () => { (stage.requestFullscreen || stage.webkitRequestFullscreen || (() => { })).call(stage); frame.focus(); } }, icon('full'), el('span', {}, 'Fullscreen')));
    const bar = el('div', { class: 'game-bar' },
      el('div', { class: 'gb-thumb' }, art(g)),
      el('div', { class: 'gb-title' }, el('h2', {}, g.title), el('p', { class: 'muted' }, [g.category, g.year].filter(Boolean).join(' · '))),
      tools);

    const others = GAMES.filter(x => x.id !== g.id);
    const rail = el('aside', { class: 'rail', 'aria-label': 'More games' }, el('h3', {}, 'More games'),
      el('div', { class: 'rail-grid' }, others.map(x => tile(x)), SITE.comingSoon ? Array.from({ length: Math.max(0, 4 - others.length) }, soonTile) : null));
    const shots = [g.cover, ...(g.screenshots || [])].filter(Boolean);
    const about = el('section', { class: 'about' },
      el('div', { class: 'about-main' },
        el('h2', {}, `About ${g.title}`),
        paras(g.description).map(t => el('p', {}, t)),
        el('div', { class: 'chips' }, groupsOf(g).map(t => el('a', { class: 'chip', href: './?cat=' + encodeURIComponent(t) }, t))),
        shots.length ? el('div', { class: 'shots' }, shots.map((s, i) => { const b = el('button', { class: 'shot', type: 'button', 'aria-label': `Screenshot ${i + 1} — enlarge` }, el('img', { src: s, alt: '', loading: 'lazy' })); b.addEventListener('click', () => { $('lbImg').src = s; $('lightbox').hidden = false; $('lbClose').focus(); }); return b; })) : null),
      g.controls && g.controls.length ? el('div', { class: 'about-side' },
        el('h2', {}, 'Controls'),
        el('dl', { class: 'controls' }, g.controls.flatMap(([k, v]) => [el('dt', {}, el('kbd', {}, k)), el('dd', {}, v)])),
        g.notes ? el('p', { class: 'note' }, g.notes) : null) : null);

    c.append(el('div', { class: 'play-layout' }, el('div', { class: 'play-col' }, stage, bar), rail), about);
    const lb = $('lightbox'), closeLb = () => { lb.hidden = true; };
    $('lbClose').addEventListener('click', closeLb); lb.addEventListener('click', e => { if (e.target === lb) closeLb(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && !lb.hidden) closeLb(); });
    // arrow keys / space go to the game, not the page
    window.addEventListener('keydown', e => { if (stage.classList.contains('running') && document.activeElement === document.body && ['Space', 'ArrowUp', 'ArrowDown'].includes(e.code)) { e.preventDefault(); frame.focus(); } });
  }
  function refreshCounts() { const s = document.querySelector('a[href="./?view=favs"]'); if (s) { const em = s.querySelector('em'), n = favs().length; if (n) { if (em) em.textContent = n; else s.append(el('em', {}, String(n))); } else if (em) em.remove(); } }
  let toastT; function toast(msg) { const t = $('toast'); if (!t) return; t.textContent = msg; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2200); }

  if (document.body.dataset.page === 'play') play(); else home();
})();
