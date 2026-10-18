// How a game ends. The player wins by domination (a quarter of the world's output), by winning the scenario's great war,
// or by leading the world in power at the end date; loses when the nation is gone. After the end the player may play on.
import type { MapStatic, World } from './types';
import { msg } from './types';
import { say } from './world';
import { power } from './diplomacy';
import { sideOf } from './war/war';

export const DOMINATION = 0.25;
/** The end date of each scenario: 20 years for the present day, 12 for the historical ones. */
export const endDay = (w: World) => Math.round((Date.UTC(new Date(w.startDate).getUTCFullYear() + (w.scenario === '2026' ? 20 : 12), 0, 1) - w.startDate) / 864e5);
/** share of the world's output from the land a country owns */
export function outputShare(w: World, c: number) { let mine = 0, all = 0; for (const p of w.provinces) { all += p.gdp; if (p.owner === c) mine += p.gdp; } return mine / Math.max(1, all); }
/** Power: half economy, a third army (technology and equipment counted), a fifth people — as shares of the world. */
export function powerScores(w: World): { c: number; v: number }[] {
  const n = w.countries.length, gdp = new Float64Array(n), pop = new Float64Array(n);
  for (const p of w.provinces) { gdp[p.owner] += p.gdp; pop[p.owner] += p.pop; }
  const arm = w.countries.map(c => c.alive ? power(w, c.id) : 0), sum = (a: ArrayLike<number>) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i]; return s || 1; };
  const G = sum(gdp), P = sum(pop), A = sum(arm);
  return w.countries.filter(c => c.alive).map(c => ({ c: c.id, v: 0.5 * gdp[c.id] / G + 0.3 * arm[c.id] / A + 0.2 * pop[c.id] / P })).sort((a, b) => b.v - a.v);
}
/** the scenario's great war (1914, 1939), whose outcome is a goal */
export const goalWar = (w: World) => w.goalWar !== undefined ? w.wars.find(x => x.id === w.goalWar) : undefined;

/** Monthly (and on the player's fall): has the game reached an end? Sets w.outcome once; playing on keeps it. */
export function checkOutcome(w: World, S: MapStatic) {
  if (w.outcome) return;
  const me = w.countries.find(c => c.player); if (!me) return;
  const end = (kind: 'victory' | 'defeat' | 'end', reason: string, rank?: number) => {
    w.outcome = { kind, reason, day: w.day, rank };
    say(w, msg('log.outcome.' + reason, { c: { c: me.id }, n: rank ?? 0 }), 'player', { who: [me.id], big: 'big.' + kind });
  };
  if (!me.alive) return end('defeat', 'annexed');
  if (outputShare(w, me.id) >= DOMINATION) return end('victory', 'domination');
  const gw = goalWar(w);
  if (gw?.ended && sideOf(gw, me.id) && gw.winner) return end(gw.winner === sideOf(gw, me.id) ? 'victory' : 'defeat', gw.winner === sideOf(gw, me.id) ? 'greatWarWon' : 'greatWarLost');
  if (w.day >= endDay(w)) { const rank = powerScores(w).findIndex(x => x.c === me.id) + 1; return end(rank === 1 ? 'victory' : 'end', rank === 1 ? 'firstPower' : 'endDate', rank); }
  void S;
}
/** Daily: the player's fall ends the game at once (the rest is checked monthly). */
export function dailyOutcome(w: World, S: MapStatic) { if (!w.outcome && w.countries.some(c => c.player && !c.alive)) checkOutcome(w, S); }
