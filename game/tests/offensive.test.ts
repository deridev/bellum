import { describe, expect, it } from 'vitest';
import { createWorld } from '../src/sim/world';
import { stepDay } from '../src/sim/step';
import { initSim } from '../src/sim';
import { setupScenario, tablesFor } from '../src/sim/scenario';
import { declareWar, theatersOf } from '../src/sim/war/war';
import { bestStrike, endOffensive, startOffensive, strikeForce, strikeOdds, warReserve, commitShare } from '../src/sim/war/ai';
import { armyDivs, armyWhere, orderArmy } from '../src/sim/war/armies';
import { cellLonLat, T } from '../src/sim/war/theater';
import { serialize, deserialize } from '../src/game/save';
import { km } from '../src/geo';
import type { World } from '../src/sim/types';
import { loadStatic } from './helpers';

// Offensives are the player's main lever in a war: they must gather real force, go where they are aimed (over land, 150 km at most),
// and pay off when aimed well. Thailand attacks Myanmar: a long border, an even fight.
describe('offensives', () => {
  initSim();
  const S = loadStatic();
  const ci = (w: World, c: string) => w.countries.find(x => x.code === c)!.id;
  const start = (seed: number, days: number, player = false) => {
    const w = createWorld(S, { seed, scenario: '2026', tables: tablesFor('2026') }); setupScenario(w, S);
    const tha = ci(w, 'THA'); w.countries[tha].player = player;
    for (let d = 0; d < 20; d++) stepDay(w, S);
    const war = declareWar(w, S, tha, ci(w, 'MMR'));
    for (let d = 0; d < days; d++) stepDay(w, S);
    return { w, war, tha, t: theatersOf(w, war)[0] };
  };

  it('a fifth of the commitment waits as the reserve, and a strike uses it first, 150 km deep at most', () => {
    const { w, war, tha, t } = start(3, 0);
    const mine = w.divisions.filter(d => d.country === tha), committed = Math.ceil(mine.length * commitShare(w, war, tha));
    const reserve = warReserve(w, war, tha);
    expect(reserve.length).toBeGreaterThan(0);
    expect(mine.length - mine.filter(d => d.theater < 0).length + reserve.length).toBeLessThanOrEqual(committed);
    const b = bestStrike(w, war, t, tha)!;
    expect(b).toBeTruthy();
    expect(b.reserves).toBe(Math.min(12, reserve.length));
    expect(km(b.from![0], b.from![1], b.to![0], b.to![1])).toBeLessThanOrEqual(T.offReach + 1);
  }, 120000);

  it('cannot be aimed across the sea or through a neutral country', () => {
    const { w, tha, t } = start(3, 5);
    // the Andaman Sea, west of Thailand's coast, and Laos, a neutral neighbour
    expect(strikeForce(w, t, tha, [96.5, 12.5]).err).toMatch(/off\.(notEnemy|blocked)/);
    expect(strikeForce(w, t, tha, [102.6, 18.0]).err).toMatch(/off\.(notEnemy|blocked)/);
  }, 120000);

  it('its divisions stay at the front when it ends, worn out', () => {
    const { w, war, tha, t } = start(3, 10);
    const b = bestStrike(w, war, t, tha)!; expect(startOffensive(w, S, t, tha, b.target)).toBeNull();
    const o = t.offensives[t.offensives.length - 1], us = w.divisions.filter(d => d.op === o.id), org = us.map(d => d.org);
    expect(us.length).toBeGreaterThanOrEqual(3);
    endOffensive(w, o);
    expect(us.every(d => d.theater === t.id && !d.op)).toBe(true);
    us.forEach((d, i) => expect(d.org).toBeCloseTo(org[i] * 0.55));
  }, 120000);

  it('a well-aimed army attack takes more ground than doing nothing, from the same moment', () => {
    const { w, war, tha } = start(3, 100, true);
    const myr = ci(w, 'MMR'), snap = serialize(w);
    const ground = (v: World) => { let n = 0; for (const t of v.theaters.filter(t => t.war === war.id)) { const a = t.cellKm ** 2; for (let k = 0; k < t.W * t.H; k++) if (t.land[k]) { const o = v.provinces[t.prov[k]].owner, ours = t.c[k] * t.sideOf[tha] > 0; if (ours && o === myr) n += a; else if (!ours && o === tha) n -= a; } } return n; };
    const play = (strike: boolean) => {
      const v = deserialize(snap); const vw = v.wars.find(x => x.id === war.id)!; stepDay(v, S); const g0 = ground(v);
      // the player's way to strike: pick up the army with the best odds for the best target and send it there
      if (strike) for (const t of theatersOf(v, vw)) { const b = bestStrike(v, vw, t, tha); if (!b) continue; let best = -1, bo = 0; for (const a of v.armies.filter(a => a.country === tha)) { const r = strikeOdds(v, vw, t, tha, b.target, a.id); if (!r.err && r.odds > bo) { bo = r.odds; best = a.id; } } if (best >= 0) orderArmy(v, S, best, ...b.target); }
      for (let d = 0; d < 45; d++) stepDay(v, S);
      return ground(v) - g0;
    };
    const idle = play(false), strike = play(true);
    console.log('ground (km²) idle', Math.round(idle), 'strike', Math.round(strike));
    expect(strike).toBeGreaterThan(idle);
  }, 300000);

  it('the player commands whole armies: station them in peace, move them to the front, send them to attack', () => {
    const w = createWorld(S, { seed: 3, scenario: '2026', tables: tablesFor('2026'), player: 0 }); setupScenario(w, S);
    const tha = ci(w, 'THA'); w.countries.forEach(c => (c.player = c.id === tha));
    const mine = w.armies.filter(a => a.country === tha && armyDivs(w, a.id).length);
    expect(mine.length).toBeGreaterThanOrEqual(2);
    // in peace: station an army in a province
    const a = mine[0], border = w.provinces.find(p => p.owner === tha && S.provinces[p.id].nbr.some(n => w.provinces[n].owner === ci(w, 'MMR')))!;
    expect(orderArmy(w, S, a.id, ...S.provinces[border.id].label).kind).toBe('station');
    expect(armyDivs(w, a.id).every(d => d.prov === border.id)).toBe(true);
    for (let d = 0; d < 5; d++) stepDay(w, S);
    const war = declareWar(w, S, tha, ci(w, 'MMR')); stepDay(w, S);
    const t = theatersOf(w, war)[0];
    // the stationed army went in whole and holds the front there
    const where = armyWhere(w, S, a)!;
    expect(where.theater).toBe(t.id); expect(where.n).toBe(armyDivs(w, a.id).length);
    expect(armyDivs(w, a.id).every(d => d.goal?.[2] === 2)).toBe(true); // in its general's line
    // send it to attack an enemy city on this front: it attacks with all of itself, as a named army
    const city = t.cities.find(c => t.c[c.k] * t.sideOf[tha] < 0)!;
    expect(orderArmy(w, S, a.id, ...cellLonLat(t, city.k)).kind).toBe('attack');
    const o = t.offensives[t.offensives.length - 1];
    expect(o.army).toBe(a.id); expect(o.order).toBe(1);
    expect(w.divisions.filter(d => d.op === o.id).length).toBe(armyDivs(w, a.id).length);
    // then move it back to hold our side of the front somewhere else: the attack is called off
    const own = cellLonLat(t, t.cities.find(c => t.c[c.k] * t.sideOf[tha] > 0)!.k);
    expect(orderArmy(w, S, a.id, ...own).kind).toBe('move');
    expect(o.ended).toBeGreaterThan(0); expect(armyDivs(w, a.id).every(d => !d.op && d.goal)).toBe(true);
  }, 120000);
});
