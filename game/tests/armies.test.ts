import { describe, expect, it } from 'vitest';
import { createWorld } from '../src/sim/world';
import { stepDay } from '../src/sim/step';
import { initSim } from '../src/sim';
import { setupScenario, tablesFor } from '../src/sim/scenario';
import { declareWar, theatersOf } from '../src/sim/war/war';
import { armyDivs, armyWhere, mergeArmies, orderArmy, releaseArmy, reserveArmy, splitArmy } from '../src/sim/war/armies';
import { queueUnit } from '../src/sim/economy';
import { unitPower, work, cellOf } from '../src/sim/war/theater';
import type { World } from '../src/sim/types';
import { loadStatic } from './helpers';

// What a player can do with one army, besides moving and attacking: split it, merge it, put it back under its general,
// pull it into reserve, raise a division for it. And its general matters in battle.
describe('army options', () => {
  initSim();
  const S = loadStatic();
  const setup = () => {
    const w = createWorld(S, { seed: 3, scenario: '2026', tables: tablesFor('2026'), player: 0 }); setupScenario(w, S);
    const ci = (c: string) => w.countries.find(x => x.code === c)!.id, tha = ci('THA'); w.countries.forEach(c => (c.player = c.id === tha));
    const mine = () => w.armies.filter(a => a.country === tha && armyDivs(w, a.id).length);
    return { w, tha, mmr: ci('MMR'), mine };
  };
  const atWar = (w: World, a: number, b: number) => { const war = declareWar(w, S, a, b); for (let d = 0; d < 3; d++) stepDay(w, S); return { war, t: theatersOf(w, war)[0] }; };

  it('splits an army in two under a new general, and merges it back', () => {
    const { w, mine } = setup(); const a = mine()[0], n = armyDivs(w, a.id).length;
    const b = splitArmy(w, a.id); expect(typeof b).toBe('object'); if (typeof b !== 'object') return;
    expect(armyDivs(w, a.id).length + armyDivs(w, b.id).length).toBe(n);
    expect(armyDivs(w, b.id).length).toBeGreaterThan(0); expect(b.general.name).toBeTruthy();
    // merge the second army into another one, at home: it moves to that army's province and is gone
    const c = mine().find(x => x.id !== a.id && x.id !== b.id)!, prov = armyWhere(w, S, c)!.prov;
    expect(mergeArmies(w, S, b.id, c.id)).toBeNull();
    expect(w.armies.some(x => x.id === b.id)).toBe(false);
    expect(armyDivs(w, c.id).every(d => d.prov === prov)).toBe(true);
  }, 120000);

  it('pulls an army into reserve behind the front, and puts it back in its general\'s line', () => {
    const { w, tha, mmr, mine } = setup(); const { t } = atWar(w, tha, mmr);
    const a = mine().find(x => armyWhere(w, S, x)!.theater === t.id)!;
    expect(reserveArmy(w, S, a.id)).toBeNull();
    const ds = armyDivs(w, a.id), wk = work(t);
    expect(ds.every(d => d.goal && d.goal[2] === 0)).toBe(true);
    const k = cellOf(t, ds[0].goal![0], ds[0].goal![1]); expect(wk.distF[k] * t.cellKm).toBeGreaterThanOrEqual(100);
    expect(releaseArmy(w, a.id)).toBeNull();
    expect(armyDivs(w, a.id).every(d => d.goal?.[2] === 2)).toBe(true);
  }, 120000);

  it('a division raised for an army joins it at the front', () => {
    const { w, tha, mmr, mine } = setup(); const { t } = atWar(w, tha, mmr);
    const a = mine().find(x => armyWhere(w, S, x)!.theater === t.id)!, n = armyDivs(w, a.id).length;
    w.countries[tha].treasury += 1e5;
    expect(queueUnit(w, w.countries[tha], 'infantry', w.countries[tha].capital, a.id)).toBeNull();
    for (let d = 0; d < 120 && armyDivs(w, a.id).length === n; d++) stepDay(w, S);
    const ds = armyDivs(w, a.id); expect(ds.length).toBe(n + 1);
    expect(ds[ds.length - 1].theater).toBe(t.id);
  }, 120000);

  it('a skilled general makes the same division stronger', () => {
    const { w, tha, mmr, mine } = setup(); const { t } = atWar(w, tha, mmr);
    const a = mine().find(x => armyWhere(w, S, x)!.theater === t.id)!, d = armyDivs(w, a.id).find(x => x.theater === t.id)!, k = cellOf(t, d.x, d.y);
    a.general.traits = []; a.general.skill = 1; const weak = unitPower(w, t, d, k, work(t));
    a.general.skill = 4; const strong = unitPower(w, t, d, k, work(t));
    expect(strong / weak).toBeCloseTo((1 + 0.04 * 1.5) / (1 - 0.04 * 1.5), 2);
    expect(orderArmy(w, S, a.id, d.x, d.y).kind).toBe('move');
  }, 120000);
});
