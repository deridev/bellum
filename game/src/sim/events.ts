// Systemic story events: they fire from the state of the world, never at random alone, and offer a choice.
// The player gets an agenda card; AI countries pick for themselves.
import { atWar, popOf } from './economy';
import { neighbours } from './ai';
import { nextRand } from './rng';
import type { AgendaItem, Country, MapStatic, MsgArg, World } from './types';
import { msg } from './types';
import { addRel, clamp01, rel, say } from './world';
import { allied, enemies, sideOf, warsOf } from './war/war';
import { hasTreaty, power } from './diplomacy';
import { researchNeed } from './policies';

interface Ctx { w: World; c: Country; other: number; pw?: number[] }
interface EventDef {
  id: string; chance: number; cooldown: number; // monthly chance once the condition holds; days before it can repeat
  when: (x: Ctx, nb: Set<number>) => number | boolean; // true, or the id of the other country involved
  options: ((x: Ctx) => void)[]; // option 0 is what the AI usually picks
  aiPick?: (x: Ctx) => number;
  peace?: boolean; // only at peace
  era?: 'modern' | 'hist'; // only in the present day, or only in the historical scenarios
  then?: (string | undefined)[]; // per option: an event it leads to, a few months later
  chain?: boolean; // only ever comes as the consequence of an earlier choice
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
  // ---- the everyday business of government: each asks for a choice with a cost either way
  { id: 'election', then: ['promisesDue'], chance: 1, cooldown: 365 * 3, when: ({ w, c }) => c.gov === 'democracy' && c.nextElection - w.day > 30 && c.nextElection - w.day < 120,
    options: [({ c }) => { shift(c, 'welfare', 0.04); c.deficit = Math.min(0.5, c.deficit + 0.03); c.stability = clamp01(c.stability + 0.06); },
      ({ c }) => { c.polCap += 15; }], aiPick: () => 1 },
  { id: 'strike', then: [undefined, 'riots'], chance: 0.12, cooldown: 450, when: ({ c }) => group(c, 'labor').support < 0.55,
    options: [({ c }) => { shift(c, 'welfare', 0.04); group(c, 'labor').support = clamp01(group(c, 'labor').support + 0.12); group(c, 'industry').support = clamp01(group(c, 'industry').support - 0.06); },
      ({ c }) => { c.stability = clamp01(c.stability - 0.04); group(c, 'labor').support = clamp01(group(c, 'labor').support - 0.1); group(c, 'industry').support = clamp01(group(c, 'industry').support + 0.06); }] },
  { id: 'investment', then: ['firmDemands'], peace: true, chance: 0.07, cooldown: 540, when: ({ w, c }) => w.countries.find(k => k.alive && k.id !== c.id && k.gdp > 2 * c.gdp && rel(w, k.id, c.id) >= 0)?.id ?? false,
    options: [({ w, c, other }) => { for (const p of w.provinces) if (p.owner === c.id) p.gdp *= 1.02; addRel(w, c.id, other, 10); group(c, 'rural').support = clamp01(group(c, 'rural').support - 0.06); },
      ({ c }) => { c.polCap += 10; group(c, 'rural').support = clamp01(group(c, 'rural').support + 0.04); }] },
  { id: 'armsDeal', chance: 0.06, cooldown: 540, when: ({ w, c }) => w.countries.find(k => k.alive && k.id !== c.id && (k.quality ?? 1) > (c.quality ?? 1) + 0.12 && rel(w, k.id, c.id) >= 5)?.id ?? false,
    options: [({ w, c, other }) => { const cost = c.income * 2; c.debt += Math.max(0, cost - c.treasury); c.treasury = Math.max(0, c.treasury - cost); c.quality = Math.min(1.6, (c.quality ?? 1) + 0.06); addRel(w, c.id, other, 6); },
      ({ w, c, other }) => { addRel(w, c.id, other, -5); c.polCap += 10; }], aiPick: ({ w, c }) => atWar(w, c.id) || c.treasury > c.income * 3 ? 0 : 1 },
  { id: 'spyRing', then: [undefined, 'doubleAgent'], chance: 0.05, cooldown: 540, when: ({ w, c, pw = [] }) => w.countries.find(k => k.alive && k.id !== c.id && rel(w, c.id, k.id) < -20 && pw[k.id] > pw[c.id] * 0.3)?.id ?? false,
    options: [({ w, c, other }) => { addRel(w, c.id, other, -12); c.warSupport = clamp01(c.warSupport + 0.05); },
      ({ c }) => { c.polCap += 25; }] },
  { id: 'breakthrough', chance: 0.05, cooldown: 540, when: ({ c }) => c.budget.research >= 0.04,
    options: [({ c }) => { c.treasury = Math.max(0, c.treasury - c.income); c.research += researchNeed(c) * 0.5; },
      ({ c }) => { c.treasury += c.income * 1.5; }], aiPick: ({ c }) => c.treasury > c.income * 2 ? 0 : 1 },
  { id: 'buildup', chance: 0.1, cooldown: 365, when: ({ w, c, pw = [] }, nb) => [...nb].find(n => w.countries[n].alive && rel(w, c.id, n) < -25 && !enemies(w, c.id, n) && pw[n] > pw[c.id] * 0.8) ?? false,
    options: [({ c }) => { shift(c, 'military', 0.05); c.warSupport = clamp01(c.warSupport + 0.06); c.stability = clamp01(c.stability - 0.02); },
      ({ w, c, other }) => { c.polCap = Math.max(0, c.polCap - 15); addRel(w, c.id, other, 8); }] },
  { id: 'separatists', chance: 0.1, cooldown: 540, when: ({ w, c }) => w.provinces.some(p => p.owner === c.id && p.controller === c.id && (p.unrest > 0.25 || p.core.some(k => k !== c.id && !p.core.includes(c.id)))),
    options: [({ w, c }) => { c.polCap = Math.max(0, c.polCap - 20); for (const p of w.provinces) if (p.owner === c.id) p.unrest = Math.max(0, p.unrest - 0.3); c.stability = clamp01(c.stability + 0.02); },
      ({ w, c }) => { c.stability = clamp01(c.stability - 0.03); for (const p of w.provinces) if (p.owner === c.id) p.unrest = Math.max(0, p.unrest - 0.12); for (const k of w.countries) if (k.alive && k.gov === 'democracy' && k.id !== c.id) addRel(w, k.id, c.id, -4, false); }],
    aiPick: ({ c }) => c.gov === 'democracy' ? 0 : 1 },
  { id: 'drought', chance: 0.03, cooldown: 900, when: () => true,
    options: [({ c }) => { c.treasury = Math.max(0, c.treasury - c.income * 0.7); group(c, 'rural').support = clamp01(group(c, 'rural').support + 0.08); },
      ({ c }) => { c.stability = clamp01(c.stability - 0.04); group(c, 'rural').support = clamp01(group(c, 'rural').support - 0.1); }],
    aiPick: ({ c }) => c.treasury > c.income ? 0 : 1 },
  { id: 'summit', peace: true, chance: 0.06, cooldown: 450, when: ({ w, c }) => w.countries.find(k => k.alive && k.id !== c.id && rel(w, c.id, k.id) >= 25 && !allied(w, c.id, k.id))?.id ?? false,
    options: [({ w, c, other }) => { addRel(w, c.id, other, 12); c.polCap = Math.max(0, c.polCap - 10); },
      ({ w, c, other }) => { addRel(w, c.id, other, -4); c.polCap += 5; }] },
  { id: 'tradeDispute', peace: true, chance: 0.05, cooldown: 720, when: ({ w, c }) => w.countries.find(k => k.alive && k.id !== c.id && hasTreaty(w, c.id, k.id, 'trade'))?.id ?? false,
    options: [({ w, c, other }) => { c.treasury = Math.max(0, c.treasury - c.income * 0.5); addRel(w, c.id, other, 5); },
      ({ w, c, other }) => { addRel(w, c.id, other, -15); group(c, 'industry').support = clamp01(group(c, 'industry').support + 0.06); }] },
  { id: 'chaosNext', chance: 0.12, cooldown: 540, when: ({ w, c }, nb) => [...nb].find(n => w.countries[n].alive && w.countries[n].stability < 0.4 && !allied(w, c.id, n)) ?? false,
    options: [({ w, c, other }) => { c.polCap = Math.max(0, c.polCap - 25); const o = w.countries[other]; o.stability = clamp01(o.stability - 0.1); addRel(w, other, c.id, -20); },
      ({ w, c, other }) => { addRel(w, other, c.id, 5); }],
    aiPick: ({ c }) => c.personality === 'expansionist' || c.personality === 'ideologue' ? 0 : 1 },
  { id: 'corruption', chance: 0.05, cooldown: 540, when: () => true,
    options: [({ c }) => { c.polCap = Math.max(0, c.polCap - 15); c.stability = clamp01(c.stability + 0.03); },
      ({ c }) => { c.polCap += 10; c.stability = clamp01(c.stability - 0.03); }] },
  { id: 'megaproject', then: ['overrun'], peace: true, chance: 0.04, cooldown: 720, when: ({ c }) => c.treasury > c.income,
    options: [({ w, c }) => { c.treasury = Math.max(0, c.treasury - c.income * 2); for (const p of w.provinces) if (p.owner === c.id) p.gdp *= 1.015; group(c, 'industry').support = clamp01(group(c, 'industry').support + 0.05); },
      ({ c }) => { group(c, 'industry').support = clamp01(group(c, 'industry').support - 0.05); c.polCap += 5; }], aiPick: ({ c }) => c.treasury > c.income * 4 ? 0 : 1 },
  { id: 'press', chance: 0.05, cooldown: 540, when: ({ c }) => c.stability < 0.75,
    options: [({ w, c }) => { c.stability = clamp01(c.stability + 0.03); for (const k of w.countries) if (k.alive && k.gov === 'democracy' && k.id !== c.id) addRel(w, k.id, c.id, -3, false); },
      ({ c }) => { c.polCap = Math.max(0, c.polCap - 10); }], aiPick: ({ c }) => c.gov === 'democracy' ? 1 : 0 },
  { id: 'games', chance: 0.03, cooldown: 1460, when: ({ w, c }) => c.gdp > 2e5 && !atWar(w, c.id),
    options: [({ c }) => { c.treasury = Math.max(0, c.treasury - c.income * 1.5); c.stability = clamp01(c.stability + 0.05); c.polCap += 15; },
      ({ c }) => { c.polCap += 5; c.stability = clamp01(c.stability - 0.01); }], aiPick: ({ c }) => c.treasury > c.income * 3 ? 0 : 1 },
  // ---- consequences: these come only from an earlier choice
  { id: 'riots', chain: true, chance: 1, cooldown: 0, when: () => true,
    options: [({ c }) => { c.stability = clamp01(c.stability - 0.03); group(c, 'labor').support = clamp01(group(c, 'labor').support - 0.1); c.polCap += 5; },
      ({ c }) => { c.polCap = Math.max(0, c.polCap - 15); group(c, 'labor').support = clamp01(group(c, 'labor').support + 0.1); c.stability = clamp01(c.stability + 0.02); }] },
  { id: 'firmDemands', chain: true, chance: 1, cooldown: 0, when: () => true,
    options: [({ w, c, other }) => { c.treasury = Math.max(0, c.treasury - c.income * 0.5); if (other >= 0) addRel(w, c.id, other, 5); },
      ({ w, c, other }) => { if (other >= 0) addRel(w, c.id, other, -10); group(c, 'industry').support = clamp01(group(c, 'industry').support + 0.03); }] },
  { id: 'doubleAgent', chain: true, chance: 1, cooldown: 0, when: () => true,
    options: [({ w, c, other }) => { c.polCap += 20; if (other >= 0) w.countries[other].stability = clamp01(w.countries[other].stability - 0.03); },
      ({ c }) => { c.warSupport = clamp01(c.warSupport + 0.04); }] },
  { id: 'promisesDue', chain: true, chance: 1, cooldown: 0, when: ({ c }) => c.gov === 'democracy',
    options: [({ c }) => { shift(c, 'welfare', 0.03); c.deficit = Math.min(0.5, c.deficit + 0.02); },
      ({ c }) => { c.stability = clamp01(c.stability - 0.05); c.polCap += 10; }] },
  { id: 'overrun', chain: true, chance: 1, cooldown: 0, when: () => true,
    options: [({ w, c }) => { c.treasury = Math.max(0, c.treasury - c.income); for (const p of w.provinces) if (p.owner === c.id) p.gdp *= 1.005; },
      ({ c }) => { c.stability = clamp01(c.stability - 0.02); }] },
  // ---- the present day
  { id: 'cyberattack', era: 'modern', chance: 0.06, cooldown: 540, when: ({ w, c }) => w.countries.find(k => k.alive && k.id !== c.id && rel(w, c.id, k.id) < -20 && k.tech >= c.tech)?.id ?? false,
    options: [({ w, c, other }) => { addRel(w, c.id, other, -10); c.warSupport = clamp01(c.warSupport + 0.04); c.polCap = Math.max(0, c.polCap - 10); },
      ({ c }) => { c.treasury = Math.max(0, c.treasury - c.income * 0.5); c.research += researchNeed(c) * 0.15; }] },
  { id: 'automation', era: 'modern', peace: true, chance: 0.05, cooldown: 720, when: ({ c }) => c.budget.research >= 0.04 && c.gdp > 1e5,
    options: [({ w, c }) => { for (const p of w.provinces) if (p.owner === c.id) p.gdp *= 1.015; group(c, 'labor').support = clamp01(group(c, 'labor').support - 0.08); },
      ({ c }) => { group(c, 'labor').support = clamp01(group(c, 'labor').support + 0.06); c.treasury = Math.max(0, c.treasury - c.income * 0.3); }] },
  { id: 'climate', era: 'modern', chance: 0.03, cooldown: 900, when: () => true,
    options: [({ c }) => { c.treasury = Math.max(0, c.treasury - c.income); c.stability = clamp01(c.stability + 0.02); },
      ({ c }) => { c.stability = clamp01(c.stability - 0.04); group(c, 'rural').support = clamp01(group(c, 'rural').support - 0.06); }],
    aiPick: ({ c }) => c.treasury > c.income ? 0 : 1 },
  // ---- the historical eras
  { id: 'suffrage', era: 'hist', peace: true, chance: 0.05, cooldown: 1460, when: ({ c }) => c.gov === 'democracy' || c.gov === 'monarchy',
    options: [({ c }) => { c.stability = clamp01(c.stability + 0.03); c.polCap = Math.max(0, c.polCap - 15); group(c, 'labor').support = clamp01(group(c, 'labor').support + 0.05); },
      ({ c }) => { c.stability = clamp01(c.stability - 0.03); c.polCap += 10; }] },
  { id: 'rationing', era: 'hist', chance: 0.15, cooldown: 540, when: ({ w, c }) => atWar(w, c.id),
    options: [({ c }) => { c.stability = clamp01(c.stability - 0.02); c.warSupport = clamp01(c.warSupport + 0.05); },
      ({ c }) => { c.treasury = Math.max(0, c.treasury - c.income * 0.5); group(c, 'labor').support = clamp01(group(c, 'labor').support + 0.04); }] },
  { id: 'newsreel', era: 'hist', chance: 0.08, cooldown: 540, when: ({ w, c }) => atWar(w, c.id) || c.warSupport < 0.3,
    options: [({ c }) => { c.treasury = Math.max(0, c.treasury - c.income * 0.3); c.warSupport = clamp01(c.warSupport + 0.06); },
      ({ c }) => { c.polCap += 5; c.stability = clamp01(c.stability + 0.01); }] },
];
/** The player hears from the world often: their events are likelier, and after a quiet spell the next one that fits comes for sure. */
const PLAYER_CHANCE = 2.5, QUIET_DAYS = 50;

