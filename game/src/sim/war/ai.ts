// War AI: reinforcements, aggression, offensives (same tools as the player) and peace.
import { km } from '../../geo';
import { nextRand } from '../rng';
import type { Division, MapStatic, War, World } from '../types';
import { msg } from '../types';
import { say } from '../world';
import { acceptsPeace, activeWars, heldDemand, makePeace, placeUnit, sendToTheater, sideOf, theatersOf, type PeaceTerms } from './war';
import { cellLonLat, cellOf, offensiveTip, T, unitPower, work, type Offensive, type Theater } from './theater';
import { deployLine, sendArmy } from './armies';

/** Military strength of each side in a theater (arrived units only). */
export function theaterStrength(w: World, t: Theater): [number, number] {
  const wk = work(t); const s: [number, number] = [0, 0];
  for (const d of w.divisions) { if (d.theater !== t.id || d.arrive > w.day) continue; const side = t.sideOf[d.country]; if (!side) continue; s[side > 0 ? 0 : 1] += unitPower(w, t, d, cellOf(t, d.x, d.y), wk); }
  return s;
}
const isAI = (w: World, c: number) => !w.countries[c].player;

const aggrFor = (ratio: number) => ratio > 1.35 ? 1.22 : ratio > 1.0 ? 1.08 : ratio > 0.75 ? 0.98 : 0.9;
/** Push strength on a front: the player's posture applies everywhere; AI sides use each front's own balance. */
export function frontAggr(w: World, war: War, t: Theater): [number, number] {
  const ai = (c: number) => !w.countries[c].player;
  return [ai(war.leadA) && t.aggr ? t.aggr[0] : war.aggr[0], ai(war.leadD) && t.aggr ? t.aggr[1] : war.aggr[1]];
}
export function warAI(w: World, S: MapStatic) {
  for (const war of activeWars(w)) {
    const ths = theatersOf(w, war).filter(t => !t.frozen); if (!ths.length) continue;
    // aggression per side from relative strength (the player's side keeps the player's setting)
    if (w.day % 3 === 0) {
      let a = 0, b = 0; for (const t of ths) { const s = theaterStrength(w, t); a += s[0]; b += s[1]; }
      for (const side of [1, -1] as const) {
        const lead = side > 0 ? war.leadA : war.leadD; if (!isAI(w, lead)) continue;
        const ratio = side > 0 ? a / Math.max(1, b) : b / Math.max(1, a);
        war.aggr[side > 0 ? 0 : 1] = aggrFor(ratio);
      }
      // each front pushes by its own balance: strong where the army is concentrated, careful where it is thin
      for (const t of ths) { const s = theaterStrength(w, t); t.aggr = [aggrFor(s[0] / Math.max(1, s[1])), aggrFor(s[1] / Math.max(1, s[0]))]; }
    }
    // logistics run for everyone, players included: reinforcements up to the committed share, rail moves to threatened sectors
    if (w.day % 4 === 0) for (const c of [...war.attackers, ...war.defenders]) reinforce(w, S, war, c, ths);
    if (w.day % 3 === 1) for (const t of ths) for (const c of Object.keys(t.sideOf).map(Number)) redeploy(w, S, t, c);
    if (w.day % 7 === 2) for (const t of ths) for (const c of Object.keys(t.sideOf).map(Number)) deployLine(w, t, c, false); // every general re-balances its line, the player's and the AI's alike
    for (const t of ths) for (const o of t.offensives) if (!o.ended && !o.met) parry(w, S, t, o);
    // offensives
    for (const t of ths) {
      for (const o of t.offensives) if (!o.ended && (o.org < 0.08 || w.day - o.created > 45 || reached(t, o))) endOffensive(w, o, t);
      t.offensives = t.offensives.filter(o => !o.ended || w.day - o.ended < 30);
      if (w.day % 6 !== (t.id % 6)) continue;
      for (const c of Object.keys(t.sideOf).map(Number)) if (isAI(w, c)) planOffensive(w, S, war, t, c);
    }
    if (w.day % 7 === 3) peaceAI(w, S, war);
  }
}

