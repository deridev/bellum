// War theaters: the continuous-front simulation from the Front Lab, generalised.
//
// A theater is a lon/lat grid over the area where two coalitions fight. Each cell holds a
// control value c in [-1, 1] (+1 = side A, the attackers; -1 = side B). The front is c = 0.
//   dc/dt = D·∇²c + K·(c - c³) + F      (forced Allen–Cahn)
// F is the local balance of military pressure (plus offensive pushes and pocket collapse).
// All tunables are in km so behaviour does not depend on the grid's cell size.
import type { Division, MapStatic, World } from '../types';
import { km } from '../../geo';

export interface Offensive {
  id: number; side: 1 | -1; country: number; army: number;
  from: [number, number]; to: [number, number]; created: number; org: number; ended: number;
  met?: number; // the other side's reserves have answered it
}
export interface Theater {
  id: number; war: number; name: string;
  lon0: number; lat0: number; cw: number; ch: number; W: number; H: number; cellKm: number;
  land: Uint8Array; prov: Int32Array; mtn: Float32Array; c: Float32Array; ent: Float32Array; flip: Uint8Array; heat: Float32Array; pocket: Uint8Array; main: Uint8Array;
  sideOf: Record<number, 1 | -1>; offensives: Offensive[]; cities: { name: string; k: number; side: number; tier: number }[];
  lead: [number, number]; frozen: boolean; dmz: Float32Array | null; created: number;
  aggr?: [number, number]; // how hard each AI side pushes on this front (from the local balance)
}
/** scratch buffers (not saved) */
interface Work { c2: Float32Array; P0: Float32Array; P1: Float32Array; tmp: Float32Array; F: Float32Array; eff0: Float32Array; eff1: Float32Array; distF: Int16Array; q: Int32Array; dtmp: Int16Array; air: [number, number]; atk: [number, number]; aggr: [number, number]; act: Int32Array; nAct: number }
const WORK = new WeakMap<Theater, Work>();
export function work(t: Theater): Work {
  let wk = WORK.get(t); const N = t.W * t.H;
  if (!wk || wk.c2.length !== N) {
    wk = { c2: new Float32Array(N), P0: new Float32Array(N), P1: new Float32Array(N), tmp: new Float32Array(N), F: new Float32Array(N), eff0: new Float32Array(N), eff1: new Float32Array(N), distF: new Int16Array(N), q: new Int32Array(N), dtmp: new Int16Array(N), air: [1, 1], atk: [1, 1], aggr: [1, 1], act: new Int32Array(N), nAct: 0 };
    WORK.set(t, wk); computeDist(t, wk); // distances to the front are needed before the first day (a new war, a loaded game)
  }
  return wk;
}

export const T = {
  D: 1.0, K: 0.6, dt: 0.2, FMAX: 0.3, P0: 4500, COLLAPSE: 0.2,
  blurKm: 18, lossRate: 0.0045, baseDef: 1.5, entMax: 0.8, entRate: 0.015, outOfSupplyLoss: 0.016,
  orgDrain: 0.022, orgRegen: 0.025, repelKm: 22, kmPerDayInf: 15, frontSpeedRef: 4.4, luck: 0.45, airWeight: 0.25, offBoost: 0.7,
  offKm: 65, // half-width of an offensive's corridor
  offReach: 150, // how deep one offensive can go (km)
  line: 0.8, // share of the divisions committed to a war that hold the line; the rest wait as its reserve
  shock: 0.5, // share of the trench bonus a fresh offensive cancels in its corridor
};

// ---------------------------------------------------------------------------- geometry
export const cellOf = (t: Theater, lon: number, lat: number) => {
  const i = Math.floor((lon - t.lon0) / t.cw), j = Math.floor((t.lat0 - lat) / t.ch);
  return i < 0 || j < 0 || i >= t.W || j >= t.H ? -1 : j * t.W + i;
};
export const cellLonLat = (t: Theater, k: number): [number, number] => [t.lon0 + ((k % t.W) + 0.5) * t.cw, t.lat0 - (Math.floor(k / t.W) + 0.5) * t.ch];
function provAtLonLat(S: MapStatic, lon: number, lat: number): number {
  const i = Math.min(S.demW - 1, Math.max(0, Math.floor((lon + 180) / 360 * S.demW))), j = Math.min(S.demH - 1, Math.max(0, Math.floor((90 - lat) / 180 * S.demH)));
  return S.provRaster[j * S.demW + i] - 1;
}
const elevAt = (S: MapStatic, lon: number, lat: number) => {
  const i = Math.min(S.demW - 1, Math.max(0, Math.floor((lon + 180) / 360 * S.demW))), j = Math.min(S.demH - 1, Math.max(0, Math.floor((90 - lat) / 180 * S.demH)));
  const v = S.dem[j * S.demW + i] / 255; return v * v * 8800;
};