export function monthlyEvents(w: World, S: MapStatic) {
  const nb = neighbours(w, S), pw = w.countries.map(c => c.alive ? power(w, c.id) : 0);
  for (const c of w.countries) {
    if (!c.alive || popOf(w, c.id) < 3e5) continue;
    if (c.player && w.agenda.some(a => a.kind === 'event' && a.country === c.id)) continue; // one at a time for the player
    // a consequence that is due comes first
    const due = (w.chains ?? []).find(x => x.c === c.id && x.day <= w.day);
    if (due) { w.chains = w.chains!.filter(x => x !== due); const e = EVENTS.find(x => x.id === due.id); if (e && e.when({ w, c, other: due.other, pw }, nb[c.id]) !== false) { fire(w, c, e, due.other); continue; } }
    const quiet = c.player && w.day - (w.cooldowns[`ev:${c.id}:last`] ?? 0) > QUIET_DAYS;
    const from = Math.floor(nextRand(w) * EVENTS.length); // no event always comes first
    for (let k = 0; k < EVENTS.length; k++) {
      const e = EVENTS[(from + k) % EVENTS.length];
      if (e.chain || (e.peace && atWar(w, c.id)) || (e.era && (e.era === 'modern') !== (w.scenario === '2026' || !w.scenario))) continue;
      const key = `ev:${c.id}:${e.id}`; if ((w.cooldowns[key] ?? -1) > w.day) continue;
      const hit = e.when({ w, c, other: -1, pw }, nb[c.id]); if (hit === false) continue;
      if (!quiet && nextRand(w) > e.chance * (c.player ? PLAYER_CHANCE : 1)) continue;
      if (e.id === 'disaster' && quiet && nextRand(w) > 0.1) continue; // disasters stay rare
      const other = typeof hit === 'number' ? hit : -1;
      w.cooldowns[key] = w.day + e.cooldown;
      fire(w, c, e, other);
      break; // at most one event per country per month
    }
  }
}
/** An event happens to a country: the player gets a card; an AI country chooses at once. */
function fire(w: World, c: Country, e: EventDef, other: number) {
  const x: Ctx = { w, c, other };
  if (c.player) {
    const a: Record<string, MsgArg> = { c: { c: c.id } }; if (other >= 0) a.o = { c: other };
    const item: AgendaItem = { id: w.nextId++, country: c.id, day: w.day, kind: 'event', title: msg(`ev.${e.id}.title`, a), text: msg(`ev.${e.id}.text`, a),
      options: e.options.map((_, i) => ({ label: msg(`ev.${e.id}.o${i}`, a), effect: `event.${e.id}`, hint: msg(`ev.${e.id}.h${i}`, a) })), data: { other }, expires: w.day + 45, dflt: e.aiPick ? e.aiPick(x) : 0 };
    w.agenda.push(item); w.cooldowns[`ev:${c.id}:last`] = w.day;
  } else { const i = e.aiPick ? e.aiPick(x) : 0; e.options[i](x); follow(w, c, e, i, other); }
  if (e.id === 'protests' || e.id === 'disaster') say(w, msg(`log.ev.${e.id}`, { c: { c: c.id } }), 'event', { who: [c.id] });
}
/** A choice that has consequences: the follow-up comes two to five months later. */
function follow(w: World, c: Country, e: EventDef, option: number, other: number) {
  const next = e.then?.[option]; if (next) (w.chains ??= []).push({ c: c.id, id: next, day: w.day + 60 + Math.floor(nextRand(w) * 90), other });
}
/** The player's choice on an event card. */
export function applyEvent(w: World, item: AgendaItem, option: number) {
  const e = EVENTS.find(e => item.options[0]?.effect === `event.${e.id}`); if (!e) return;
  e.options[option]?.({ w, c: w.countries[item.country], other: item.data?.other ?? -1 });
  follow(w, w.countries[item.country], e, option, item.data?.other ?? -1);
}