function reinforce(w: World, S: MapStatic, war: War, c: number, ths: Theater[]) {
  const mine = w.divisions.filter(d => d.country === c);
  const inWar = mine.filter(d => ths.some(t => t.id === d.theater)).length;
  const share = commitShare(w, war, c);
  const want = Math.ceil(mine.length * share * T.line) - inWar; if (want <= 0) return; // the rest of the commitment is the war's reserve
  if (w.countries[c].player) { sendHomeArmy(w, S, ths, c); return; }
  const reserves = mine.filter(d => d.theater < 0);
  const batch = Math.min(want, Math.max(2, Math.ceil(mine.length / 20)), reserves.length);
  for (let i = 0; i < batch; i++) {
    const d = reserves[i];
    // pick the theater where our side is weakest
    let best: Theater | null = null, bestR = Infinity;
    for (const t of ths) { const s = theaterStrength(w, t), side = t.sideOf[c]; if (!side) continue; const r = side > 0 ? s[0] / Math.max(1, s[1]) : s[1] / Math.max(1, s[0]); if (r < bestR) { bestR = r; best = t; } }
    if (best) sendToTheater(w, S, d, best);
  }
}
/** The player's generals move whole armies: the largest army still at home goes to where our side is weakest. */
function sendHomeArmy(w: World, S: MapStatic, ths: Theater[], c: number) {
  const home = new Map<number, Division[]>(); for (const d of w.divisions) if (d.country === c && d.theater < 0) { const l = home.get(d.army) || []; l.push(d); home.set(d.army, l); }
  const divs = [...home.values()].sort((a, b) => b.length - a.length)[0]; if (!divs) return;
  let best: Theater | null = null, bestR = Infinity;
  for (const t of ths) { const s = theaterStrength(w, t), side = t.sideOf[c]; if (!side) continue; const r = side > 0 ? s[0] / Math.max(1, s[1]) : s[1] / Math.max(1, s[0]); if (r < bestR) { bestR = r; best = t; } }
  if (!best || !sendToTheater(w, S, divs[0], best)) return;
  sendArmy(w, S, best, divs, divs[0].x, divs[0].y, 80, 2);
}
/** Reserves answer an enemy offensive: each country on the other side sends free reserves (6 for every 10 attackers) to meet it, by rail. */
function parry(w: World, S: MapStatic, t: Theater, o: Offensive) {
  o.met = 1;
  const attackers = w.divisions.filter(d => d.op === o.id).length, wk = work(t);
  for (const c of Object.keys(t.sideOf).map(Number)) {
    if (t.sideOf[c] !== -o.side) continue;
    deployLine(w, t, c, false); // its generals close up toward the blow at once
    const war = w.wars.find(x => x.id === t.war)!, need = Math.ceil(attackers * 0.6);
    // the player's armies go whole: those at home and those waiting in reserve behind this front, nearest first
    const res = w.countries[c].player ? playerReserves(w, t, c, o.from, need) : warReserve(w, war, c).slice(0, need); if (!res.length) continue;
    // our ground just behind the front, nearest where the blow will land
    const [ax, ay] = o.from; let best = -1, bd = Infinity;
    for (let k = 0; k < t.W * t.H; k += 2) { if (!t.land[k] || wk.distF[k] < 2 || wk.distF[k] > 4 || t.c[k] * o.side > -0.6) continue; const [x, y] = cellLonLat(t, k), d = km(x, y, ax, ay); if (d < bd) { bd = d; best = k; } }
    if (best < 0) continue;
    const [x, y] = cellLonLat(t, best);
    if (w.countries[c].player) sendArmy(w, S, t, res, x, y, 80, 2);
    else for (const d of res) { const [hx, hy] = S.provinces[d.prov].label, dk = km(hx, hy, x, y); placeUnit(w, t, d, x, y, w.day + Math.round(3 + dk / (dk > 2500 ? 300 : 450))); }
    if (w.countries[c].player) say(w, msg('log.parry', { n: res.length, c: { c: o.country } }), 'war', { who: [c], at: [x, y] });
  }
}
/** The player's armies free to answer an offensive near `at`: waiting in reserve at this front, or at home; whole armies, nearest first, until `need` divisions. */
function playerReserves(w: World, t: Theater, c: number, at: [number, number], need: number): Division[] {
  const groups = new Map<number, Division[]>();
  for (const d of w.divisions) if (d.country === c && !d.op && (d.theater < 0 || (d.theater === t.id && d.arrive <= w.day && d.goal && !d.goal[2]))) { const l = groups.get(d.army) || []; l.push(d); groups.set(d.army, l); }
  const dist = (l: Division[]) => { const d = l[0]; return d.theater < 0 ? 1e4 : km(d.x, d.y, at[0], at[1]); };
  const out: Division[] = [];
  for (const l of [...groups.values()].sort((a, b) => dist(a) - dist(b))) { if (out.length >= need) break; out.push(...l); }
  return out;
}
/** The war's reserve: divisions committed to this war but still waiting at home (a fifth of the commitment, less what is already spent). */
export function warReserve(w: World, war: War, c: number): Division[] {
  const mine = w.divisions.filter(d => d.country === c), ths = theatersOf(w, war);
  const left = Math.ceil(mine.length * commitShare(w, war, c)) - mine.filter(d => ths.some(t => t.id === d.theater)).length;
  return left > 0 ? mine.filter(d => d.theater < 0).slice(0, left) : [];
}
/** Share of a country's army that goes to a war: the player's choice (or the scenario's), else most of it, and nearly all in a fight for survival. */
export function commitShare(w: World, war: War, c: number) {
  if (war.commit?.[c] !== undefined) return war.commit[c];
  return war.score * sideOf(war, c) < -30 ? 0.92 : sideOf(war, c) > 0 ? 0.8 : 0.85;
}

