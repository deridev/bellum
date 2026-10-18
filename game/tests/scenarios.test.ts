import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { createWorld } from '../src/sim/world';
import { stepDay } from '../src/sim/step';
import { initSim } from '../src/sim';
import { setupScenario, tablesFor } from '../src/sim/scenario';
import { fromFile, withScenario } from '../src/game/scenarios';
import { loadStatic } from './helpers';
import { say as logText, countryName } from '../src/i18n';

// Historical openings should play out recognisably, without being scripted.
describe('historical scenarios', () => {
  initSim();
  const base = loadStatic();
  const build = (id: '1914' | '1939', seed: number) => {
    const f = JSON.parse(fs.readFileSync(`public/data/scenario-${id}.json`, 'utf8'));
    const sc = fromFile(base.provinces, base.countries, f, id, Date.parse(f.start + 'T00:00:00Z'));
    const S = withScenario(base, sc), w = createWorld(S, { seed, startDate: sc.startDate, scenario: id, tables: tablesFor(id) });
    setupScenario(w, S); return { w, S };
  };
  const fell = (w: any, city: string, by: string) => { const e = w.log.find((l: any) => l.msg.k === 'log.cityFalls' && l.msg.a.city === city && w.countries[l.msg.a.c.c].code === by); return e ? e.day : -1; };
  const report = (w: any) => { const top = w.countries.filter((c: any) => c.alive).sort((a: any, b: any) => b.gdp - a.gdp).slice(0, 8).map((c: any) => `${c.code} ${Math.round(c.gdp / 1000)}B ${w.divisions.filter((d: any) => d.country === c.id).length}div`); console.log(top.join(' | ')); console.log(w.log.filter((l: any) => l.kind === 'war' || l.kind === 'peace' || l.big || l.kind === 'city').slice(0, 40).map((l: any) => `${l.day} ${logText(w, l.msg)}`).join('\n')); };
  it('1939: Poland falls within four months; France holds', () => {
    const { w, S } = build('1939', 3);
    console.log('wars', w.wars.map(x => logText(w, x.name) + ' ' + x.attackers.map(c => w.countries[c].code) + ' vs ' + x.defenders.map(c => w.countries[c].code)).join('; '), 'theaters', w.theaters.length);
    for (let d = 0; d < 120; d++) stepDay(w, S);
    report(w); void countryName;
    expect(Math.max(fell(w, 'Warsaw', 'GER'), fell(w, 'Warsaw', 'SOV'))).toBeGreaterThan(0);
    expect(fell(w, 'Paris', 'GER')).toBe(-1);
  }, 600000);
  it('1914: the great powers go to war and Paris holds for half a year', () => {
    const { w, S } = build('1914', 3);
    console.log('wars', w.wars.map(x => logText(w, x.name) + ' ' + x.attackers.map(c => w.countries[c].code) + ' vs ' + x.defenders.map(c => w.countries[c].code)).join('; '), 'theaters', w.theaters.length);
    for (let d = 0; d < 180; d++) stepDay(w, S);
    report(w);
    expect(w.wars[0].defenders.length).toBeGreaterThanOrEqual(4);
    expect(fell(w, 'Paris', 'GER')).toBe(-1);
  }, 600000);
});
