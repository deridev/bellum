// Armies: the player picks one up and moves it (it holds the front there, or waits behind it), or sends it to attack.
// Armies without orders follow their general: every side's generals share out the front between their armies (deployLine).
// Divisions remember their army's order as a goal; the field does the rest (theater.ts, moveUnits).
import { km } from '../../geo';
import type { Army, Division, MapStatic, World } from '../types';
import { cellLonLat, cellOf, provAtLonLat, T, work, type Theater } from './theater';
import { activeWars, placeUnit, planWeight, sideOf, theatersOf, travelDays, tripAt, whereNow, withdraw } from './war';
import { startOffensive } from './ai';
import { makeGeneral } from '../names';
import { launchLanding } from './landing';

export const armyDivs = (w: World, id: number) => w.divisions.filter(d => d.army === id);
export type ArmyState = 'attack' | 'hold' | 'wait' | 'front' | 'home' | 'moving';
/** Where an army is: the war zone holding most of its divisions (their centre), else the province where most of it is stationed. */
export function armyWhere(w: World, S: MapStatic, a: Army) {
  const ds = armyDivs(w, a.id); if (!ds.length) return null;
  const byT = new Map<number, Division[]>(); for (const d of ds) if (d.theater >= 0) { const l = byT.get(d.theater) || []; l.push(d); byT.set(d.theater, l); }
  const home = ds.filter(d => d.theater < 0);
  let best: Division[] = [], tid = -1; for (const [t, l] of byT) if (l.length > best.length) { best = l; tid = t; }
  const str = ds.reduce((s, d) => s + d.str, 0) / ds.reduce((s, d) => s + d.max, 0);
  // an army on its way: where its divisions are on the road, where they are going, and when the last of them gets there
  const transit = (l: Division[]) => {
    const go = l.filter(d => d.trip && d.arrive > w.day); if (!go.length) return null;
    const at = go.map(d => tripAt(d, w.day));
    return { x: at.reduce((s, p) => s + p[0], 0) / at.length, y: at.reduce((s, p) => s + p[1], 0) / at.length, to: [go.reduce((s, d) => s + d.trip![2], 0) / go.length, go.reduce((s, d) => s + d.trip![3], 0) / go.length] as [number, number], eta: Math.max(...go.map(d => d.arrive)) };
  };
  if (best.length && best.length >= home.length) {
    const here = best.filter(d => d.arrive <= w.day), mv = here.length ? null : transit(best), pts = here.length ? here : best;
    const x = mv ? mv.x : pts.reduce((s, d) => s + d.x, 0) / pts.length, y = mv ? mv.y : pts.reduce((s, d) => s + d.y, 0) / pts.length;
    const state: ArmyState = !here.length ? 'moving' : here.some(d => d.op) ? 'attack' : here.some(d => d.goal && !d.goal[2]) ? 'wait' : here.some(d => d.goal?.[2] === 1) ? 'hold' : 'front';
    return { theater: tid, x, y, n: best.length, total: ds.length, str, state, divs: best, to: mv?.to, eta: mv?.eta };
  }
  const cnt = new Map<number, number>(); for (const d of home) cnt.set(d.prov, (cnt.get(d.prov) || 0) + 1);
  const prov = [...cnt.entries()].sort((p, q) => q[1] - p[1])[0][0], mv = transit(home), [x, y] = mv ? [mv.x, mv.y] : S.provinces[prov].label;
  return { theater: -1, x, y, n: home.length, total: ds.length, str, state: (mv ? 'moving' : 'home') as ArmyState, divs: home, prov, to: mv?.to, eta: mv?.eta };
}