/** Create a theater over a lon/lat box. Cells are sized so the grid stays under ~55k cells. */
export function createTheater(w: World, S: MapStatic, war: number, box: [number, number, number, number], sideOf: Record<number, 1 | -1>, name: string): Theater {
  const [x0, y0, x1, y1] = box; // lon min, lat min, lon max, lat max
  const latC = (y0 + y1) / 2, cosL = Math.max(0.25, Math.cos(latC * Math.PI / 180));
  const areaDeg = (x1 - x0) * cosL * (y1 - y0);
  const ch = Math.min(0.16, Math.max(0.045, Math.sqrt(areaDeg / 55000)));
  const cw = ch / cosL;
  const W = Math.max(8, Math.ceil((x1 - x0) / cw)), H = Math.max(8, Math.ceil((y1 - y0) / ch));
  const N = W * H;
  const t: Theater = {
    id: w.nextId++, war, name, lon0: x0, lat0: y1, cw, ch, W, H, cellKm: ch * 111.2,
    land: new Uint8Array(N), prov: new Int32Array(N).fill(-1), mtn: new Float32Array(N), c: new Float32Array(N), ent: new Float32Array(N).fill(0.3),
    flip: new Uint8Array(N).fill(255), heat: new Float32Array(N), pocket: new Uint8Array(N), main: new Uint8Array(N), sideOf: { ...sideOf }, offensives: [], cities: [],
    lead: [-1, -1], frozen: false, dmz: null, created: w.day,
  };
  buildMasks(t, w, S, true);
  return t;
}
/** (Re)compute which cells are playable and their terrain; optionally seed control from province controllers. */
export function buildMasks(t: Theater, w: World, S: MapStatic, seed: boolean) {
  const N = t.W * t.H;
  for (let k = 0; k < N; k++) {
    const [lon, lat] = cellLonLat(t, k);
    const p = provAtLonLat(S, lon, lat); t.prov[k] = p;
    if (p < 0) { t.land[k] = 0; continue; }
    const ctrl = w.provinces[p].controller, side = t.sideOf[ctrl];
    t.land[k] = side ? 1 : 0;
    // terrain: local relief from elevation + province terrain type
    const e = elevAt(S, lon, lat), d = t.cellKm / 111.2;
    const rel = Math.max(Math.abs(elevAt(S, lon + d, lat) - e), Math.abs(elevAt(S, lon, lat + d) - e), Math.abs(elevAt(S, lon - d, lat) - e), Math.abs(elevAt(S, lon, lat - d) - e));
    const tt = S.provinces[p].terrain;
    let m = Math.min(1, rel / 900 + Math.max(0, e - 1200) / 3000);
    if (tt === 'jungle') m = Math.max(m, 0.45); else if (tt === 'forest') m = Math.max(m, 0.25); else if (tt === 'mountains') m = Math.max(m, 0.55);
    t.mtn[k] = m;
    if (seed && side) t.c[k] = side;
  }
  // big cities are urban terrain: slow to take, and capitals most of all
  for (const city of S.cities) {
    if (city.pop < 300000 && !city.capital) continue;
    const rKm = 8 + 7 * Math.log10(Math.max(1, city.pop / 1e5)), u = Math.min(0.85, 0.35 + 0.15 * Math.log10(Math.max(1, city.pop / 3e5)) + (city.capital ? 0.25 : 0));
    const k0 = cellOf(t, city.lon, city.lat); if (k0 < 0) continue;
    const r = Math.ceil(rKm / t.cellKm), i0 = k0 % t.W, j0 = Math.floor(k0 / t.W);
    for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
      const i = i0 + di, j = j0 + dj; if (i < 0 || j < 0 || i >= t.W || j >= t.H) continue;
      const dk = Math.hypot(di, dj) * t.cellKm; if (dk > rKm) continue;
      const k = j * t.W + i; if (t.land[k]) t.mtn[k] = Math.max(t.mtn[k], u * (1 - 0.5 * dk / rKm));
    }
  }
  // mainland = largest connected piece of playable land; islands are supplied by sea and never become pockets
  { const lab = new Int32Array(N).fill(-1), q = new Int32Array(N); let best = -1, bestN = 0, id = 0;
    for (let s0 = 0; s0 < N; s0++) { if (!t.land[s0] || lab[s0] >= 0) continue; let h = 0, tl = 0; q[tl++] = s0; lab[s0] = id;
      while (h < tl) { const k = q[h++], i = k % t.W; for (const n of [i > 0 ? k - 1 : -1, i < t.W - 1 ? k + 1 : -1, k - t.W, k + t.W]) if (n >= 0 && n < N && t.land[n] && lab[n] < 0) { lab[n] = id; q[tl++] = n; } }
      if (tl > bestN) { bestN = tl; best = id; } id++; }
    for (let k = 0; k < N; k++) t.main[k] = lab[k] === best ? 1 : 0; }
  // settle the initial front a little
  if (seed) { const wk = work(t); wk.F.fill(0); for (let s = 0; s < 20; s++) fieldStep(t, wk); }
  computeDist(t, work(t));
  // cities worth reporting
  t.cities = [];
  for (const city of S.cities) {
    if (!(city.capital || city.pop > 900000)) continue;
    const k = cellOf(t, city.lon, city.lat); if (k < 0 || !t.land[k]) continue;
    t.cities.push({ name: city.name, k, side: t.c[k] >= 0 ? 1 : -1, tier: city.capital ? 1 : 2 });
  }
}

