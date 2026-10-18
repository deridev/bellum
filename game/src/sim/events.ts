// Systemic story events: they fire from the state of the world, never at random alone, and offer a choice.
// The player gets an agenda card; AI countries pick for themselves.
import { atWar, popOf } from './economy';
import { neighbours } from './ai';
import { nextRand } from './rng';
import type { AgendaItem, Country, MapStatic, MsgArg, World } from './types';
import { msg } from './types';
import { addRel, clamp01, rel, say } from './world';
import { enemies, sideOf, warsOf } from './war/war';

interface Ctx { w: World; c: Country; other: number }
interface EventDef {
  id: string; chance: number; cooldown: number; // monthly chance once the condition holds; days before it can repeat
  when: (x: Ctx, nb: Set<number>) => number | boolean; // true, or the id of the other country involved
  options: ((x: Ctx) => void)[]; // option 0 is what the AI usually picks
  aiPick?: (x: Ctx) => number;
}
const group = (c: Country, id: string) => c.groups.find(g => g.id === id)!;
const shift = (c: Country, k: keyof Country['budget'], d: number) => { const v = Math.max(0.02, Math.min(0.8, c.budget[k] + d)); const others = (Object.keys(c.budget) as (keyof Country['budget'])[]).filter(x => x !== k); const rest = others.reduce((a, x) => a + c.budget[x], 0) || 1; c.budget[k] = v; for (const x of others) c.budget[x] = c.budget[x] / rest * (1 - v); };

export const EVENTS: EventDef[] = [
  { id: 'protests', chance: 0.25, cooldown: 365, when: ({ c }) => c.stability < 0.35,
    options: [({ c }) => { shift(c, 'welfare', 0.05); c.stability = clamp01(c.stability + 0.06); c.polCap = Math.max(0, c.polCap - 20); },
      ({ w, c }) => { c.stability = clamp01(c.stability + 0.03); group(c, 'labor').support = clamp01(group(c, 'labor').support - 0.12); if (c.gov === 'democracy') for (const k of w.countries) if (k.alive && k.gov === 'democracy' && k.id !== c.id) addRel(w, k.id, c.id, -5, false); }],
    aiPick: ({ c }) => c.gov === 'democracy' ? 0 : 1 },
  { id: 'debtCrisis', chance: 0.2, cooldown: 720, when: ({ c }) => c.debt / Math.max(1, c.gdp) > 1.6,
    options: [({ c }) => { c.deficit = 0; shift(c, 'welfare', -0.05); c.stability = clamp01(c.stability - 0.05); },
      ({ w, c }) => { c.debt *= 0.8; c.stability = clamp01(c.stability - 0.03); for (const p of w.provinces) if (p.owner === c.id) p.gdp *= 0.97; }] },
  { id: 'borderIncident', chance: 0.06, cooldown: 365, when: ({ w, c }, nb) => [...nb].find(n => rel(w, c.id, n) < -60 && !enemies(w, c.id, n)) ?? false,
    options: [({ w, c, other }) => { addRel(w, c.id, other, -10); c.warSupport = clamp01(c.warSupport + 0.08); },
      ({ c }) => { c.stability = clamp01(c.stability - 0.02); c.polCap += 10; }] },
  { id: 'scandal', chance: 0.05, cooldown: 540, when: ({ c }) => c.leader.traits.includes('Corrupt') || c.stability < 0.5,
    options: [({ c }) => { c.polCap = Math.max(0, c.polCap - 25); c.stability = clamp01(c.stability + 0.02); }, ({ c }) => { c.stability = clamp01(c.stability - 0.05); }] },
  { id: 'boom', chance: 0.1, cooldown: 720, when: ({ c }) => c.growth > 0.03,
    options: [({ w, c }) => { for (const p of w.provinces) if (p.owner === c.id) p.gdp *= 1.02; c.treasury = Math.max(0, c.treasury - c.income); }, ({ c }) => { c.treasury += c.income * 2; }] },
  { id: 'warWeariness', chance: 0.3, cooldown: 240, when: ({ w, c }) => atWar(w, c.id) && c.warSupport < 0.25,
    options: [({ c }) => { c.polCap = Math.max(0, c.polCap - 30); c.warSupport = clamp01(c.warSupport + 0.1); },
      ({ w, c }) => { c.stability = clamp01(c.stability + 0.03); for (const war of warsOf(w, c.id)) war.exhaustion[sideOf(war, c.id) > 0 ? 0 : 1] += 0.1; }] },
  { id: 'warHero', chance: 0.15, cooldown: 365, when: ({ w, c }) => warsOf(w, c.id).some(war => war.score * sideOf(war, c.id) > 30),
    options: [({ c }) => { c.stability = clamp01(c.stability + 0.03); group(c, 'military').support = clamp01(group(c, 'military').support + 0.1); c.warSupport = clamp01(c.warSupport + 0.05); },
      ({ c }) => { c.polCap += 15; }] },
  { id: 'refugees', chance: 0.15, cooldown: 365, when: ({ w, c }, nb) => [...nb].find(n => warsOf(w, n).some(war => war.score * sideOf(war, n) < -30) && !enemies(w, c.id, n)) ?? false,
    options: [({ w, c, other }) => { addRel(w, other, c.id, 15, false); c.stability = clamp01(c.stability - 0.02); group(c, 'labor').support = clamp01(group(c, 'labor').support - 0.04); },
      ({ w, c, other }) => { addRel(w, other, c.id, -10, false); group(c, 'rural').support = clamp01(group(c, 'rural').support + 0.04); }] },
  { id: 'disaster', chance: 0.012, cooldown: 1095, when: () => true,
    options: [({ c }) => { c.treasury = Math.max(0, c.treasury - c.income); c.stability = clamp01(c.stability + 0.03); }, ({ c }) => { c.stability = clamp01(c.stability - 0.05); }],
    aiPick: ({ c }) => c.treasury > c.income ? 0 : 1 },
];

