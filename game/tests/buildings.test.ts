import { describe, expect, it } from 'vitest';
import { createWorld } from '../src/sim/world';
import { stepDay } from '../src/sim/step';
import { initSim } from '../src/sim';
import { setupScenario, tablesFor } from '../src/sim/scenario';
import { computeGdp, queueUnit } from '../src/sim/economy';
import { buildCost, dailyBuildings, levelOf, startBuild } from '../src/sim/buildings';
import { armyWhere, orderArmy } from '../src/sim/war/armies';
import { fortAt, cellOf } from '../src/sim/war/theater';
import { placeUnit, theatersOf } from '../src/sim/war/war';
import { loadStatic } from './helpers';

// Provinces matter: barracks raise and train divisions, forts hold the line, factories add output; armies travel instead of jumping.
describe('provinces and travel', () => {
  initSim();
  const S = loadStatic();
  const world = () => { const w = createWorld(S, { seed: 4, scenario: '2026', tables: tablesFor('2026') }); setupScenario(w, S); const ci = (c: string) => w.countries.find(x => x.code === c)!; return { w, ci }; };
  const named = (n: string) => S.provinces.findIndex(p => p.name === n);

  it('every nation starts with barracks in its capital, and raises divisions only where there are barracks', () => {
    const { w, ci } = world(); const bra = ci('BRA');
    expect(w.countries.filter(c => c.alive).every(c => levelOf(w.provinces[c.capital], 'barracks') >= 1)).toBe(true);
    const poa = named('Porto Alegre'); expect(w.provinces[poa].owner).toBe(bra.id);
    expect(queueUnit(w, bra, 'infantry', poa)).toBe('mil.noBarracks');
    w.provinces[poa].bld = { barracks: 1 };
    expect(queueUnit(w, bra, 'infantry', poa)).toBeNull();
    expect(bra.production[bra.production.length - 1].prov).toBe(poa); // raised where we chose
  }, 60000);

  it('a factory is paid for, built over months, and raises the province\'s output', () => {
    const { w, ci } = world(); const bra = ci('BRA'), p = w.provinces[named('São Paulo')];
    bra.treasury += 1e6; const before = computeGdp(w, bra.id), cash = bra.treasury, { cost, days } = buildCost(bra, p, 'factory');
    expect(startBuild(w, bra, p, 'factory')).toBeNull();
    expect(bra.treasury).toBeCloseTo(cash - cost);
    expect(startBuild(w, bra, p, 'fort')).toBe('bld.busy'); // one work at a time in a province
    w.day += days; dailyBuildings(w);
    expect(levelOf(p, 'factory')).toBe(1);
    expect(computeGdp(w, bra.id)).toBeGreaterThan(before + p.gdp * 0.1);
  }, 60000);

  it('a fort makes its builder\'s defenders stronger in that province', () => {
    const { w, ci } = world(); const ukr = ci('UKR');
    const war = w.wars.find(x => !x.ended && x.defenders.includes(ukr.id))!, t = theatersOf(w, war)[0];
    const p = w.provinces.find(q => q.owner === ukr.id && q.controller === ukr.id && cellOf(t, ...S.provinces[q.id].label) >= 0)!;
    p.bld = { fort: 3 }; stepDay(w, S);
    const k = cellOf(t, ...S.provinces[p.id].label);
    expect(fortAt(t, k, t.sideOf[ukr.id])).toBeCloseTo(1.8);
    expect(fortAt(t, k, -t.sideOf[ukr.id])).toBe(0);
  }, 60000);

  it('an army sent across the country travels there over days, on the map', () => {
    const { w, ci } = world(); const bra = ci('BRA');
    const a = w.armies.find(x => x.country === bra.id && armyWhere(w, S, x)?.state === 'home')!, poa = named('Porto Alegre'), [lon, lat] = S.provinces[poa].label;
    const from = armyWhere(w, S, a)!;
    expect(orderArmy(w, S, a.id, lon, lat).kind).toBe('station');
    const on = armyWhere(w, S, a)!;
    expect(on.state).toBe('moving'); expect(on.eta! - w.day).toBeGreaterThanOrEqual(3);
    for (let d = 0; d < 2; d++) stepDay(w, S);
    const mid = armyWhere(w, S, a)!;
    expect(Math.hypot(mid.x - from.x, mid.y - from.y)).toBeGreaterThan(0.5); // under way, not there yet
    expect(Math.hypot(mid.x - lon, mid.y - lat)).toBeGreaterThan(0.5);
    while (w.day < on.eta!) stepDay(w, S);
    expect(armyWhere(w, S, a)!.state).toBe('home');
  }, 60000);

  it('a long trip to the front wears a division out: where it was raised matters', () => {
    const { w, ci } = world(); const rus = ci('RUS');
    const war = w.wars.find(x => !x.ended && x.attackers.includes(rus.id))!, t = theatersOf(w, war)[0];
    const far = w.divisions.find(d => d.country === rus.id && d.theater < 0)!, near = w.divisions.filter(d => d.country === rus.id && d.theater < 0)[1];
    for (const d of [far, near]) { d.trip = undefined; d.arrive = 0; d.org = 1; } // at home, not on the road
    far.prov = named('Primorsky Krai'); near.prov = named('Belgorod');
    const [x, y] = S.provinces[named('Belgorod')].label;
    placeUnit(w, t, far, x, y, w.day + 1); placeUnit(w, t, near, x, y, w.day + 1);
    expect(far.arrive - w.day).toBeGreaterThan(10); expect(far.org).toBeLessThan(0.85);
    expect(near.org).toBe(1); // a short trip costs nothing
  }, 60000);

  it('buildings cost months of revenue, so they compete for the treasury', () => {
    const { w, ci } = world(); const bra = ci('BRA'), p = w.provinces[named('Porto Alegre')];
    expect(buildCost(bra, p, 'barracks').cost).toBeGreaterThan(bra.income * 0.2);
    expect(buildCost(bra, p, 'fort').cost).toBeGreaterThan(bra.income * 0.25);
    expect(startBuild(w, bra, p, 'barracks')).toBeNull(); w.day += 60; dailyBuildings(w);
    expect(startBuild(w, bra, p, 'barracks')).toBe('bld.max'); // barracks have one level
  }, 60000);
});