// ---------------------------------------------------------------------------- field
/** One explicit step of the field. With `active`, only the band near the front is updated (elsewhere the field is settled at ±1). */
function fieldStep(t: Theater, wk: Work, active = false) {
  const c = t.c, o = wk.c2, land = t.land, F = wk.F, W = t.W, N = t.W * t.H, D = T.D, K = T.K, dt = T.dt, act = wk.act, n = active ? wk.nAct : N;
  for (let i0 = 0; i0 < n; i0++) {
    const k = active ? act[i0] : i0;
    if (!land[k]) { o[k] = c[k]; continue; }
    const v = c[k], i = k % W; let lap = 0;
    if (i > 0 && land[k - 1]) lap += c[k - 1] - v;
    if (i < W - 1 && land[k + 1]) lap += c[k + 1] - v;
    if (k >= W && land[k - W]) lap += c[k - W] - v;
    if (k < N - W && land[k + W]) lap += c[k + W] - v;
    let nv = v + dt * (D * lap + K * (v - v * v * v) + F[k]);
    if (nv > 1.05) nv = 1.05; else if (nv < -1.05) nv = -1.05;
    o[k] = nv;
  }
  if (active) { for (let i0 = 0; i0 < n; i0++) c[act[i0]] = o[act[i0]]; } else c.set(o);
}
function boxBlur(a: Float32Array, tmp: Float32Array, W: number, H: number, r: number) {
  for (let j = 0; j < H; j++) { const o = j * W; let s = 0;
    for (let i = -r; i <= r; i++) s += a[o + Math.min(W - 1, Math.max(0, i))];
    for (let i = 0; i < W; i++) { tmp[o + i] = s; s += a[o + Math.min(W - 1, i + r + 1)] - a[o + Math.max(0, i - r)]; } }
  for (let i = 0; i < W; i++) { let s = 0;
    for (let j = -r; j <= r; j++) s += tmp[Math.min(H - 1, Math.max(0, j)) * W + i];
    for (let j = 0; j < H; j++) { a[j * W + i] = s; s += tmp[Math.min(H - 1, j + r + 1) * W + i] - tmp[Math.max(0, j - r) * W + i]; } }
}

// ---------------------------------------------------------------------------- units
const POWER: Record<Division['type'], number> = { infantry: 1, mechanized: 1.5, armor: 2.2, marines: 1.25, airborne: 1.2 };
const SPEED: Record<Division['type'], number> = { infantry: 1, mechanized: 1.6, armor: 1.7, marines: 1, airborne: 1.1 };
export const sideOfUnit = (t: Theater, d: Division) => t.sideOf[d.country] || 0;
export function unitPower(w: World, t: Theater, d: Division, k: number, wk: Work) {
  const c = w.countries[d.country];
  let p = POWER[d.type] * (1 + 0.05 * c.tech) * (0.8 + 0.4 * d.exp) * (0.5 + 0.5 * d.org);
  if (k >= 0 && (d.type === 'armor' || d.type === 'mechanized')) p *= 1 - 0.45 * t.mtn[k];
  const s = sideOfUnit(t, d) > 0 ? 0 : 1;
  return d.str * p * wk.air[s] * (0.35 + 0.65 * Math.min(1, d.sup));
}