export function monthlyEvents(w: World, S: MapStatic) {
  const nb = neighbours(w, S);
  for (const c of w.countries) {
    if (!c.alive || popOf(w, c.id) < 3e5) continue;
    if (c.player && w.agenda.some(a => a.kind === 'event' && a.country === c.id)) continue; // one at a time for the player
    for (const e of EVENTS) {
      const key = `ev:${c.id}:${e.id}`; if ((w.cooldowns[key] ?? -1) > w.day) continue;
      const hit = e.when({ w, c, other: -1 }, nb[c.id]); if (hit === false) continue;
      if (nextRand(w) > e.chance) continue;
      const other = typeof hit === 'number' ? hit : -1, x: Ctx = { w, c, other };
      w.cooldowns[key] = w.day + e.cooldown;
      if (c.player) {
        const a: Record<string, MsgArg> = { c: { c: c.id } }; if (other >= 0) a.o = { c: other };
        const item: AgendaItem = { id: w.nextId++, country: c.id, day: w.day, kind: 'event', title: msg(`ev.${e.id}.title`, a), text: msg(`ev.${e.id}.text`, a),
          options: e.options.map((_, i) => ({ label: msg(`ev.${e.id}.o${i}`, a), effect: `event.${e.id}`, hint: msg(`ev.${e.id}.h${i}`, a) })), data: { other }, expires: w.day + 45 };
        w.agenda.push(item);
      } else e.options[e.aiPick ? e.aiPick(x) : 0](x);
      if (e.id === 'protests' || e.id === 'disaster') say(w, msg(`log.ev.${e.id}`, { c: { c: c.id } }), 'event', { who: [c.id] });
      break; // at most one event per country per month
    }
  }
}
/** The player's choice on an event card. */
export function applyEvent(w: World, item: AgendaItem, option: number) {
  const e = EVENTS.find(e => item.options[0]?.effect === `event.${e.id}`); if (!e) return;
  e.options[option]?.({ w, c: w.countries[item.country], other: item.data?.other ?? -1 });
}
