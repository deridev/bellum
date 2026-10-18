// World crises: every few years something shakes everyone at once (a recession, an oil shock, a pandemic, a revolutionary wave).
// Each nation chooses how to meet it; the choice trades a cost now against how hard the crisis bites while it lasts.
import type { Country, MapStatic, World } from './types';
import { msg } from './types';
import { clamp01, say } from './world';
import { nextRand } from './rng';

type Id = 'recession' | 'oil' | 'pandemic' | 'revolution';
interface Def { months: number; growth: number; bite: [number, number]; apply: [(w: World, c: Country) => void, (w: World, c: Country) => void]; ai: (c: Country) => 0 | 1; who?: (c: Country) => boolean }
/** growth: the yearly hit to every economy; bite: how much of it each choice lets through; apply: each choice's cost now */
export const CRISES: Record<Id, Def> = {
  recession: { months: 18, growth: -0.03, bite: [0.5, 1], ai: c => c.debt / Math.max(1, c.gdp) < 1 ? 0 : 1,
    apply: [(w, c) => { c.debt += c.gdp * 0.04; }, (w, c) => { c.stability = clamp01(c.stability - 0.04); }] },
  oil: { months: 12, growth: -0.02, bite: [1, 0.5], ai: c => c.stability > 0.5 ? 1 : 0,
    apply: [(w, c) => { c.stability = clamp01(c.stability + 0.02); c.treasury = Math.max(0, c.treasury - c.income * 0.5); }, (w, c) => { c.stability = clamp01(c.stability - 0.05); }] },
  pandemic: { months: 12, growth: -0.04, bite: [1.3, 0.7], ai: c => c.stability > 0.5 ? 1 : 0,
    apply: [(w, c) => { c.stability = clamp01(c.stability + 0.02); c.manpower *= 0.95; }, (w, c) => { c.stability = clamp01(c.stability - 0.06); c.manpower *= 0.85; }] },
  revolution: { months: 12, growth: 0, bite: [1, 1], ai: () => 0, who: c => c.gov !== 'democracy' && c.stability < 0.6,
    apply: [(w, c) => { c.stability = clamp01(c.stability + 0.04); c.polCap = Math.max(0, c.polCap - 10); }, (w, c) => { c.stability = clamp01(c.stability - 0.02); c.polCap = Math.max(0, c.polCap - 30); c.ideology = [c.ideology[0], Math.max(-1, c.ideology[1] - 0.15)]; /* reform: less authority */ }] },
};
const IDS = Object.keys(CRISES) as Id[];
/** this year's hit to a nation's growth from the crisis under way (0 if none, or it is spared) */
export function crisisGrowth(w: World, c: Country) {
  const k = w.crisis; if (!k || w.day > k.until) return 0;
  const d = CRISES[k.id as Id], ch = k.choice[c.id]; if (d.who && !d.who(c)) return 0;
  return d.growth * d.bite[ch ?? 0];
}
/** a nation's answer to the crisis: its cost now, and how hard the crisis bites it from here on */
export function chooseCrisis(w: World, c: Country, option: 0 | 1) {
  const k = w.crisis; if (!k || k.choice[c.id] !== undefined) return;
  k.choice[c.id] = option; CRISES[k.id as Id].apply[option](w, c);
}
export function startCrisis(w: World, id: Id) {
  const d = CRISES[id];
  w.crisis = { id, start: w.day, until: w.day + d.months * 30, choice: {} };
  say(w, msg('log.crisis.' + id), 'event', { who: w.countries.filter(c => c.alive).map(c => c.id), big: 'big.crisis' });
  for (const c of w.countries) {
    if (!c.alive || (d.who && !d.who(c))) continue;
    if (!c.player) { chooseCrisis(w, c, d.ai(c)); continue; }
    w.agenda.push({ id: w.nextId++, country: c.id, day: w.day, kind: 'crisis', title: msg(`crisis.${id}.title`), text: msg(`crisis.${id}.text`), expires: w.day + 60, data: { crisis: id },
      options: [0, 1].map(i => ({ label: msg(`crisis.${id}.o${i}`), effect: 'crisis.choose', hint: msg(`crisis.${id}.h${i}`) })) });
  }
}
/** Monthly: a crisis under way runs out; otherwise, every three years at most, a new one may break (1918 brings the influenza). */
export function monthlyCrises(w: World, S: MapStatic) {
  const k = w.crisis;
  if (k) {
    for (const c of w.countries) if (c.player && c.alive && k.choice[c.id] === undefined && !w.agenda.some(a => a.kind === 'crisis' && a.country === c.id)) chooseCrisis(w, c, 0); // an unanswered crisis is met the first way
    if (w.day > k.until) { say(w, msg('log.crisisEnds', { m: { m: msg(`crisis.${k.id}.title`) } }), 'event'); w.crisis = undefined; w.cooldowns.crisis = w.day + 365 * 3; }
    return;
  }
  const year = new Date(w.startDate + w.day * 864e5).getUTCFullYear(), month = new Date(w.startDate + w.day * 864e5).getUTCMonth();
  if (w.scenario === '1914' && year === 1918 && month === 9 && !w.cooldowns.flu) { w.cooldowns.flu = 1; startCrisis(w, 'pandemic'); return; }
  if (w.day < 365 || (w.cooldowns.crisis ?? -1) > w.day || w.scenario !== '2026') return;
  if (nextRand(w) < 1 / 48) startCrisis(w, IDS[Math.floor(nextRand(w) * IDS.length)]);
  void S;
}