/** Spots for `n` divisions to hold, spread along our side of the front nearest a point (about 22 km apart), or null if the point is more than `frontKm` behind the front. */
function frontSpots(t: Theater, side: number, x: number, y: number, n: number, frontKm: number): [number, number][] | null {
  const wk = work(t), k0 = cellOf(t, x, y); if (k0 < 0 || wk.distF[k0] < 0 || wk.distF[k0] * t.cellKm > frontKm) return null;
  const cand: [number, number, number][] = [];
  for (let k = 0; k < t.W * t.H; k++) { if (!t.land[k] || !t.main[k] || wk.distF[k] < 1 || wk.distF[k] > 3 || t.c[k] * side < 0.5) continue; const [cx, cy] = cellLonLat(t, k), d = km(cx, cy, x, y); if (d < 400 + frontKm) cand.push([cx, cy, d]); }
  cand.sort((a, b) => a[2] - b[2]);
  const out: [number, number][] = [];
  for (const [cx, cy] of cand) { if (out.length >= n) break; if (out.every(([ox, oy]) => km(ox, oy, cx, cy) > 22)) out.push([cx, cy]); }
  while (out.length && out.length < n) out.push(out[out.length % Math.max(1, out.length)]);
  return out.length ? out : null;
}
/** Every army of a nation still waiting at home goes to the line of its nearest war zone (by rail when far), for its generals to place. Returns how many divisions went. */
export function deployIdleArmies(w: World, S: MapStatic, c: number): number {
  const ths = activeWars(w).filter(x => sideOf(x, c)).flatMap(x => theatersOf(w, x)).filter(t => t.sideOf[c] && !t.frozen); if (!ths.length) return 0;
  let n = 0; const used = new Set<Theater>();
  for (const a of w.armies.filter(a => a.country === c)) {
    const divs = armyDivs(w, a.id).filter(d => d.theater < 0); if (!divs.length) continue;
    const [hx, hy] = S.provinces[divs[0].prov].label, t = ths.slice().sort((p, q) => km(hx, hy, p.lon0 + p.W * p.cw / 2, p.lat0 - p.H * p.ch / 2) - km(hx, hy, q.lon0 + q.W * q.cw / 2, q.lat0 - q.H * q.ch / 2))[0];
    for (const d of divs) { const [lon, lat] = S.provinces[d.prov].label; placeUnit(w, t, d, lon, lat, w.day + 2); d.goal = [lon, lat, 2]; n++; }
    used.add(t);
  }
  for (const t of used) deployLine(w, t, c, true);
  return n;
}
/** Send divisions to a point in a war zone: near the front they spread out to hold it, further back they wait in reserve.
 *  Those far away go by rail (gone from the map until they arrive); those nearby march. */
export function sendArmy(w: World, S: MapStatic, t: Theater, divs: Division[], x: number, y: number, frontKm = 80, mode = 1) {
  const side = t.sideOf[divs[0].country], spots = frontSpots(t, side, x, y, divs.length, frontKm);
  divs.forEach((d, i) => {
    const [gx, gy] = spots ? spots[i] : [x, y];
    d.op = 0; d.goal = [gx, gy, spots ? mode : 0];
    if (d.theater !== t.id) { const [hx, hy] = d.theater < 0 ? S.provinces[d.prov].label : [d.x, d.y], dk = km(hx, hy, gx, gy); placeUnit(w, t, d, gx, gy, w.day + Math.round(3 + dk / (dk > 2500 ? 300 : 450))); }
    else { const dk = km(d.x, d.y, gx, gy); if (dk > 200) placeUnit(w, t, d, gx, gy, w.day + Math.round(2 + dk / 450)); }
  });
}
/** The player's generals split the front between the armies left to them (no order of the player's): each army takes one stretch of it,
 *  in the order the armies stand along the front, with its divisions spread out, closer together where the enemy presses harder.
 *  Done when a war opens (by rail: `rail`) and again every week (on foot), so the line follows the enemy's weight. */
