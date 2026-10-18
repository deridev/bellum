import { describe, expect, it } from 'vitest';
import { createWorld } from '../src/sim/world';
import { stepDay } from '../src/sim/step';
import { initSim } from '../src/sim';
import { setupScenario, tablesFor } from '../src/sim/scenario';
import { fromFile, withScenario } from '../src/game/scenarios';
import { checkOutcome, endDay, goalWar, outputShare } from '../src/sim/victory';
import { loadStatic } from './helpers';
import fs from 'node:fs';

// A game has an end: domination, the scenario's great war, the end date, or the fall of the player's nation.
describe('victory and defeat', () => {
  initSim();
  const base = loadStatic();
  const modern = (code: string) => { const w = createWorld(base, { seed: 4, scenario: '2026', tables: tablesFor('2026') }); setupScenario(w, base); const me = w.countries.find(c => c.code === code)!; me.player = true; return { w, me }; };

  it('the fall of the nation is a defeat', () => {
    const { w, me } = modern('PRT'); me.alive = false; stepDay(w, base);
    expect(w.outcome?.kind).toBe('defeat'); expect(w.outcome?.reason).toBe('annexed');
  });
  it('a quarter of the world\'s output is a domination victory', () => {
    const { w, me } = modern('CHN'); const usa = w.countries.find(c => c.code === 'USA')!.id;
    for (const p of w.provinces) if (p.owner === usa) { p.owner = me.id; p.controller = me.id; }
    expect(outputShare(w, me.id)).toBeGreaterThan(0.25);
    checkOutcome(w, base); expect(w.outcome?.kind).toBe('victory'); expect(w.outcome?.reason).toBe('domination');
  });
  it('at the end date the nations are ranked; the first power wins', () => {
    const { w, me } = modern('USA'); w.day = endDay(w);
    checkOutcome(w, base); expect(w.outcome?.reason).toBe('firstPower'); expect(w.outcome?.kind).toBe('victory');
    const b = modern('PRT'); b.w.day = endDay(b.w); checkOutcome(b.w, base); expect(b.w.outcome?.kind).toBe('end'); expect(b.w.outcome!.rank!).toBeGreaterThan(5);
  });
  it('1939: the Second World War goes on after Poland falls', () => {
    const f = JSON.parse(fs.readFileSync('public/data/scenario-1939.json', 'utf8')); const sc = fromFile(base.provinces, base.countries, f, '1939', Date.parse(f.start + 'T00:00:00Z')); const S = withScenario(base, sc);
    const w = createWorld(S, { seed: 3, scenario: '1939', startDate: sc.startDate, tables: tablesFor('1939') }); setupScenario(w, S);
    const war = goalWar(w)!; expect(war.total).toBe(true);
    for (let d = 0; d < 365; d++) stepDay(w, S);
    const pol = w.countries.find(c => c.code === 'POL')!;
    expect(war.defenders.includes(pol.id)).toBe(false); // Poland made its separate peace (or is gone)
    expect(war.ended).toBe(0); // and the war goes on a year later
  }, 300000);
});
