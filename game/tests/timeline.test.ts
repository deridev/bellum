import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { createWorld } from '../src/sim/world';
import { initSim } from '../src/sim';
import { setupScenario, tablesFor } from '../src/sim/scenario';
import { fromFile, withScenario } from '../src/game/scenarios';
import { historyDaily } from '../src/sim/history';
import { resolveAgenda } from '../src/sim/agenda';
import { joinWar, sideOf } from '../src/sim/war/war';
import { stepDay } from '../src/sim/step';
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

  it('1914: armies march on foot, Germany opens through Belgium, and Belgium fights on', () => {
    const { w, S, ci, war } = world('1914', 'BRA');
    expect(w.divisions.every(d => d.type === 'infantry')).toBe(true);
    for (let d = 0; d < 45; d++) stepDay(w, S);
    expect(w.cooldowns['swept:brussels']).toBeGreaterThan(0); // Liège fought for, Brussels taken
    expect(w.provinces.some(p => p.owner === ci('BEL') && p.controller === ci('GER'))).toBe(true);
    expect(w.countries[ci('BEL')].alive && sideOf(war, ci('BEL'))).toBeTruthy();
  }, 120000);

  it('two theaters of one war never cover the same ground', () => {
    const { w, S, ci, war } = world('1939', 'BRA');
    joinWar(w, S, war, ci('SOV'), -1, true); joinWar(w, S, war, ci('FIN'), 1, true);
    const boxes = w.theaters.filter(t => t.war === war.id).map(t => [t.lon0, t.lat0 - t.H * t.ch, t.lon0 + t.W * t.cw, t.lat0]);
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i], b = boxes[j];
      expect(a[0] < b[2] - 1e-6 && b[0] < a[2] - 1e-6 && a[1] < b[3] - 1e-6 && b[1] < a[3] - 1e-6).toBe(false);
    }
  }, 120000);

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
