/*
 * Bellum front prototype: simulation.
 *
 * Territory is a continuous control field c in [-1, 1] on a fine grid
 * (+1 = North, -1 = South). The front is the c = 0 contour. The field
 * evolves as a forced Allen–Cahn equation:
 *
 *   dc/dt = D * laplacian(c) + K * (c - c^3) + F
 *
 * - The reaction term keeps cells firmly owned (+1 or -1).
 * - Diffusion keeps the front smooth and shrinks small pockets.
 * - F is the local balance of military pressure, so armies bend the
 *   front instead of flipping whole provinces.
 *
 * Pure JS, no DOM. Runs in the browser and in Node.
 */
(function (root) {
  'use strict';

  // ---------- projection (equirectangular, x scaled by cos 38°) ----------
  const COS = 0.788, LON0 = 116, LAT0 = 46;
  const proj = (lon, lat) => [(lon - LON0) * COS, LAT0 - lat];
  const unproj = (x, y) => [x / COS + LON0, LAT0 - y];

  // ---------- grid ----------
  const CELL = 0.04; // world units (= degrees of latitude) ≈ 4.4 km
  const GW = 140, GH = 256, N = GW * GH;
  const GX0 = (124 - LON0) * COS, GY0 = LAT0 - 43.2;
  const KM_PER_CELL = CELL * 111.2;

  // ---------- tuning ----------
  const T = {
    D: 1.0, K: 0.6, dt: 0.2, substeps: 30,
    FMAX: 0.3, P0: 4500, COLLAPSE: 0.2,
    blurR: 4,
    lossRate: 0.0045, baseDef: 1.25, entMax: 0.6, entRate: 0.015, outOfSupplyLoss: 0.016, orgDrain: 0.022, orgRegen: 0.025, rebuildDays: 25,
    repelR: 5,
  };

  // ---------- deterministic noise / rng ----------
  function hash(i, j) {
    let h = (Math.imul(i, 374761393) + Math.imul(j, 668265263)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
  }
  function vnoise(x, y) {
    const i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j;
    const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
    const a = hash(i, j), b = hash(i + 1, j), c = hash(i, j + 1), d = hash(i + 1, j + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }
  function fbm(x, y, o) { let s = 0, a = 0.5, f = 1; for (let k = 0; k < o; k++) { s += a * vnoise(x * f, y * f); f *= 2.03; a *= 0.5; } return s; }
  function ridged(x, y, o) { let s = 0, a = 0.5, f = 1; for (let k = 0; k < o; k++) { const n = 1 - Math.abs(vnoise(x * f + 17.3 * k, y * f) * 2 - 1); s += a * n * n; f *= 2.1; a *= 0.5; } return s; }
  function mulberry32(a) { return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

  // ---------- terrain: hand-placed ranges + noise ----------
  // [lonA, latA, lonB, latB, width(world units), amplitude]
  const RIDGES = [
    [128.45, 38.85, 129.30, 36.10, 0.38, 0.80], // Taebaek
    [129.25, 36.10, 128.95, 35.35, 0.30, 0.45],
    [128.50, 36.95, 127.30, 35.20, 0.34, 0.60], // Sobaek
    [126.30, 41.45, 127.70, 39.35, 0.42, 0.80], // Nangnim
    [128.00, 41.00, 129.80, 42.35, 0.48, 0.85], // Hamgyong
    [127.50, 40.95, 128.70, 40.55, 0.60, 0.65], // Kaema plateau
    [127.20, 39.05, 128.35, 38.60, 0.34, 0.50], // Masingnyong
    [126.90, 38.40, 127.60, 37.90, 0.30, 0.35], // central hills (Iron Triangle area)
  ];
  function segDist(px, py, ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay; let t = ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy);
    t = Math.max(0, Math.min(1, t)); const ex = ax + t * dx - px, ey = ay + t * dy - py; return Math.sqrt(ex * ex + ey * ey);
  }
  const RIDGES_P = RIDGES.map(r => { const a = proj(r[0], r[1]), b = proj(r[2], r[3]); return [a[0], a[1], b[0], b[1], r[4], r[5]]; });
  function heightAt(x, y) { // world coords
    let m = 0;
    for (const r of RIDGES_P) { const d = segDist(x, y, r[0], r[1], r[2], r[3]) / r[4]; m = Math.max(m, r[5] * Math.exp(-d * d)); }
    const base = 0.10 + 0.22 * fbm(x * 2.6, y * 2.6, 4);
    const rid = ridged(x * 4.3 + 3.1, y * 4.3, 5);
    return Math.min(1, base * 0.7 + m * (0.35 + 0.85 * rid));
  }

  // ---------- polygons ----------
  function decodeRings(list) {
    return list.map(d => {
      const pts = []; let x = d[0], y = d[1]; pts.push(proj(x / 200, y / 200));
      for (let i = 2; i < d.length; i += 2) { x += d[i]; y += d[i + 1]; pts.push(proj(x / 200, y / 200)); }
      return pts;
    });
  }
  function scanMask(rings) { // cell-center even-odd fill
    const m = new Uint8Array(N), xs = [];
    for (let j = 0; j < GH; j++) {
      const y = GY0 + (j + 0.5) * CELL; xs.length = 0;
      for (const r of rings) for (let i = 0, n = r.length; i < n; i++) {
        const a = r[i], b = r[(i + 1) % n];
        if ((a[1] > y) !== (b[1] > y)) xs.push(a[0] + (y - a[1]) / (b[1] - a[1]) * (b[0] - a[0]));
      }
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        const i0 = Math.max(0, Math.ceil((xs[k] - GX0) / CELL - 0.5)), i1 = Math.min(GW - 1, Math.floor((xs[k + 1] - GX0) / CELL - 0.5));
        for (let i = i0; i <= i1; i++) m[j * GW + i] = 1;
      }
    }
    return m;
  }

  // ---------- factions ----------
  const FACTIONS = {
    KPA: { side: 0, power: 1.15, speed: 3.4, refill: 0.006, label: 'KPA' },
    PVA: { side: 0, power: 1.05, speed: 3.2, refill: 0.006, mountain: 1.3, label: 'PVA' },
    ROK: { side: 1, power: 0.68, speed: 3.4, refill: 0.009, label: 'ROK' },
    UN: { side: 1, power: 1.4, speed: 3.8, refill: 0.012, label: 'UN' },
  };
  const SIDE_NAME = ['North', 'South'];

  const CITIES = [
    ['Pyongyang', 125.75, 39.02, 1], ['Seoul', 126.98, 37.56, 1], ['Pusan', 129.04, 35.18, 1],
    ['Taegu', 128.60, 35.87, 1], ['Taejon', 127.38, 36.35, 1], ['Incheon', 126.63, 37.46, 1],
    ['Kaesong', 126.55, 37.97, 2], ['Wonsan', 127.44, 39.15, 1], ['Hamhung', 127.54, 39.92, 2],
    ['Sinuiju', 124.40, 40.10, 2], ['Chongjin', 129.78, 41.80, 2], ['Kwangju', 126.85, 35.16, 2],
    ['Mokpo', 126.39, 34.79, 3], ['Pohang', 129.36, 36.02, 2], ['Chuncheon', 127.73, 37.88, 3],
    ['Kunsan', 126.71, 35.98, 3], ['Hyesan', 128.18, 41.40, 3], ['Kanggye', 126.60, 40.97, 3],
    ['Chosin Res.', 127.25, 40.45, 3], ['Masan', 128.57, 35.21, 3],
  ];

  // Supply sources: [lon, lat, side, capacity, range in cells]
  const PORTS = [
    [125.75, 39.02, 0, 1.00, 170], // Pyongyang depot
    [125.40, 38.73, 0, 0.55, 60],  // Chinnampo
    [129.04, 35.18, 1, 1.00, 230], // Pusan
    [126.63, 37.46, 1, 0.90, 150], // Incheon
    [129.36, 36.02, 1, 0.55, 70],  // Pohang
    [126.71, 35.98, 1, 0.55, 70],  // Kunsan
    [126.39, 34.79, 1, 0.45, 60],  // Mokpo
    [127.44, 39.15, 1, 0.70, 110], // Wonsan (if the South holds it)
    [127.62, 39.83, 1, 0.65, 100], // Hungnam
  ];

  // ---------- dates ----------
  const DAY0 = Date.UTC(1950, 5, 25);
  const dayOf = s => Math.round((Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)) - DAY0) / 864e5);
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function dateStr(day) { const d = new Date(DAY0 + day * 864e5); return d.getUTCDate() + ' ' + MONTHS[d.getUTCMonth()] + ' ' + d.getUTCFullYear(); }
  function monthOf(day) { return new Date(DAY0 + day * 864e5).getUTCMonth(); }

  // ======================================================================
  function Sim(region) {
    const NK = decodeRings(region.NK), SK = decodeRings(region.SK);
    const OTHER = decodeRings([].concat(region.CN || [], region.RU || [], region.MN || []));
    const mNK = scanMask(NK), mSK = scanMask(SK), mOther = scanMask(OTHER);
    const kor = new Uint8Array(N), other = new Uint8Array(N);
    for (let k = 0; k < N; k++) { kor[k] = mNK[k] | mSK[k]; other[k] = mOther[k] & (kor[k] ^ 1); }
    // remove 1-cell specks that would trap the field
    this.kor = kor; this.other = other;

    // mainland = largest connected piece of Korean land (islands never become pockets)
    this.main = new Uint8Array(N);
    { const lab = new Int32Array(N).fill(-1), q = new Int32Array(N); let best = -1, bestN = 0, id = 0;
      for (let s0 = 0; s0 < N; s0++) { if (!kor[s0] || lab[s0] >= 0) continue; let h = 0, t = 0; q[t++] = s0; lab[s0] = id;
        while (h < t) { const k = q[h++], i = k % GW; for (const n of [i > 0 ? k - 1 : -1, i < GW - 1 ? k + 1 : -1, k - GW, k + GW]) if (n >= 0 && n < N && kor[n] && lab[n] < 0) { lab[n] = id; q[t++] = n; } }
        if (t > bestN) { bestN = t; best = id; } id++; }
      for (let k = 0; k < N; k++) this.main[k] = lab[k] === best ? 1 : 0; }
    this.mtn = new Float32Array(N); this.lat = new Float32Array(N);
    for (let k = 0; k < N; k++) this.lat[k] = 43.2 - (Math.floor(k / GW) + 0.5) * CELL;
    this.coast = new Uint8Array(N);
    this.border = []; // Korean cells touching Chinese/Russian land
    for (let j = 0; j < GH; j++) for (let i = 0; i < GW; i++) {
      const k = j * GW + i; if (!kor[k]) continue;
      const x = GX0 + (i + 0.5) * CELL, y = GY0 + (j + 0.5) * CELL;
      const h = heightAt(x, y); this.mtn[k] = Math.max(0, Math.min(1, (h - 0.32) / 0.38));
      let sea = false, cn = false;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        const ii = i + di, jj = j + dj; if (ii < 0 || jj < 0 || ii >= GW || jj >= GH) { sea = true; continue; }
        const kk = jj * GW + ii; if (other[kk]) cn = true; else if (!kor[kk]) sea = true;
      }
      if (sea) this.coast[k] = 1; if (cn) this.border.push(k);
    }

    // field
    this.c = new Float32Array(N); this.c2 = new Float32Array(N);
    for (let j = 0; j < GH; j++) {
      const lat = 43.2 - (j + 0.5) * CELL;
      for (let i = 0; i < GW; i++) { const k = j * GW + i; this.c[k] = kor[k] ? (lat > 38 ? 1 : -1) : 0; }
    }
    this.F = new Float32Array(N);
    this.ent = new Float32Array(N); this.sgn = new Int8Array(N);
    this.P = [new Float32Array(N), new Float32Array(N)];
    this.tmp = new Float32Array(N);
    this.eff = [new Float32Array(N), new Float32Array(N)];
    this.pocket = new Uint8Array(N); // 1 = unsupplied North land, 2 = unsupplied South land
    this.distF = new Int16Array(N);
    this.q = new Int32Array(N);
    this.dtmp = new Int16Array(N);
    this.dmz = null;

    this.ports = PORTS.map(p => ({ k: this.nearestKor(p[0], p[1]), side: p[2], cap: p[3], range: p[4] }));
    this.cities = CITIES.map(c => { const k = this.nearestKor(c[1], c[2]); return { name: c[0], lon: c[1], lat: c[2], tier: c[3], k, owner: this.c[k] >= 0 ? 0 : 1, lastLog: -99 }; });

    this.units = []; this.nextId = 1;
    this.day = 0; this.rng = mulberry32(region.seed || 1950);
    this.power = {}; for (const f in FACTIONS) this.power[f] = FACTIONS[f].power;
    this.aggr = [1, 1]; this.halt = [null, null]; this.air = [1, 1]; this.org = [1, 1]; this.rebuild = []; this.frozen = false; this.armistice = false; this.sandbox = false;
    this.stats = { men: [0, 0], cas: [0, 0], cap: [0, 0] };
    this.log = [];
    this.caption = '';
    this.events = buildScript(this);
    this.evIdx = 0;
    // settle the initial front
    for (let s = 0; s < 30; s++) this.fieldStep();
    for (let k = 0; k < N; k++) { this.sgn[k] = this.c[k] >= 0 ? 1 : -1; this.ent[k] = 0.15; }
    this.runEvents();
    this.atk = [1, 1];
    this.updateSupply(); this.computeDist(); this.tally();
  }

  const P = Sim.prototype;
  P.cellAt = function (x, y) { const i = Math.floor((x - GX0) / CELL), j = Math.floor((y - GY0) / CELL); if (i < 0 || j < 0 || i >= GW || j >= GH) return -1; return j * GW + i; };
  P.cellXY = function (k) { return [GX0 + ((k % GW) + 0.5) * CELL, GY0 + (Math.floor(k / GW) + 0.5) * CELL]; };
  P.nearestKor = function (lon, lat, side) {
    const [x, y] = proj(lon, lat); const k0 = this.cellAt(x, y);
    const i0 = k0 % GW, j0 = Math.floor(k0 / GW);
    for (let r = 0; r < 40; r++) {
      let best = -1, bd = 1e9;
      for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
        if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
        const i = i0 + di, j = j0 + dj; if (i < 0 || j < 0 || i >= GW || j >= GH) continue;
        const k = j * GW + i; if (!this.kor[k]) continue;
        if (side !== undefined && this.c && (this.c[k] * (side === 0 ? 1 : -1)) <= 0) continue;
        const d = di * di + dj * dj; if (d < bd) { bd = d; best = k; }
      }
      if (best >= 0) return best;
    }
    return side === undefined ? k0 : -1;
  };
  P.say = function (text, kind) { this.log.push({ day: this.day, text, kind: kind || 'event' }); if (this.log.length > 200) this.log.shift(); };

  // ---------- units ----------
  P.addUnit = function (fac, type, k, str) {
    if (k < 0) return null;
    const f = FACTIONS[fac]; const [x, y] = this.cellXY(k);
    const jx = (this.rng() - 0.5) * CELL * 1.5, jy = (this.rng() - 0.5) * CELL * 1.5;
    const u = { id: this.nextId++, fac, side: f.side, type: type || 'inf', x: x + jx, y: y + jy, px: x + jx, py: y + jy, str, max: str, sup: 1, born: this.day };
    this.units.push(u); return u;
  };
  P.spawnLine = function (fac, type, pts, str) { for (const p of pts) this.addUnit(fac, type, this.nearestKor(p[0], p[1], FACTIONS[fac].side), str); };
  P.spawnAt = function (fac, type, lon, lat, n, str, spread) {
    const side = FACTIONS[fac].side;
    for (let i = 0; i < n; i++) {
      const lo = lon + (this.rng() - 0.5) * (spread || 0.4), la = lat + (this.rng() - 0.5) * (spread || 0.4) * 0.6;
      this.addUnit(fac, type, this.nearestKor(lo, la, side), str);
    }
  };
  P.claimDisk = function (k, r, side) { // force control in a small disk (landings, border crossings)
    const i0 = k % GW, j0 = Math.floor(k / GW), v = side === 0 ? 1 : -1;
    for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
      if (di * di + dj * dj > r * r) continue; const i = i0 + di, j = j0 + dj;
      if (i < 0 || j < 0 || i >= GW || j >= GH) continue; const kk = j * GW + i; if (this.kor[kk]) this.c[kk] = v;
    }
  };
  P.spawnFromChina = function (n, str, lonMin, lonMax) {
    let cands = this.border.filter(k => { const [x] = this.cellXY(k); const lon = unproj(x, 0)[0]; return lon >= lonMin && lon <= lonMax; });
    const held = cands.filter(k => this.c[k] > 0.2); if (held.length) cands = held; // cross where the North already holds the bank
    for (let i = 0; i < n; i++) {
      const k = cands[Math.floor(this.rng() * cands.length)];
      if (this.c[k] < 0.2) this.claimDisk(k, 4, 0);
      this.addUnit('PVA', 'inf', k, str);
    }
  };
  P.landing = function (k, side, n, str) {
    const fac = side === 0 ? 'KPA' : 'UN';
    this.claimDisk(k, 5, side);
    for (let i = 0; i < n; i++) this.addUnit(fac, i === 0 && side === 1 ? 'marine' : 'inf', k, str);
  };

  // ---------- supply ----------
  P.bfs = function (sources, side, dist, maxD) { // flood over own-held Korean land
    const q = this.q, c = this.c, kor = this.kor, sg = side === 0 ? 1 : -1;
    dist.fill(-1); let h = 0, t = 0;
    for (const k of sources) if (kor[k] && c[k] * sg > 0 && dist[k] < 0) { dist[k] = 0; q[t++] = k; }
    while (h < t) {
      const k = q[h++], d = dist[k]; if (maxD && d >= maxD) continue;
      const i = k % GW;
      if (i > 0) { const n = k - 1; if (dist[n] < 0 && kor[n] && c[n] * sg > 0) { dist[n] = d + 1; q[t++] = n; } }
      if (i < GW - 1) { const n = k + 1; if (dist[n] < 0 && kor[n] && c[n] * sg > 0) { dist[n] = d + 1; q[t++] = n; } }
      if (k >= GW) { const n = k - GW; if (dist[n] < 0 && kor[n] && c[n] * sg > 0) { dist[n] = d + 1; q[t++] = n; } }
      if (k < N - GW) { const n = k + GW; if (dist[n] < 0 && kor[n] && c[n] * sg > 0) { dist[n] = d + 1; q[t++] = n; } }
    }
  };
  P.updateSupply = function () {
    const d = this.dtmp;
    for (let s = 0; s < 2; s++) {
      const eff = this.eff[s]; eff.fill(0);
      const srcs = this.ports.filter(p => p.side === s);
      const groups = srcs.map(p => ({ ks: [p.k], cap: p.cap, range: p.range }));
      if (s === 0) groups.push({ ks: this.border, cap: 1.0, range: 150 });
      // connectivity to any source at all
      const all = []; for (const g of groups) for (const k of g.ks) all.push(k);
      this.bfs(all, s, d, 0);
      for (let k = 0; k < N; k++) if (d[k] >= 0) eff[k] = 0.22;
      for (const g of groups) {
        this.bfs(g.ks, s, d, g.range);
        for (let k = 0; k < N; k++) if (d[k] >= 0) { const e = g.cap * (1 - 0.65 * d[k] / g.range); if (e > eff[k]) eff[k] = e; }
      }
    }
    const c = this.c, pk = this.pocket;
    for (let k = 0; k < N; k++) {
      pk[k] = 0; if (!this.main[k]) continue;
      if (c[k] > 0 && this.eff[0][k] === 0) pk[k] = 1; else if (c[k] < 0 && this.eff[1][k] === 0) pk[k] = 2;
    }
  };

  // ---------- pressure ----------
  function boxBlur(a, tmp, r) {
    for (let j = 0; j < GH; j++) { // horizontal
      const o = j * GW; let s = 0;
      for (let i = -r; i <= r; i++) s += a[o + Math.min(GW - 1, Math.max(0, i))];
      for (let i = 0; i < GW; i++) { tmp[o + i] = s; s += a[o + Math.min(GW - 1, i + r + 1)] - a[o + Math.max(0, i - r)]; }
    }
    for (let i = 0; i < GW; i++) { // vertical
      let s = 0;
      for (let j = -r; j <= r; j++) s += tmp[Math.min(GH - 1, Math.max(0, j)) * GW + i];
      for (let j = 0; j < GH; j++) { a[j * GW + i] = s; s += tmp[Math.min(GH - 1, j + r + 1) * GW + i] - tmp[Math.max(0, j - r) * GW + i]; }
    }
  }
  P.unitPower = function (u) {
    const f = FACTIONS[u.fac]; let p = this.power[u.fac];
    if (u.type === 'armor') p *= 2.2; else if (u.type === 'marine') p *= 1.25;
    if (f.mountain) { const k = this.cellAt(u.x, u.y); if (k >= 0) p *= 1 + (f.mountain - 1) * this.mtn[k]; }
    return u.str * p * this.air[u.side] * (0.35 + 0.65 * Math.min(1, u.sup));
  };
  P.computePressure = function () {
    const r = T.blurR, norm = 1 / ((2 * r + 1) * (2 * r + 1));
    for (let s = 0; s < 2; s++) this.P[s].fill(0);
    for (const u of this.units) { const k = this.cellAt(u.x, u.y); if (k >= 0) this.P[u.side][k] += this.unitPower(u); }
    for (let s = 0; s < 2; s++) {
      const a = this.P[s]; boxBlur(a, this.tmp, r); boxBlur(a, this.tmp, r);
      // two passes of a (2r+1) box ≈ gaussian; rescale to "men within ~25 km"
      for (let k = 0; k < N; k++) a[k] *= norm * 9;
    }
  };
  P.attack = function (s) { const a = this.aggr[s]; return a > 1 ? 1 + (a - 1) * this.org[s] : a; };
  P.balanceAt = function (k) { // >0 favours North
    const c = this.c[k], m = this.mtn[k], def = T.baseDef + 0.8 * m + this.ent[k];
    const holder = c >= 0 ? 0 : 1, lat = this.lat[k];
    // past its halt line an offensive stops pushing and consolidates
    const an = this.halt[0] !== null && lat < this.halt[0] ? Math.min(this.atk[0], 0.45) : this.atk[0];
    const as = this.halt[1] !== null && lat > this.halt[1] ? Math.min(this.atk[1], 0.45) : this.atk[1];
    const En = this.P[0][k] * (holder === 0 ? def : an);
    const Es = this.P[1][k] * (holder === 1 ? def : as);
    return [En, Es];
  };
  P.computeForcing = function () {
    const F = this.F, mo = monthOf(this.day), winter = (mo === 11 || mo <= 1) ? 0.7 : (mo === 6 || mo === 7) ? 0.85 : 1;
    for (let k = 0; k < N; k++) {
      if (!this.kor[k]) { F[k] = 0; continue; }
      const [En, Es] = this.balanceAt(k);
      const bal = (En - Es) / (En + Es + T.P0);
      let f = T.FMAX * bal * (1 - 0.55 * this.mtn[k]) * winter;
      if (this.pocket[k] === 1) f -= T.COLLAPSE; else if (this.pocket[k] === 2) f += T.COLLAPSE;
      F[k] = f;
    }
  };
  P.fieldStep = function () {
    const c = this.c, o = this.c2, kor = this.kor, F = this.F, D = T.D, K = T.K, dt = T.dt;
    for (let k = 0; k < N; k++) {
      if (!kor[k]) { o[k] = c[k]; continue; }
      const v = c[k], i = k % GW; let lap = 0;
      if (i > 0 && kor[k - 1]) lap += c[k - 1] - v;
      if (i < GW - 1 && kor[k + 1]) lap += c[k + 1] - v;
      if (k >= GW && kor[k - GW]) lap += c[k - GW] - v;
      if (k < N - GW && kor[k + GW]) lap += c[k + GW] - v;
      let nv = v + dt * (D * lap + K * (v - v * v * v) + F[k]);
      if (nv > 1.05) nv = 1.05; else if (nv < -1.05) nv = -1.05;
      o[k] = nv;
    }
    this.c = o; this.c2 = c;
  };

  // distance (in cells) to the nearest front cell, over all Korean land
  P.computeDist = function () {
    const c = this.c, kor = this.kor, d = this.distF, q = this.q; d.fill(-1); let h = 0, t = 0;
    for (let k = 0; k < N; k++) {
      if (!kor[k]) continue; const s = c[k] >= 0, i = k % GW;
      if ((i > 0 && kor[k - 1] && (c[k - 1] >= 0) !== s) || (i < GW - 1 && kor[k + 1] && (c[k + 1] >= 0) !== s) ||
        (k >= GW && kor[k - GW] && (c[k - GW] >= 0) !== s) || (k < N - GW && kor[k + GW] && (c[k + GW] >= 0) !== s)) { d[k] = 0; q[t++] = k; }
    }
    while (h < t) {
      const k = q[h++], v = d[k] + 1, i = k % GW;
      if (i > 0 && kor[k - 1] && d[k - 1] < 0) { d[k - 1] = v; q[t++] = k - 1; }
      if (i < GW - 1 && kor[k + 1] && d[k + 1] < 0) { d[k + 1] = v; q[t++] = k + 1; }
      if (k >= GW && kor[k - GW] && d[k - GW] < 0) { d[k - GW] = v; q[t++] = k - GW; }
      if (k < N - GW && kor[k + GW] && d[k + GW] < 0) { d[k + GW] = v; q[t++] = k + GW; }
    }
  };

  P.moveUnits = function () {
    const c = this.c, kor = this.kor, d = this.distF, R = T.repelR * CELL, us = this.units;
    for (const u of us) { u.px = u.x; u.py = u.y; }
    for (const u of us) {
      const k = this.cellAt(u.x, u.y); if (k < 0) continue;
      const sg = u.side === 0 ? 1 : -1, i = k % GW, j = Math.floor(k / GW);
      const f = FACTIONS[u.fac]; let spd = f.speed * (u.type === 'armor' ? 1.7 : 1) * (1 - 0.45 * this.mtn[k]) * CELL;
      let vx = 0, vy = 0;
      const own = c[k] * sg;
      // gradient of own control
      const gx = ((i < GW - 1 && kor[k + 1] ? c[k + 1] : c[k]) - (i > 0 && kor[k - 1] ? c[k - 1] : c[k])) * sg;
      const gy = ((j < GH - 1 && kor[k + GW] ? c[k + GW] : c[k]) - (j > 0 && kor[k - GW] ? c[k - GW] : c[k])) * sg;
      if (own < -0.15) { // overrun: fall back toward own lines
        const g = Math.hypot(gx, gy) || 1; vx += gx / g * spd; vy += gy / g * spd;
      } else {
        const dk = d[k];
        if (dk > 1) { // march toward the nearest front
          let best = k, bd = dk;
          for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
            const ii = i + di, jj = j + dj; if (ii < 0 || jj < 0 || ii >= GW || jj >= GH) continue;
            const kk = jj * GW + ii; if (kor[kk] && d[kk] >= 0 && d[kk] < bd && c[kk] * sg > 0) { bd = d[kk]; best = kk; }
          }
          if (best !== k) { const [bx, by] = this.cellXY(best); const l = Math.hypot(bx - u.x, by - u.y) || 1; const s = Math.min(spd, (dk - 1) * CELL); vx += (bx - u.x) / l * s; vy += (by - u.y) / l * s; }
        } else {
          const [En, Es] = this.balanceAt(k), Eo = u.side === 0 ? En : Es, Ee = u.side === 0 ? Es : En;
          const g = Math.hypot(gx, gy) || 1;
          if (Ee > 2.2 * Eo) { vx += gx / g * spd * 0.6; vy += gy / g * spd * 0.6; u.retreat = 1; } // fall back fighting
          else { vx -= gx / g * CELL * 0.4; vy -= gy / g * CELL * 0.4; u.retreat = 0; } // lean into the enemy
        }
      }
      // spread out from friends
      for (const o of us) {
        if (o === u || o.side !== u.side) continue;
        const dx = u.x - o.x, dy = u.y - o.y; if (Math.abs(dx) > R || Math.abs(dy) > R) continue;
        const l = Math.hypot(dx, dy); if (l >= R) continue;
        const w = (1 - l / R) * CELL * 1.1; if (l < 1e-6) { vx += (this.rng() - 0.5) * w; vy += (this.rng() - 0.5) * w; } else { vx += dx / l * w; vy += dy / l * w; }
      }
      const l = Math.hypot(vx, vy); if (l > spd) { vx *= spd / l; vy *= spd / l; }
      // accept the move only onto own (or contested) Korean land
      for (const s of [1, 0.5, 0.25]) {
        const nx = u.x + vx * s, ny = u.y + vy * s, nk = this.cellAt(nx, ny);
        if (nk >= 0 && kor[nk] && (c[nk] * sg > -0.3 || own < -0.15)) { u.x = nx; u.y = ny; break; }
      }
    }
  };

  P.supplyNear = function (k, side) { // best supply within ~2 cells: front-line units stand on contested ground
    const e = this.eff[side], i0 = k % GW, j0 = Math.floor(k / GW); let best = 0;
    for (let dj = -2; dj <= 2; dj++) for (let di = -2; di <= 2; di++) {
      const i = i0 + di, j = j0 + dj; if (i < 0 || j < 0 || i >= GW || j >= GH) continue;
      const v = e[j * GW + i]; if (v > best) best = v;
    }
    return best;
  };
  P.combat = function () {
    const keep = [], inten = 0.55 + 0.45 * Math.max(this.atk[0], this.atk[1]);
    for (const u of this.units) {
      const k = this.cellAt(u.x, u.y);
      u.sup = k >= 0 ? this.supplyNear(k, u.side) : 0;
      let loss = 0;
      if (k >= 0) {
        const [En, Es] = this.balanceAt(k), Eo = u.side === 0 ? En : Es, Ee = u.side === 0 ? Es : En;
        if (Ee > 300) loss += (u.retreat ? 0.6 : 1) * T.lossRate * inten * (0.5 + 0.5 * this.atk[u.side]) * u.str * Ee / (Eo + Ee + T.P0);
      }
      if (u.sup === 0) loss += T.outOfSupplyLoss * u.str;
      loss = Math.min(loss, u.str);
      u.str -= loss; this.stats.cas[u.side] += loss;
      if (u.sup > 0 && u.str < u.max) u.str = Math.min(u.max, u.str + FACTIONS[u.fac].refill * u.max * u.sup);
      if (u.sup === 0 && u.str < 0.42 * u.max) { this.stats.cap[u.side] += u.str; u.gone = 'captured'; continue; }
      if (u.str < 0.12 * u.max) { this.stats.cas[u.side] += u.str; u.gone = 'destroyed'; this.rebuild.push({ day: this.day + T.rebuildDays, fac: u.fac, type: u.type, max: u.max }); continue; }
      keep.push(u);
    }
    const lost = this.units.length - keep.length;
    if (lost) {
      const cap = this.units.filter(u => u.gone === 'captured');
      if (cap.length >= 2) this.say(cap.length + ' encircled ' + SIDE_NAME[cap[0].side] + 'ern divisions surrender', 'pocket');
    }
    this.units = keep;
  };

  P.trackCities = function () {
    for (const ct of this.cities) {
      const o = this.c[ct.k] >= 0 ? 0 : 1;
      if (o !== ct.owner) {
        ct.owner = o;
        if (ct.tier <= 2 && this.day - ct.lastLog > 6) { this.say(ct.name + ' falls to the ' + SIDE_NAME[o], 'city'); ct.lastLog = this.day; }
      }
    }
  };

  P.tally = function () {
    const m = [0, 0]; for (const u of this.units) m[u.side] += u.str; this.stats.men = m;
  };

  P.runEvents = function () {
    while (this.evIdx < this.events.length && this.events[this.evIdx].day <= this.day) {
      const e = this.events[this.evIdx++];
      if (this.sandbox && e.scripted !== false && e.day > 0 && !e.always) continue;
      e.run(this);
      if (e.text) { this.say(e.text, e.kind || 'event'); this.caption = e.caption || this.caption; }
    }
  };

  P.entrench = function () { // fronts that stay still dig in
    const c = this.c, e = this.ent, g = this.sgn;
    for (let k = 0; k < N; k++) {
      if (!this.kor[k]) continue; const s = c[k] >= 0 ? 1 : -1;
      if (s === g[k]) { if (e[k] < T.entMax) e[k] += T.entRate; } else { e[k] = 0; g[k] = s; }
    }
  };
  P.momentum = function () {
    for (let s = 0; s < 2; s++) {
      if (this.aggr[s] > 1.02) this.org[s] = Math.max(0, this.org[s] - T.orgDrain * (this.aggr[s] - 1) * 2);
      else this.org[s] = Math.min(1, this.org[s] + T.orgRegen);
    }
    this.atk = [this.attack(0), this.attack(1)];
  };
  P.rebuildUnits = function () {
    const keep = [];
    for (const r of this.rebuild) {
      if (r.day > this.day) { keep.push(r); continue; }
      const side = FACTIONS[r.fac].side;
      const k = side === 0 ? this.nearestKor(125.75, 39.6, 0) : this.nearestKor(128.9, 35.3, 1);
      const u = this.addUnit(r.fac, r.type, k, r.max); if (u) u.str = r.max * 0.6; else keep.push(r);
    }
    this.rebuild = keep;
  };
  P.step = function () { // one day
    if (this.frozen) { this.day++; return; }
    this.day++;
    this.runEvents();
    if (this.frozen) return;
    this.momentum();
    this.rebuildUnits();
    this.updateSupply();
    this.combat();
    this.computePressure();
    this.computeForcing();
    for (let s = 0; s < T.substeps; s++) this.fieldStep();
    this.entrench();
    this.computeDist();
    this.moveUnits();
    this.trackCities();
    this.tally();
  };

  // ---------- player actions (sandbox tools) ----------
  P.playerDrop = function (x, y, side) {
    const k = this.cellAt(x, y); if (k < 0 || !this.kor[k]) return false;
    const sg = side === 0 ? 1 : -1;
    if (this.c[k] * sg > 0) { this.addUnit(side === 0 ? 'KPA' : 'UN', 'inf', k, 15000); this.say('You send a fresh ' + SIDE_NAME[side] + 'ern division to the front', 'player'); this.tally(); return true; }
    return false;
  };
  P.playerLanding = function (x, y, side) {
    let k = this.cellAt(x, y); if (k < 0) return false;
    if (!this.kor[k] || !this.coast[k]) { // snap to the nearest coast within ~25 km
      let best = -1, bd = 1e9; const i0 = k % GW, j0 = Math.floor(k / GW);
      for (let dj = -6; dj <= 6; dj++) for (let di = -6; di <= 6; di++) {
        const i = i0 + di, j = j0 + dj; if (i < 0 || j < 0 || i >= GW || j >= GH) continue;
        const kk = j * GW + i; if (this.kor[kk] && this.coast[kk] && di * di + dj * dj < bd) { bd = di * di + dj * dj; best = kk; }
      }
      if (best < 0) return false; k = best;
    }
    this.landing(k, side, 3, 16000);
    this.say('Amphibious landing: three ' + SIDE_NAME[side] + 'ern divisions go ashore', 'player'); this.tally();
    return true;
  };
  P.breakArmistice = function () {
    this.frozen = false; this.armistice = false; this.sandbox = true; this.aggr = [1.25, 1.25];
    this.say('The armistice collapses. Fighting resumes', 'event'); this.caption = 'Sandbox: the war goes on';
  };

  // ======================================================================
  // The 1950–53 script. It only adds forces and sets each side's posture
  // (how hard it attacks). Where the front ends up is up to the simulation.
  function buildScript(sim) {
    const ev = [];
    const at = (date, text, run, extra) => ev.push(Object.assign({ day: dayOf(date), text, run }, extra || {}));
    // posture: how hard each side attacks, and the latitude where its offensive halts (null = no limit)
    const post = (n, s, hn, hs) => sim => { sim.aggr = [n, s]; sim.halt = [hn === undefined ? null : hn, hs === undefined ? null : hs]; };

    at('1950-06-25', 'North Korea invades across the 38th parallel', sim => {
      const L = 38.18;
      sim.spawnLine('KPA', 'inf', [[125.6, L], [126.2, L], [126.55, L], [126.85, L], [127.05, L], [127.35, L], [127.7, L], [128.05, L], [128.4, L], [128.7, 38.3]], 13500);
      sim.spawnLine('KPA', 'armor', [[126.95, 38.25]], 8218);
      sim.spawnLine('ROK', 'inf', [[126.2, 37.82], [126.75, 37.85], [127.2, 37.85], [127.8, 37.8], [128.6, 37.8]], 12270);
      sim.spawnLine('ROK', 'inf', [[127.0, 37.5], [127.4, 36.4], [128.6, 35.9]], 12273);
      post(1.45, 0.8, 35.0, null)(sim);
    }, { caption: 'The invasion', always: true });
    at('1950-07-01', 'US 24th Infantry Division arrives at Pusan. UN aircraft take control of the skies', sim => { sim.spawnAt('UN', 'inf', 129.0, 35.25, 1, 15000); sim.air = [1, 1.25]; }, { caption: 'Delaying action' });
    at('1950-07-12', 'US 25th Infantry Division lands', sim => sim.spawnAt('UN', 'inf', 128.9, 35.4, 1, 15000));
    at('1950-07-18', 'US 1st Cavalry Division lands at Pohang', sim => sim.spawnAt('UN', 'inf', 129.3, 36.0, 1, 15000));
    at('1950-07-26', 'ROK army regroups at Taegu', sim => sim.spawnAt('ROK', 'inf', 128.6, 35.9, 2, 11000));
    at('1950-08-04', 'The Pusan Perimeter forms along the Naktong River', sim => { sim.spawnAt('UN', 'inf', 128.8, 35.4, 2, 15000); post(1.3, 0.85, 35.0, 36.0)(sim); }, { caption: 'The Pusan Perimeter' });
    at('1950-08-20', 'British and US reinforcements reach the perimeter', sim => { sim.spawnAt('UN', 'inf', 128.9, 35.35, 1, 12000); sim.spawnAt('ROK', 'inf', 128.9, 35.6, 1, 11000); });
    at('1950-08-31', 'Great Naktong Offensive', post(1.5, 0.85, 35.0, 36.0), { caption: 'Great Naktong Offensive' });
    at('1950-09-15', 'Operation Chromite: X Corps lands at Inchon', sim => {
      sim.landing(sim.nearestKor(126.64, 37.47), 1, 0, 0);
      sim.spawnAt('UN', 'marine', 126.68, 37.48, 2, 13000, 0.15);
      sim.spawnAt('UN', 'inf', 126.7, 37.45, 2, 12000, 0.15);
      post(0.85, 1.4)(sim);
    }, { caption: 'The Inchon landing' });
    at('1950-09-23', 'UN forces break out of the Pusan Perimeter', sim => sim.spawnAt('UN', 'inf', 128.7, 35.6, 2, 14000), { caption: 'Breakout' });
    at('1950-10-07', 'UN forces drive north toward the Yalu', sim => { sim.spawnAt('ROK', 'inf', 127.0, 37.6, 3, 11000); post(0.8, 1.35)(sim); }, { caption: 'The race to the Yalu' });
    at('1950-10-25', 'China enters the war', sim => { sim.spawnFromChina(11, 16000, 124.3, 127.0); sim.spawnFromChina(5, 16000, 127.0, 128.4); post(1.3, 1.05, 39.6, null)(sim); }, { caption: 'Chinese intervention' });
    at('1950-11-25', 'Second Phase Offensive: UN forces retreat south', sim => { sim.spawnFromChina(10, 16000, 124.3, 128.4); sim.power.UN = 1.05; sim.power.ROK = 0.55; post(1.55, 0.85, 37.5, null)(sim); }, { caption: 'The great retreat' });
    at('1950-12-20', 'Hungnam evacuation. New ROK divisions form in the south', sim => { sim.spawnAt('ROK', 'inf', 128.3, 36.2, 3, 12000, 1.4); sim.spawnAt('UN', 'inf', 128.9, 35.4, 1, 15000); });
    at('1951-01-20', null, sim => { sim.power.UN = 1.4; sim.power.ROK = 0.68; });
    at('1951-02-20', 'Fresh Chinese armies cross the Yalu', sim => sim.spawnFromChina(6, 16000, 124.3, 128.4));
    at('1951-03-07', 'Operation Ripper: the UN pushes back to the 38th parallel', post(0.95, 1.3, null, 38.2));
    at('1951-06-01', 'A retrained ROK army returns to the line', sim => { sim.power.ROK = 0.9; });
    at('1951-02-15', 'UN forces hold at Chipyong-ni', sim => { sim.spawnAt('UN', 'inf', 128.4, 35.9, 2, 15000, 1.0); sim.spawnAt('ROK', 'inf', 127.9, 36.3, 2, 12000, 1.4); });
    at('1951-01-01', 'Third Phase Offensive: Seoul is threatened again', sim => { sim.spawnFromChina(4, 16000, 124.3, 127.5); post(1.45, 0.85, 37.0, null)(sim); }, { caption: 'Third Phase Offensive' });
    at('1951-01-25', 'Operation Thunderbolt: the UN counterattacks', sim => { sim.spawnAt('UN', 'inf', 128.5, 36.0, 3, 15000, 1.2); sim.spawnAt('ROK', 'inf', 127.8, 36.4, 3, 12000, 1.2); post(0.95, 1.35, null, 37.6)(sim); }, { caption: 'Counteroffensive' });
    at('1951-04-22', 'Chinese Spring Offensive', sim => { sim.spawnFromChina(10, 16000, 124.3, 128.4); post(1.45, 0.95, 37.3, null)(sim); }, { caption: 'Spring Offensive' });
    at('1951-05-20', 'UN May–June counteroffensive', sim => { sim.spawnAt('UN', 'inf', 127.8, 36.8, 2, 15000, 1.0); sim.spawnAt('ROK', 'inf', 128.2, 36.6, 3, 12000, 1.0); post(0.95, 1.3, null, 38.4)(sim); });
    at('1951-07-10', 'Armistice talks open at Kaesong. The war of the hills begins', post(0.95, 0.95, 37.9, 38.5), { caption: 'Stalemate' });
    // two years of stalemate: steady build-up and short local offensives
    const buildUp = [];
    for (let m = 0; m < 23; m++) {
      const y = 1951 + Math.floor((7 + m) / 12), mo = (7 + m) % 12 + 1;
      buildUp.push(`${y}-${String(mo).padStart(2, '0')}-01`);
    }
    buildUp.forEach((d, m) => {
      at(d, null, sim => {
        sim.spawnFromChina(2, 16000, 124.3, 128.4);
        if (m % 2) sim.spawnAt('KPA', 'inf', 127.5, 39.3, 1, 12000, 1.0);
        sim.spawnAt('ROK', 'inf', 127.8, 36.6, 2, 12000, 1.4);
        sim.spawnAt('UN', 'inf', 128.6, 35.6, 1, 13000, 1.0);
      });
    });
    at('1951-10-13', 'Battle of Heartbreak Ridge', post(0.95, 1.2, 37.9, 38.6));
    at('1951-11-05', null, post(0.95, 0.95, 37.9, 38.5));
    at('1952-10-14', 'Battle of Triangle Hill', post(1.2, 0.95, 38.0, 38.5));
    at('1952-11-10', null, post(0.95, 0.95, 37.9, 38.5));
    at('1953-07-13', 'Final Chinese offensive at Kumsong', post(1.3, 0.95, 38.0, 38.5), { caption: 'Last offensive' });
    at('1953-07-27', 'Armistice signed. The front line becomes the DMZ', sim => {
      sim.frozen = true; sim.armistice = true; sim.dmz = new Float32Array(sim.c);
    }, { caption: 'Armistice' });
    ev.sort((a, b) => a.day - b.day);
    return ev;
  }

  root.BellumSim = { Sim, T, FACTIONS, SIDE_NAME, proj, unproj, heightAt, decodeRings, dateStr, dayOf, monthOf, CELL, GW, GH, GX0, GY0, KM_PER_CELL, N };
})(typeof window !== 'undefined' ? window : globalThis);