/** Shift a few divisions from the quietest sectors to the most threatened one (by rail: they vanish and arrive later). */
function redeploy(w: World, S: MapStatic, t: Theater, c: number) {
  const side = t.sideOf[c], wk = work(t), own = side > 0 ? wk.P0 : wk.P1, foe = side > 0 ? wk.P1 : wk.P0;
  const mine = w.divisions.filter(d => d.country === c && d.theater === t.id && d.arrive <= w.day && !d.op && !d.goal);
  const quiet = mine.map(d => { const k = cellOf(t, d.x, d.y); return { d, q: k < 0 ? 1 : foe[k] / (own[k] + foe[k] + T.P0) }; }).sort((a, b) => a.q - b.q);
  const n = Math.max(1, Math.ceil(mine.length / 30));
  for (const { d } of quiet.slice(0, n)) sendToTheater(w, S, d, t, [d.x, d.y], 0.35);
}

function reached(t: Theater, o: Offensive) { const k = cellOf(t, o.to[0], o.to[1]); return k >= 0 && t.c[k] * o.side > 0.3; }

function planOffensive(w: World, S: MapStatic, war: War, t: Theater, c: number) {
  const side = t.sideOf[c]; const myAggr = frontAggr(w, war, t)[side > 0 ? 0 : 1];
  // on a front where we are not stronger overall, attack only where we clearly outnumber them locally
  const localOnly = myAggr < 1.04;
  const mine = w.divisions.filter(d => d.country === c && d.theater === t.id && d.arrive <= w.day);
  if (mine.length < 3) return;
  const active = t.offensives.filter(o => !o.ended && o.country === c).length;
  if (active >= Math.min(3, 1 + Math.floor(mine.length / 25))) return;
  // strike where value and odds are best; on a front where we are not stronger overall, only where the odds are clearly ours
  const b = bestStrike(w, war, t, c);
  if (b && b.odds > (localOnly ? 1.8 : 1.4)) startOffensive(w, S, t, c, b.target);
}
/** Short distances (km) on a flat local projection: plenty for comparing places within one war zone, and cheap. */
const fkm = (x1: number, y1: number, x2: number, y2: number) => { const c = Math.cos((y1 + y2) * Math.PI / 360), dx = (x2 - x1) * c, dy = y2 - y1; return 111.2 * Math.sqrt(dx * dx + dy * dy); };
/** What every strike on one front shares (jump-off cells, the enemy's front line, both sides' divisions and their strength), computed once a day per country. */
interface Scan { key: string; starts: [number, number][]; front: [number, number, number][]; free: { d: Division; p: number }[]; foes: { x: number; y: number; p: number }[]; here: number; reserves: Division[] }
const SCANS = new WeakMap<Theater, Map<number, Scan>>();
function scan(w: World, t: Theater, c: number): Scan {
  const side = t.sideOf[c], wk = work(t), war = w.wars.find(x => x.id === t.war)!;
  const here = w.divisions.filter(d => d.country === c && d.theater === t.id && d.arrive <= w.day), reserves = warReserve(w, war, c);
  const key = `${w.day}|${t.offensives.length}|${here.length}|${reserves.length}|${t.W * t.H}`;
  let m = SCANS.get(t); if (!m) SCANS.set(t, m = new Map()); const old = m.get(c); if (old && old.key === key) return old;
  const starts: [number, number][] = [], front: [number, number, number][] = [];
  for (let k = 0; k < t.W * t.H; k++) {
    if (!t.land[k]) continue; const d = wk.distF[k];
    if (d === 0 && t.c[k] * side <= 0) { const [x, y] = cellLonLat(t, k); front.push([k, x, y]); }
    else if ((k & 1) === 0 && d >= 2 && d <= 4 && t.c[k] * side >= 0.5) starts.push(cellLonLat(t, k));
  }
  const free = here.filter(d => !d.op).map(d => ({ d, p: unitPower(w, t, d, cellOf(t, d.x, d.y), wk) }));
  const foes: Scan['foes'] = []; for (const d of w.divisions) if (d.theater === t.id && d.arrive <= w.day && t.sideOf[d.country] === -side) foes.push({ x: d.x, y: d.y, p: unitPower(w, t, d, cellOf(t, d.x, d.y), wk) });
  const s: Scan = { key, starts, front, free, foes, here: here.length, reserves }; m.set(c, s); return s;
}
/** The divisions an offensive toward `target` would use. Reserves at home come first (by rail, so they add to the front rather than thin it);
 *  then up to a quarter of the free divisions at this front, from the sector around the jump-off point (150 km). 3 to 12 in all.
 *  `from` is our ground just behind the front, nearest the target. `err` is a message key when it can't be done. */
