// Game Hub: renders the home page and the play page from games.js.
// Plain script (no modules), so the home page also opens straight from disk.
(function () {
  const SITE = window.SITE || { name: 'Game Hub', tagline: '', footer: '' };
  const GAMES = (window.GAMES || []).filter(g => g && g.id && g.title && g.path);
  const $ = id => document.getElementById(id);
  const el = (tag, attrs = {}, ...kids) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === 'class') n.className = v; else if (k === 'style') n.style.cssText = v; else if (k.startsWith('on')) n.addEventListener(k.slice(2), v); else n.setAttribute(k, v);
    }
    for (const c of kids.flat()) if (c != null && c !== false) n.append(c.nodeType ? c : document.createTextNode(c));
    return n;
  };
  const playUrl = g => `play.html?game=${encodeURIComponent(g.id)}`;
  const paras = d => (Array.isArray(d) ? d : d ? [d] : []);

  // site name / footer everywhere
  document.querySelectorAll('[data-site="name"]').forEach(n => { n.textContent = SITE.name; });
  document.querySelectorAll('[data-site="footer"]').forEach(n => { n.textContent = SITE.footer || ''; });

  /** Cover image, or a generated tile (game colour + initials) when there is no picture or it fails to load. */
  function cover(g, cls) {
    const box = el('div', { class: 'cover ' + (cls || ''), style: `--c:${g.color || '#7c8aa5'}` });
    const tile = el('div', { class: 'cover-tile', 'aria-hidden': 'true' }, g.title.split(/\s+/).map(w => w[0]).join('').slice(0, 3).toUpperCase());
    box.append(tile);
    if (g.cover) {
      const img = el('img', { src: g.cover, alt: '', loading: cls === 'hero-img' ? 'eager' : 'lazy', decoding: 'async' });
      img.addEventListener('load', () => box.classList.add('has-img'));
      img.addEventListener('error', () => img.remove());
      box.append(img);
    }
    return box;
  }
  const tagList = (tags, cls = 'tags static') => el('div', { class: cls }, (tags || []).map(t => el('span', { class: 'tag' }, t)));

  // ---------------------------------------------------------------- home page
  function home() {
    document.title = SITE.name;
    const featured = GAMES.find(g => g.featured) || GAMES[0];
    const hero = $('featured');
    if (featured) {
      hero.style.setProperty('--c', featured.color || '#ff5a1f');
      hero.append(
        cover(featured, 'hero-img'),
        el('div', { class: 'hero-copy' },
          el('p', { class: 'eyebrow' }, SITE.tagline || 'Featured'),
          el('h1', {}, featured.title),
          el('p', { class: 'lede' }, featured.short || ''),
          tagList(featured.tags),
          el('div', { class: 'hero-actions' },
            el('a', { class: 'btn primary big', href: playUrl(featured) }, 'Play now'),
            GAMES.length > 1 ? el('a', { class: 'btn big', href: '#games' }, `Browse ${GAMES.length} games`) : null)));
    } else hero.append(el('div', { class: 'hero-copy' }, el('h1', {}, SITE.name), el('p', { class: 'lede' }, 'No games yet — add one in games.js.')));

    // tag filter + search
    const allTags = [...new Set(GAMES.flatMap(g => g.tags || []))].sort();
    let tag = '', q = '';
    const tagBox = $('tags');
    const chips = ['All', ...allTags].map(t => el('button', { type: 'button', class: 'chip', 'aria-pressed': String(t === 'All'), onclick: () => { tag = t === 'All' ? '' : t; chips.forEach(c => c.setAttribute('aria-pressed', String(c.textContent === (tag || 'All')))); render(); } }, t));
    if (allTags.length > 1) tagBox.append(...chips);
    $('search').addEventListener('input', e => { q = e.target.value.trim().toLowerCase(); render(); });

    const cards = GAMES.map(g => el('a', { class: 'card', href: playUrl(g), style: `--c:${g.color || '#7c8aa5'}` },
      cover(g),
      el('div', { class: 'card-body' },
        el('div', { class: 'card-top' }, el('h3', {}, g.title), g.year ? el('span', { class: 'muted small' }, String(g.year)) : null),
        el('p', {}, g.short || ''),
        tagList(g.tags)),
      el('span', { class: 'card-play', 'aria-hidden': 'true' }, 'Play')));

    const grid = $('grid');
    function render() {
      let n = 0; grid.replaceChildren();
      GAMES.forEach((g, i) => {
        const text = [g.title, g.short, ...(g.tags || []), ...paras(g.description)].join(' ').toLowerCase();
        if ((tag && !(g.tags || []).includes(tag)) || (q && !text.includes(q))) return;
        grid.append(cards[i]); n++;
      });
      // a placeholder card for the site owner, only when running on this computer
      if (/^(localhost|127\.0\.0\.1|\[::1\]|)$/.test(location.hostname) && !q && !tag) grid.append(el('div', { class: 'card add' },
        el('div', { class: 'add-plus', 'aria-hidden': 'true' }, '+'),
        el('h3', {}, 'Add a game'),
        el('p', {}, 'Copy its folder in here and add an entry to games.js. Only you see this card — it is hidden on the live site.')));
      $('empty').hidden = n > 0;
      $('count').textContent = `${GAMES.length} game${GAMES.length === 1 ? '' : 's'}`;
    }
    render();
  }

  // ---------------------------------------------------------------- play page
  function play() {
    const id = new URLSearchParams(location.search).get('game');
    const g = GAMES.find(x => x.id === id);
    const main = $('playMain');
    if (!g) {
      document.title = 'Game not found — ' + SITE.name;
      main.replaceChildren(el('div', { class: 'missing' }, el('h1', {}, 'Game not found'), el('p', { class: 'muted' }, 'That game isn’t in the list. It may have been renamed.'), el('a', { class: 'btn primary', href: './#games' }, 'See all games')));
      return;
    }
    document.title = `${g.title} — ${SITE.name}`;
    document.body.style.setProperty('--c', g.color || '#ff5a1f');
    $('title').textContent = g.title; $('short').textContent = g.short || '';
    $('newtab').href = g.path;
    $('desc').append(...paras(g.description).map(p => el('p', {}, p)));
    $('dtags').replaceWith(tagList(g.tags));
    if (g.controls && g.controls.length) $('controls').append(...g.controls.flatMap(([k, v]) => [el('dt', {}, el('kbd', {}, k)), el('dd', {}, v)]));
    else $('controlsBox').hidden = true;
    if (g.notes) { $('notes').textContent = g.notes; $('notes').hidden = false; }

    // screenshots (click to enlarge)
    const shots = [g.cover, ...(g.screenshots || [])].filter(Boolean);
    const lb = $('lightbox'), lbImg = $('lbImg');
    const closeLb = () => { lb.hidden = true; };
    $('lbClose').addEventListener('click', closeLb); lb.addEventListener('click', e => { if (e.target === lb) closeLb(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && !lb.hidden) closeLb(); });
    $('shots').append(...shots.map((src, i) => {
      const b = el('button', { type: 'button', class: 'shot', 'aria-label': `Screenshot ${i + 1} — enlarge` }, el('img', { src, alt: '', loading: 'lazy' }));
      b.addEventListener('click', () => { lbImg.src = src; lb.hidden = false; $('lbClose').focus(); });
      b.querySelector('img').addEventListener('error', () => b.remove());
      return b;
    }));

    // player: the game only loads when you press Play, so the page itself stays quick
    const stage = $('stage'), frame = $('frame'), start = $('start');
    const posterImg = g.cover ? el('img', { src: g.cover, alt: '', class: 'poster' }) : null;
    if (posterImg) { posterImg.addEventListener('error', () => posterImg.remove()); stage.prepend(posterImg); }
    const load = () => {
      frame.src = g.path; stage.classList.add('running'); start.hidden = true; if (posterImg) posterImg.remove();
      $('fs').disabled = false; $('restart').disabled = false;
      frame.addEventListener('load', () => frame.focus(), { once: true });
    };
    start.addEventListener('click', () => { if (!stage.classList.contains('running')) load(); });
    if (location.protocol === 'file:') $('startHint').textContent = 'Run the site with node server.js to play';
    $('restart').addEventListener('click', () => { frame.src = 'about:blank'; requestAnimationFrame(() => { frame.src = g.path; frame.focus(); }); });
    $('fs').addEventListener('click', () => { const t = stage; (t.requestFullscreen || t.webkitRequestFullscreen || (() => { })).call(t); frame.focus(); });
    stage.addEventListener('pointerdown', () => frame.focus());
    // keep the page from scrolling while you play (arrow keys / space go to the game)
    window.addEventListener('keydown', e => { if (stage.classList.contains('running') && document.activeElement === document.body && ['Space', 'ArrowUp', 'ArrowDown'].includes(e.code)) { e.preventDefault(); frame.focus(); } });
  }

  if (document.body.classList.contains('home')) home();
  else if (document.body.classList.contains('play')) play();
})();
