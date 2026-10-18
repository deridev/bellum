import { describe, expect, it } from 'vitest';
import { createWorld } from '../src/sim/world';
import { stepDay } from '../src/sim/step';
import { initSim } from '../src/sim';
import { setupScenario, tablesFor } from '../src/sim/scenario';
import { monthlyUprisings } from '../src/sim/uprisings';
import { monthlyMissions, pickMission } from '../src/sim/missions';
import { loadStatic } from './helpers';

// A living world: annexed nations rise again while their land is unsettled; the player always has missions to choose.
describe('uprisings and missions', () => {
  initSim();
  const S = loadStatic();
  const world = (seed = 3) => { const w = createWorld(S, { seed, scenario: '2026', tables: tablesFor('2026') }); setupScenario(w, S); const ci = (c: string) => w.countries.find(x => x.code === c)!; return { w, ci }; };

  it('an annexed nation rises against its conqueror and fights for its land', () => {
    const { w, ci } = world(); const rus = ci('RUS'), geo = ci('GEO');
    for (const p of w.provinces) if (p.owner === geo.id) { p.owner = p.controller = rus.id; p.unrest = 1; }
    geo.alive = false; w.cooldowns[`gone:${geo.id}`] = -1000;
    for (let i = 0; i < 2000 && !geo.alive; i++) monthlyUprisings(w, S);
    expect(geo.alive).toBe(true);
    expect(w.provinces.filter(p => p.owner === geo.id).length).toBeGreaterThan(0);
    const war = w.wars.find(x => !x.ended && x.attackers.includes(geo.id) && x.defenders.includes(rus.id));
    expect(war).toBeTruthy();
    expect(w.divisions.filter(d => d.country === geo.id).length).toBeGreaterThanOrEqual(2);
    for (let d = 0; d < 30; d++) stepDay(w, S); // the war runs
  }, 120000);

  it('settled land does not rise', () => {
    const { w, ci } = world(); const rus = ci('RUS'), geo = ci('GEO');
    for (const p of w.provinces) if (p.owner === geo.id) { p.owner = p.controller = rus.id; p.unrest = 0; }
    geo.alive = false; w.cooldowns[`gone:${geo.id}`] = -1000;
    for (let i = 0; i < 500; i++) monthlyUprisings(w, S);
    expect(geo.alive).toBe(false);
  });

  it('the player is offered two missions, picks one, and is rewarded when it is done', () => {
    const { w, ci } = world(); const bra = ci('BRA'); bra.player = true;
    monthlyMissions(w, S);
    const card = w.agenda.find(a => a.kind === 'mission' && a.country === bra.id)!;
    expect(card.options.length).toBe(2);
    const offers = card.data.offers; w.agenda = w.agenda.filter(a => a !== card);
    // pick the economy mission if offered, and make it happen
    const growth = { id: 99, kind: 'growth', start: 0, until: 365, base: bra.gdp, target: bra.gdp * 1.05 };
    pickMission(w, [growth, offers[0]], 0);
    expect(w.missions!.length).toBe(1);
    const cap = bra.polCap; for (const p of w.provinces) if (p.owner === bra.id) p.gdp *= 1.1; bra.gdp *= 1.1;
    monthlyMissions(w, S);
    expect(w.missions!.some(m => m.kind === 'growth')).toBe(false);
    expect(bra.polCap).toBeGreaterThan(cap);
    expect(w.log.some(l => l.msg.k === 'log.missionDone')).toBe(true);
  });
});