export function strikeForce(w: World, t: Theater, c: number, target: [number, number], army?: number): { from: [number, number] | null; to?: [number, number]; units: Division[]; reserves: number; err: string | null } {
  const none = (err: string) => ({ from: null, units: [], reserves: 0, err });
  const side = t.sideOf[c]; if (!side) return none('off.notInWar');
  const tk = cellOf(t, target[0], target[1]);
  if (tk < 0 || !t.land[tk]) return none('off.notEnemy'); if (t.c[tk] * side > 0) return none('off.ownGround');
  const sc = scan(w, t, c);
  // jump off from our ground just behind the front, nearest the target, with a clear way over land (not across the sea or a neutral country)
  const starts = sc.starts.map(([x, y]) => [x, y, fkm(x, y, target[0], target[1])] as [number, number, number]).sort((a, b) => a[2] - b[2]);
  const st = starts.slice(0, 40).find(([x, y]) => overLand(t, [x, y], target));
  if (!st) return none(starts.length && starts[0][2] <= 600 ? 'off.blocked' : 'off.tooFar');
  const from: [number, number] = [st[0], st[1]], bd = st[2];
  if (bd > 600) return none('off.tooFar');
  // an offensive reaches 150 km at most: a deeper objective is taken in steps, with a pause between them
  const reach = Math.min(1, T.offReach / bd), to: [number, number] = [from[0] + (target[0] - from[0]) * reach, from[1] + (target[1] - from[1]) * reach];
  if (army !== undefined) { // a named army attacks with all of it: what is at this front, and what is still at home (by rail)
    const units = w.divisions.filter(d => d.army === army && (d.theater === t.id || d.theater < 0)); // those still on the way come too
    return units.length ? { from, to, units, reserves: units.filter(d => d.theater < 0).length, err: null } : none('army.empty');
  }
  const reserves = sc.reserves.slice(0, 12);
  const local = Math.max(3 - reserves.length, Math.min(12 - reserves.length, Math.round(sc.free.length * 0.25)));
  const near = sc.free.map(x => ({ d: x.d, k: fkm(x.d.x, x.d.y, from[0], from[1]) })).filter(x => x.k < 150).sort((a, b) => a.k - b.k).slice(0, local).map(x => x.d);
  if (reserves.length + near.length < 3) return none(sc.here >= 3 ? 'off.allBusy' : 'off.noUnits');
  return { from, to, units: [...reserves, ...near], reserves: reserves.length, err: null };
}
/** How a strike toward `target` would go: our strike force against the enemy divisions within 120 km of where it hits,
 *  multiplied by their defence there (terrain, cities, trenches, less what the barrage cancels). odds > 1 favours us. */
