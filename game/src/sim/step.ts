import { dailyProduction, monthlyEconomy } from './economy';
import { monthlyPolitics } from './politics';
import type { MapStatic, World } from './types';
import { isMonthStart } from './types';

/** Systems that plug into the daily step (war, AI, diplomacy register here). */
export const hooks: { daily: ((w: World, S: MapStatic) => void)[]; monthly: ((w: World, S: MapStatic) => void)[] } = { daily: [], monthly: [] };

/** Advance the world by one day. */
export function stepDay(w: World, S: MapStatic) {
  w.day++;
  dailyProduction(w, S);
  for (const f of hooks.daily) f(w, S);
  if (isMonthStart(w)) {
    monthlyEconomy(w, S);
    monthlyPolitics(w);
    for (const f of hooks.monthly) f(w, S);
  }
}
