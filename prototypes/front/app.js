/* Bellum front prototype: app shell (loop, camera, overlay, HUD). */
(function () {
  'use strict';
  const S = window.BellumSim, Rr = window.BellumRender;
  const { proj, dateStr, dayOf, FACTIONS } = S;
  const HISTORY_SEED = 50; // best match to the real war (see tools/score-seeds.js)
  const SPEEDS = { slow: 3, normal: 8, fast: 20 };
  const END_DAY = dayOf('1953-07-27');

  const $ = id => document.getElementById(id);
  const glc = $('map'), ovc = $('overlay'), ctx = ovc.getContext('2d');
  let sim, ren, seed = HISTORY_SEED;
  const state = { playing: true, speed: 'normal', acc: 0, tool: 'watch', grid: false, logSeen: 0, shown: [0, 0] };
  const view = { x: 0, y: 0, upp: 0.012, dpr: 1, w: 0, h: 0, gls: 1 }; // gls: adaptive map resolution
  const perf = { ema: 1 / 60, t: 0 };

  function newSim(s) {
    seed = s; window.REGION.seed = s;
    sim = new S.Sim(window.REGION);
    if (ren) ren.setSim(sim);
    state.acc = 0; state.logSeen = 0; state.shown = sim.stats.men.slice();
    if (typeof fx !== 'undefined') { fx.sparks = []; fx.smoke = []; fx.ghosts = []; fx.ripples = []; fx.hotHist = []; fx.banners = []; fx.cLag = []; OFF.list = []; NUM.forEach(n => { n.ok = false; n.a = 0; }); }
    $('feed').innerHTML = ''; pushFeed();
    $('seed').textContent = s === HISTORY_SEED ? 'Historical replay' : 'Alternate war \u00b7 seed ' + s;
    $('armistice').hidden = true;
  }

  // ---------- camera ----------
  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = glc.clientWidth, h = glc.clientHeight;
    view.dpr = dpr; view.w = w; view.h = h;
    ovc.width = Math.round(w * dpr); ovc.height = Math.round(h * dpr);
    glc.width = Math.round(w * dpr * view.gls); glc.height = Math.round(h * dpr * view.gls);
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
      const e = sim.log[state.logSeen++]; if (typeof onLog === 'function' && ren) onLog(e);
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

  // ---------- overlay: cities, units, troop totals, effects ----------
  const FLAG = {
    KPA: (x, y, w, h) => { ctx.fillStyle = '#024fa2'; ctx.fillRect(x, y, w, h); ctx.fillStyle = '#fff'; ctx.fillRect(x, y + h * 0.17, w, h * 0.66); ctx.fillStyle = '#c8102e'; ctx.fillRect(x, y + h * 0.24, w, h * 0.52); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x + w * 0.33, y + h / 2, h * 0.2, 0, 7); ctx.fill(); },
    PVA: (x, y, w, h) => { ctx.fillStyle = '#de2910'; ctx.fillRect(x, y, w, h); ctx.fillStyle = '#ffde00'; ctx.beginPath(); ctx.arc(x + w * 0.24, y + h * 0.3, h * 0.17, 0, 7); ctx.fill(); },
    ROK: (x, y, w, h) => { ctx.fillStyle = '#fff'; ctx.fillRect(x, y, w, h); const r = h * 0.27, cx = x + w / 2, cy = y + h / 2; ctx.fillStyle = '#cd2e3a'; ctx.beginPath(); ctx.arc(cx, cy, r, Math.PI, 0); ctx.fill(); ctx.fillStyle = '#0047a0'; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI); ctx.fill(); ctx.fillStyle = '#111'; ctx.fillRect(x + w * 0.1, y + h * 0.18, w * 0.12, h * 0.16); ctx.fillRect(x + w * 0.78, y + h * 0.66, w * 0.12, h * 0.16); },
    UN: (x, y, w, h) => { ctx.fillStyle = '#4b92db'; ctx.fillRect(x, y, w, h); ctx.strokeStyle = '#fff'; ctx.lineWidth = Math.max(1, h * 0.09); ctx.beginPath(); ctx.arc(x + w / 2, y + h / 2, h * 0.26, 0, 7); ctx.stroke(); },
  };
  const SIDE_RGB = ['227,57,77', '62,147,234'];
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const cr = (a, b, c, d, t) => 0.5 * ((2 * b) + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (-a + 3 * b - 3 * c + d) * t * t * t);
  const hash = n => { n = Math.imul(n ^ (n >>> 15), 2246822507); n = Math.imul(n ^ (n >>> 13), 3266489909); return ((n ^ (n >>> 16)) >>> 0) / 4294967296; };
  function sprite(stops) {
    const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
    const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32); stops.forEach(([o, col]) => grd.addColorStop(o, col)); g.fillStyle = grd; g.fillRect(0, 0, 64, 64); return c;
  }
  const FLASH = sprite([[0, 'rgba(255,250,235,1)'], [0.22, 'rgba(255,205,130,0.9)'], [0.55, 'rgba(255,110,40,0.28)'], [1, 'rgba(255,80,20,0)']]);
  const SMOKE = sprite([[0, 'rgba(40,36,34,0.55)'], [0.6, 'rgba(40,36,34,0.2)'], [1, 'rgba(40,36,34,0)']]);
  const fx = { cLag: [], sparks: [], smoke: [], ghosts: [], ripples: [], arrows: [], hotHist: [], banners: [], banner: null, shake: 0, pulse: [0, 0] };

  // a unit's on-screen position: Catmull-Rom through its last four daily positions,
  // drawn a day or two behind the sim, in step with the map
  function unitPos(u, t) {
    if (!u.hist) u.hist = [[u.x, u.y], [u.x, u.y], [u.x, u.y], [u.x, u.y]];
    const h = u.hist; return [cr(h[0][0], h[1][0], h[2][0], h[3][0], t), cr(h[0][1], h[1][1], h[2][1], h[3][1], t)];
  }
  function afterStep(now) {
    ren.uploadField();
    for (const u of sim.units) { if (!u.hist) u.hist = [[u.x, u.y], [u.x, u.y], [u.x, u.y], [u.x, u.y]]; else { u.hist.shift(); u.hist.push([u.x, u.y]); } }
    for (const u of sim.removed) { const [x, y] = unitPos(u, 1); fx.ghosts.push({ x, y, fac: u.fac, kind: u.gone, t0: now }); }
    // hot cells, kept a day back so flashes sit on the visible front
    const ks = new Int32Array(sim.hot), hs = new Float32Array(ks.length); ks.forEach((k, i) => (hs[i] = sim.heat[k]));
    fx.hotHist.push({ ks, hs }); if (fx.hotHist.length > 2) fx.hotHist.shift();
    updateOffensives();
    fx.cLag.push(new Float32Array(sim.c)); if (fx.cLag.length > 3) fx.cLag.shift(); // what the map is showing
  }
  function onLog(e) {
    if (e.big) { fx.banners.push({ day: e.day, title: e.big, text: e.text }); }
    if (e.kind === 'city' && e.lon) fx.ripples.push({ day: e.day, lon: e.lon, lat: e.lat, side: e.side, tier: e.tier, t0: 0 });
    if (e.kind === 'pocket') fx.shake = Math.max(fx.shake, 3);
  }

  // ---------- offensives: arrows that push the front ----------
  // An arrow is an event. It is born when a real push starts (tail anchored in its own
  // lines), its tip is locked to the visible front so it grows as the line moves, it
  // stays still when the front is still, and it drains away when the push stops.
  const OFF = { list: [], next: 1 };
  const shownDayOf = mix => sim.day - 2 + mix; // the map is drawn two days behind the sim
  function cAt(x, y) { // bilinear control value at a world point (NaN off Korean land)
    const gx = (x - S.GX0) / S.CELL - 0.5, gy = (y - S.GY0) / S.CELL - 0.5, i = Math.floor(gx), j = Math.floor(gy);
    if (i < 0 || j < 0 || i >= S.GW - 1 || j >= S.GH - 1) return NaN;
    const k = j * S.GW + i, fx_ = gx - i, fy = gy - j; let sum = 0, w = 0;
    const add = (kk, ww) => { if (sim.kor[kk]) { sum += sim.c[kk] * ww; w += ww; } };
    add(k, (1 - fx_) * (1 - fy)); add(k + 1, fx_ * (1 - fy)); add(k + S.GW, (1 - fx_) * fy); add(k + S.GW + 1, fx_ * fy);
    return w > 0.1 ? sum / w : NaN;
  }
  function march(x, y, dx, dy, sg, maxD) { // from own ground along a direction to the front line
    const st = S.CELL * 0.3; let px = x, py = y, pv = cAt(x, y) * sg;
    for (let d = 0; d < maxD; d += st) {
      const nx = px + dx * st, ny = py + dy * st, v = cAt(nx, ny) * sg;
      if (!(v > 0)) { if (v <= 0 && pv > 0) { const t = pv / (pv - v); return [px + dx * st * t, py + dy * st * t]; } return [px, py]; }
      px = nx; py = ny; pv = v;
    }
    return [px, py];
  }
  function updateOffensives() {
    const L = sim.day, blobs = sim.advances.filter(b => b.size >= 35).sort((a, b) => b.size - a.size).slice(0, 6);
    const live = OFF.list.filter(o => !o.endDay);
    for (const b of blobs) {
      const sg = b.side === 0 ? 1 : -1; let best = null, bd = 0.6;
      for (const o of live) if (o.side === b.side) { const t = o.tips[o.tips.length - 1]; const d = Math.hypot(t.x - b.x, t.y - b.y); if (d < bd) { bd = d; best = o; } }
      if (best) { best.last = L; best.size = Math.max(best.size * 0.95, b.size); best.dx += (b.dx - best.dx) * 0.15; best.dy += (b.dy - best.dy) * 0.15; const l = Math.hypot(best.dx, best.dy); best.dx /= l; best.dy /= l; continue; }
      if (b.size < 55 || live.filter(o => o.side === b.side).length >= 3) continue;
      let tx = b.x - b.dx * 0.5, ty = b.y - b.dy * 0.5;
      for (let n = 0; n < 12 && !(cAt(tx, ty) * sg > 0.6); n++) { tx -= b.dx * 0.06; ty -= b.dy * 0.06; }
      if (!(cAt(tx, ty) * sg > 0)) continue;
      const [hx, hy] = march(tx, ty, b.dx, b.dy, sg, 2.2);
      if (Math.hypot(hx - tx, hy - ty) < 0.18) continue;
      const o = { id: OFF.next++, side: b.side, tail: [tx, ty], dx: b.dx, dy: b.dy, tips: [{ d: L, x: hx, y: hy }], bornDay: L, last: L, size: b.size, endDay: 0, t0: 0, tEnd: 0, vs: 0, prev: null, impact: false };
      OFF.list.push(o); live.push(o);
    }
    for (const o of live) {
      if (o.bornDay === L) continue;
      const sg = o.side === 0 ? 1 : -1, t = o.tips[o.tips.length - 1], back = S.CELL * 0.5;
      let nx, ny;
      if (cAt(t.x - o.dx * back, t.y - o.dy * back) * sg > 0) [nx, ny] = march(t.x - o.dx * back, t.y - o.dy * back, o.dx, o.dy, sg, 2.2);
      else { // the enemy pushed back: the tip gives ground toward the tail
        let px = t.x, py = t.y; const bx = o.tail[0] - px, by = o.tail[1] - py, bl = Math.hypot(bx, by) || 1, st = S.CELL * 0.3;
        for (let d = 0; d < bl && !(cAt(px, py) * sg > 0); d += st) { px += bx / bl * st; py += by / bl * st; }
        nx = px; ny = py;
      }
      o.tips.push({ d: L, x: nx, y: ny }); if (o.tips.length > 500) o.tips.shift();
      const len = Math.hypot(nx - o.tail[0], ny - o.tail[1]), maxLen = 1.7; // very long drives: the tail follows
      if (len > maxLen) { const k = (len - maxLen) / len; o.tail[0] += (nx - o.tail[0]) * k; o.tail[1] += (ny - o.tail[1]) * k; }
      if (L - o.last > 3 || sim.frozen) o.endDay = L;
    }
  }
  function tipAt(o, sd) { // Catmull-Rom through daily tips, in step with the map
    const T = o.tips; if (sd <= T[0].d) return [T[0].x, T[0].y];
    let i = T.length - 2; while (i > 0 && T[i].d > sd) i--;
    if (i < 0) i = 0; const a = T[Math.max(0, i - 1)], b = T[i], c = T[Math.min(T.length - 1, i + 1)], d = T[Math.min(T.length - 1, i + 2)];
    const t = Math.min(1, Math.max(0, (sd - b.d) / Math.max(1, c.d - b.d)));
    return [cr(a.x, b.x, c.x, d.x, t), cr(a.y, b.y, c.y, d.y, t)];
  }
  function offPath(o, sd) { // tail → route taken → head, kept moving forward and smoothed (arcs)
    const head = tipAt(o, sd), proj = p => (p[0] - o.tail[0]) * o.dx + (p[1] - o.tail[1]) * o.dy, ph = proj(head);
    let pts = [o.tail]; let lastP = 0;
    for (const t of o.tips) { if (t.d >= sd) break; const q = [t.x, t.y], pq = proj(q); if (pq > lastP + 0.05 && pq < ph - 0.05) { pts.push(q); lastP = pq; } }
    pts.push(head);
    for (let it = 0; it < 2; it++) { const n = [pts[0]]; for (let k = 0; k < pts.length - 1; k++) { const a = pts[k], b = pts[k + 1]; n.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25], [a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]); } n.push(pts[pts.length - 1]); pts = n; }
    return pts;
  }
  function stepEffects(dt, now, mix) {
    const sd = shownDayOf(mix);
    for (const o of OFF.list) {
      if (!o.t0 && sd >= o.bornDay) o.t0 = now;
      if (o.endDay && !o.tEnd && o.t0 && sd >= o.endDay) o.tEnd = now;
      if (!o.t0) continue;
      // tip speed (px/s) drives squash and stretch and the sparks at the point of the push
      const h = toScreen(...tipAt(o, sd)); if (o.prev) { const v = Math.hypot(h[0] - o.prev[0], h[1] - o.prev[1]) / Math.max(dt, 1e-3); o.vs += (Math.min(v, 400) - o.vs) * Math.min(1, dt * 6); } o.prev = h;
      if (!o.tEnd && now - o.t0 > 0.6 && state.playing && o.vs > 8 && Math.random() < o.vs * dt * 0.35) {
        const [x, y] = tipAt(o, sd); fx.sparks.push({ x: x + (Math.random() - 0.5) * S.CELL * 2, y: y + (Math.random() - 0.5) * S.CELL * 2, t0: now, life: 0.35, big: Math.random() < 0.3 });
      }
    }
    OFF.list = OFF.list.filter(o => !(o.tEnd && now - o.tEnd > 1.0));
    // artillery flashes along hot stretches of front
    const hot = fx.hotHist[0];
    if (hot && hot.ks.length && state.playing && !sim.frozen) {
      let n = Math.min(130, hot.ks.length * 0.4) * dt * Math.sqrt(SPEEDS[state.speed] / 8);
      while (n > 0 && fx.sparks.length < 260) {
        if (n < 1 && Math.random() > n) break; n -= 1;
        const i = (Math.random() * hot.ks.length) | 0; if (Math.random() > hot.hs[i]) continue;
        const [cx, cy] = sim.cellXY(hot.ks[i]); const big = Math.random() < 0.08;
        const sp = { x: cx + (Math.random() - 0.5) * S.CELL * 1.6, y: cy + (Math.random() - 0.5) * S.CELL * 1.6, t0: now, life: big ? 0.7 : 0.25 + Math.random() * 0.3, big };
        fx.sparks.push(sp); if (big) fx.smoke.push({ x: sp.x, y: sp.y, t0: now, life: 1.8 + Math.random() });
      }
    }
    fx.sparks = fx.sparks.filter(p => now - p.t0 < p.life); fx.smoke = fx.smoke.filter(p => now - p.t0 < p.life);
    fx.ghosts = fx.ghosts.filter(g => now - g.t0 < 1.6);
    const shownDay = sim.day - 2 + mix;
    for (const r of fx.ripples) if (!r.t0 && shownDay >= r.day - 0.3) r.t0 = now;
    readHud(now);
    fx.ripples = fx.ripples.filter(r => !r.t0 || now - r.t0 < 1.4);
    fx.shake *= Math.exp(-dt * 7);
    if (!fx.banner && fx.banners.length) showBanner(fx.banners.shift(), now);
    if (fx.banner && now - fx.banner.t0 > fx.banner.dur) { $('banner').classList.remove('on'); fx.banner = null; }
  }
  function showBanner(b, now) {
    const el = $('banner'); el.querySelector('.b-date').textContent = dateStr(b.day); el.querySelector('.b-title').textContent = b.title; el.querySelector('.b-text').textContent = b.text;
    el.classList.remove('on'); void el.offsetWidth; el.classList.add('on');
    fx.banner = { t0: now, dur: state.speed === 'fast' ? 1.8 : 2.8 };
    if (!reduceMotion) fx.shake = Math.max(fx.shake, 5);
  }

  const easeOutBack = q => { const c1 = 1.9, c3 = c1 + 1; return 1 + c3 * Math.pow(q - 1, 3) + c1 * Math.pow(q - 1, 2); };
  const easeOut = q => 1 - (1 - q) * (1 - q), easeInCubic = q => q * q * q;
  function drawOffensive(o, sd, now) {
    if (!o.t0) return;
    const e = now - o.t0, f = o.tEnd ? now - o.tEnd : -1;
    let s = 1, u = 0, alpha = 1, wind = 0, hw = 1, hl = 1;
    // anticipation: a short stub winds back, then the arrow thrusts forward and overshoots
    if (e < 0.22) { s = 0.07 * easeOut(e / 0.22); wind = Math.sin(Math.PI * e / 0.22); alpha = e / 0.22; }
    else if (e < 0.62) s = 0.07 + 0.93 * easeOutBack((e - 0.22) / 0.4);
    // impact: the head squashes against the front, then rings out
    if (e > 0.5) { const q = e - 0.5, damp = Math.exp(-q * 7) * Math.cos(q * 24); hw *= 1 + 0.5 * damp; hl *= 1 - 0.32 * damp;
      if (!o.impact) { o.impact = true; const [x, y] = tipAt(o, sd); fx.sparks.push({ x, y, t0: now, life: 0.6, big: true }); fx.ripples.push({ lon: 0, lat: 0, wx: x, wy: y, side: o.side, tier: 3, t0: now, day: 0 }); } }
    // stretch with speed (volume kept: longer head, slimmer)
    const st = 1 + Math.min(0.4, o.vs / 260); hl *= st; hw /= Math.sqrt(st);
    // follow-through: the head settles, then the arrow drains from the tail
    if (f >= 0) { if (f < 0.25) hw *= 1 + 0.22 * Math.sin(Math.PI * f / 0.25); else u = easeInCubic(Math.min(1, (f - 0.25) / 0.6)); alpha = 1 - Math.min(1, Math.max(0, (f - 0.6) / 0.3)); }
    if (alpha <= 0.01) return;
    let P = offPath(o, sd).map(p => toScreen(p[0] - o.dx * 0.04 * wind, p[1] - o.dy * 0.04 * wind));
    const cum = [0]; for (let k = 1; k < P.length; k++) cum.push(cum[k - 1] + Math.hypot(P[k][0] - P[k - 1][0], P[k][1] - P[k - 1][1]));
    const total = cum[cum.length - 1]; if (total < 10) return;
    const at = d => { // point + tangent at arc length d (extends past the head for the overshoot)
      if (d >= total) { const a = P[P.length - 2], b = P[P.length - 1], l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, tx = (b[0] - a[0]) / l, ty = (b[1] - a[1]) / l; return [b[0] + tx * (d - total), b[1] + ty * (d - total), tx, ty]; }
      let k = 1; while (k < cum.length - 1 && cum[k] < d) k++;
      const a = P[k - 1], b = P[k], l = (cum[k] - cum[k - 1]) || 1, q = (d - cum[k - 1]) / l, tx = (b[0] - a[0]) / l, ty = (b[1] - a[1]) / l;
      return [a[0] + (b[0] - a[0]) * q, a[1] + (b[1] - a[1]) * q, tx, ty];
    };
    const W = Math.max(10, Math.min(22, 8 + Math.sqrt(o.size) * 0.7)), headL = W * 1.7 * hl, headW = W * 2.2 * hw;
    const d0 = u * total, d1 = s * total, bodyEnd = Math.max(d0, d1 - headL);
    if (d1 - d0 < 4) return;
    const left = [], right = [], N = 22;
    for (let k = 0; k <= N; k++) {
      const d = d0 + (bodyEnd - d0) * k / N, [x, y, tx, ty] = at(d), a = (d - d0) / Math.max(1, d1 - d0);
      const w = W * (0.22 + 0.78 * Math.min(1, a * 1.15)) / 2; left.push([x - ty * w, y + tx * w]); right.push([x + ty * w, y - tx * w]);
    }
    const [bx, by, btx, bty] = at(bodyEnd), [tipX, tipY] = at(d1 + 2);
    ctx.save(); ctx.globalAlpha = alpha;
    ctx.beginPath(); ctx.moveTo(...left[0]); for (const q of left) ctx.lineTo(...q);
    ctx.lineTo(bx - bty * headW / 2, by + btx * headW / 2); ctx.lineTo(tipX, tipY); ctx.lineTo(bx + bty * headW / 2, by - btx * headW / 2);
    for (let k = right.length - 1; k >= 0; k--) ctx.lineTo(...right[k]); ctx.closePath();
    const [sx0, sy0] = at(d0), g = ctx.createLinearGradient(sx0, sy0, tipX, tipY);
    g.addColorStop(0, `rgba(${SIDE_RGB[o.side]},0.15)`); g.addColorStop(0.45, `rgba(${SIDE_RGB[o.side]},0.75)`); g.addColorStop(1, `rgba(${SIDE_RGB[o.side]},1)`);
    ctx.shadowColor = 'rgba(0,0,0,0.55)'; ctx.shadowBlur = 10; ctx.shadowOffsetY = 2; ctx.fillStyle = g; ctx.fill();
    ctx.shadowBlur = 0; ctx.shadowOffsetY = 0; ctx.lineJoin = 'round'; ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(255,255,255,0.92)'; ctx.stroke();
    // bow wave: the point glows while it is actually pushing
    const push = Math.min(1, o.vs / 60);
    if (push > 0.05 && f < 0) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = alpha * push * 0.8; const r = headW * 0.9; ctx.drawImage(FLASH, tipX - r, tipY - r, 2 * r, 2 * r); ctx.globalCompositeOperation = 'source-over'; }
    ctx.restore();
  }

  // ---------- troop totals: staged inside each side's territory, clear of the front and HUD ----------
  const NUM = [{ x: 0, y: 0, a: 0, ok: false }, { x: 0, y: 0, a: 0, ok: false }];
  let hudRects = [], hudT = 0;
  function readHud(now) { if (now - hudT < 1) return; hudT = now; hudRects = [...document.querySelectorAll('.hud > *, .timeline')].filter(el => !el.hidden && el.offsetParent !== null).map(el => el.getBoundingClientRect()); }
  function placeNumber(side, anchor, w, h, other) {
    const sg = side === 0 ? 1 : -1, pad = 10, rCells = (Math.hypot(w, h) / 2 + 36) * view.upp / S.CELL + 2; // clear of the line and the band of unit flags along it
    const cur = NUM[side]; let best = null, bs = Infinity;
    const cityPx = sim.cities.filter(c => c.tier === 1).map(c => toScreen(...proj(c.lon, c.lat)));
    const overlaps = (x, y) => {
      if (x - w / 2 < pad || x + w / 2 > view.w - pad || y - h / 2 < pad || y + h / 2 > view.h - pad) return true;
      for (const r of hudRects) if (x + w / 2 > r.left - 8 && x - w / 2 < r.right + 8 && y + h / 2 > r.top - 8 && y - h / 2 < r.bottom + 8) return true;
      if (other && Math.abs(x - other.x) < (w + other.w) / 2 + 6 && Math.abs(y - other.y) < (h + other.h) / 2 + 6) return true;
      return false;
    };
    const valid = k => k >= 0 && sim.main[k] && sim.c[k] * sg >= 0.5 && sim.distF[k] >= rCells && !(fx.cLag.length && fx.cLag.some(c => c[k] * sg < 0.5));
    // hysteresis: keep the current spot while it stays valid unless another is clearly better
    let keep = null;
    if (cur.ok && cur.tx !== undefined) { const k = sim.cellAt(...toWorld(cur.tx, cur.ty)); if (valid(k) && !overlaps(cur.tx, cur.ty)) keep = Math.hypot(cur.tx - anchor[0], cur.ty - anchor[1]); }
    for (let j = 0; j < S.GH; j += 2) for (let i = 0; i < S.GW; i += 2) {
      const k = j * S.GW + i; if (!valid(k)) continue;
      const [x, y] = toScreen(...sim.cellXY(k)); if (overlaps(x, y)) continue;
      let sc = Math.hypot(x - anchor[0], y - anchor[1]) + (cur.ok ? 0.8 * Math.hypot(x - cur.x, y - cur.y) : 0);
      for (const c of cityPx) if (Math.abs(c[0] - x) < w / 2 + 30 && Math.abs(c[1] - y) < h / 2 + 4) sc += 450; // keep city names readable
      if (sc < bs) { bs = sc; best = [x, y]; }
    }
    if (keep !== null && (!best || bs > keep - 140)) return [cur.tx, cur.ty];
    return best;
  }
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


    // smoke from big shell bursts
    for (const p of fx.smoke) {
      const q = (t - p.t0) / p.life, [x, y] = toScreen(p.x, p.y - q * 0.03), r = (6 + 16 * q) * Math.min(2.5, Math.max(1, Math.sqrt(zoom)));
      ctx.globalAlpha = (1 - q) * 0.7; ctx.drawImage(SMOKE, x - r, y - r, 2 * r, 2 * r);
    }
    ctx.globalAlpha = 1;

    // units: each division shows as a small cluster of flags (one per ~6,000 men)
    const s = Math.min(1.9, Math.max(0.75, Math.pow(zoom, 0.4)));
    const w = 11 * s, h = 7.5 * s; const sums = [[0, 0, 0], [0, 0, 0]];
    const blink = 0.55 + 0.45 * Math.sin(t * 6);
    const spread = Math.max(6, Math.min(16, 9 * s));
    for (const u of sim.units) {
      const [ux, uy] = unitPos(u, mix); const [x, y] = toScreen(ux, uy);
      const k = sim.cellAt(u.x, u.y);
      if (k >= 0 && sim.distF[k] >= 0 && sim.distF[k] <= 8) { const sum = sums[u.side]; sum[0] += x * u.str; sum[1] += y * u.str; sum[2] += u.str; }
      if (x < -30 || y < -30 || x > view.w + 30 || y > view.h + 30) continue;
      const n = zoom > 3 ? 1 : Math.max(1, Math.min(4, Math.round(u.str / 6000)));
      const bob = u.retreat ? Math.sin(t * 9 + u.id) * 0.8 : 0;
      ctx.globalAlpha = 0.6 + 0.4 * Math.min(1, u.str / u.max);
      for (let i = 0; i < n; i++) {
        const fx_ = x + (i ? (hash(u.id * 31 + i) - 0.5) * spread * 2 : 0), fy = y + bob + (i ? (hash(u.id * 57 + i * 7) - 0.5) * spread * 1.4 : 0);
        FLAG[u.fac](fx_ - w / 2, fy - h / 2, w, h);
        ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(0,0,0,0.55)'; ctx.strokeRect(fx_ - w / 2 - 0.5, fy - h / 2 - 0.5, w + 1, h + 1);
      }
      ctx.globalAlpha = 1;
      if (u.sup === 0) { ctx.strokeStyle = `rgba(242,193,78,${blink})`; ctx.lineWidth = 2; ctx.strokeRect(x - w / 2 - 2, y - h / 2 - 2, w + 4, h + 4); }
      if (u.type === 'armor' || u.type === 'marine') { ctx.fillStyle = '#000'; ctx.fillRect(x - w / 2, y + h / 2 - 1.6 * s, w, 1.6 * s); }
    }
    // divisions that just surrendered (white flag) or broke (cross)
    for (const g of fx.ghosts) {
      const q = (t - g.t0) / 1.6, [x, y0] = toScreen(g.x, g.y), y = y0 - q * 14;
      ctx.globalAlpha = Math.max(0, 1 - q); FLAG[g.fac](x - w / 2, y - h / 2, w, h);
      if (g.kind === 'captured') { ctx.fillStyle = '#fff'; ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 1; ctx.fillRect(x + w / 2 + 2, y - h, h * 1.1, h * 0.8); ctx.strokeRect(x + w / 2 + 2, y - h, h * 1.1, h * 0.8); ctx.fillStyle = '#ddd'; ctx.fillRect(x + w / 2 + 1, y - h, 1.2, h * 1.9); }
      else { ctx.strokeStyle = '#ffdddd'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x - w / 2, y - h / 2); ctx.lineTo(x + w / 2, y + h / 2); ctx.moveTo(x + w / 2, y - h / 2); ctx.lineTo(x - w / 2, y + h / 2); ctx.stroke(); }
    }
    ctx.globalAlpha = 1;

    // offensives: arrows that push the front
    const sdShown = shownDayOf(mix);
    for (const o of OFF.list) drawOffensive(o, sdShown, t);

    // artillery flashes
    ctx.globalCompositeOperation = 'lighter';
    const fz = Math.min(3, Math.max(1, Math.sqrt(zoom)));
    for (const p of fx.sparks) {
      const q = (t - p.t0) / p.life, a = q < 0.15 ? q / 0.15 : 1 - (q - 0.15) / 0.85;
      const r = (p.big ? 13 : 5.5) * fz * (0.7 + 0.6 * q); const [x, y] = toScreen(p.x, p.y);
      if (x < -20 || y < -20 || x > view.w + 20 || y > view.h + 20) continue;
      ctx.globalAlpha = a * (p.big ? 1 : 0.85); ctx.drawImage(FLASH, x - r, y - r, 2 * r, 2 * r);
    }
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;

    // a city changes hands: ripple in the new owner's colour
    for (const r of fx.ripples) {
      if (!r.t0) continue; const q = (t - r.t0) / 1.4, [x, y] = r.wx !== undefined ? toScreen(r.wx, r.wy) : toScreen(...proj(r.lon, r.lat));
      for (const d of [0, 0.18]) { const qq = q - d; if (qq < 0 || qq > 1) continue;
        ctx.strokeStyle = `rgba(${SIDE_RGB[r.side]},${(1 - qq) * 0.95})`; ctx.lineWidth = 3 * (1 - qq) + 1; ctx.beginPath(); ctx.arc(x, y, 5 + (r.tier === 1 ? 46 : 30) * qq, 0, 7); ctx.stroke(); }
      ctx.fillStyle = `rgba(255,255,255,${Math.max(0, 1 - q * 1.5)})`; ctx.beginPath(); ctx.arc(x, y, 5, 0, 7); ctx.fill();
    }

    // big troop totals, as in the reference video: inside each side's territory, never on the front
    const numAlpha = 1 - Math.min(1, Math.max(0, (zoom - 2.2) / 0.8));
    const mean = sums.map(a => a[2] > 0 ? [a[0] / a[2], a[1] / a[2]] : null);
    const size = Math.max(30, Math.min(52, view.w / 22)); ctx.font = `italic 800 ${size}px "Barlow Condensed", "Arial Narrow", sans-serif`;
    if (!fx.placeT || t - fx.placeT > 0.25) fx.placeT = t; const replace = fx.placeT === t;
    let placed = null;
    for (let side = 0; side < 2; side++) {
      const target = sim.stats.men[side], gap = Math.abs(target - state.shown[side]) / Math.max(target, 1);
      fx.pulse[side] = Math.max(fx.pulse[side] * 0.9, Math.min(0.16, gap * 6));
      state.shown[side] += (target - state.shown[side]) * 0.12;
      const N_ = NUM[side], text = fmt(state.shown[side]), w = ctx.measureText(text).width * 1.18 + 12, h = size * 1.15;
      if (replace) {
        const spot = numAlpha && mean[side] && target >= 1 ? placeNumber(side, mean[side], w, h, placed) : null;
        if (!spot) N_.want = false;
        else { N_.want = true; N_.tx = spot[0]; N_.ty = spot[1]; if (!N_.ok) { N_.x = spot[0]; N_.y = spot[1]; N_.a = 0; N_.ok = true; } }
      }
      if (N_.ok) {
        // small moves glide; a long move never sweeps across the front: fade out, jump, fade in
        const far = Math.hypot(N_.tx - N_.x, N_.ty - N_.y) > 70;
        if (far) { N_.a += (0 - N_.a) * 0.25; if (N_.a < 0.05) { N_.x = N_.tx; N_.y = N_.ty; } }
        else { const k = 0.12; N_.x += (N_.tx - N_.x) * k; N_.y += (N_.ty - N_.y) * k; N_.a += ((N_.want ? 1 : 0) - N_.a) * 0.15; }
      }
      placed = { x: N_.tx || N_.x, y: N_.ty || N_.y, w, h };
      if (N_.a > 0.02) { ctx.globalAlpha = N_.a * numAlpha; bigNumber(text, N_.x, N_.y, side, 1 + fx.pulse[side]); ctx.globalAlpha = 1; }
    }
  }
  function label(text, x, y, size, color) {
    ctx.font = `700 ${size}px "Barlow Condensed", "Arial Narrow", sans-serif`; ctx.textAlign = 'center';
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.65)'; ctx.strokeText(text, x, y); ctx.fillStyle = color; ctx.fillText(text, x, y); ctx.textAlign = 'left';
  }
  function bigNumber(text, x, y, side, scale) {
    const size = Math.max(30, Math.min(52, view.w / 22));
    ctx.save(); ctx.translate(x, y); ctx.rotate(-0.1); ctx.scale(scale, scale);
    ctx.font = `italic 800 ${size}px "Barlow Condensed", "Arial Narrow", sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.shadowColor = side === 0 ? 'rgba(120,0,15,0.9)' : 'rgba(0,30,90,0.9)'; ctx.shadowBlur = 14 + 40 * (scale - 1);
    ctx.lineWidth = 5; ctx.strokeStyle = side === 0 ? 'rgba(90,0,10,0.85)' : 'rgba(0,25,70,0.85)'; ctx.strokeText(text, 0, 0);
    ctx.shadowBlur = 0; ctx.fillStyle = '#fbfbfb'; ctx.fillText(text, 0, 0);
    ctx.restore();
  }

  // ---------- loop ----------
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.1, (now - last) / 1000); last = now; const ts = now / 1000;
    // keep the map smooth on weaker GPUs: lower its resolution when frames run long
    perf.ema += (dt - perf.ema) * 0.05; perf.t += dt;
    if (perf.t > 1.5) { perf.t = 0;
      if (perf.ema > 0.024 && view.gls > 0.5) { view.gls = Math.max(0.5, view.gls * 0.85); resize(); }
      else if (perf.ema < 0.0175 && view.gls < 1) { view.gls = Math.min(1, view.gls * 1.12); resize(); } }
    if (state.playing && !(sim.frozen && sim.armistice && !sim.sandbox && sim.day >= END_DAY)) {
      state.acc += dt * SPEEDS[state.speed];
      let steps = 0;
      while (state.acc >= 1 && steps < 3) { state.acc -= 1; sim.step(); afterStep(ts); steps++; }
      if (steps === 3) state.acc = Math.min(state.acc, 1);
      if (steps) { pushFeed(); updateHud(); }
    }
    const mix = Math.min(1, state.acc);
    stepEffects(dt, ts, mix);
    // camera shake on big moments (screen-space, tiny)
    const sx = reduceMotion ? 0 : (Math.random() - 0.5) * fx.shake, sy = reduceMotion ? 0 : (Math.random() - 0.5) * fx.shake;
    view.x += sx * view.upp; view.y += sy * view.upp;
    ren.draw(view, mix, ts, { grid: state.grid });
    drawOverlay(mix, ts);
    view.x -= sx * view.upp; view.y -= sy * view.upp;
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
  window.__probe = (sx, sy) => { const [x, y] = toWorld(sx, sy), k = sim.cellAt(x, y); return { k, c: sim.c[k], distF: sim.distF[k], main: sim.main[k], upp: view.upp, lag: fx.cLag.map(c => +c[k].toFixed(2)) }; };
  window.__fx = () => ({ sparks: fx.sparks.length, smoke: fx.smoke.length, offensives: OFF.list.map(o => ({ side: o.side, tips: o.tips.length, end: o.endDay })), nums: NUM.map(n => [Math.round(n.x), Math.round(n.y), +n.a.toFixed(2)]), hot: fx.hotHist.map(h => h.ks.length), adv: sim.advances.map(a => a.size) });
  window.__debugJump = (date, zoom, lon, lat, grid) => {
    setPlaying(false); const d = dayOf(date); if (d < sim.day) newSim(seed);
    const t = performance.now() / 1000;
    while (sim.day < d) { sim.step(); if (sim.day >= d - 20) afterStep(t); }
    state.acc = 0.5; pushFeed(); fx.banners = []; updateHud();
    if (zoom) { fitKorea(); view.upp /= zoom; const w = proj(lon, lat); view.x = w[0]; view.y = w[1]; clampView(); }
    state.grid = !!grid;
  };
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(boot, boot); else boot();
})();
