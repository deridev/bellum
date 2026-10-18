// War lab: does what the player does in a war change how it ends?
// `npm run warlab -- <attacker> <defender> [days] [seeds] [scenario]` plays the same war under several player strategies and prints the outcome of each.
// The player is the attacker (DEF=1: the defender; scores stay from the attacker's view). Peace offers are refused, so the war runs its course (or until a capitulation).
// Strategies (STRATS=a,b picks some): ai (the AI plays), idle, hold, push (All-out), reckless (All-out, total commitment, offensives at cities),
// smart (strike where the odds are best, one at a time), smart3 (up to three at once), sharp (only at 1.5 : 1 or better), pro (All-out plus sharp strikes), allin (Total commitment plus sharp strikes), commander (sends whole armies to attack, like a player using army orders), careful (the same, only at cities or 2 : 1, resting troops between attacks), digin (Hold, plus smart strikes).
// BUILD=n months of building infantry before the war. Prints the war score after `days`, enemy provinces held, and casualties, one column per seed.
import { createWorld } from '../src/sim/world';
import { stepDay } from '../src/sim/step';
import { initSim } from '../src/sim';
import { setupScenario, tablesFor } from '../src/sim/scenario';
import { fromFile, withScenario } from '../src/game/scenarios';
import { loadStatic } from './helpers';
import { declareWar, sideOf, theatersOf } from '../src/sim/war/war';
import { startOffensive, bestStrike, strikeOdds } from '../src/sim/war/ai';
import { orderArmy, armyWhere } from '../src/sim/war/armies';
import { resolveAgenda } from '../src/sim/agenda';
import { queueUnit } from '../src/sim/economy';
import type { MapStatic, War, World } from '../src/sim/types';
import { cellLonLat } from '../src/sim/war/theater';
import fs from 'node:fs';

const [A = 'IND', B = 'PAK', days = '240', seeds = '4', scen = '2026'] = process.argv.slice(2).filter(a => a !== '--');
initSim();
const base = loadStatic();
let S: MapStatic = base, sd: number | undefined;
if (scen !== '2026') { const f = JSON.parse(fs.readFileSync(`public/data/scenario-${scen}.json`, 'utf8')); const sc = fromFile(base.provinces, base.countries, f, scen as '1914', Date.parse(f.start + 'T00:00:00Z')); S = withScenario(base, sc); sd = sc.startDate; }
const ai = S.countries.findIndex(c => c.code === A), bi = S.countries.findIndex(c => c.code === B);
const DEF = !!process.env.DEF, pi = DEF ? bi : ai; // DEF=1: the player defends

