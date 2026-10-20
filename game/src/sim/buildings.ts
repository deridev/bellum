// Province buildings: barracks raise the army, a fort holds the line, a factory adds to the province's output.
// Forts and factories have three levels; a level is paid for when it is started and stands when finished.
import type { Building, Country, MapStatic, Province, World } from './types';
import { msg } from './types';
import { say } from './world';
import { atWar } from './economy';
import { nextRand } from './rng';

export const BUILDINGS: Building[] = ['barracks', 'fort', 'factory'];
export const MAX_LEVEL = 3;
/** Barracks either stand or don't; forts and factories have three levels */
export const maxLevel = (b: Building) => b === 'barracks' ? 1 : MAX_LEVEL;
export const levelOf = (p: Province, b: Building) => p.bld?.[b] ?? 0;
/** What each level does */
export const FORT_DEF = 0.6; // added to the defender's edge in the province, per level
export const FACTORY_OUT = 0.12; // the province's output, per level
/** The next level's price (US$ millions) and building time (days), in months of the nation's revenue: building competes for the treasury.
 *  A factory's price follows the province's output, so it pays where the output is. */
export function buildCost(c: Country, p: Province, b: Building) {
  const L = levelOf(p, b) + 1, month = Math.max(c.income, c.unitCost * 10);
  if (b === 'factory') return { cost: Math.max(month * 0.3, p.gdp * 0.1) * L, days: 120 + 30 * L };
  if (b === 'fort') return { cost: month * 0.3 * L, days: 45 + 30 * L };
  return { cost: month * 0.25, days: 60 };
}
export const building = (w: World, prov: number, b?: Building) => (w.projects ?? []).find(x => x.prov === prov && (!b || x.b === b));
/** Why a level can't be built now (a message key), or null. */
export function canBuild(w: World, c: Country, p: Province, b: Building): string | null {
  if (p.owner !== c.id || p.controller !== c.id) return 'bld.notOurs';
  if (levelOf(p, b) >= maxLevel(b)) return 'bld.max';
  if (building(w, p.id)) return 'bld.busy'; // one work at a time in a province
  if (c.treasury < buildCost(c, p, b).cost) return 'bld.money';
  return null;
}
export function startBuild(w: World, c: Country, p: Province, b: Building): string | null {
  const err = canBuild(w, c, p, b); if (err) return err;
  const { cost, days } = buildCost(c, p, b);
  c.treasury -= cost;
  (w.projects ??= []).push({ id: w.nextId++, c: c.id, prov: p.id, b, start: w.day, done: w.day + days });
  return null;
}
/** Daily: finished buildings stand; work on land the builder lost stops. */
export function dailyBuildings(w: World) {
  if (!w.projects?.length) return;
  for (const x of [...w.projects]) {
    const p = w.provinces[x.prov];
    if (p.owner !== x.c || p.controller !== x.c) { w.projects = w.projects.filter(y => y !== x); continue; }
    if (w.day < x.done) continue;
    w.projects = w.projects.filter(y => y !== x);
    (p.bld ??= {})[x.b] = levelOf(p, x.b) + 1;
    if (w.countries[x.c].player) say(w, msg('log.built', { b: { m: msg('bld.' + x.b) }, n: levelOf(p, x.b), p: { p: p.id } }), 'player', { who: [x.c], prov: p.id });
  }
}
/** Where a nation raises troops: its best barracks (the capital's first). */
export function bestBarracks(w: World, c: Country) {
  let best = -1, bl = 0;
  for (const p of w.provinces) { if (p.owner !== c.id || p.controller !== c.id) continue; const l = levelOf(p, 'barracks'); if (l > bl || (l === bl && l > 0 && p.id === c.capital)) { bl = l; best = p.id; } }
  return best;
}
/** Every nation starts with barracks in its capital. */
export function setupBuildings(w: World) {
  for (const c of w.countries) { const p = w.provinces[c.capital]; if (c.alive && p) (p.bld ??= {}).barracks = Math.max(1, levelOf(p, 'barracks')); }
}
/** Monthly: an AI with money to spare builds — forts on a threatened border, else factories, and barracks near its borders now and then. */
export function monthlyAIBuild(w: World, S: MapStatic, nb: Set<number>[]) {
  for (const c of w.countries) {
    if (!c.alive || c.player || c.treasury < c.income * 1.2 || nextRand(w) > 0.35) continue;
    const mine = w.provinces.filter(p => p.owner === c.id && p.controller === c.id && !building(w, p.id));
    if (!mine.length) continue;
    const hostile = (n: number) => w.countries[n]?.alive && (atWar(w, c.id) || (w.relations[c.id * w.countries.length + n] ?? 0) < -40);
    const border = mine.filter(p => S.provinces[p.id].nbr.some(n => { const o = w.provinces[n].owner; return o !== c.id && hostile(o); }));
    const r = nextRand(w);
    let pick: Province | undefined, b: Building = 'factory';
    if (border.length && r < 0.5) { b = 'fort'; pick = border.filter(p => levelOf(p, 'fort') < maxLevel('fort')).sort((x, y) => y.gdp - x.gdp)[0]; }
    else if (r < 0.6) { b = 'barracks'; const cands = (border.length ? border : mine).filter(p => !levelOf(p, 'barracks')); pick = cands.sort((x, y) => y.pop - x.pop)[0]; }
    else { pick = mine.filter(p => levelOf(p, 'factory') < maxLevel('factory')).sort((x, y) => y.gdp - x.gdp)[0]; }
    if (pick && c.treasury - buildCost(c, pick, b).cost > c.income * 0.3) startBuild(w, c, pick, b);
  }
}
