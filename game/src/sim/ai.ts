// Country AI outside battle: budget and production, diplomacy, and when to start a war.
import { atWar, demobilize, queueUnit } from './economy';
import { DIPLO, demandTarget, diploOdds, doDiplo, hasTreaty, power, type DiploAction } from './diplomacy';
import { nextRand } from './rng';
import type { Country, MapStatic, UnitType, World } from './types';
import { msg } from './types';
import { rel } from './world';
import { aiPolicies } from './policies';
import { activeWars, allied, declareWar, defendersOf, enemies, inTruce, overlordOf, sideOf, warCost, warsOf } from './war/war';

/** Land neighbours of every country (from province adjacency). */
export function neighbours(w: World, S: MapStatic): Set<number>[] {
  const nb = w.countries.map(() => new Set<number>());
  for (const p of w.provinces) for (const n of S.provinces[p.id].nbr) { const o = w.provinces[n].owner; if (o !== p.owner) nb[p.owner].add(o); }
  return nb;
}

export function aiMonthly(w: World, S: MapStatic) {
  const pw = w.countries.map(c => c.alive ? power(w, c.id) : 0), nb = neighbours(w, S);
  for (const c of w.countries) {
    if (!c.alive || c.player) continue;
    const threats = [...nb[c.id]].filter(n => enemies(w, c.id, n) || (rel(w, c.id, n) < -40 && pw[n] > pw[c.id] * 1.2));
    aiEconomy(w, c, threats.length > 0);
    aiPolicies(w, c);
    aiDiplomacy(w, S, c, pw, nb, threats);
  }
  aiWars(w, S, pw, nb);
}

// ---- economy ----
function setShare(c: Country, k: keyof Country['budget'], v: number) {
  const others = (Object.keys(c.budget) as (keyof Country['budget'])[]).filter(x => x !== k);
  const rest = others.reduce((a, x) => a + c.budget[x], 0) || 1, left = 1 - v;
  c.budget[k] = v; for (const x of others) c.budget[x] = c.budget[x] / rest * left;
}
function aiEconomy(w: World, c: Country, threatened: boolean) {
  const war = atWar(w, c.id), debt = c.debt / Math.max(1, c.gdp);
  // a nation that is attacked, or losing, mobilises: its economy goes to war (the arsenal that a small peacetime army hides)
  const mobilise = war && activeWars(w).some(x => { const s = sideOf(x, c.id); return s < 0 || (s > 0 && x.score * s < -15); });
  const target = war ? Math.min(0.6, Math.max(c.milBase * 1.6, c.milBase + 0.1, mobilise ? 0.45 : 0)) : threatened ? Math.min(0.5, c.milBase * 1.25) : c.milBase;
  setShare(c, 'military', c.budget.military + (target - c.budget.military) * 0.25);
  if (war && c.treasury < c.income && c.deficit < 0.5) c.deficit += 0.02; // borrow for the war
  else if (!war && debt > 1.4) c.deficit = Math.max(0, c.deficit - 0.02);
  if (debt > 2 && c.taxRate < 0.4) c.taxRate += 0.005;
  // at peace, an army the budget cannot fund is stood down (a few reserve divisions a month)
  if (!war && (c.readiness ?? 1) < 0.85) for (let k = 0; k < 3; k++) if (!(['infantry', 'mechanized', 'armor', 'marines', 'airborne'] as UnitType[]).some(u => demobilize(w, c, u))) break;
  // build up to what the budget sustains: a cushion in peace, everything in war
  const funds = c.spending * c.budget.military, divs = w.divisions.filter(d => d.country === c.id).length + c.production.length;
  const want = Math.floor(funds * (war ? 0.95 : threatened ? 0.85 : 0.72) / c.unitCost);
  // queue as many as the spare funds keep in training at once (a division in training costs its price spread over its days), up to 12
  const training = c.production.reduce((a, i) => a + i.cost / Math.max(1, i.days) * 30, 0), slots = c.production.length < 12 && training < funds - c.upkeep;
  if (divs < want && slots && funds - c.upkeep > c.unitCost * 3) {
    const rich = Math.min(1, c.gdp * 1e6 / Math.max(1, w.provinces.reduce((a, p) => a + (p.owner === c.id ? p.pop : 0), 0)) / 45000);
    const r = nextRand(w), type: UnitType = r < 0.1 + 0.15 * rich ? 'armor' : r < 0.25 + 0.3 * rich ? 'mechanized' : 'infantry';
    queueUnit(w, c, type);
  }
}