// ---------------------------------------------------------------------------- daily step
export function stepTheater(w: World, S: MapStatic, t: Theater, units: Division[], sides: { aggr: [number, number] }) {
  if (t.frozen) return;
  const wk = work(t), W = t.W, H = t.H, N = W * H, c = t.c, land = t.land;
  wk.aggr = sides.aggr;
  // momentum per side comes from its offensives (org drains while pushing)
  for (const o of t.offensives) { if (o.ended) continue; o.org = Math.max(0, o.org - T.orgDrain * 0.9); }
  wk.atk = [1, 1];
  // air superiority: each side's air strength (economy x defence budget x technology), weighted by commitment
  if (w.day % 5 === 0 || wk.air[0] === 1) {
    const air = [0, 0];
    const committed = new Map<number, number>(); for (const d of units) committed.set(d.country, (committed.get(d.country) || 0) + 1);
    for (const [cs, side] of Object.entries(t.sideOf)) {
      const c = w.countries[+cs]; if (!c.alive) continue; const here = committed.get(c.id) || 0; const total = w.divisions.filter(d => d.country === c.id).length || 1;
      const share = Math.max(here / total, here > 0 ? 0.35 : 0.08);
      air[side > 0 ? 0 : 1] += c.gdp * c.budget.military * (1 + 0.15 * c.tech) * share;
    }
    // outside support: friends of one side who are hostile to the other lend a share of air power and supply
    const n = w.countries.length, la = w.countries[t.lead[0] >= 0 ? t.lead[0] : +Object.keys(t.sideOf).find(c => t.sideOf[+c] > 0)!], lb = w.countries[t.lead[1] >= 0 ? t.lead[1] : +Object.keys(t.sideOf).find(c => t.sideOf[+c] < 0)!];
    if (la && lb) for (const c of w.countries) {
      if (!c.alive || t.sideOf[c.id]) continue;
      const toA = w.relations[c.id * n + la.id], toB = w.relations[c.id * n + lb.id];
      const pw = c.gdp * c.budget.military * (1 + 0.15 * c.tech) * 0.035;
      if (toA > 50 && toB < -30) air[0] += pw; else if (toB > 50 && toA < -30) air[1] += pw;
    }
    const r = air[0] / Math.max(1, air[0] + air[1]);
    wk.air = [1 + T.airWeight * (2 * r - 1), 1 - T.airWeight * (2 * r - 1)];
  }
  updateSupply(w, S, t, wk);
  combat(w, t, units, wk);
  // pressure
  const r = Math.max(1, Math.round(T.blurKm / t.cellKm));
  wk.P0.fill(0); wk.P1.fill(0);
  for (const d of units) { const k = cellOf(t, d.x, d.y); if (k < 0) continue; const s = sideOfUnit(t, d); (s > 0 ? wk.P0 : wk.P1)[k] += unitPower(w, t, d, k, wk); }
  const norm = 729 / ((2 * r + 1) * (2 * r + 1)) / ((2 * r + 1) * (2 * r + 1));
  for (const P of [wk.P0, wk.P1]) { boxBlur(P, wk.tmp, W, H, r); boxBlur(P, wk.tmp, W, H, r); for (let k = 0; k < N; k++) P[k] *= norm; }
  // the band where the field can move today: near yesterday's front (it moves a few cells a day at most) and in pockets
  { const d = wk.distF, act = wk.act; let n = 0; for (let k = 0; k < N; k++) if (land[k] && ((d[k] >= 0 && d[k] <= 10) || t.pocket[k])) act[n++] = k; wk.nAct = n; }
  computeForcing(w, t, wk);
  const sub = Math.max(6, Math.min(36, Math.round(30 * T.frontSpeedRef / t.cellKm)));
  for (let s = 0; s < sub; s++) fieldStep(t, wk, true);
  // entrenchment, flips, heat
  for (let k = 0; k < N; k++) {
    if (!land[k]) continue; const s = c[k] >= 0 ? 1 : 0, prevS = t.flip[k] & 128 ? 1 : 0; let age = t.flip[k] & 127;
    if (s === prevS) { if (t.ent[k] < T.entMax) t.ent[k] += T.entRate * stanceDig(wk.aggr[1 - s]); if (age < 127) age++; } else { t.ent[k] = 0; age = 0; }
    t.flip[k] = (s << 7) | age;
  }
  computeDist(t, wk);
  for (let k = 0; k < N; k++) {
    let v = t.heat[k] * 0.8;
    if (land[k] && wk.distF[k] >= 0 && wk.distF[k] <= 3) { const contact = Math.min(1, Math.min(wk.P0[k], wk.P1[k]) / 45000); v = Math.max(v, contact * (0.35 + 0.65 * Math.min(1, Math.abs(wk.F[k]) / 0.1))); }
    if ((t.flip[k] & 127) === 0 && land[k]) v = Math.max(v, 0.6);
    t.heat[k] = v;
  }
  moveUnits(w, t, units, wk);
}
export const flipAge = (t: Theater, k: number) => t.flip[k] & 127;

