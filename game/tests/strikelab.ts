// Strike lab: does one offensive help? Plays a war to a given day, saves it, then runs 30 days (or DAYS) twice from the same moment:
// once doing nothing, once launching the best strike on each front. Prints the odds and the difference in ground and losses.
// `npm run strikelab -- <attacker> <defender> [seeds] [days list]` (DAYS=45 sets how long each branch runs).
import { createWorld } from '../src/sim/world';
import { stepDay } from '../src/sim/step';
import { initSim } from '../src/sim';
import { setupScenario, tablesFor } from '../src/sim/scenario';
import { loadStatic } from './helpers';
import { declareWar, theatersOf } from '../src/sim/war/war';
import { bestStrike, startOffensive } from '../src/sim/war/ai';
import { resolveAgenda } from '../src/sim/agenda';
import { serialize, deserialize } from '../src/game/save';
import { offensiveTip } from '../src/sim/war/theater';
import { km } from '../src/geo';
import type { World } from '../src/sim/types';

const [A = 'THA', B = 'MMR', seeds = '3', at = '40,90,140', hold = ''] = process.argv.slice(2).filter(a => a !== '--');
initSim(); const S = loadStatic();
const ai = S.countries.findIndex(c => c.code === A), bi = S.countries.findIndex(c => c.code === B);
/** net occupied land in thousands of km²: enemy land we hold minus our land they hold (stable when a war zone grows) */
const ground = (w: World, wid: number) => { let n = 0; for (const t of w.theaters.filter(t => t.war === wid)) { const a = t.cellKm * t.cellKm / 1e3; for (let k = 0; k < t.W * t.H; k++) if (t.land[k]) { const o = w.provinces[t.prov[k]].owner, mine = t.c[k] * (t.sideOf[ai] || 1) > 0; if (mine && o === bi) n += a; else if (!mine && o === ai) n -= a; } } return n; };
const run = (w: World, wid: number, days: number) => { for (let d = 0; d < days; d++) { for (const a of w.agenda.filter(a => a.country === ai)) resolveAgenda(w, S, a.id, a.kind === 'peace' ? 1 : 0); stepDay(w, S); if (w.wars.find(x => x.id === wid)!.ended) break; } };
const sum: number[] = [], ssum: number[] = [];
for (let s = 1; s <= +seeds; s++) {
  const w = createWorld(S, { seed: s, player: ai, scenario: '2026', tables: tablesFor('2026') }); setupScenario(w, S); w.countries[ai].player = true;
  for (let d = 0; d < 20; d++) stepDay(w, S);
  const war = declareWar(w, S, ai, bi); let day = 0;
  if (hold) war.aggr[0] = 0.9;
  for (const D of at.split(',').map(Number)) {
    run(w, war.id, D - day); day = D; if (war.ended) break;
    const snap = serialize(w);
    const res: string[] = []; let idleG = 0, idleS = 0;
    for (const strike of [false, true]) {
      const v = deserialize(snap), vw = v.wars.find(x => x.id === war.id)!; run(v, war.id, 1); // a day rebuilds the scratch fields (distance to the front)
      const g0 = ground(v, war.id), c0 = [...vw.casualties], s0 = vw.score;
      let info = '';
      if (strike) for (const t of theatersOf(v, vw)) { const b = bestStrike(v, vw, t, ai); if (b) { info += `r${b.reserves} odds ${b.odds.toFixed(2)} (${b.units.length}div ${Math.round(b.ours)}:${Math.round(b.theirs)} def×${b.def.toFixed(2)}) `; startOffensive(v, S, t, ai, b.target); } }
      const ops = theatersOf(v, vw).flatMap(t => t.offensives.filter(o => o.country === ai && !o.ended).map(o => ({ t, o, best: 0 })));
      for (let d = 0; d < +(process.env.DAYS || 30); d++) { run(v, war.id, 1); for (const x of ops) if (!x.o.ended && v.theaters.includes(x.t)) { const tip = offensiveTip(x.t, x.o); x.best = Math.max(x.best, km(x.o.from[0], x.o.from[1], tip[0], tip[1]) / Math.max(1, km(x.o.from[0], x.o.from[1], x.o.to[0], x.o.to[1]))); } }
      for (const x of ops) info += `depth ${Math.round(x.best * 100)}% `;
      const dg = ground(v, war.id) - g0; if (strike) { sum.push(dg - idleG); ssum.push(vw.score - s0 - idleS); } else { idleG = dg; idleS = vw.score - s0; }
      res.push(`${dg.toFixed(1)}k km² score ${vw.score - s0 >= 0 ? '+' : ''}${vw.score - s0}, losses ${Math.round((vw.casualties[0] - c0[0]) / 1e3)}k:${Math.round((vw.casualties[1] - c0[1]) / 1e3)}k ${info}`);
    }
    console.log(`seed ${s} day ${D}: idle ${res[0]} | strike ${res[1]}`);
  }
}
console.log('mean extra ground from striking (k km²):', (sum.reduce((a, b) => a + b, 0) / sum.length).toFixed(1), sum.map(x => x.toFixed(1)).join(' '));
console.log('mean extra score from striking:', (ssum.reduce((a, b) => a + b, 0) / ssum.length).toFixed(1), ssum.join(' '));
