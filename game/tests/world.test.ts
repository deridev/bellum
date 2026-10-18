import { describe, expect, it } from 'vitest';
import { createWorld } from '../src/sim/world';
import { stepDay } from '../src/sim/step';
import { initSim } from '../src/sim';
import { setupScenario } from '../src/sim/scenario';
import { diploOdds, power } from '../src/sim/diplomacy';
import { loadStatic } from './helpers';
import { say as logText } from '../src/i18n';

// A decade of the present-day world, every country run by the AI: it should stay busy but sane.
describe('world over ten years', () => {
  initSim();
  const S = loadStatic();
  it('stays sane: some wars, alliances and events, no debt spirals or exploding armies', () => {
    const w = createWorld(S, { seed: Number(process.env.SEED || 11) }); setupScenario(w, S);
    const div0 = w.countries.map(c => w.divisions.filter(d => d.country === c.id).length), treaties0 = w.treaties.length;
    const t0 = Date.now();
    for (let d = 0; d < 3650; d++) stepDay(w, S);
    const ms = (Date.now() - t0) / 3650;
    const alive = w.countries.filter(c => c.alive);
    const debt = alive.filter(c => c.gdp > 1000).map(c => c.debt / c.gdp).sort((a, b) => a - b), stab = alive.map(c => c.stability).sort((a, b) => a - b);
    const growth = alive.map(c => { const n = w.divisions.filter(d => d.country === c.id).length; return n / Math.max(1, div0[c.id]); }).sort((a, b) => a - b);
    const wars = w.wars.filter(x => x.start > 0), events = w.log.filter(l => l.kind === 'event').length;
    console.log(`ms/day ${ms.toFixed(1)} | wars ${wars.length} (${wars.map(x => logText(w, x.name) + (x.ended ? ` ${Math.round((x.ended - x.start) / 30)}mo` : ' ongoing')).join('; ')})`);
    console.log(`treaties ${treaties0} -> ${w.treaties.length} (${['alliance', 'nap', 'guarantee', 'trade'].map(t => t + ' ' + w.treaties.filter(x => x.type === t).length).join(', ')}) | gone ${w.countries.filter(c => !c.alive).map(c => c.code).join(',')}`);
    console.log(`debt/gdp median ${debt[debt.length >> 1].toFixed(2)} max ${debt[debt.length - 1].toFixed(2)} | stability median ${stab[stab.length >> 1].toFixed(2)} min ${stab[0].toFixed(2)} | army size x start: median ${growth[growth.length >> 1].toFixed(2)} max ${growth[growth.length - 1].toFixed(2)} | log events ${events}`);
    console.log(w.log.filter(l => l.kind === 'war' || l.kind === 'peace' || l.big).slice(-25).map(l => `${l.day} ${logText(w, l.msg)}`).join('\n'));
    expect(wars.length).toBeGreaterThanOrEqual(2); expect(wars.length).toBeLessThanOrEqual(15);
    expect(debt[debt.length >> 1]).toBeLessThan(1);
    expect(stab[stab.length >> 1]).toBeGreaterThan(0.45);
    expect(growth[growth.length >> 1]).toBeGreaterThan(0.7); expect(growth[growth.length >> 1]).toBeLessThan(1.5); expect(growth[growth.length - 1]).toBeLessThan(4);
    expect(events).toBeGreaterThan(50);
    expect(w.treaties.filter(x => x.type === 'alliance').length).toBeGreaterThan(6); // more than the six at the start
    expect(ms).toBeLessThan(20);
  }, 900000);
  it('diplomacy answers make sense', () => {
    const w = createWorld(S, { seed: 3 }); setupScenario(w, S);
    const ci = (c: string) => w.countries.find(x => x.code === c)!.id;
    for (const c of w.countries) c.polCap = 100;
    expect(diploOdds(w, ci('USA'), ci('RUS'), 'alliance').ok).toBe(false);
    expect(diploOdds(w, ci('RUS'), ci('UKR'), 'trade').ok).toBe(false); // at war
    expect(diploOdds(w, ci('POL'), ci('LTU'), 'trade').ok).toBe(true);
    expect(diploOdds(w, ci('FRA'), ci('BRA'), 'improve').ok).toBe(true);
    expect(power(w, ci('USA'))).toBeGreaterThan(power(w, ci('BEL')) * 10);
  });
});
