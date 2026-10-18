import { CULTURE_OF, LEADER_TRAITS, NAMES } from './data';
import { nextRand, pick } from './rng';
import type { General, World } from './types';

export function personName(w: World, code: string): string {
  const [first, last] = NAMES[CULTURE_OF[code] || 'african'] || NAMES.anglo;
  return `${pick(w, first)} ${pick(w, last)}`;
}
export function leaderTraits(w: World, n = 2): string[] {
  const out: string[] = []; while (out.length < n) { const t = pick(w, LEADER_TRAITS); if (!out.includes(t)) out.push(t); } return out;
}
const GEN_TRAITS = ['Bold', 'Cautious', 'Defensive Genius', 'Armor Pioneer', 'Beloved by the Troops', 'Logistician', 'Mountain Expert', 'Urban Fighter', 'Politically Ambitious', 'Reckless', 'Old Guard', 'Rising Star'];
export function makeGeneral(w: World, code: string): General {
  const traits: string[] = []; const n = nextRand(w) < 0.5 ? 1 : 2; while (traits.length < n) { const t = pick(w, GEN_TRAITS); if (!traits.includes(t)) traits.push(t); }
  return { name: personName(w, code), skill: 1 + Math.floor(nextRand(w) * 4), traits, born: 1960 + Math.floor(nextRand(w) * 20) };
}
export const UNIT_NAMES: Record<string, string> = { infantry: 'Infantry Division', armor: 'Armored Division', mechanized: 'Mechanized Division', marines: 'Marine Division', airborne: 'Airborne Division' };
export function ordinal(n: number) { const s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); }