function updateSupply(w: World, S: MapStatic, t: Theater, wk: Work) {
  const W = t.W, H = t.H, N = W * H, c = t.c, land = t.land;
  for (const side of [1, -1] as const) {
    const eff = side > 0 ? wk.eff0 : wk.eff1; eff.fill(0);
    // sources: side-held cells on the theater edge (link to the hinterland), capitals, big ports
    const edge: number[] = [], caps: number[] = [], ports: number[] = [];
    for (let i = 0; i < W; i++) for (const j of [0, H - 1]) { const k = j * W + i; if (land[k] && c[k] * side > 0) edge.push(k); }
    for (let j = 0; j < H; j++) for (const i of [0, W - 1]) { const k = j * W + i; if (land[k] && c[k] * side > 0) edge.push(k); }
    for (const [cs, s] of Object.entries(t.sideOf)) if (s === side) { const cap = w.countries[+cs].capital, [lon, lat] = S.provinces[cap].label; const k = cellOf(t, lon, lat); if (k >= 0 && land[k] && c[k] * side > 0) caps.push(k); }
    for (const city of t.cities) if (city.tier <= 2 && land[city.k] && c[city.k] * side > 0 && isCoast(t, city.k)) ports.push(city.k);
    const groups: { ks: number[]; cap: number; rangeKm: number }[] = [{ ks: edge, cap: 0.95, rangeKm: 900 }, { ks: caps, cap: 1, rangeKm: 1100 }, { ks: ports, cap: 0.8, rangeKm: 450 }];
    bfs(t, wk, groups.flatMap(g => g.ks), side, 0);
    for (let k = 0; k < N; k++) if (wk.dtmp[k] >= 0) eff[k] = 0.22;
    for (const g of groups) {
      if (!g.ks.length) continue; const range = g.rangeKm / t.cellKm;
      bfs(t, wk, g.ks, side, Math.ceil(range));
      for (let k = 0; k < N; k++) if (wk.dtmp[k] >= 0) { const e = g.cap * (1 - 0.65 * wk.dtmp[k] / range); if (e > eff[k]) eff[k] = e; }
    }
  }
  for (let k = 0; k < N; k++) {
    t.pocket[k] = 0; if (!land[k]) continue;
    if (!t.main[k]) { if (c[k] > 0) wk.eff0[k] = Math.max(wk.eff0[k], 0.5); else wk.eff1[k] = Math.max(wk.eff1[k], 0.5); continue; }
    if (c[k] > 0 && wk.eff0[k] === 0) t.pocket[k] = 1; else if (c[k] < 0 && wk.eff1[k] === 0) t.pocket[k] = 2;
  }
}
const isCoast = (t: Theater, k: number) => { const i = k % t.W, j = Math.floor(k / t.W); for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const ii = i + di, jj = j + dj; if (ii < 0 || jj < 0 || ii >= t.W || jj >= t.H) continue; if (t.prov[jj * t.W + ii] < 0) return true; } return false; };
function bfs(t: Theater, wk: Work, sources: number[], side: number, maxD: number) {
  const q = wk.q, d = wk.dtmp, c = t.c, land = t.land, W = t.W, N = t.W * t.H; d.fill(-1); let h = 0, tl = 0;
  for (const k of sources) if (land[k] && c[k] * side > 0 && d[k] < 0) { d[k] = 0; q[tl++] = k; }
  while (h < tl) {
    const k = q[h++], v = d[k]; if (maxD && v >= maxD) continue; const i = k % W;
    if (i > 0) { const n = k - 1; if (d[n] < 0 && land[n] && c[n] * side > 0) { d[n] = v + 1; q[tl++] = n; } }
    if (i < W - 1) { const n = k + 1; if (d[n] < 0 && land[n] && c[n] * side > 0) { d[n] = v + 1; q[tl++] = n; } }
    if (k >= W) { const n = k - W; if (d[n] < 0 && land[n] && c[n] * side > 0) { d[n] = v + 1; q[tl++] = n; } }
    if (k < N - W) { const n = k + W; if (d[n] < 0 && land[n] && c[n] * side > 0) { d[n] = v + 1; q[tl++] = n; } }
  }
}
export function supplyAt(t: Theater, k: number, side: number): number {
  const wk = work(t), e = side > 0 ? wk.eff0 : wk.eff1, i0 = k % t.W, j0 = Math.floor(k / t.W); let best = 0;
  for (let dj = -2; dj <= 2; dj++) for (let di = -2; di <= 2; di++) { const i = i0 + di, j = j0 + dj; if (i < 0 || j < 0 || i >= t.W || j >= t.H) continue; const v = e[j * t.W + i]; if (v > best) best = v; }
  return best;
}