type Strat = (w: World, war: War, me: number) => void;
const POSTURE = { hold: 0.9, advance: 1.08, offensive: 1.22 };
/** aim at the nearest enemy city on each front, like a player clicking the map */
const aim = (w: World, war: War, me: number) => {
  for (const t of theatersOf(w, war)) {
    const side = t.sideOf[me]; if (!side) continue;
    if (t.offensives.filter(o => !o.ended && o.country === me).length >= 3) continue;
    const city = t.cities.filter(c => t.c[c.k] * side < 0).sort((a, b) => a.tier - b.tier)[0];
    if (city) startOffensive(w, S, t, me, cellLonLat(t, city.k));
  }
};
/** strike where value and odds are best, up to `max` offensives per front at a time (a careful player) */
const strike = (w: World, war: War, me: number, max = 1, odds = 1.2) => {
  for (const t of theatersOf(w, war)) {
    if (!t.sideOf[me] || t.offensives.filter(o => !o.ended && o.country === me).length >= max) continue;
    const b = bestStrike(w, war, t, me); if (b && b.odds > odds) startOffensive(w, S, t, me, b.target);
  }
};
/** command armies like a player: find the best target on each front, send the army with the best odds there (one attack per front at a time) */
const command = (w: World, war: War, me: number, careful = false) => {
  for (const t of theatersOf(w, war)) {
    if (!t.sideOf[me] || t.offensives.some(o => !o.ended && o.country === me)) continue;
    if (careful && t.offensives.some(o => o.country === me && w.day - o.ended < 15)) continue; // let the last attack's troops recover
    const b = bestStrike(w, war, t, me); if (!b) continue;
    if (careful && b.score < 2.5 * 1.8 * 0.8) continue; // cities, or overwhelming odds
    let best = -1, bo = 0;
    for (const a of w.armies.filter(a => a.country === me)) { const at = armyWhere(w, S, a); if (!at || (at.theater !== t.id && at.state !== 'home') || at.state === 'moving') continue; const r = strikeOdds(w, war, t, me, b.target, a.id); if (!r.err && r.odds > bo) { bo = r.odds; best = a.id; } }
    if (best >= 0 && bo > (careful ? 2 : 1.5)) orderArmy(w, S, best, ...b.target);
  }
};
const only = process.env.STRATS?.split(',');
const STRATS: Record<string, Strat | null> = {
  ai: null, // the AI plays the attacker
  idle: () => {},
  hold: (w, war, me) => { war.aggr[sideOf(war, me) > 0 ? 0 : 1] = POSTURE.hold; },
  push: (w, war, me) => { war.aggr[sideOf(war, me) > 0 ? 0 : 1] = POSTURE.offensive; },
  reckless: (w, war, me) => { war.aggr[sideOf(war, me) > 0 ? 0 : 1] = POSTURE.offensive; war.commit ||= {}; war.commit[me] = 0.92; if (w.day % 10 === 0) aim(w, war, me); },
  smart: (w, war, me) => { if (w.day % 5 === 0) strike(w, war, me); },
  smart3: (w, war, me) => { if (w.day % 5 === 0) strike(w, war, me, 3); },
  sharp: (w, war, me) => { if (w.day % 5 === 0) strike(w, war, me, 1, 1.5); },
  pro: (w, war, me) => { war.aggr[sideOf(war, me) > 0 ? 0 : 1] = POSTURE.offensive; if (w.day % 5 === 0) strike(w, war, me, 1, 1.5); },
  allin: (w, war, me) => { war.commit ||= {}; war.commit[me] = 0.92; if (w.day % 5 === 0) strike(w, war, me, 1, 1.5); },
  commander: (w, war, me) => { if (w.day % 5 === 0) command(w, war, me); },
  careful: (w, war, me) => { if (w.day % 5 === 0) command(w, war, me, true); },
  digin: (w, war, me) => { war.aggr[sideOf(war, me) > 0 ? 0 : 1] = POSTURE.hold; if (w.day % 5 === 0) strike(w, war, me); },
};
const rows: string[] = [];
for (const [name, strat] of Object.entries(STRATS).filter(([n]) => !only || only.includes(n))) {
  const out: string[] = []; let sum = 0;
  for (let s = 1; s <= +seeds; s++) {
    const w = createWorld(S, { seed: s, player: pi, scenario: scen, startDate: sd, tables: tablesFor(scen as any) }); setupScenario(w, S);
    w.countries[pi].player = strat !== null;
    // BUILD=n: the player first spends n months building infantry with its spare funds ("investing a little in an army")
    const P = w.countries[pi];
    for (let d = 0; d < 30 * +(process.env.BUILD || 0); d++) { if (d % 15 === 0) for (let q = 0; q < 4 && P.spending * P.budget.military - P.upkeep > P.unitCost * 4 * (P.production.length + 1); q++) if (queueUnit(w, P, 'infantry')) break; for (const a of w.agenda.filter(a => a.country === pi)) resolveAgenda(w, S, a.id, 0); stepDay(w, S); }
    for (let d = 0; d < 20; d++) stepDay(w, S);
    const war = declareWar(w, S, ai, bi);
    let end = '';
    for (let d = 0; d < +days; d++) {
      if (strat) { strat(w, war, pi); for (const a of w.agenda.filter(a => a.country === pi)) resolveAgenda(w, S, a.id, a.kind === 'peace' ? 1 : 0); }
      stepDay(w, S);
      if (war.ended) { end = `ended d${war.ended - war.start}`; break; }
    }
    const held = w.provinces.filter(p => p.owner === bi && sideOf(war, p.controller) === 1).length, tot = w.provinces.filter(p => p.owner === bi).length;
    sum += war.score; out.push(`${String(war.score).padStart(4)} (${held}/${tot}${end ? ' ' + end : ''}) cas ${Math.round(war.casualties[0] / 1e3)}k:${Math.round(war.casualties[1] / 1e3)}k`);
  }
  rows.push(`${name.padEnd(8)} mean ${(sum / +seeds).toFixed(0).padStart(4)} | ${out.join(' | ')}`);
  console.log(rows[rows.length - 1]);
}