export function strikeOdds(w: World, war: War, t: Theater, c: number, target: [number, number], army?: number) {
  const f = strikeForce(w, t, c, target, army); if (f.err || !f.from) return { ...f, odds: 0, ours: 0, theirs: 0, foes: 0, def: 1, at: null as [number, number] | null };
  const side = t.sideOf[c], wk = work(t), sc = scan(w, t, c), [fx, fy] = f.from;
  let hit = -1, hd = Infinity, at: [number, number] = [0, 0]; // the enemy's front cell nearest the jump-off point, leaning toward the target
  for (const [k, x, y] of sc.front) { const d = fkm(x, y, fx, fy) + 0.3 * fkm(x, y, target[0], target[1]); if (d < hd) { hd = d; hit = k; at = [x, y]; } }
  if (hit < 0) return { ...f, odds: 0, ours: 0, theirs: 0, foes: 0, def: 1, at: null };
  const aggr = frontAggr(w, war, t)[side > 0 ? 0 : 1], power = new Map(sc.free.map(x => [x.d, x.p]));
  let ours = 0, theirs = 0, foes = 0;
  for (const d of f.units) ours += power.get(d) ?? unitPower(w, t, d, -1, wk);
  for (const e of sc.foes) if (fkm(e.x, e.y, at[0], at[1]) < 120) { theirs += e.p; foes++; }
  const def = T.baseDef + 0.8 * t.mtn[hit] + t.ent[hit] * (1 - T.shock);
  return { ...f, odds: ours * aggr * (1 + T.offBoost) / Math.max(1, theirs * def), ours, theirs, foes, def, at };
}
/** The best place to strike on a front: points spread along the enemy's line (aimed 150 km deep) and enemy cities within 450 km, by odds. */
export function bestStrike(w: World, war: War, t: Theater, c: number) {
  const side = t.sideOf[c], wk = work(t), cands: [number, number, number][] = []; // lon, lat, worth
  const front: number[] = []; for (let k = 0; k < t.W * t.H; k++) if (t.land[k] && t.main[k] && wk.distF[k] === 0 && t.c[k] * side < 0) front.push(k);
  const stride = Math.max(1, Math.floor(front.length / 20));
  for (let i = Math.floor(stride / 2); i < front.length; i += stride) {
    const [fx, fy] = cellLonLat(t, front[i]);
    const gx = cAtSafe(t, fx + t.cw, fy) - cAtSafe(t, fx - t.cw, fy), gy = cAtSafe(t, fx, fy + t.ch) - cAtSafe(t, fx, fy - t.ch);
    const l = Math.hypot(gx, gy) || 1; cands.push([fx - gx / l * side * 1.35 / Math.cos(fy * Math.PI / 180), fy - gy / l * side * 1.35, 1]);
  }
  for (const city of t.cities) if (t.c[city.k] * side < 0 && wk.distF[city.k] >= 0 && wk.distF[city.k] * t.cellKm < 450) cands.push([...cellLonLat(t, city.k), city.tier === 1 ? 2.5 : 1.8]);
  // odds past 2.5 add little; a city is worth more than open country
  let best: (ReturnType<typeof strikeOdds> & { target: [number, number]; score: number }) | null = null;
  for (const [x, y, worth] of cands) { const r = strikeOdds(w, war, t, c, [x, y]), score = Math.min(2.5, r.odds) * worth; if (!r.err && (!best || score > best.score)) best = { ...r, target: [x, y], score }; }
  return best;
}
/** Launch an offensive toward a target. The strike force gathers at the jump-off point: nearby divisions march, distant ones come by rail
 *  (they leave their sector today and arrive days later, so the line they leave is thinner). Returns why not (a message key), if it can't. */
