// 2026 scenario specifics: ongoing conflicts and claims.
import { msg } from './types';
import { setupHistory, TABLES_1914, TABLES_1939 } from './history';
import { TABLES_2026 } from './data';
/** World-building tables for a scenario. */
export const tablesFor = (id: string) => id === '1914' ? TABLES_1914 : id === '1939' ? TABLES_1939 : TABLES_2026;
import type { MapStatic, World } from './types';
import { declareWar, theatersOf } from './war/war';
import { cellLonLat, deployAlongFront } from './war/theater';
import { nextRand } from './rng';

/** Claims: whole-country cores (the claimant regards the land as its own). */
const CLAIMS: [string, string][] = [['CHN', 'TWN'], ['KOR', 'PRK'], ['PRK', 'KOR'], ['RUS', 'UKR'], ['SRB', 'KOS'], ['MAR', 'SAH'], ['SOM', 'SOL'], ['CYP', 'CYN']];
/** Approximate line of contact in Ukraine, late 2025 (north to south). East of it is held by Russia. */
const UKR_LINE: [number, number][] = [[36.9, 50.35], [37.61, 49.71], [37.81, 48.99], [38.1, 48.87], [37.84, 48.59], [37.85, 48.4], [37.18, 48.28], [37.28, 47.98], [36.82, 47.85], [36.26, 47.66], [35.79, 47.57], [35.4, 47.46], [35.0, 47.45], [34.4, 47.1], [33.35, 46.75], [32.65, 46.6], [31.9, 46.45]];
function lineLon(lat: number) {
  for (let i = 0; i < UKR_LINE.length - 1; i++) { const [x0, y0] = UKR_LINE[i], [x1, y1] = UKR_LINE[i + 1]; if (lat <= y0 && lat >= y1) return x0 + (x1 - x0) * (y0 - lat) / ((y0 - y1) || 1); }
  return NaN;
}
export function setupScenario(w: World, S: MapStatic) {
  if (w.scenario === '1914' || w.scenario === '1939') { setupHistory(w, S); return; }
  const ci: Record<string, number> = {}; w.countries.forEach(c => (ci[c.code] = c.id));
  for (const [a, b] of CLAIMS) if (ci[a] !== undefined && ci[b] !== undefined) for (const p of w.provinces) if (p.owner === ci[b] && !p.core.includes(ci[a])) p.core.push(ci[a]);
  // the Russia–Ukraine war is already under way
  const rus = ci.RUS, ukr = ci.UKR; if (rus === undefined || ukr === undefined) return;
  const war = declareWar(w, S, rus, ukr, { silent: true, name: msg('war.name.rusukr') });
  war.aggr = [1.04, 0.98]; (war as any).lastChange = 0;
  war.commit = { [rus]: 0.6, [ukr]: 0.85 }; // Russia keeps much of its army on its other borders
  for (const t of theatersOf(w, war)) {
    for (let k = 0; k < t.W * t.H; k++) {
      if (!t.land[k]) continue; const p = t.prov[k]; if (w.provinces[p].owner !== ukr) continue;
      const [lon, lat] = cellLonLat(t, k);
      const russian = lat < 46.45 ? lon > 32.4 : lat <= 50.35 && lon > lineLon(lat);
      if (russian) t.c[k] = 1;
    }
    for (let k = 0; k < t.W * t.H; k++) t.ent[k] = 0.6; // a long-entrenched front
    for (const city of t.cities) city.side = t.c[city.k] >= 0 ? 1 : -1;
  }
  // occupied provinces (by majority of cells) are controlled by Russia
  for (const t of theatersOf(w, war)) {
    const cnt = new Map<number, [number, number]>();
    for (let k = 0; k < t.W * t.H; k++) { if (!t.land[k]) continue; const p = t.prov[k]; let e = cnt.get(p); if (!e) cnt.set(p, e = [0, 0]); e[t.c[k] > 0 ? 0 : 1]++; }
    for (const [p, [a, b]] of cnt) if (w.provinces[p].owner === ukr && a > b) w.provinces[p].controller = rus;
  }
  // most of both armies are already at the front
  const t0 = theatersOf(w, war)[0];
  if (t0) {
    // each side starts with the share of its army the war AI would commit (attacker 60%, defender 85%); the rest is in reserve
    const mine = w.divisions.filter(d => (d.country === rus && nextRand(w) < 0.6) || (d.country === ukr && nextRand(w) < 0.85));
    deployAlongFront(w, t0, mine, () => nextRand(w));
    for (const d of w.divisions) if ((d.country === rus || d.country === ukr) && d.theater === t0.id && !mine.includes(d)) d.theater = -1;
  }
}
