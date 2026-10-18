import { describe, expect, it } from 'vitest';
import { createWorld } from '../src/sim/world';
import { stepDay } from '../src/sim/step';
import { dateStr } from '../src/sim/types';
import { loadStatic } from './helpers';

describe('world', () => {
  const S = loadStatic();
  it('creates a sane 2026 world', () => {
    const w = createWorld(S, { seed: 1 });
    expect(w.countries.length).toBe(S.countries.length);
    for (const c of w.countries) { expect(Number.isFinite(c.gdp)).toBe(true); expect(Number.isFinite(c.debt)).toBe(true); expect(c.stability).toBeGreaterThanOrEqual(0); }
    const usa = w.countries.find(c => c.code === 'USA')!;
    expect(usa.gdp).toBeGreaterThan(1.5e7);
    expect(w.divisions.length).toBeGreaterThan(800);
  });
  it('runs three years of peace without blowing up', () => {
    const w = createWorld(S, { seed: 2 });
    const t0 = Date.now();
    for (let d = 0; d < 365 * 3; d++) stepDay(w, S);
    const ms = Date.now() - t0;
    const top = ['USA', 'CHN', 'IND', 'DEU', 'RUS', 'BRA', 'NGA'].map(code => w.countries.find(c => c.code === code)!);
    console.log(dateStr(w), `${ms}ms`, top.map(c => `${c.code} gdp ${(c.gdp / 1e6).toFixed(2)}T g ${(c.growth * 100).toFixed(1)}% stab ${c.stability.toFixed(2)} debt/gdp ${(c.debt / c.gdp).toFixed(2)} ${c.leader.name}`).join('\n'));
    console.log(w.log.slice(-8).map(l => `${dateStr(w, l.day)} ${l.text}`).join('\n'));
    for (const c of w.countries) { expect(Number.isFinite(c.gdp)).toBe(true); expect(c.gdp).toBeGreaterThan(0); }
  });
});

import { deserialize, serialize } from '../src/game/save';
describe('save', () => {
  it('round-trips a world', () => {
    const S = loadStatic(); const w = createWorld(S, { seed: 3 });
    for (let d = 0; d < 40; d++) stepDay(w, S);
    const w2 = deserialize(serialize(w));
    expect(w2.relations).toBeInstanceOf(Int8Array);
    expect(Array.from(w2.relations)).toEqual(Array.from(w.relations));
    for (let d = 0; d < 60; d++) { stepDay(w, S); stepDay(w2, S); }
    expect(w2.countries.map(c => Math.round(c.gdp))).toEqual(w.countries.map(c => Math.round(c.gdp)));
  });
});