/** effective [A, B] pressure at a cell, with defence bonuses and offensive pushes */
export function balanceAt(t: Theater, wk: Work, k: number): [number, number] {
  const holder = c0(t, k), push = pushAt(t, k, holder === 0 ? -1 : 1);
  // a fresh offensive's barrage cancels most of the trench bonus in its corridor
  const def = T.baseDef + 0.8 * t.mtn[k] + t.ent[k] * (1 - T.shock * Math.max(0, push - 1) / T.offBoost);
  const ea = wk.P0[k] * (holder === 0 ? def : wk.aggr[0] * push);
  const eb = wk.P1[k] * (holder === 1 ? def : wk.aggr[1] * push);
  return [ea, eb];
}
const c0 = (t: Theater, k: number) => t.c[k] >= 0 ? 0 : 1;
/** Stance: Hold digs in and spares men; All-out pushes everywhere and pays for it. (aggr < 1 is Hold, > 1.15 All-out) */
export const stanceLoss = (aggr: number) => aggr < 1 ? 0.65 : aggr > 1.15 ? 1.35 : 1;
export const stanceDig = (aggr: number) => aggr < 1 ? 2 : 1;
/** extra attack strength inside an active offensive's corridor; past its target the push halts */
function pushAt(t: Theater, k: number, side: number): number {
  let best = 1; if (!t.offensives.length) return best;
  const [lon, lat] = cellLonLat(t, k);
  for (const o of t.offensives) {
    if (o.ended || o.side !== side) continue;
    const ax = o.from[0], ay = o.from[1], bx = o.to[0], by = o.to[1];
    const cosL = Math.cos(lat * Math.PI / 180);
    const dx = (bx - ax) * cosL, dy = by - ay, L2 = dx * dx + dy * dy; if (L2 < 1e-9) continue;
    const px = (lon - ax) * cosL, py = lat - ay; const u = (px * dx + py * dy) / L2;
    const ex = px - u * dx, ey = py - u * dy, dKm = Math.sqrt(ex * ex + ey * ey) * 111.2;
    if (u > 1.02) { if (dKm < T.offKm) best = Math.min(best, 0.45); continue; } // halt line
    if (u < -0.1 || dKm > T.offKm) continue;
    const boost = 1 + T.offBoost * (0.4 + 0.6 * o.org) * Math.min(1, 1.5 * (1 - dKm / T.offKm));
    if (boost > best) best = boost;
  }
  return best;
}
function computeForcing(w: World, t: Theater, wk: Work) {
  const F = wk.F, mo = new Date(w.startDate + w.day * 864e5).getUTCMonth();
  const winter = (mo === 11 || mo <= 1) ? 0.75 : 1;
  for (let i0 = 0; i0 < wk.nAct; i0++) {
    const k = wk.act[i0];
    if (!t.land[k]) { F[k] = 0; continue; }
    const [ea, eb] = balanceAt(t, wk, k);
    const bal = (ea - eb) / (ea + eb + T.P0);
    let f = T.FMAX * bal * (1 - 0.55 * t.mtn[k]) * winter * friction(w, t, k);
    if (t.pocket[k] === 1) f -= T.COLLAPSE; else if (t.pocket[k] === 2) f += T.COLLAPSE;
    F[k] = f;
  }
}
function vnoise(x: number, y: number) {
  const i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j, u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const h = (a: number, b: number) => { let n = (Math.imul(a, 374761393) + Math.imul(b, 668265263)) | 0; n = Math.imul(n ^ (n >>> 13), 1274126177); return ((n ^ (n >>> 16)) >>> 0) / 4294967295; };
  const a = h(i, j), b = h(i + 1, j), c = h(i, j + 1), d = h(i + 1, j + 1); return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function friction(w: World, t: Theater, k: number) { // local luck: fronts surge in places, stick in others
  const sc = 35 / t.cellKm, x = (k % t.W) / sc, y = Math.floor(k / t.W) / sc, tt = w.day / 6, ti = Math.floor(tt), tf = tt - ti, u = tf * tf * (3 - 2 * tf);
  const a = vnoise(x + 31.7 * ti, y), b = vnoise(x + 31.7 * (ti + 1), y); return 1 - T.luck + 2 * T.luck * (a + (b - a) * u);
}
function computeDist(t: Theater, wk: Work) {
  const c = t.c, land = t.land, d = wk.distF, q = wk.q, W = t.W, N = t.W * t.H; d.fill(-1); let h = 0, tl = 0;
  for (let k = 0; k < N; k++) {
    if (!land[k]) continue; const s = c[k] >= 0, i = k % W;
    if ((i > 0 && land[k - 1] && (c[k - 1] >= 0) !== s) || (i < W - 1 && land[k + 1] && (c[k + 1] >= 0) !== s) || (k >= W && land[k - W] && (c[k - W] >= 0) !== s) || (k < N - W && land[k + W] && (c[k + W] >= 0) !== s)) { d[k] = 0; q[tl++] = k; }
  }
  while (h < tl) { const k = q[h++], v = d[k] + 1, i = k % W;
    if (i > 0 && land[k - 1] && d[k - 1] < 0) { d[k - 1] = v; q[tl++] = k - 1; }
    if (i < W - 1 && land[k + 1] && d[k + 1] < 0) { d[k + 1] = v; q[tl++] = k + 1; }
    if (k >= W && land[k - W] && d[k - W] < 0) { d[k - W] = v; q[tl++] = k - W; }
    if (k < N - W && land[k + W] && d[k + W] < 0) { d[k + W] = v; q[tl++] = k + W; } }
}

function combat(w: World, t: Theater, units: Division[], wk: Work) {
  const inten = 0.55 + 0.45 * Math.max(wk.aggr[0], wk.aggr[1]);
  for (const d of units) {
    const k = cellOf(t, d.x, d.y), side = sideOfUnit(t, d);
    d.sup = k >= 0 ? supplyAt(t, k, side) : 0;
    let loss = 0;
    if (k >= 0) {
      const [ea, eb] = balanceAt(t, wk, k), eo = side > 0 ? ea : eb, ee = side > 0 ? eb : ea;
      if (ee > 300) loss += (d.retreat ? 0.6 : 1) * (d.op ? 1.2 : 1) * T.lossRate * inten * stanceLoss(side > 0 ? wk.aggr[0] : wk.aggr[1]) * d.str * ee / (eo + ee + T.P0);
      if (ee > 300) d.exp = Math.min(1, d.exp + 0.002);
    }
    if (d.sup === 0) loss += T.outOfSupplyLoss * d.str;
    loss = Math.min(loss, d.str); d.str -= loss;
    w.countries[d.country].stats.casualties += loss;
    const war = w.wars.find(x => x.id === t.war); if (war) war.casualties[side > 0 ? 0 : 1] += loss;
    const country = w.countries[d.country];
    if (d.sup > 0 && d.str < d.max && country.manpower > 0) { const add = Math.min(d.max - d.str, d.max * 0.006 * d.sup, country.manpower); d.str += add; country.manpower -= add; }
    d.org = Math.min(0.6 + 0.4 * (country.readiness ?? 1), d.org + (d.sup > 0.3 ? 0.02 : -0.02));
  }
}

function moveUnits(w: World, t: Theater, units: Division[], wk: Work) {
  const c = t.c, land = t.land, d = wk.distF, W = t.W, H = t.H;
  const R = T.repelKm / 111.2;
  for (const u of units) {
    const k = cellOf(t, u.x, u.y); if (k < 0) continue;
    const sg = sideOfUnit(t, u), i = k % W, j = Math.floor(k / W);
    const cosL = Math.cos(u.y * Math.PI / 180);
    const spdKm = T.kmPerDayInf * SPEED[u.type] * (1 - 0.45 * t.mtn[k]);
    const spd = spdKm / 111.2; // degrees lat per day
    let vx = 0, vy = 0; // in "lat-degree" units, x scaled by cos
    const own = c[k] * sg;
    const gx = ((i < W - 1 && land[k + 1] ? c[k + 1] : c[k]) - (i > 0 && land[k - 1] ? c[k - 1] : c[k])) * sg;
    const gy = -((j < H - 1 && land[k + W] ? c[k + W] : c[k]) - (j > 0 && land[k - W] ? c[k - W] : c[k])) * sg; // north = +y
    // offensive assignment: units of an army with an active offensive head for its tip
    const off = u.op ? t.offensives.find(o => o.id === u.op && !o.ended) : undefined;
    if (own < -0.15) { const g = Math.hypot(gx, gy) || 1; vx += gx / g * spd; vy += gy / g * spd; }
    else if (off && d[k] > 1) {
      const tip = offensiveTip(t, off); const dx = (tip[0] - u.x) * cosL, dy = tip[1] - u.y, l = Math.hypot(dx, dy) || 1;
      vx += dx / l * spd; vy += dy / l * spd;
    } else {
      const dk = d[k];
      if (dk > 1) {
        let best = k, bd = dk;
        for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) { const ii = i + di, jj = j + dj; if (ii < 0 || jj < 0 || ii >= W || jj >= H) continue; const kk = jj * W + ii; if (land[kk] && d[kk] >= 0 && d[kk] < bd && c[kk] * sg > 0) { bd = d[kk]; best = kk; } }
        if (best !== k) { const [bx, by] = cellLonLat(t, best); const dx = (bx - u.x) * cosL, dy = by - u.y, l = Math.hypot(dx, dy) || 1, s = Math.min(spd, (dk - 1) * t.ch); vx += dx / l * s; vy += dy / l * s; }
      } else {
        const [ea, eb] = balanceAt(t, wk, k), eo = sg > 0 ? ea : eb, ee = sg > 0 ? eb : ea; const g = Math.hypot(gx, gy) || 1;
        if (ee > 2.2 * eo) { vx += gx / g * spd * 0.6; vy += gy / g * spd * 0.6; u.retreat = 1; } else { vx -= gx / g * t.ch * 0.4; vy -= gy / g * t.ch * 0.4; u.retreat = 0; }
      }
    }
    for (const o of units) {
      if (o === u || sideOfUnit(t, o) !== sg) continue;
      const dx = (u.x - o.x) * cosL, dy = u.y - o.y; if (Math.abs(dx) > R || Math.abs(dy) > R) continue;
      const l = Math.hypot(dx, dy); if (l >= R) continue;
      const wgt = (1 - l / R) * t.ch * 1.1; if (l < 1e-6) { vx += (hash01(u.id + w.day) - 0.5) * wgt; vy += (hash01(u.id * 7 + w.day) - 0.5) * wgt; } else { vx += dx / l * wgt; vy += dy / l * wgt; }
    }
    const l = Math.hypot(vx, vy); if (l > spd) { vx *= spd / l; vy *= spd / l; }
    for (const s of [1, 0.5, 0.25]) {
      const nx = u.x + vx * s / cosL, ny = u.y + vy * s, nk = cellOf(t, nx, ny);
      if (nk >= 0 && land[nk] && (c[nk] * sg > -0.3 || own < -0.15)) { u.x = nx; u.y = ny; break; }
    }
  }
}
const hash01 = (n: number) => { n = Math.imul(n ^ (n >>> 15), 2246822507); n = Math.imul(n ^ (n >>> 13), 3266489909); return ((n ^ (n >>> 16)) >>> 0) / 4294967296; };

