import { describe, expect, it } from 'vitest';
import { createWorld } from '../src/sim/world';
import { stepDay } from '../src/sim/step';
import { initSim } from '../src/sim';
import { setupScenario, tablesFor } from '../src/sim/scenario';
import { resolveAgenda } from '../src/sim/agenda';
import { declareWar, theatersOf } from '../src/sim/war/war';
import { loadStatic } from './helpers';

// An enemy of the player that is beaten but still holds land does not end the war on its own: the player accepts its capitulation or fights on.
describe('capitulation', () => {
  initSim();
  const S = loadStatic();
  const setup = (player: boolean) => {
    const w = createWorld(S, { seed: 3, scenario: '2026', tables: tablesFor('2026') }); setupScenario(w, S);
    const ci = (c: string) => w.countries.find(x => x.code === c)!, rus = ci('RUS'), geo = ci('GEO');
    rus.player = player;
    const war = declareWar(w, S, rus.id, geo.id, { silent: true });
    const own = w.provinces.filter(p => p.owner === geo.id), free = own.find(p => p.id !== geo.capital)!;
    for (const p of own) if (p !== free) p.controller = rus.id; // the capital and all but one province taken
    for (const t of theatersOf(w, war)) t.frozen = true; // the front stays where it is
    const week = () => { for (let d = 0; d < 8; d++) stepDay(w, S); };
    const card = () => w.agenda.find(a => a.country === rus.id && a.data?.cap === geo.id);
    return { w, rus, geo, war, free, week, card };
  };

  it('waits for the player while some of the enemy is still free, and fighting on keeps the war going', () => {
    const { w, rus, geo, war, free, week, card } = setup(true);
    week();
    expect(war.ended).toBe(0);
    expect(card()).toBeTruthy();
    resolveAgenda(w, S, card()!.id, 1); // fight on
    week(); week();
    expect(war.ended).toBe(0);
    expect(card()).toBeFalsy(); // not asked again at once
    free.controller = rus.id; // now all of it is ours
    week();
    expect(war.ended).toBeGreaterThan(0);
    expect(w.provinces.filter(p => p.owner === geo.id).length).toBe(0);
  }, 120000);

  it('ends the war when the player accepts', () => {
    const { w, geo, war, week, card } = setup(true);
    week();
    resolveAgenda(w, S, card()!.id, 0);
    expect(war.ended).toBeGreaterThan(0);
    expect(w.provinces.some(p => p.owner === geo.id)).toBe(true); // what was not taken stays (a puppet)
  }, 120000);

  it('an unanswered offer means fighting on', () => {
    const { w, war, week, card } = setup(true);
    week();
    for (let d = 0; d < 40; d++) stepDay(w, S);
    expect(card()).toBeFalsy();
    expect(war.ended).toBe(0);
  }, 120000);

  it('between AI nations a beaten one still capitulates by itself', () => {
    const { war, week } = setup(false);
    week();
    expect(war.ended).toBeGreaterThan(0);
  }, 120000);
});
