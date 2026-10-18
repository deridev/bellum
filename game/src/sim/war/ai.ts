// War AI: reinforcements, aggression, offensives (same tools as the player) and peace.
import { km } from '../../geo';
import { nextRand } from '../rng';
import type { MapStatic, War, World } from '../types';
import { msg } from '../types';
import { say } from '../world';
import { acceptsPeace, activeWars, heldDemand, makePeace, sendToTheater, sideOf, theatersOf, type PeaceTerms } from './war';
import { cellLonLat, cellOf, T, unitPower, work, type Offensive, type Theater } from './theater';

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
    // offensives
    for (const t of ths) {
      for (const o of t.offensives) if (!o.ended && (o.org < 0.08 || w.day - o.created > 45 || reached(t, o))) o.ended = w.day;
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
  const want = Math.ceil(mine.length * share) - inWar; if (want <= 0) return;
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
/** Share of a country's army that goes to a war: the player's choice, else more for a fight for survival, less for a far-off war. */
export function commitShare(w: World, war: War, c: number) {
  if (war.commit?.[c] !== undefined) return war.commit[c];
  return war.score * sideOf(war, c) < -30 ? 0.92 : sideOf(war, c) > 0 ? 0.6 : 0.85;
}

/** Shift a few divisions from the quietest sectors to the most threatened one (by rail: they vanish and arrive later). */
function redeploy(w: World, S: MapStatic, t: Theater, c: number) {
  const side = t.sideOf[c], wk = work(t), own = side > 0 ? wk.P0 : wk.P1, foe = side > 0 ? wk.P1 : wk.P0;
  const busy = new Set(t.offensives.filter(o => !o.ended && o.country === c).map(o => o.army));
  const mine = w.divisions.filter(d => d.country === c && d.theater === t.id && d.arrive <= w.day && !busy.has(d.army));
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
  // pick an army that has units here and no current offensive
  const armies = new Map<number, number>(); for (const d of mine) armies.set(d.army, (armies.get(d.army) || 0) + 1);
  const busy = new Set(t.offensives.filter(o => !o.ended && o.country === c).map(o => o.army));
  const army = [...armies.entries()].filter(([a]) => !busy.has(a)).sort((a, b) => b[1] - a[1])[0]?.[0];
  if (army === undefined) return;
  const wk = work(t);
  // targets: enemy-held cities near the front (capitals weigh double), else the weakest stretch of front
  let target: [number, number] | null = null, bestScore = -Infinity;
  for (const city of localOnly ? [] : t.cities) {
    if (t.c[city.k] * side > 0) continue; const d = wk.distF[city.k]; if (d < 0) continue;
    const dKm = d * t.cellKm; if (dKm > 450) continue;
    const s = (city.tier === 1 ? 2 : 1) * 300 / (60 + dKm) + nextRand(w) * 0.5;
    if (s > bestScore) { bestScore = s; target = cellLonLat(t, city.k); }
  }
  let fromK = -1;
  if (!target) {
    // weakest enemy front cell
    let bestW = Infinity;
    for (let k = 0; k < t.W * t.H; k += 3) { if (!t.land[k] || wk.distF[k] !== 0 || t.c[k] * side > 0) continue; const e = side > 0 ? wk.P1[k] : wk.P0[k], m = side > 0 ? wk.P0[k] : wk.P1[k]; const v = e / (m + 1) + nextRand(w) * 0.3; if (v < bestW) { bestW = v; fromK = k; } }
    if (fromK < 0 || (localOnly && bestW > 0.55)) return;
    const [fx, fy] = cellLonLat(t, fromK);
    // push 150 km into enemy ground, away from our side
    const gx = cAtSafe(t, fx + t.cw, fy) - cAtSafe(t, fx - t.cw, fy), gy = cAtSafe(t, fx, fy + t.ch) - cAtSafe(t, fx, fy - t.ch);
    const l = Math.hypot(gx, gy) || 1, dirx = -gx / l * side, diry = -gy / l * side;
    target = [fx + dirx * 1.35 / Math.cos(fy * Math.PI / 180), fy + diry * 1.35];
  }
  startOffensive(w, t, c, target, army);
}
/** Launch an offensive toward a target: it starts from our side of the front nearest the target. Returns why not (a message key), if it can't. */
export function startOffensive(w: World, t: Theater, c: number, target: [number, number], army?: number): string | null {
  const side = t.sideOf[c]; if (!side) return 'off.notInWar';
  const wk = work(t), mine = w.divisions.filter(d => d.country === c && d.theater === t.id && d.arrive <= w.day);
  const busy = new Set(t.offensives.filter(o => !o.ended && o.country === c).map(o => o.army));
  if (army === undefined) { const n = new Map<number, number>(); for (const d of mine) if (!busy.has(d.army)) n.set(d.army, (n.get(d.army) || 0) + 1); army = [...n.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]; }
  if (army === undefined) return mine.length ? 'off.allBusy' : 'off.noUnits';
  const tk = cellOf(t, target[0], target[1]); if (tk >= 0 && t.c[tk] * side > 0) return 'off.ownGround';
  let from: [number, number] | null = null, bd = Infinity;
  for (let k = 0; k < t.W * t.H; k += 2) { if (!t.land[k] || wk.distF[k] < 2 || wk.distF[k] > 4 || t.c[k] * side < 0.5) continue; const [x, y] = cellLonLat(t, k); const d = km(x, y, target[0], target[1]); if (d < bd) { bd = d; from = [x, y]; } }
  if (!from || bd > 600) return 'off.tooFar';
  t.offensives.push({ id: w.nextId++, side: side as 1 | -1, country: c, army, from, to: target, created: w.day, org: 1, ended: 0 });
  return null;
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
