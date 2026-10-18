/* Bellum front prototype: app shell (loop, camera, overlay, HUD). */
(function () {
  'use strict';
  const S = window.BellumSim, Rr = window.BellumRender;
  const { proj, dateStr, dayOf, FACTIONS } = S;
  const HISTORY_SEED = 7; // best match to the real war (see tools/score-seeds.js)
  const SPEEDS = { slow: 3, normal: 8, fast: 20 };
  const END_DAY = dayOf('1953-07-27');

  const $ = id => document.getElementById(id);
  const glc = $('map'), ovc = $('overlay'), ctx = ovc.getContext('2d');
  let sim, ren, seed = HISTORY_SEED;
  const state = { playing: true, speed: 'normal', acc: 0, tool: 'watch', grid: false, logSeen: 0, shown: [0, 0] };
  const view = { x: 0, y: 0, upp: 0.012, dpr: 1, w: 0, h: 0 };

  function newSim(s) {
    seed = s; window.REGION.seed = s;
    sim = new S.Sim(window.REGION);
    if (ren) ren.setSim(sim);
    state.acc = 0; state.logSeen = 0; state.shown = sim.stats.men.slice();
    $('feed').innerHTML = ''; pushFeed();
    $('seed').textContent = s === HISTORY_SEED ? 'Historical replay' : 'Alternate war \u00b7 seed ' + s;
    $('armistice').hidden = true;
  }

  // ---------- camera ----------
  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = glc.clientWidth, h = glc.clientHeight;
    view.dpr = dpr; view.w = w; view.h = h;
    for (const c of [glc, ovc]) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); }
  }
  function fitKorea() {
    const a = proj(124.4, 43.1), b = proj(130.9, 33.6);
    view.x = (a[0] + b[0]) / 2; view.y = (a[1] + b[1]) / 2 + 0.15;
    view.upp = Math.max((b[1] - a[1]) / (view.h * 0.9), (b[0] - a[0]) / (view.w * 0.92));
  }
  const toScreen = (x, y) => [(x - view.x) / view.upp + view.w / 2, (y - view.y) / view.upp + view.h / 2];
  const toWorld = (sx, sy) => [view.x + (sx - view.w / 2) * view.upp, view.y + (sy - view.h / 2) * view.upp];
  function clampView() {
    const LB = Rr.LB; view.upp = Math.min(0.03, Math.max(0.00035, view.upp));
    view.x = Math.min(LB.x + LB.w, Math.max(LB.x, view.x)); view.y = Math.min(LB.y + LB.h, Math.max(LB.y, view.y));
  }
  function zoomAt(sx, sy, f) {
    const [wx, wy] = toWorld(sx, sy); view.upp /= f; clampView();
    const [nx, ny] = toWorld(sx, sy); view.x += wx - nx; view.y += wy - ny; clampView();
  }

  // ---------- input ----------
  const ptrs = new Map(); let drag = null, pinch = null;
  const stage = $('stage');
  stage.addEventListener('pointerdown', e => {
    stage.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, [e.offsetX, e.offsetY]);
    if (ptrs.size === 1) drag = { x: e.offsetX, y: e.offsetY, vx: view.x, vy: view.y, moved: 0 };
    if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), upp: view.upp }; drag = null; }
  });
  stage.addEventListener('pointermove', e => {
    if (!ptrs.has(e.pointerId)) return; ptrs.set(e.pointerId, [e.offsetX, e.offsetY]);
    if (pinch && ptrs.size === 2) {
      const [a, b] = [...ptrs.values()]; const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
      const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2; const [wx, wy] = toWorld(mx, my);
      view.upp = pinch.upp * pinch.d / Math.max(d, 1); clampView(); const [nx, ny] = toWorld(mx, my); view.x += wx - nx; view.y += wy - ny; clampView();
    } else if (drag) {
      const dx = e.offsetX - drag.x, dy = e.offsetY - drag.y; drag.moved = Math.max(drag.moved, Math.hypot(dx, dy));
      view.x = drag.vx - dx * view.upp; view.y = drag.vy - dy * view.upp; clampView();
    }
  });
  const up = e => {
    if (drag && drag.moved < 5 && ptrs.size === 1) click(e.offsetX, e.offsetY);
    ptrs.delete(e.pointerId); if (ptrs.size < 2) pinch = null; if (!ptrs.size) drag = null;
  };
  stage.addEventListener('pointerup', up); stage.addEventListener('pointercancel', up);
  stage.addEventListener('wheel', e => { e.preventDefault(); zoomAt(e.offsetX, e.offsetY, Math.exp(-e.deltaY * 0.0015)); }, { passive: false });

  function click(sx, sy) {
    const [x, y] = toWorld(sx, sy); let ok = true;
    if (state.tool === 'north') ok = sim.playerDrop(x, y, 0);
    else if (state.tool === 'south') ok = sim.playerDrop(x, y, 1);
    else if (state.tool === 'landing') ok = sim.playerLanding(x, y, 1);
    else return;
    if (!ok) hint(state.tool === 'landing' ? 'Pick a spot on the Korean coast.' : 'Drop divisions inside your own territory.');
    pushFeed();
  }

  // ---------- HUD ----------
  function setTool(t) { state.tool = t; document.querySelectorAll('[data-tool]').forEach(b => b.setAttribute('aria-pressed', b.dataset.tool === t)); stage.style.cursor = t === 'watch' ? 'grab' : 'crosshair'; }
  function setSpeed(s) { state.speed = s; document.querySelectorAll('[data-speed]').forEach(b => b.setAttribute('aria-pressed', b.dataset.speed === s)); }
  function setPlaying(p) { state.playing = p; $('play').setAttribute('aria-label', p ? 'Pause' : 'Play'); $('play').innerHTML = p ? '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="3" y="2" width="3.5" height="12" rx="1"/><rect x="9.5" y="2" width="3.5" height="12" rx="1"/></svg>' : '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 2.5v11l9-5.5z"/></svg>'; }
  document.querySelectorAll('[data-tool]').forEach(b => b.addEventListener('click', () => setTool(state.tool === b.dataset.tool ? 'watch' : b.dataset.tool)));
  document.querySelectorAll('[data-speed]').forEach(b => b.addEventListener('click', () => setSpeed(b.dataset.speed)));
  $('play').addEventListener('click', () => setPlaying(!state.playing));
  $('replay').addEventListener('click', () => { newSim(HISTORY_SEED); setPlaying(true); });
  $('random').addEventListener('click', () => { newSim(1 + Math.floor(Math.random() * 9999)); setPlaying(true); });
  $('grid').addEventListener('click', () => { state.grid = !state.grid; $('grid').setAttribute('aria-pressed', state.grid); });
  $('armistice').addEventListener('click', () => { sim.breakArmistice(); $('armistice').hidden = true; setPlaying(true); pushFeed(); });
  window.addEventListener('keydown', e => {
    if (e.target.closest && e.target.closest('button')) { if (e.key === ' ') return; }
    if (e.key === ' ') { e.preventDefault(); setPlaying(!state.playing); }
    if (e.key === 'g' || e.key === 'G') $('grid').click();
  });
  let hintT = 0; function hint(t) { const h = $('hint'); h.textContent = t; h.hidden = false; clearTimeout(hintT); hintT = setTimeout(() => (h.hidden = true), 2200); }

  function pushFeed() {
    const feed = $('feed');
    while (state.logSeen < sim.log.length) {
      const e = sim.log[state.logSeen++];
      const li = document.createElement('li'); li.className = 'k-' + e.kind;
      li.innerHTML = '<time></time><span></span>'; li.firstChild.textContent = dateStr(e.day); li.lastChild.textContent = e.text;
      feed.prepend(li);
      while (feed.children.length > 5) feed.lastChild.remove();
    }
  }
  const fmt = n => Math.round(n).toLocaleString('en-US');
  function updateHud() {
    const d = new Date(Date.UTC(1950, 5, 25) + sim.day * 864e5);
    $('date').textContent = d.getUTCDate() + ' ' + d.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' }).toUpperCase() + ' ' + d.getUTCFullYear();
    $('caption').textContent = sim.caption || '';
    const st = sim.stats;
    $('nMen').textContent = fmt(st.men[0]); $('sMen').textContent = fmt(st.men[1]);
    $('nCas').textContent = fmt(st.cas[0]); $('sCas').textContent = fmt(st.cas[1]);
    $('nCap').textContent = fmt(st.cap[0]); $('sCap').textContent = fmt(st.cap[1]);
    $('bar').style.width = Math.min(100, 100 * sim.day / END_DAY) + '%';
    if (sim.armistice && $('armistice').hidden && !sim.sandbox) $('armistice').hidden = false;
  }

  // ---------- overlay: cities, units, troop totals ----------
  const FLAG = {
    KPA: (x, y, w, h) => { ctx.fillStyle = '#024fa2'; ctx.fillRect(x, y, w, h); ctx.fillStyle = '#fff'; ctx.fillRect(x, y + h * 0.17, w, h * 0.66); ctx.fillStyle = '#c8102e'; ctx.fillRect(x, y + h * 0.24, w, h * 0.52); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x + w * 0.33, y + h / 2, h * 0.2, 0, 7); ctx.fill(); },
    PVA: (x, y, w, h) => { ctx.fillStyle = '#de2910'; ctx.fillRect(x, y, w, h); ctx.fillStyle = '#ffde00'; ctx.beginPath(); ctx.arc(x + w * 0.24, y + h * 0.3, h * 0.17, 0, 7); ctx.fill(); },
    ROK: (x, y, w, h) => { ctx.fillStyle = '#fff'; ctx.fillRect(x, y, w, h); const r = h * 0.27, cx = x + w / 2, cy = y + h / 2; ctx.fillStyle = '#cd2e3a'; ctx.beginPath(); ctx.arc(cx, cy, r, Math.PI, 0); ctx.fill(); ctx.fillStyle = '#0047a0'; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI); ctx.fill(); ctx.fillStyle = '#111'; ctx.fillRect(x + w * 0.1, y + h * 0.18, w * 0.12, h * 0.16); ctx.fillRect(x + w * 0.78, y + h * 0.66, w * 0.12, h * 0.16); },
    UN: (x, y, w, h) => { ctx.fillStyle = '#4b92db'; ctx.fillRect(x, y, w, h); ctx.strokeStyle = '#fff'; ctx.lineWidth = Math.max(1, h * 0.09); ctx.beginPath(); ctx.arc(x + w / 2, y + h / 2, h * 0.26, 0, 7); ctx.stroke(); },
  };
  function drawOverlay(mix, t) {
    const dpr = view.dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, view.w, view.h);
    const zoom = 0.012 / view.upp; // 1 = whole peninsula
    // cities
    ctx.textBaseline = 'middle';
    for (const c of sim.cities) {
      if (c.tier === 2 && zoom < 1.25) continue; if (c.tier === 3 && zoom < 2.2) continue;
      const [x, y] = toScreen(...proj(c.lon, c.lat)); if (x < -50 || y < -20 || x > view.w + 50 || y > view.h + 20) continue;
      ctx.fillStyle = 'rgba(255,255,255,0.92)'; ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(x, y, c.tier === 1 ? 3 : 2.2, 0, 7); ctx.fill(); ctx.stroke();
      ctx.font = (c.tier === 1 ? '600 12px' : '500 11px') + ' Barlow, "Segoe UI", system-ui, sans-serif';
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(5,10,16,0.7)'; ctx.strokeText(c.name, x + 6, y); ctx.fillStyle = 'rgba(240,244,248,0.88)'; ctx.fillText(c.name, x + 6, y);
    }
    if (sim.dmz) { const [x, y] = toScreen(...proj(126.2, 38.0)); label('DEMILITARIZED ZONE', x, y - 18, 11, 'rgba(255,255,255,0.85)'); }

    // units: each division shows as a small cluster of flags (one per ~6,000 men),
    // which gives the dense bands of tokens along the front seen in the reference video
    const s = Math.min(1.9, Math.max(0.75, Math.pow(zoom, 0.4)));
    const w = 11 * s, h = 7.5 * s; const sums = [[0, 0, 0], [0, 0, 0]];
    const blink = 0.55 + 0.45 * Math.sin(t * 6);
    const hash = n => { n = Math.imul(n ^ (n >>> 15), 2246822507); n = Math.imul(n ^ (n >>> 13), 3266489909); return ((n ^ (n >>> 16)) >>> 0) / 4294967296; };
    const spread = Math.max(6, Math.min(16, 9 * s));
    for (const u of sim.units) {
      const ux = u.px + (u.x - u.px) * mix, uy = u.py + (u.y - u.py) * mix;
      const [x, y] = toScreen(ux, uy);
      const k = sim.cellAt(u.x, u.y);
      if (k >= 0 && sim.distF[k] >= 0 && sim.distF[k] <= 8) { const sum = sums[u.side]; sum[0] += x * u.str; sum[1] += y * u.str; sum[2] += u.str; }
      if (x < -30 || y < -30 || x > view.w + 30 || y > view.h + 30) continue;
      const n = zoom > 3 ? 1 : Math.max(1, Math.min(4, Math.round(u.str / 6000)));
      ctx.globalAlpha = 0.6 + 0.4 * Math.min(1, u.str / u.max);
      for (let i = 0; i < n; i++) {
        const fx = x + (i ? (hash(u.id * 31 + i) - 0.5) * spread * 2 : 0), fy = y + (i ? (hash(u.id * 57 + i * 7) - 0.5) * spread * 1.4 : 0);
        FLAG[u.fac](fx - w / 2, fy - h / 2, w, h);
        ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(0,0,0,0.55)'; ctx.strokeRect(fx - w / 2 - 0.5, fy - h / 2 - 0.5, w + 1, h + 1);
      }
      ctx.globalAlpha = 1;
      if (u.sup === 0) { ctx.strokeStyle = `rgba(242,193,78,${blink})`; ctx.lineWidth = 2; ctx.strokeRect(x - w / 2 - 2, y - h / 2 - 2, w + 4, h + 4); }
      if (u.type === 'armor' || u.type === 'marine') { ctx.fillStyle = '#000'; ctx.fillRect(x - w / 2, y + h / 2 - 1.6 * s, w, 1.6 * s); }
    }
    // big troop totals on each side of the front, as in the reference video (strategic zoom only)
    const numAlpha = 1 - Math.min(1, Math.max(0, (zoom - 2.2) / 0.8));
    const mean = sums.map(a => a[2] > 0 ? [a[0] / a[2], a[1] / a[2]] : null);
    for (let side = 0; side < 2; side++) {
      state.shown[side] += (sim.stats.men[side] - state.shown[side]) * 0.12;
      if (!numAlpha || !mean[side] || sim.stats.men[side] < 1) continue;
      let [x, y] = mean[side]; const o = mean[1 - side];
      if (o) { const dx = x - o[0], dy = y - o[1], l = Math.hypot(dx, dy) || 1; const push = 58; x += dx / l * push; y += dy / l * push; }
      else y += side === 0 ? -60 : 60;
      x = Math.min(view.w - 120, Math.max(120, x)); y = Math.min(view.h - 110, Math.max(60, y));
      ctx.globalAlpha = numAlpha; bigNumber(fmt(state.shown[side]), x, y, side); ctx.globalAlpha = 1;
    }
  }
  function label(text, x, y, size, color) {
    ctx.font = `700 ${size}px "Barlow Condensed", "Arial Narrow", sans-serif`; ctx.textAlign = 'center';
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.65)'; ctx.strokeText(text, x, y); ctx.fillStyle = color; ctx.fillText(text, x, y); ctx.textAlign = 'left';
  }
  function bigNumber(text, x, y, side) {
    const size = Math.max(30, Math.min(52, view.w / 22));
    ctx.save(); ctx.translate(x, y); ctx.rotate(-0.1);
    ctx.font = `italic 800 ${size}px "Barlow Condensed", "Arial Narrow", sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.shadowColor = side === 0 ? 'rgba(120,0,15,0.9)' : 'rgba(0,30,90,0.9)'; ctx.shadowBlur = 14;
    ctx.lineWidth = 5; ctx.strokeStyle = side === 0 ? 'rgba(90,0,10,0.85)' : 'rgba(0,25,70,0.85)'; ctx.strokeText(text, 0, 0);
    ctx.shadowBlur = 0; ctx.fillStyle = '#fbfbfb'; ctx.fillText(text, 0, 0);
    ctx.restore();
  }

  // ---------- loop ----------
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    if (state.playing && !(sim.frozen && sim.armistice && !sim.sandbox && sim.day >= END_DAY)) {
      state.acc += dt * SPEEDS[state.speed];
      let steps = 0;
      while (state.acc >= 1 && steps < 3) { state.acc -= 1; sim.step(); ren.uploadField(); steps++; }
      if (steps === 3) state.acc = Math.min(state.acc, 1);
      if (steps) { pushFeed(); updateHud(); }
    }
    const mix = Math.min(1, state.acc);
    ren.draw(view, mix, now / 1000, { grid: state.grid });
    drawOverlay(mix, now / 1000);
    requestAnimationFrame(frame);
  }

  function boot() {
    resize(); fitKorea(); clampView();
    newSim(HISTORY_SEED);
    try { ren = new Rr.Renderer(glc, sim, window.REGION); }
    catch (err) { $('fatal').hidden = false; $('fatal').textContent = 'This prototype needs WebGL2. ' + err.message; return; }
    setTool('watch'); setSpeed('normal'); setPlaying(true); updateHud();
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) setSpeed('slow');
    window.addEventListener('resize', () => { const k = view.upp * view.w; resize(); view.upp = k / view.w; clampView(); });
    requestAnimationFrame(t => { last = t; frame(t); });
  }
  // test hook: jump to a date, optionally zoom to a spot (used by headless screenshots)
  window.__debugJump = (date, zoom, lon, lat, grid) => {
    setPlaying(false); const d = dayOf(date); if (d < sim.day) newSim(seed);
    while (sim.day < d) { sim.step(); if (sim.day >= d - 1) ren.uploadField(); }
    ren.uploadField(); state.acc = 1; pushFeed(); updateHud();
    if (zoom) { fitKorea(); view.upp /= zoom; const w = proj(lon, lat); view.x = w[0]; view.y = w[1]; clampView(); }
    state.grid = !!grid;
  };
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(boot, boot); else boot();
})();