export function deployLine(w: World, t: Theater, c: number, rail = true) {
  const side = t.sideOf[c], wk = work(t), divs = w.divisions.filter(d => d.country === c && d.theater === t.id && !d.op && (!d.goal || d.goal[2] === 2));
  const own = side > 0 ? wk.P0 : wk.P1, foe = side > 0 ? wk.P1 : wk.P0;
  const cells: [number, number][] = [], weight: number[] = [], near = homeReach(w, t, c);
  for (let k = 0; k < t.W * t.H; k++) if (t.land[k] && t.main[k] && wk.distF[k] >= 2 && wk.distF[k] <= 3 && t.c[k] * side >= 0.5 && (!near || near[k])) { cells.push(cellLonLat(t, k)); weight.push((1 + 3 * foe[k] / (own[k] + foe[k] + T.P0)) * (w.provinces[t.prov[k]]?.owner === c ? 3 : 1)); } // a nation guards its own soil first, then its allies' // a nation guards its own soil first, then its allies'
  if (!divs.length || !cells.length) return;
  cells.forEach((p, i) => { weight[i] *= planWeight(w, t, c, p[0], p[1]); });
  // the front's long axis (principal direction of its cells), to order both the front and the armies along it
  const cl = Math.cos(cells.reduce((s, p) => s + p[1], 0) / cells.length * Math.PI / 180);
  const mx = cells.reduce((s, p) => s + p[0], 0) / cells.length, my = cells.reduce((s, p) => s + p[1], 0) / cells.length;
  let sxx = 0, syy = 0, sxy = 0; for (const [x, y] of cells) { const dx = (x - mx) * cl, dy = y - my; sxx += dx * dx; syy += dy * dy; sxy += dx * dy; }
  const th = 0.5 * Math.atan2(2 * sxy, sxx - syy), along = (x: number, y: number) => (x - mx) * cl * Math.cos(th) + (y - my) * Math.sin(th);
  const order = cells.map((p, i) => i).sort((a, b) => along(...cells[a]) - along(...cells[b]));
  const cum: number[] = []; let tot = 0; for (const i of order) { tot += weight[i]; cum.push(tot); }
  const groups = new Map<number, Division[]>(); for (const d of divs) { const l = groups.get(d.army) || []; l.push(d); groups.set(d.army, l); }
  const mean = (l: Division[]) => l.reduce((s, d) => s + along(d.x, d.y), 0) / l.length;
  const ordered = [...groups.values()].sort((a, b) => mean(a) - mean(b)).flat();
  let j = 0, railed = 0; const railCap = Math.ceil(ordered.length / 6);
  ordered.forEach((d, i) => {
    const q = (i + 0.5) / ordered.length * tot; while (j < cum.length - 1 && cum[j] < q) j++;
    const [gx, gy] = cells[order[j]];
    const dk = km(d.x, d.y, gx, gy);
    // a weekly re-balance moves few divisions far: up to a sixth of them go by rail to where they are needed; the rest keep their stretch
    if (!rail && dk > 250 && d.goal) {
      const ok = cellOf(t, d.goal[0], d.goal[1]);
      if (ok >= 0 && t.c[ok] * side > 0 && railed >= railCap) return;
      railed++; d.goal = [gx, gy, 2]; placeUnit(w, t, d, gx, gy, w.day + Math.round(2 + dk / 450)); return;
    }
    d.goal = [gx, gy, 2];
    if (rail && dk > 200) placeUnit(w, t, d, gx, gy, w.day + Math.round(2 + dk / 450));
  });
}
/** The cells within about 350 km of a nation's own soil in the theater, by land, or null when it has none there
 *  (an expeditionary force goes where its allies need it). Keeps each nation's line on its own fronts. */