/** where an offensive's arrow meets the front right now */
export function offensiveTip(t: Theater, o: Offensive): [number, number] {
  const side = o.side; let [x, y] = o.from; const cosL = Math.cos(y * Math.PI / 180);
  const dx = (o.to[0] - x) * cosL, dy = o.to[1] - y, L = Math.hypot(dx, dy) || 1, stepDeg = t.ch * 0.4;
  let prev = cAt(t, x, y) * side;
  for (let s = 0; s < L; s += stepDeg) {
    const nx = x + dx / L * stepDeg / cosL, ny = y + dy / L * stepDeg, v = cAt(t, nx, ny) * side;
    if (!(v > 0)) { if (v <= 0 && prev > 0) { const f = prev / (prev - v); return [x + (nx - x) * f, y + (ny - y) * f]; } return [x, y]; }
    x = nx; y = ny; prev = v;
  }
  return [x, y];
}
export function cAt(t: Theater, lon: number, lat: number): number {
  const gx = (lon - t.lon0) / t.cw - 0.5, gy = (t.lat0 - lat) / t.ch - 0.5, i = Math.floor(gx), j = Math.floor(gy);
  if (i < 0 || j < 0 || i >= t.W - 1 || j >= t.H - 1) return NaN;
  const k = j * t.W + i, fx = gx - i, fy = gy - j; let sum = 0, wsum = 0;
  const add = (kk: number, ww: number) => { if (t.land[kk]) { sum += t.c[kk] * ww; wsum += ww; } };
  add(k, (1 - fx) * (1 - fy)); add(k + 1, fx * (1 - fy)); add(k + t.W, (1 - fx) * fy); add(k + t.W + 1, fx * fy);
  return wsum > 0.1 ? sum / wsum : NaN;
}
/** force control in a disk (amphibious landings, border crossings) */
export function claimDisk(t: Theater, lon: number, lat: number, radiusKm: number, side: number) {
  const k0 = cellOf(t, lon, lat); if (k0 < 0) return; const r = Math.ceil(radiusKm / t.cellKm), i0 = k0 % t.W, j0 = Math.floor(k0 / t.W);
  for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) { if (di * di + dj * dj > r * r) continue; const i = i0 + di, j = j0 + dj; if (i < 0 || j < 0 || i >= t.W || j >= t.H) continue; const k = j * t.W + i; if (t.land[k]) t.c[k] = side; }
}
/** distance (km) from a point to the nearest front cell, -1 if no front */
export function frontDistanceKm(t: Theater, lon: number, lat: number): number { const k = cellOf(t, lon, lat); if (k < 0) return -1; const d = work(t).distF[k]; return d < 0 ? -1 : d * t.cellKm; }
export { km };

