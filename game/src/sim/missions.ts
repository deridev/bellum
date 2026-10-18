// National missions: the player always has a few goals under way, chosen two at a time from what fits the nation now.
// Each has a deadline and a reward; a mission that runs out costs a little stability.
import type { Country, MapStatic, Mission, Msg, World } from './types';
import { msg } from './types';
import { clamp01, rel, say } from './world';
import { hasTreaty, power } from './diplomacy';
import { allied, enemies } from './war/war';
import { neighbours } from './ai';
import { nextRand } from './rng';

type Reward = { polCap?: number; stability?: number; warSupport?: number };
interface Kind {
  days: number; reward: Reward;
  /** a fresh mission of this kind for the country, or null when it does not fit */
  make: (w: World, c: Country, nb: Set<number>) => Omit<Mission, 'id' | 'kind' | 'start' | 'until'> | null;
  /** the country's standing on the mission's measure (done when it reaches the target) */
  value: (w: World, c: Country, m: Mission) => number;
  /** the number shown in the mission's name */
  shown?: (m: Mission, c: Country) => number;
}
const divs = (w: World, c: Country) => w.divisions.filter(d => d.country === c.id).length;
const trades = (w: World, c: Country) => w.treaties.filter(t => t.type === 'trade' && (t.a === c.id || t.b === c.id)).length;
export const KINDS: Record<string, Kind> = {
  growth: { days: 730, reward: { polCap: 40, stability: 0.02 }, make: (w, c) => ({ base: c.gdp, target: c.gdp * (1 + Math.max(0.04, Math.min(0.12, c.growth * 2))) }), value: (w, c) => c.gdp, shown: m => Math.round((m.target / m.base - 1) * 100) },
  army: { days: 365, reward: { polCap: 20, warSupport: 0.06 }, make: (w, c) => { const n = divs(w, c), add = Math.max(3, Math.round(n * 0.15)); return c.manpower >= add * 12000 ? { base: n, target: n + add } : null; }, value: divs, shown: m => m.target },
  tech: { days: 900, reward: { polCap: 30, stability: 0.03 }, make: (w, c) => c.budget.research >= 0.04 ? { base: c.tech, target: c.tech + 1 } : null, value: (w, c) => c.tech, shown: m => m.target },
  trade: { days: 365, reward: { polCap: 30 }, make: (w, c) => trades(w, c) < 4 && w.countries.some(k => k.alive && k.id !== c.id && rel(w, k.id, c.id) >= 20 && !hasTreaty(w, c.id, k.id, 'trade')) ? { base: trades(w, c), target: trades(w, c) + 1 } : null, value: trades },
  ally: { days: 540, reward: { polCap: 40, stability: 0.02 }, make: (w, c) => { const k = w.countries.filter(k => k.alive && k.id !== c.id && rel(w, k.id, c.id) >= 30 && !allied(w, c.id, k.id) && !enemies(w, c.id, k.id)).sort((a, b) => rel(w, b.id, c.id) - rel(w, a.id, c.id))[0]; return k ? { base: 0, target: 1, other: k.id } : null; }, value: (w, c, m) => allied(w, c.id, m.other!) ? 1 : 0 },
  reclaim: { days: 1095, reward: { polCap: 50, stability: 0.05, warSupport: 0.1 }, make: (w, c) => { const p = w.provinces.find(p => p.owner !== c.id && p.core.includes(c.id) && w.countries[p.owner].alive); return p ? { base: 0, target: 1, prov: p.id } : null; }, value: (w, c, m) => w.provinces[m.prov!].owner === c.id ? 1 : 0 },
  stability: { days: 365, reward: { polCap: 30 }, make: (w, c) => c.stability < 0.62 ? { base: c.stability, target: Math.min(0.8, c.stability + 0.1) } : null, value: (w, c) => c.stability, shown: m => Math.round(m.target * 100) },
  debt: { days: 1095, reward: { polCap: 30, stability: 0.03 }, make: (w, c) => { const r = c.debt / Math.max(1, c.gdp); return r > 0.6 ? { base: -r, target: -(r - 0.1) } : null; }, value: (w, c) => -c.debt / Math.max(1, c.gdp), shown: m => Math.round(-m.target * 100) },
  savings: { days: 540, reward: { polCap: 20, stability: 0.02 }, make: (w, c) => c.treasury < c.income * 3 && c.income > 0 ? { base: c.treasury / c.income, target: 6 } : null, value: (w, c) => c.treasury / Math.max(1e-9, c.income), shown: m => m.target },
  surpass: { days: 1440, reward: { polCap: 60, stability: 0.03, warSupport: 0.05 },
    make: (w, c, nb) => { const me = power(w, c.id); const k = [...nb].find(n => w.countries[n].alive && rel(w, c.id, n) < 10 && power(w, n) > me && power(w, n) < me * 1.6); return k !== undefined ? { base: me / power(w, k), target: 1, other: k } : null; },
    value: (w, c, m) => power(w, c.id) / Math.max(1e-9, power(w, m.other!)) },
};
const MAX = 3;
/** The mission's name, for cards and the missions list. */
export const missionTitle = (m: Mission, c: Country): Msg => msg('mission.' + m.kind, { n: KINDS[m.kind].shown?.(m, c) ?? 0, ...(m.other !== undefined ? { o: { c: m.other } } : {}), ...(m.prov !== undefined ? { p: { p: m.prov } } : {}) });
const rewardMsg = (k: Kind): Msg => { const parts = Object.entries(k.reward).map(([r, v]) => msg('mr.' + r, { v: r === 'polCap' ? v : Math.round(v * 100) })); return msg('mission.reward' + parts.length, { t: Math.round(k.days / 30), r1: { m: parts[0] }, ...(parts[1] ? { r2: { m: parts[1] } } : {}), ...(parts[2] ? { r3: { m: parts[2] } } : {}) }); };
/** How far along a mission is, 0..1. */
export function missionProgress(w: World, c: Country, m: Mission) { return clamp01((KINDS[m.kind].value(w, c, m) - m.base) / Math.max(1e-9, m.target - m.base)); }