function homeReach(w: World, t: Theater, c: number): Uint8Array | null {
  const N = t.W * t.H, dist = new Int16Array(N).fill(-1), q = new Int32Array(N); let h = 0, tl = 0;
  for (let k = 0; k < N; k++) if (t.land[k] && w.provinces[t.prov[k]]?.owner === c) { dist[k] = 0; q[tl++] = k; }
  if (!tl) return null;
  const R = Math.round(350 / t.cellKm);
  while (h < tl) { const k = q[h++], i = k % t.W; if (dist[k] >= R) continue; for (const n of [i > 0 ? k - 1 : -1, i < t.W - 1 ? k + 1 : -1, k - t.W, k + t.W]) if (n >= 0 && n < N && t.land[n] && dist[n] < 0) { dist[n] = dist[k] + 1; q[tl++] = n; } }
  const out = new Uint8Array(N); for (let k = 0; k < N; k++) out[k] = dist[k] >= 0 ? 1 : 0; return out;
}
/** Stop an army's attack without the exhaustion of a finished one (the army has new orders). */
function cancelAttack(w: World, id: number) {
  for (const t of w.theaters) for (const o of t.offensives) if (!o.ended && o.army === id && o.order) { o.ended = w.day; for (const d of w.divisions) if (d.op === o.id) d.op = 0; }
}
/** An order for an army at a point on the map: our ground in a war zone = go there; enemy ground = attack it; one of our provinces elsewhere = station there.
 *  Returns what it did, or why not (a message key). */
export function orderArmy(w: World, S: MapStatic, id: number, lon: number, lat: number): { kind: 'move' | 'attack' | 'station' | 'landing' | null; err: string | null } {
  const a = w.armies.find(x => x.id === id); const divs = a ? armyDivs(w, id) : [];
  if (!a || !divs.length) return { kind: null, err: 'army.empty' };
  const c = a.country;
  for (const war of activeWars(w)) {
    if (!sideOf(war, c)) continue;
    for (const t of theatersOf(w, war)) {
      const k = cellOf(t, lon, lat); if (k < 0 || !t.land[k] || t.frozen) continue;
      const free = divs.filter(d => d.theater === t.id || d.theater < 0);
      // the armies left in the line close up at once around the one that leaves it
      if (t.c[k] * t.sideOf[c] > 0) { cancelAttack(w, id); sendArmy(w, S, t, free, lon, lat); deployLine(w, t, c, false); return { kind: 'move', err: null }; }
      cancelAttack(w, id);
      const err = startOffensive(w, S, t, c, [lon, lat], id); if (!err) { deployLine(w, t, c, false); return { kind: 'attack', err: null }; }
      // no way over land (the sea, a neutral country): across the sea, if that is enemy coast
      if (err === 'off.blocked' || err === 'off.tooFar') { const e2 = launchLanding(w, S, id, lon, lat); if (!e2) { deployLine(w, t, c, false); return { kind: 'landing', err: null }; } }
      return { kind: null, err };
    }
  }
  const p = provAtLonLat(S, lon, lat); if (p < 0) return { kind: null, err: 'army.notOurs' };
  const pr = w.provinces[p];
  if (pr.owner !== c || pr.controller !== c) {
    if (!activeWars(w).some(x => sideOf(x, c) * sideOf(x, pr.controller) === -1)) return { kind: null, err: 'army.notOurs' };
    const e = launchLanding(w, S, id, lon, lat); return e ? { kind: null, err: e === 'land.inland' ? 'army.noFront' : e } : { kind: 'landing', err: null }; // enemy land with no front: land on its coast
  }
  cancelAttack(w, id);
  // it goes there over the roads and railways: on the map until it arrives
  const [tx, ty] = S.provinces[p].label;
  for (const d of divs) {
    const from = whereNow(w, d) ?? S.provinces[d.prov].label;
    if (d.theater >= 0) withdraw(d);
    const days = travelDays(w, d, km(from[0], from[1], tx, ty)); d.prov = p;
    if (km(from[0], from[1], tx, ty) > 5) { d.arrive = w.day + days; d.trip = [from[0], from[1], tx, ty, w.day, d.arrive]; }
  }
  return { kind: 'station', err: null };
}

