import { describe, expect, it } from 'vitest';
import { createWorld } from '../src/sim/world';
import { stepDay } from '../src/sim/step';
import { initSim } from '../src/sim';
import { setupScenario } from '../src/sim/scenario';
import { declareWar } from '../src/sim/war/war';
import { loadStatic } from './helpers';
import { say as logText } from '../src/i18n';

// Balance targets for the present-day scenario: wars should grind and move, not collapse in weeks.
describe('balance', () => {
  initSim();
  const S = loadStatic();
  const fell = (w: ReturnType<typeof createWorld>, city: string, side: string) => w.log.some(l => logText(w, l.msg) === `${city} falls to ${side}`);
  for (const seed of [5, 6, 7]) it(`Russo-Ukrainian war, seed ${seed}: Kyiv holds a year, Ukraine keeps most of its land, the front moves`, () => {
    const w = createWorld(S, { seed }); setupScenario(w, S);
    const ukr = w.countries.find(c => c.code === 'UKR')!.id, t = w.theaters[0], c0 = t.c.slice();
    const own = w.provinces.filter(p => p.owner === ukr);
    for (let d = 0; d < 365; d++) stepDay(w, S);
    expect(fell(w, 'Kyiv', 'Russia')).toBe(false);
    expect(own.filter(p => p.controller === ukr).length / own.length).toBeGreaterThanOrEqual(0.6);
    if (t.c.length === c0.length) { let moved = 0; for (let k = 0; k < c0.length; k++) if (t.land[k] && (c0[k] >= 0) !== (t.c[k] >= 0)) moved++; expect(moved * t.cellKm ** 2).toBeGreaterThan(20000); }
  }, 600000);
  it('Korean war: Seoul is not overrun within 120 days', () => {
    const w = createWorld(S, { seed: 5 }); setupScenario(w, S);
    const ci = (c: string) => w.countries.find(x => x.code === c)!.id;
    declareWar(w, S, ci('PRK'), ci('KOR'));
    const own = w.provinces.filter(p => p.owner === ci('KOR'));
    for (let d = 0; d < 120; d++) stepDay(w, S);
    expect(fell(w, 'Seoul', 'North Korea')).toBe(false);
    expect(own.filter(p => p.controller === ci('KOR')).length / own.length).toBeGreaterThanOrEqual(0.7);
  }, 600000);
});
