import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { createWorld } from '../src/sim/world';
import { initSim } from '../src/sim';
import { setupScenario, tablesFor } from '../src/sim/scenario';
import { fromFile, withScenario } from '../src/game/scenarios';
import { historyDaily } from '../src/sim/history';
import { resolveAgenda } from '../src/sim/agenda';
import { sideOf } from '../src/sim/war/war';
import { loadStatic } from './helpers';

// History's timeline: the nations that entered the great wars enter them on the day, unless the world has changed;
// when it is the player's nation, the player decides on a card.
describe('historical timeline', () => {
  initSim();
  const base = loadStatic();
  const world = (scen: '1914' | '1939', player: string) => {
    const f = JSON.parse(fs.readFileSync(`public/data/scenario-${scen}.json`, 'utf8')); const sc = fromFile(base.provinces, base.countries, f, scen, Date.parse(f.start + 'T00:00:00Z')); const S = withScenario(base, sc);
    const w = createWorld(S, { seed: 2, player: S.countries.findIndex(c => c.code === player), scenario: scen, startDate: sc.startDate, tables: tablesFor(scen) }); setupScenario(w, S);
    const ci = (c: string) => w.countries.findIndex(x => x.code === c); w.countries[ci(player)].player = true;
    const at = (date: string) => { w.day = Math.round((Date.parse(date + 'T00:00:00Z') - w.startDate) / 864e5); historyDaily(w, S); };
    return { w, S, ci, at, war: w.wars.find(x => x.id === w.goalWar)! };
  };

  it('the Ottoman Empire joins the Central Powers on 29 October 1914', () => {
    const { ci, at, war } = world('1914', 'BRA');
    expect(sideOf(war, ci('OTT'))).toBe(0);
    at('1914-10-29');
    expect(sideOf(war, ci('OTT'))).toBe(1);
  }, 120000);

  it('a player leading Italy in 1940 is asked, and can stay out', () => {
    const { w, S, ci, at, war } = world('1939', 'ITA');
    at('1940-06-10');
    const card = w.agenda.find(a => a.kind === 'history')!;
    expect(card).toBeTruthy(); expect(sideOf(war, ci('ITA'))).toBe(0);
    resolveAgenda(w, S, card.id, 1);
    expect(sideOf(war, ci('ITA'))).toBe(0);
  }, 120000);

  it('Pearl Harbor brings Japan and the United States into the war', () => {
    const { ci, at, war } = world('1939', 'BRA');
    at('1941-12-07');
    expect(sideOf(war, ci('JPN'))).toBe(1); expect(sideOf(war, ci('USA'))).toBe(-1);
  }, 120000);
});
