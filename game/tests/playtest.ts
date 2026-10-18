// Headless playtest: one human-controlled nation under a scripted strategy, every other nation run by the AI.
// Not a unit test (no assertions): `npm run playtest -- <code> <strategy> <years> <scenario> [seed]`, e.g. `npm run playtest -- UKR hawk 3 2026`.
// Strategies: passive (answers the agenda only), builder, econ, saver (saves, uses policies, demobilizes), diplomat, hawk (attacks neighbours, refuses peace).
// Prints one row a month (economy, politics, army, war) and the player's log, so a design problem shows up as a number that stops moving.
import { createWorld } from '../src/sim/world';
import { stepDay } from '../src/sim/step';
import { initSim } from '../src/sim';
import { setupScenario } from '../src/sim/scenario';
import { tablesFor } from '../src/sim/scenario';
import { fromFile, withScenario } from '../src/game/scenarios';
import { loadStatic } from './helpers';
import { say as logText } from '../src/i18n';
import { warsOf, sideOf, acceptsPeace, heldDemand, makePeace, declareWar, warCost } from '../src/sim/war/war';
import { queueUnit, popOf, demobilize } from '../src/sim/economy';
import { resolveAgenda } from '../src/sim/agenda';
import { diploOdds, doDiplo, DIPLO } from '../src/sim/diplomacy';
import { neighbours } from '../src/sim/ai';
import { stabilityTarget } from '../src/sim/politics';
import { rel } from '../src/sim/world';
import fs from 'node:fs';
import { enactPolicy } from '../src/sim/policies';

const [code = 'UKR', strat = 'passive', years = '5', scen = '2026', seed = '7'] = process.argv.slice(2).filter(a => a !== '--');
initSim();
const base = loadStatic();
let S = base, sd: number | undefined;
if (scen !== '2026') { const f = JSON.parse(fs.readFileSync(`public/data/scenario-${scen}.json`, 'utf8')); const sc = fromFile(base.provinces, base.countries, f, scen as '1914', Date.parse(f.start + 'T00:00:00Z')); S = withScenario(base, sc); sd = sc.startDate; }
const ci = S.countries.findIndex(c => c.code === code);
const w = createWorld(S, { seed: +seed, player: ci, scenario: scen, startDate: sd, tables: tablesFor(scen as any) }); setupScenario(w, S);
const me = w.countries[ci]; me.player = true;
const nb = neighbours(w, S);
let decisions = 0, actions = 0;
const rows: string[] = [];
const fmt = (v: number) => Math.abs(v) >= 1e3 ? (v / 1e3).toFixed(1) + 'B' : v.toFixed(0) + 'M';
for (let d = 0; d < 365 * +years; d++) {
  stepDay(w, S); if (!me.alive) { rows.push('— ' + code + ' is gone'); break; }
  const monthStart = new Date(w.startDate + w.day * 864e5).getUTCDate() === 1;
  // the player's turn: answer the agenda, then act per strategy (once a month, like a human checking in)
  if (monthStart) {
    for (const a of w.agenda.filter(a => a.country === ci)) {
      decisions++;
      const pick = a.kind === 'peace' ? (strat === 'hawk' ? 1 : 0) : 0;
      resolveAgenda(w, S, a.id, pick);
    }
    if (strat === 'builder' || strat === 'hawk') {
      // build whenever there are funds and manpower
      const free = me.spending * me.budget.military - me.upkeep;
      if (free > me.unitCost * 2 && me.production.length < 3 && !queueUnit(w, me, 'infantry')) actions++;
    }
    if (strat === 'econ') { me.budget = { military: 0.15, investment: 0.45, welfare: 0.3, research: 0.1 }; me.deficit = 0; }
    if (strat === 'saver') { me.deficit = -0.15; if (!warsOf(w, ci).length && (me.readiness ?? 1) < 0.9) for (let k = 0; k < 5; k++) demobilize(w, me, 'infantry'); for (const id of ['research', 'stimulus', 'concessions', 'integrate', 'propaganda'] as const) if (enactPolicy(w, me, id)) actions++; }
    if (strat === 'diplomat') {
      for (const n of [...nb[ci]]) for (const act of ['improve', 'trade', 'nap', 'alliance'] as const) if (diploOdds(w, ci, n, act).ok) { doDiplo(w, ci, n, act); actions++; break; }
    }
    if (strat === 'hawk' && !warsOf(w, ci).length && !warCost(w, ci, ci).overlord) {
      const target = [...nb[ci]].filter(n => w.countries[n].alive && !warCost(w, ci, n).truce).sort((a, b) => w.countries[a].gdp - w.countries[b].gdp)[0];
      if (target !== undefined) { declareWar(w, S, ci, target); actions++; }
    }
    // try to make peace on good terms
    for (const war of warsOf(w, ci)) {
      const side = sideOf(war, ci) as 1 | -1, score = war.score * side;
      const demand = heldDemand(w, war, side, Math.max(0, score));
      if (demand.length && acceptsPeace(w, war, side, { type: 'treaty', provinces: demand }).ok) { makePeace(w, S, war, side, { type: 'treaty', provinces: demand }); actions++; }
    }
    const war = warsOf(w, ci)[0];
    const prov = w.provinces.filter(p => p.owner === ci).length, held = w.provinces.filter(p => p.controller === ci).length;
    const divs = w.divisions.filter(x => x.country === ci).length;
    const free = me.spending * me.budget.military - me.upkeep;
    rows.push([new Date(w.startDate + w.day * 864e5).toISOString().slice(0, 7), 'gdp ' + fmt(me.gdp), 'g ' + (me.growth * 100).toFixed(1) + '%', 'tre ' + fmt(me.treasury), 'debt ' + (me.debt / me.gdp * 100).toFixed(0) + '%',
      'bal ' + fmt(me.income - me.spending), 'prodFunds ' + fmt(free), 'rdy ' + Math.round((me.readiness ?? 1) * 100) + '%', 'stab ' + (me.stability * 100).toFixed(0) + '→' + (stabilityTarget(w, me) * 100).toFixed(0), 'ws ' + (me.warSupport * 100).toFixed(0), 'inf ' + me.polCap.toFixed(0),
      'mp ' + (me.manpower / 1e3).toFixed(0) + 'k', 'div ' + divs + (me.production.length ? `+${me.production.length}q` : ''), 'prov ' + prov + '/' + held, war ? 'war ' + Math.round(war.score * sideOf(war, ci)) : 'peace', 'agenda ' + w.agenda.filter(a => a.country === ci).length].join(' | '));
  }
}
console.log(rows.join('\n'));
console.log(`\nalive ${me.alive} decisions ${decisions} actions ${actions} tech ${me.tech} gov ${me.gov} leader ${me.leader.name}`);
console.log(w.log.filter(l => l.who?.includes(ci) && (l.big || l.kind === 'war' || l.kind === 'peace' || l.kind === 'politics' || l.kind === 'event')).map(l => `${new Date(w.startDate + l.day * 864e5).toISOString().slice(0, 10)} ${logText(w, l.msg)}`).join('\n'));
