import { describe, expect, it } from 'vitest';
import { createWorld } from '../src/sim/world';
import { stepDay } from '../src/sim/step';
import { initSim } from '../src/sim';
import { setupScenario } from '../src/sim/scenario';
import { declareWar, warsOf } from '../src/sim/war/war';
import { dateStr } from '../src/sim/types';
import { loadStatic } from './helpers';

describe('war', () => {
  initSim();
  const S = loadStatic();
  it('runs the Russo-Ukrainian war and a Korean war for a year', () => {
    const w = createWorld(S, { seed: 5 }); setupScenario(w, S);
    const ci = (c: string) => w.countries.find(x => x.code === c)!.id;
    const t0 = Date.now();
    for (let d = 0; d < 30; d++) stepDay(w, S);
    declareWar(w, S, ci('PRK'), ci('KOR'));
    let logI = 0;
    for (let d = 0; d < 400; d++) {
      stepDay(w, S);
      if (d % 50 === 0) {
        const lines = w.wars.map(war => `${war.name} score ${war.score} ended ${war.ended} cas ${war.casualties.map(x => Math.round(x / 1000) + 'k')} theaters ${war.theaters.length} units ${w.divisions.filter(u => w.theaters.some(t => t.id === u.theater && t.war === war.id)).length}`);
        console.log(dateStr(w), lines.join(' | '));
      }
    }
    while (logI < w.log.length) { const l = w.log[logI++]; if (l.kind !== 'politics' && l.kind !== 'economy') console.log('  ', dateStr(w, l.day), l.text); }
    console.log('ms/day', ((Date.now() - t0) / 430).toFixed(1));
    const occ = w.provinces.filter(p => p.owner !== p.controller).length;
    console.log('occupied provinces', occ, 'theaters', w.theaters.map(t => `${t.name} ${t.W}x${t.H} ${t.cellKm.toFixed(1)}km`));
    expect(w.wars.length).toBeGreaterThanOrEqual(2);
  });
});