/** Monthly: score finished missions, end the ones out of time, and offer a choice when a slot is free. */
export function monthlyMissions(w: World, S: MapStatic) {
  const c = w.countries.find(k => k.player && k.alive); if (!c) return;
  const list = (w.missions ??= []);
  for (const m of [...list]) {
    const k = KINDS[m.kind], done = k.value(w, c, m) >= m.target - 1e-9;
    if (!done && w.day < m.until) continue;
    list.splice(list.indexOf(m), 1);
    if (done) {
      const r = k.reward; c.polCap += r.polCap ?? 0; c.stability = clamp01(c.stability + (r.stability ?? 0)); c.warSupport = clamp01(c.warSupport + (r.warSupport ?? 0));
      say(w, msg('log.missionDone', { m: { m: missionTitle(m, c) } }), 'player', { who: [c.id], big: 'big.mission' });
    } else { c.stability = clamp01(c.stability - 0.02); say(w, msg('log.missionFailed', { m: { m: missionTitle(m, c) } }), 'player', { who: [c.id] }); }
  }
  if (list.length >= MAX || w.agenda.some(a => a.kind === 'mission' && a.country === c.id)) return;
  const nb = neighbours(w, S)[c.id], busy = new Set(list.map(m => m.kind));
  const fits = Object.keys(KINDS).filter(id => !busy.has(id) && (w.cooldowns[`mission:${id}`] ?? -1) <= w.day).map(id => ({ id, m: KINDS[id].make(w, c, nb) })).filter(x => x.m && KINDS[x.id].value(w, c, { ...x.m, id: 0, kind: x.id, start: 0, until: 0 }) < x.m.target);
  if (fits.length < 1) return;
  const pick: typeof fits = [];
  while (pick.length < 2 && fits.length) pick.push(fits.splice(Math.floor(nextRand(w) * fits.length), 1)[0]);
  const offers = pick.map(x => ({ ...x.m!, id: w.nextId++, kind: x.id, start: w.day, until: w.day + KINDS[x.id].days } as Mission));
  w.agenda.push({ id: w.nextId++, country: c.id, day: w.day, kind: 'mission', title: msg('agenda.mission.title'), text: msg('agenda.mission.text'), expires: w.day + 30, data: { offers },
    options: offers.map(m => ({ label: missionTitle(m, c), effect: 'mission.pick', hint: rewardMsg(KINDS[m.kind]) })) });
}
/** The player's pick: that mission starts now; the other may come back later. */
export function pickMission(w: World, offers: Mission[], i: number) {
  const m = offers[i]; if (!m) return;
  const len = m.until - m.start; m.start = w.day; m.until = w.day + len;
  (w.missions ??= []).push(m);
  for (const o of offers) if (o !== m) w.cooldowns[`mission:${o.kind}`] = w.day + 180;
}