/** place units along their own side of the front (scenario start) */
/** Place units on their own side of the front. `near` (optional) sends a unit to the stretch of front closest to a point. */
export function deployAlongFront(w: World, t: Theater, units: Division[], rand: () => number, near?: (u: Division) => [number, number] | undefined) {
  const wk = work(t); computeDist(t, wk);
  const cells: Record<string, number[]> = { '1': [], '-1': [] };
  for (let k = 0; k < t.W * t.H; k++) { if (!t.land[k] || !t.main[k]) continue; const d = wk.distF[k]; if (d >= 1 && d <= Math.max(2, Math.round(25 / t.cellKm))) cells[t.c[k] >= 0 ? '1' : '-1'].push(k); }
  // attackers spread along the front; defenders take up positions opposite them
  const place = (u: Division, k: number) => { const [x, y] = cellLonLat(t, k); u.theater = t.id; u.arrive = 0; u.x = x; u.y = y; };
  const att = units.filter(u => t.sideOf[u.country] > 0), def = units.filter(u => t.sideOf[u.country] < 0);
  const nearest = (list: number[], p: [number, number]) => { // a random cell among the 40 closest to the point
    const scored = list.map(k => { const [x, y] = cellLonLat(t, k); return [k, (x - p[0]) ** 2 * Math.cos(y * Math.PI / 180) ** 2 + (y - p[1]) ** 2] as [number, number]; }).sort((a, b) => a[1] - b[1]);
    return scored[Math.floor(rand() * Math.min(40, scored.length))][0];
  };
  for (const u of att) { const list = cells['1']; if (!list.length) continue; const p = near?.(u); place(u, p ? nearest(list, p) : list[Math.floor(rand() * list.length)]); }
  for (const u of def) {
    const list = cells['-1']; if (!list.length) continue;
    const p = near?.(u); if (p) { place(u, nearest(list, p)); continue; }
    const foe = att.length ? att[Math.floor(rand() * att.length)] : null;
    if (!foe) { place(u, list[Math.floor(rand() * list.length)]); continue; }
    let best = list[0], bd = Infinity; for (const k of list) { const [x, y] = cellLonLat(t, k); const d = (x - foe.x) ** 2 + (y - foe.y) ** 2; if (d < bd) { bd = d; best = k; } }
    place(u, best);
  }
}
