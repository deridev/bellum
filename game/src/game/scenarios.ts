// Scenarios: who owns each province at the start, and the countries that exist then.
// The present day comes from the base map; historical ones from data/scenario-<year>.json.
import { dataUrl } from '../data/load';
import type { CountryData, MapAssets, ProvinceData } from '../data/types';
import { eraProvinces } from '../sim/history';
import type { MapStatic } from '../sim/types';

export type ScenarioId = '2026' | '1939' | '1914';
export const SCENARIOS: { id: ScenarioId; start: string }[] = [{ id: '2026', start: '2026-01-01' }, { id: '1939', start: '1939-09-01' }, { id: '1914', start: '1914-07-28' }];

/** The file format written by tools/mapgen/history.mjs. */
export interface ScenarioFile { id: string; start: string; countries: { code: string; name: string; color: string; capital: number; flag?: string; modern?: string }[]; owner: number[] }
export interface Scenario { id: ScenarioId; startDate: number; countries: CountryData[]; owner: Int32Array; flagOf: Record<string, string>; era?: ProvinceData[] }

const cache = new Map<ScenarioId, Scenario>();
export async function loadScenario(A: MapAssets, id: ScenarioId): Promise<Scenario> {
  const hit = cache.get(id); if (hit) return hit;
  const start = Date.parse(SCENARIOS.find(s => s.id === id)!.start + 'T00:00:00Z');
  let sc: Scenario;
  if (id === '2026') sc = presentDay(A);
  else {
    const r = await fetch(dataUrl(`scenario-${id}.json`)); if (!r.ok) throw new Error(`Scenario ${id} is not available (${r.status})`);
    sc = fromFile(A.provinces, A.countries, await r.json(), id, start);
  }
  cache.set(id, sc); return sc;
}

/** A historical scenario from its file: period economics, countries with their totals. */
export function fromFile(provinces: ProvinceData[], modernCountries: CountryData[], f: ScenarioFile, id: '1914' | '1939', start: number): Scenario {
  const modern = new Map(modernCountries.map(c => [c.code, c]));
  const era = eraProvinces(provinces, id, provinces.map(p => p.country));
  const pop = new Float64Array(f.countries.length), gdp = new Float64Array(f.countries.length);
  f.owner.forEach((o, p) => { if (o >= 0) { pop[o] += era[p].pop; gdp[o] += era[p].gdp; } });
  return {
    id, startDate: start, owner: Int32Array.from(f.owner), flagOf: Object.fromEntries(f.countries.map(c => [c.code, c.flag || c.code])), era,
    countries: f.countries.map((c, i) => {
      const m = c.modern ? modern.get(c.modern) : undefined;
      return { code: c.code, name: c.name, iso2: m && m.name === c.name ? m.iso2 : '', pop: pop[i], gdp: gdp[i], capital: c.capital, capitalName: provinces[c.capital]?.name || '', color: c.color };
    }),
  };
}
export function presentDay(A: MapAssets): Scenario {
  const idx: Record<string, number> = {}; A.countries.forEach((c, i) => (idx[c.code] = i));
  return { id: '2026', startDate: Date.UTC(2026, 0, 1), countries: A.countries, owner: Int32Array.from(A.provinces, p => idx[p.country]), flagOf: {} };
}
/** The static data the simulation reads, with province ownership from the scenario. */
export function staticFor(A: MapAssets, sc: Scenario): MapStatic {
  return withScenario({ provinces: A.provinces, countries: A.countries, cities: A.cities, dem: A.demData, demW: A.dem.width, demH: A.dem.height, provRaster: A.provRaster }, sc);
}
export function withScenario(base: MapStatic, sc: Scenario): MapStatic {
  const src = sc.era || base.provinces; // historical scenarios carry period population and output
  const provinces = src.map((p, i) => sc.owner[i] >= 0 && sc.countries[sc.owner[i]].code !== p.country ? { ...p, country: sc.countries[sc.owner[i]].code } : p);
  return { ...base, provinces, countries: sc.countries };
}
