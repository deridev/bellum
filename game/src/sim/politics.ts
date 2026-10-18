import { leaderTraits, personName } from './names';
import { nextRand } from './rng';
import { atWar } from './economy';
import { clamp01, say } from './world';
import type { Country, World } from './types';
import { msg } from './types';
import { GOV_TITLE, PM_COUNTRIES } from './data';

const BASE: Record<Country['gov'], number> = { democracy: 0.58, authoritarian: 0.55, oneparty: 0.6, junta: 0.4, monarchy: 0.58, theocracy: 0.5 };

/** What each interest group wants, as a satisfaction score 0..1. */
export function groupMood(w: World, c: Country) {
  const war = atWar(w, c.id), g = c.growth;
  return {
    military: clamp01(0.35 + c.budget.military * 1.2 + (war ? 0.1 : 0) + (c.warSupport - 0.4) * 0.3),
    industry: clamp01(0.55 + g * 8 - (c.taxRate - 0.25) * 1.5 + c.budget.investment * 0.4 - (war ? 0.08 : 0)),
    labor: clamp01(0.3 + c.budget.welfare * 0.7 + g * 4 - (war ? 0.12 : 0) - c.stats.casualties / Math.max(1, popOf(w, c.id)) * 400),
    rural: clamp01(0.55 - (c.taxRate - 0.25) * 1.2 + (c.stability - 0.5) * 0.3 - (war ? 0.05 : 0)),
  };
}
export function stabilityTarget(w: World, c: Country) {
  const mood = groupMood(w, c);
  const groupsScore = c.groups.reduce((a, g) => a + (mood[g.id] - 0.5) * g.power, 0);
  const own = w.provinces.filter(p => p.owner === c.id), occupied = own.filter(p => p.controller !== c.id).length / Math.max(1, own.length);
  const unrest = own.reduce((a, p) => a + p.unrest, 0) / Math.max(1, own.length); // unintegrated conquests
  const debtRatio = c.debt / Math.max(1, c.gdp);
  let t = BASE[c.gov] + groupsScore * 0.5 + (c.budget.welfare - 0.45) * 0.25 - (c.taxRate - 0.25) * 0.4 + c.growth * 1.5 - occupied * 0.6 - unrest * 0.5 - Math.max(0, debtRatio - 1.5) * 0.08;
  if (c.leader.traits.includes('Charismatic')) t += 0.04; if (c.leader.traits.includes('Corrupt')) t -= 0.04;
  return Math.min(0.95, clamp01(t));
}
export function monthlyPolitics(w: World) {
  for (const c of w.countries) {
    if (!c.alive) continue;
    const mood = groupMood(w, c);
    for (const g of c.groups) g.support += (mood[g.id] - g.support) * 0.15;
    c.stability = clamp01(c.stability + (stabilityTarget(w, c) - c.stability) * 0.12);
    const war = atWar(w, c.id);
    const drift = war ? (c.gov === 'democracy' ? -0.012 : -0.005) : (0.32 - c.warSupport) * 0.08;
    c.warSupport = clamp01(c.warSupport + drift);
    // elections
    if (c.gov === 'democracy' && c.nextElection >= 0 && w.day >= c.nextElection) {
      const keep = 0.25 + c.stability * 0.55 + c.growth * 4 + (war ? 0.05 : 0) - (w.day - c.leader.since > 365 * 7 ? 0.2 : 0);
      if (nextRand(w) < keep) say(w, msg('log.reelected', { leader: c.leader.name, c: { c: c.id } }), 'politics', { who: [c.id] });
      else {
        const old = c.leader.name; newLeader(w, c);
        c.ideology[0] = Math.max(-1, Math.min(1, c.ideology[0] + (nextRand(w) - 0.5) * 0.6));
        say(w, msg('log.votedOut', { c: { c: c.id }, old, leader: c.leader.name }), 'politics', { who: [c.id], big: c.player ? 'big.electionLost' : undefined });
        c.stability = clamp01(c.stability + 0.05);
      }
      c.nextElection = w.day + 365 * 4;
    }
    // coups when the army is unhappy and the state is weak
    const mil = c.groups.find(g => g.id === 'military')!;
    if (c.gov !== 'democracy' && c.stability < 0.3 && mil.support < 0.35 && nextRand(w) < 0.04 * mil.power * 2) {
      const old = c.leader.name; c.gov = 'junta'; newLeader(w, c); c.leader.title = GOV_TITLE.junta;
      say(w, msg('log.coup', { c: { c: c.id }, old }), 'politics', { who: [c.id], big: 'big.coup' });
      c.stability = clamp01(c.stability + 0.1); mil.support = 0.7;
    }
  }
}
export function newLeader(w: World, c: Country) {
  c.leader = { name: personName(w, c.code), title: PM_COUNTRIES.has(c.code) && c.gov === 'democracy' ? 'Prime Minister' : GOV_TITLE[c.gov], born: 1955 + Math.floor(nextRand(w) * 30), traits: leaderTraits(w), since: w.day };
}
import { popOf } from './economy';
