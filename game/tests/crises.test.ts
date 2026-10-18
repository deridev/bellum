import { describe, expect, it } from 'vitest';
import { createWorld } from '../src/sim/world';
import { stepDay } from '../src/sim/step';
import { initSim } from '../src/sim';
import { setupScenario, tablesFor } from '../src/sim/scenario';
import { crisisGrowth, startCrisis } from '../src/sim/crises';
import { resolveAgenda } from '../src/sim/agenda';
import { loadStatic } from './helpers';

// A world crisis hits everyone; each nation chooses how to meet it, and the choice changes the cost and the bite.
describe('world crises', () => {
  initSim();
  const S = loadStatic();
  it('a recession: the AI chooses at once, the player gets a card, the choice softens the blow, and it ends', () => {
    const w = createWorld(S, { seed: 4, scenario: '2026', tables: tablesFor('2026') }); setupScenario(w, S);
    const me = w.countries.find(c => c.code === 'BRA')!; me.player = true;
    startCrisis(w, 'recession');
    expect(w.crisis?.id).toBe('recession');
    const usa = w.countries.find(c => c.code === 'USA')!; expect(w.crisis!.choice[usa.id]).toBeDefined();
    const card = w.agenda.find(a => a.kind === 'crisis' && a.country === me.id)!; expect(card.options.length).toBe(2);
    const debt = me.debt; resolveAgenda(w, S, card.id, 0); // stimulus
    expect(me.debt).toBeGreaterThan(debt);
    expect(crisisGrowth(w, me)).toBeCloseTo(-0.015, 3); // half the recession's −3%
    for (let d = 0; d < 30 * 19; d++) stepDay(w, S);
    expect(w.crisis).toBeUndefined();
  }, 300000);
});
