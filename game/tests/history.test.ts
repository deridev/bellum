import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// Historical scenario data built by tools/mapgen/history.mjs
const D = path.resolve(__dirname, '../public/data');
const j = (f: string) => JSON.parse(fs.readFileSync(path.join(D, f), 'utf8'));
const provinces: { id: number; pop: number }[] = j('provinces.json');
const cities: { name: string; prov: number }[] = j('cities.json');
const flags: Record<string, [number, number]> = j('flags.json').index;
type Scenario = { id: string; start: string; countries: { code: string; name: string; color: string; capital: number; flag: string; modern?: string }[]; owner: number[] };

const CHECKS: Record<string, Record<string, string>> = {
  1914: { Vienna: 'AUH', Prague: 'AUH', Sarajevo: 'AUH', Lviv: 'AUH', Berlin: 'GER', Windhoek: 'GER', 'Dar es Salaam': 'GER', Warsaw: 'RUS', Moscow: 'RUS', Helsinki: 'RUS', Riga: 'RUS',
    Istanbul: 'OTT', Baghdad: 'OTT', Damascus: 'OTT', Jerusalem: 'OTT', Belgrade: 'SRB', Algiers: 'FRA', Hanoi: 'FRA', Delhi: 'GBR', Cairo: 'GBR', Dublin: 'GBR', Tripoli: 'ITA',
    Seoul: 'JPN', Taipei: 'JPN', Beijing: 'CHN', Jakarta: 'NLD', Manila: 'USA', 'Addis Ababa': 'ETH', Ottawa: 'CAN', Pretoria: 'ZAF', Tehran: 'IRN', Lhasa: 'TIB' },
  1939: { Prague: 'GER', Vienna: 'GER', Berlin: 'GER', Warsaw: 'POL', Lviv: 'POL', Bratislava: 'SVK', Budapest: 'HUN', Tirana: 'ITA', 'Addis Ababa': 'ITA', Tripoli: 'ITA',
    Moscow: 'SOV', Helsinki: 'FIN', Riga: 'LVA', Algiers: 'FRA', Damascus: 'FRA', Hanoi: 'FRA', Delhi: 'GBR', Jerusalem: 'GBR', 'Dar es Salaam': 'GBR', Dublin: 'IRL', Cairo: 'EGY',
    Baghdad: 'IRQ', Istanbul: 'TUR', Belgrade: 'YUG', Seoul: 'JPN', Taipei: 'JPN', Shanghai: 'JPN', Beijing: 'JPN', Changchun: 'MAN', Chongqing: 'CHN', Windhoek: 'ZAF' },
};

for (const id of ['1914', '1939']) describe(`scenario ${id}`, () => {
  const S: Scenario = j(`scenario-${id}.json`);
  const count = S.countries.map(() => 0), pop = S.countries.map(() => 0);
  S.owner.forEach((o, p) => { if (o >= 0) { count[o]++; pop[o] += provinces[p].pop; } });
  const top = (v: number[]) => S.countries.map((c, i) => [c.code, v[i]] as const).sort((a, b) => b[1] - a[1]).slice(0, 15).map(([c, n]) => `${c} ${n}`).join(', ');
  const unowned = S.owner.filter(o => o < 0).length;
  console.log(`[${id}] ${S.countries.length} countries, ${unowned} unowned provinces\n  by provinces: ${top(count)}\n  by population: ${top(pop.map(p => Math.round(p / 1e6)))} (millions, modern figures)`);

  it('is well formed', () => {
    expect(S.id).toBe(id);
    expect(S.start).toMatch(/^\d{4}-\d\d-\d\d$/);
    expect(S.owner.length).toBe(provinces.length);
    expect(S.countries.length).toBeGreaterThanOrEqual(50);
    expect(S.countries.length).toBeLessThanOrEqual(70);
    expect(new Set(S.countries.map(c => c.code)).size).toBe(S.countries.length);
    expect(unowned).toBe(0);
    S.countries.forEach((c, i) => {
      expect(c.code).toMatch(/^[A-Z]{3}$/);
      expect(c.color).toMatch(/^#[0-9a-f]{6}$/);
      expect(flags[c.flag], `flag ${c.flag}`).toBeDefined();
      expect(count[i], `${c.code} owns provinces`).toBeGreaterThan(0);
      expect(S.owner[c.capital], `${c.code} owns its capital`).toBe(i);
    });
  });
  it('puts known cities in the right country', () => {
    for (const [city, code] of Object.entries(CHECKS[id])) {
      const c = cities.find(c => c.name === city)!;
      expect(c, city).toBeDefined();
      expect(S.countries[S.owner[c.prov]]?.code, city).toBe(code);
    }
  });
});