// ---------------------------------------------------------------------------- what else a player can do with an army
/** Back under its general: the army rejoins the line its generals share out. */
export function releaseArmy(w: World, id: number): string | null {
  const divs = armyDivs(w, id); if (!divs.length) return 'army.empty';
  cancelAttack(w, id);
  const ts = new Set<number>(); for (const d of divs) if (d.theater >= 0) { d.goal = [d.x, d.y, 2]; ts.add(d.theater); }
  if (!ts.size) return 'army.notAtWar';
  for (const tid of ts) { const t = w.theaters.find(x => x.id === tid); if (t) deployLine(w, t, divs[0].country, false); }
  return null;
}
/** Pull back into reserve: out of the line to our ground 100–160 km behind it, where it waits (and rushes to meet an enemy offensive). */
export function reserveArmy(w: World, S: MapStatic, id: number): string | null {
  const a = w.armies.find(x => x.id === id), at = a && armyWhere(w, S, a); if (!a || !at) return 'army.empty';
  const t = w.theaters.find(x => x.id === at.theater); if (!t) return 'army.notAtWar';
  const side = t.sideOf[a.country], wk = work(t); let best: [number, number] | null = null, bd = Infinity;
  for (let k = 0; k < t.W * t.H; k++) { if (!t.land[k] || !t.main[k] || t.c[k] * side < 0.6) continue; const f = wk.distF[k] * t.cellKm; if (f < 100 || f > 160) continue; const [x, y] = cellLonLat(t, k), d = km(x, y, at.x, at.y); if (d < bd) { bd = d; best = [x, y]; } }
  if (!best) return 'army.noRoom';
  cancelAttack(w, id); sendArmy(w, S, t, at.divs, best[0], best[1], 0); deployLine(w, t, a.country, false);
  return null;
}
/** Split an army in two: the second half (along the front, or the later divisions at home) forms a new army under a new general. */
export function splitArmy(w: World, id: number): Army | string {
  const a = w.armies.find(x => x.id === id), divs = armyDivs(w, id); if (!a || divs.length < 2) return 'army.tooSmall';
  const code = w.countries[a.country].code;
  const b: Army = { id: w.nextId++, country: a.country, num: w.armies.filter(x => x.country === a.country).reduce((m, x) => Math.max(m, x.num), 0) + 1, general: makeGeneral(w, code), theater: a.theater, posture: a.posture };
  w.armies.push(b);
  const key = (d: Division) => d.goal ? d.goal[0] + d.goal[1] : d.theater >= 0 ? d.x + d.y : d.id;
  for (const d of [...divs].sort((p, q) => key(p) - key(q)).slice(Math.ceil(divs.length / 2))) d.army = b.id;
  return b;
}
/** Merge one army into another: its divisions join the other army where it stands (by rail or on foot), and its general retires. */
export function mergeArmies(w: World, S: MapStatic, from: number, into: number): string | null {
  const A = w.armies.find(x => x.id === from), B = w.armies.find(x => x.id === into);
  if (!A || !B || A.id === B.id || A.country !== B.country) return 'army.empty';
  const at = armyWhere(w, S, B); if (!at) return 'army.empty';
  cancelAttack(w, from);
  const divs = armyDivs(w, from); for (const d of divs) d.army = into;
  const t = w.theaters.find(x => x.id === at.theater);
  if (t) { const mode = at.divs.find(d => d.goal)?.goal?.[2] ?? 2; sendArmy(w, S, t, divs.filter(d => d.theater === t.id || d.theater < 0), at.x, at.y, mode === 0 ? 0 : 80, mode || 1); deployLine(w, t, B.country, false); }
  else for (const d of divs) { if (d.theater >= 0) withdraw(d); d.prov = at.prov!; }
  w.armies = w.armies.filter(x => x.id !== from);
  return null;
}
/** A new division raised for an army joins it: by rail to where the army stands at the front, or to its station at home. */
export function joinArmy(w: World, S: MapStatic, d: Division) {
  const a = w.armies.find(x => x.id === d.army); if (!a) return;
  const others = armyDivs(w, a.id).filter(x => x !== d); if (!others.length) return;
  const at = armyWhere(w, S, a); if (!at) return;
  const t = w.theaters.find(x => x.id === at.theater);
  if (t) { const mode = others.find(x => x.theater === t.id && x.goal)?.goal?.[2] ?? 2; sendArmy(w, S, t, [d], at.x, at.y, mode === 0 ? 0 : 80, mode || 1); }
  else if (at.prov !== undefined) d.prov = at.prov;
}
