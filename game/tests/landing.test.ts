import { describe, expect, it } from 'vitest';
import { createWorld } from '../src/sim/world';
import { stepDay } from '../src/sim/step';
import { initSim } from '../src/sim';
import { setupScenario, tablesFor } from '../src/sim/scenario';
import { declareWar, theatersOf } from '../src/sim/war/war';
import { orderArmy, armyDivs } from '../src/sim/war/armies';
import { landingPlan } from '../src/sim/war/landing';
import { say as logText } from '../src/i18n';
import { loadStatic } from './helpers';

// Wars across the sea: an army can land on an enemy coast; the fleets decide the odds. The AI lands where it has no other way in.
describe('landings', () => {
  initSim();
  const S = loadStatic();
  const world = (seed = 4) => { const w = createWorld(S, { seed, scenario: '2026', tables: tablesFor('2026') }); setupScenario(w, S); const ci = (c: string) => w.countries.find(x => x.code === c)!; return { w, ci }; };

  it('the AI lands on an island it is at war with, and gains', () => {
    const { w, ci } = world(); const usa = ci('USA'), cub = ci('CUB');
    const war = declareWar(w, S, usa.id, cub.id, { alone: true });
    for (let d = 0; d < 150 && !war.ended; d++) stepDay(w, S);
    const landed = w.log.some(l => l.msg.k === 'log.landed' && l.who?.[0] === usa.id);
    console.log('USA–Cuba', 'score', war.score, 'ended', war.ended, w.log.filter(l => l.msg.k.startsWith('log.land')).map(l => logText(w, l.msg)).join(' | '));
    expect(landed).toBe(true);
    expect(war.ended ? war.winner === 1 : war.score > 0).toBe(true);
  }, 300000);

  it('a player\'s army can be sent across the sea; a weak fleet gets poor odds', () => {
    const { w, ci } = world(6); const usa = ci('USA'), cub = ci('CUB'); usa.player = true;
    const war = declareWar(w, S, usa.id, cub.id, { alone: true });
    const havana = S.provinces.find(p => w.provinces[p.id].owner === cub.id && p.coastal)!.label;
    const a = w.armies.find(x => x.country === usa.id && armyDivs(w, x.id).length >= 6)!;
    expect(landingPlan(w, S, a.id, ...havana).p).toBeGreaterThan(0.6);
    expect(orderArmy(w, S, a.id, ...havana).kind).toBe('landing');
    expect(w.landings?.length).toBe(1);
    for (let d = 0; d < 30; d++) stepDay(w, S);
    expect(w.landings?.length ?? 0).toBe(0); // it has arrived, one way or the other
    expect(theatersOf(w, war).length).toBeGreaterThan(0);
    // a landing that holds is supplied from the sea (its beachhead is a port)
    if (w.log.some(l => l.msg.k === 'log.landed')) { const ds = armyDivs(w, a.id).filter(d => d.theater >= 0 && d.arrive <= w.day); expect(ds.length).toBeGreaterThan(0); expect(ds.every(d => d.sup > 0.3)).toBe(true); }
    // Cuba's army against the US fleet
    const cuba = w.armies.find(x => x.country === cub.id && armyDivs(w, x.id).length)!;
    const florida = S.provinces.find(p => w.provinces[p.id].owner === usa.id && p.coastal && p.label[1] < 28)!.label;
    expect(landingPlan(w, S, cuba.id, ...florida).p).toBeLessThan(0.3);
  }, 300000);
});