export function startOffensive(w: World, S: MapStatic, t: Theater, c: number, target: [number, number], army?: number): string | null {
  const { from, to, units, err } = strikeForce(w, t, c, target, army); if (err || !from || !to) return err;
  const o: Offensive = { id: w.nextId++, side: t.sideOf[c], country: c, army: army ?? units[0].army, order: army !== undefined ? 1 : 0, from, to, created: w.day, org: 1, ended: 0 };
  for (const d of units) {
    d.op = o.id;
    if (d.theater !== t.id) { const [hx, hy] = S.provinces[d.prov].label, dk = km(hx, hy, from[0], from[1]); placeUnit(w, t, d, from[0], from[1], w.day + Math.round(3 + dk / (dk > 2500 ? 300 : 450))); }
    else { const dk = km(d.x, d.y, from[0], from[1]); if (dk > 200) placeUnit(w, t, d, from[0], from[1], w.day + Math.round(2 + dk / 450)); }
  }
  t.offensives.push(o);
  return null;
}
/** An offensive ends when it reaches its goal or runs out of momentum. Its divisions stay to hold what they took, worn out for a few weeks.
 *  Reserves spent on it do not come back: the reserve refills only with new divisions. */
export function endOffensive(w: World, o: Offensive, t?: Theater) {
  o.ended = w.day; const player = w.countries[o.country].player;
  for (const d of w.divisions) if (d.op === o.id) { d.op = 0; d.org *= 0.55; d.goal = [d.x, d.y, 2]; } // its divisions rejoin their general's line where they stopped
  if (t) deployLine(w, t, o.country, false);
  if (player && o.order && t) {
    const a = w.armies.find(x => x.id === o.army), tip = offensiveTip(t, o), depth = Math.round(km(o.from[0], o.from[1], tip[0], tip[1]));
    if (a) say(w, msg(reached(t, o) ? 'log.opDone' : 'log.opStalled', { a: { u: ['army', a.num] }, n: depth }), 'war', { who: [o.country], at: tip });
  }
}
/** true if the straight way from a to b stays on the war's land (sea and neutral countries block an offensive) */
function overLand(t: Theater, a: [number, number], b: [number, number]) {
  const n = Math.ceil(fkm(a[0], a[1], b[0], b[1]) / (t.cellKm * 0.7));
  for (let i = 1; i <= n; i++) { const k = cellOf(t, a[0] + (b[0] - a[0]) * i / n, a[1] + (b[1] - a[1]) * i / n); if (k < 0 || !t.land[k]) return false; }
  return true;
}
const cAtSafe = (t: Theater, x: number, y: number) => { const k = cellOf(t, x, y); return k >= 0 ? t.c[k] : 0; };

function peaceAI(w: World, S: MapStatic, war: War) {
  for (const side of [1, -1] as const) {
    const lead = side > 0 ? war.leadA : war.leadD, other = side > 0 ? war.leadD : war.leadA;
    if (!isAI(w, lead)) continue;
    const score = war.score * side, ex = war.exhaustion[side > 0 ? 0 : 1];
    let terms: PeaceTerms | null = null;
    if (score > 35 && (w.day - war.start > 120 || score > 70)) {
      const pick = heldDemand(w, war, side, score);
      if (pick.length) terms = { type: 'treaty', provinces: pick };
    } else if (score < -45 && ex > 0.3) terms = { type: 'white', provinces: [] };
    else {
      const static_ = w.day - ((war as any).lastChange ?? war.start) > 180, both = war.exhaustion[0] > 0.35 && war.exhaustion[1] > 0.35;
      if ((both || (static_ && Math.abs(score) < 20 && w.day - war.start > 540)) && nextRand(w) < 0.3) terms = { type: 'ceasefire', provinces: [] };
    }
    if (!terms) continue;
    if (isAI(w, other)) {
      const res = acceptsPeace(w, war, side, terms);
      if (res.ok) { makePeace(w, S, war, side, terms); return; }
    } else if (!w.agenda.some(a => a.kind === 'peace' && a.data?.war === war.id)) {
      const desc = terms.type === 'treaty' ? msg('agenda.peace.treaty', { n: terms.provinces.length }) : msg(terms.type === 'ceasefire' ? 'agenda.peace.ceasefire' : 'agenda.peace.white');
      w.agenda.push({ id: w.nextId++, country: other, day: w.day, kind: 'peace', title: msg('agenda.peace.title', { c: { c: lead } }), text: desc, data: { war: war.id, side, terms }, expires: w.day + 30,
        options: [{ label: msg('opt.accept'), effect: 'peace.accept' }, { label: msg('opt.fightOn'), effect: 'peace.reject' }] });
      say(w, msg('log.peaceOffer', { c: { c: lead } }), 'diplo', { who: [other, lead] });
    }
  }
}