// ---- diplomacy ----
function act(w: World, S: MapStatic, from: number, to: number, a: DiploAction) {
  if (!diploOdds(w, from, to, a, S).ok) return false;
  if (w.countries[to].player && a !== 'denounce' && a !== 'improve' && a !== 'guarantee') { offerToPlayer(w, S, from, to, a); return true; }
  doDiplo(w, from, to, a, S); return true;
}
/** Proposals (and ultimatums) to the player arrive as agenda cards. */
function offerToPlayer(w: World, S: MapStatic, from: number, to: number, a: DiploAction) {
  if (w.agenda.some(x => x.kind === 'diplo' && x.data?.from === from)) return;
  w.countries[from].polCap -= DIPLO[a].cost; // spent on making the offer
  w.cooldowns[`${from}:${to}:${a}`] = w.day + DIPLO[a].cooldown;
  const prov = a === 'demand' ? demandTarget(w, S, from, to) : -1;
  w.agenda.push({ id: w.nextId++, country: to, day: w.day, kind: 'diplo', title: msg(a === 'demand' ? 'agenda.demand.title' : 'agenda.diplo.title', { c: { c: from } }), text: msg('agenda.diplo.' + a, { c: { c: from }, p: { p: prov } }),
    data: { from, act: a, prov }, expires: w.day + 30, options: a === 'demand' ? [{ label: msg('opt.yield'), effect: 'diplo.accept' }, { label: msg('opt.refuse'), effect: 'diplo.decline' }] : [{ label: msg('opt.accept'), effect: 'diplo.accept' }, { label: msg('opt.decline'), effect: 'diplo.decline' }] });
}
function aiDiplomacy(w: World, S: MapStatic, c: Country, pw: number[], nb: Set<number>[], threats: number[]) {
  const me = c.id, r = nextRand(w);
  // threatened: look for a strong friend who shares the enemy
  if (threats.length && c.polCap >= DIPLO.alliance.cost) {
    const cands = w.countries.filter(k => k.alive && k.id !== me && !allied(w, me, k.id) && rel(w, k.id, me) > 30 && threats.some(t => rel(w, k.id, t) < -20) && !warsOf(w, k.id).some(x => !sideOf(x, me))).sort((a, b) => pw[b.id] - pw[a.id]);
    for (const k of cands.slice(0, 4)) if (act(w, S, me, k.id, 'alliance')) return;
  }
  // great powers guarantee threatened friends
  const rank = pw.filter(p => p > pw[me]).length;
  if (rank < 12 && r < 0.05 && c.polCap >= DIPLO.guarantee.cost) {
    const k = w.countries.find(k => k.alive && k.id !== me && rel(w, me, k.id) > 50 && !hasTreaty(w, me, k.id, 'guarantee') && !allied(w, me, k.id) && [...nb[k.id]].some(n => rel(w, n, k.id) < -50 && rel(w, me, n) < -20 && pw[n] > pw[k.id] * 1.5));
    if (k && act(w, S, me, k.id, 'guarantee')) return;
  }
  // the ambitious lean on much weaker neighbours, but only with a grievance: land they claim, or (for regimes that answer to no voters) real hostility
  if ((c.personality === 'expansionist' || c.personality === 'opportunist') && r < 0.02 && !atWar(w, me)) {
    const grievance = (n: number) => w.provinces.some(p => p.owner === n && p.core.includes(me)) || (c.gov !== 'democracy' && rel(w, me, n) <= -30);
    const k = [...nb[me]].find(n => w.countries[n].alive && pw[me] >= 3 * pw[n] && grievance(n) && !allied(w, me, n) && !inTruce(w, me, n));
    if (k !== undefined && act(w, S, me, k, 'demand')) return;
  }
  // the ambitious build grievances against a rival neighbour (a justified war later)
  if ((c.personality === 'expansionist' || c.personality === 'ideologue') && r < 0.1) {
    const k = [...nb[me]].find(n => rel(w, me, n) < -20 && rel(w, me, n) > -50 && !allied(w, me, n));
    if (k !== undefined && act(w, S, me, k, 'denounce')) return;
  }
  // otherwise, with spare influence: trade with friends, warm up to neighbours
  if (c.polCap > 140 && r < 0.2) {
    const trades = w.treaties.filter(t => t.type === 'trade' && (t.a === me || t.b === me)).length;
    if (trades < 2) { const k = w.countries.find(k => k.alive && k.id !== me && !k.player && rel(w, k.id, me) > 30 && !hasTreaty(w, me, k.id, 'trade')); if (k && act(w, S, me, k.id, 'trade')) return; }
    const k = [...nb[me]].filter(n => rel(w, n, me) > -30 && rel(w, n, me) < 50).sort((a, b) => pw[b] - pw[a])[0];
    if (k !== undefined && act(w, S, me, k, 'improve')) return;
  }
}

// ---- war ----
const GATE: Partial<Record<Country['personality'], { p: number; ratio: number }>> = { expansionist: { p: 0.04, ratio: 1.5 }, opportunist: { p: 0.02, ratio: 1.9 }, ideologue: { p: 0.015, ratio: 1.7 } };
function aiWars(w: World, S: MapStatic, pw: number[], nb: Set<number>[]) {
  if (w.day < 120 || activeWars(w).filter(x => x.start > 0).length >= 3) return;
  for (const c of w.countries) {
    const g = GATE[c.personality];
    if (!g || !c.alive || c.player || atWar(w, c.id) || c.stability < 0.45 || overlordOf(w, c.id) || nextRand(w) > g.p) continue;
    let best = -1, bestR = 0;
    for (const n of nb[c.id]) {
      const N = w.countries[n];
      if (!N.alive || allied(w, c.id, n) || hasTreaty(w, c.id, n, 'nap') || inTruce(w, c.id, n) || (N.player && w.day < 180)) continue;
      const claim = w.provinces.some(p => p.owner === n && p.core.includes(c.id));
      if (!claim && rel(w, c.id, n) > -50) continue;
      const helpers = defendersOf(w, n).filter(d => !allied(w, c.id, d) && rel(w, d, c.id) < 40);
      const theirs = pw[n] + helpers.reduce((a, d) => a + pw[d] * (nb[d].has(c.id) || nb[d].has(n) ? 1 : 0.5), 0);
      const ratio = pw[c.id] / Math.max(1, theirs);
      if (ratio >= g.ratio && ratio > bestR) { bestR = ratio; best = n; }
    }
    if (best >= 0) { declareWar(w, S, c.id, best); return; } // one new war a month at most
  }
}
