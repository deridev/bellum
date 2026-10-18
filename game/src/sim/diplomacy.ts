// Diplomacy: the same actions and acceptance rules for the player and the AI.
import { addRel, clamp01, rel, say } from './world';
import { allied, defendersOf, enemies, sideOf, warsOf } from './war/war';
import type { MapStatic, Msg, TreatyType, World } from './types';
import { msg } from './types';

export type DiploAction = 'improve' | 'alliance' | 'nap' | 'guarantee' | 'trade' | 'denounce' | 'break' | 'demand';
/** Influence cost and cooldown (days) of each action. */
export const DIPLO: Record<DiploAction, { cost: number; cooldown: number }> = {
  improve: { cost: 20, cooldown: 60 }, alliance: { cost: 40, cooldown: 180 }, nap: { cost: 15, cooldown: 180 }, guarantee: { cost: 25, cooldown: 180 },
  trade: { cost: 15, cooldown: 180 }, denounce: { cost: 10, cooldown: 90 }, break: { cost: 0, cooldown: 30 }, demand: { cost: 10, cooldown: 365 },
};
export const hasTreaty = (w: World, a: number, b: number, type: TreatyType) => w.treaties.some(t => t.type === type && ((t.a === a && t.b === b) || (t.a === b && t.b === a)));
const cdKey = (a: number, b: number, act: DiploAction) => `${a}:${b}:${act}`;

/** Military weight of a country: strength of its divisions, armor and technology counted. */
export function power(w: World, c: number) {
  const tech = (1 + 0.05 * w.countries[c].tech) * (w.countries[c].quality ?? 1); let p = 0; // technology and equipment, as in battle
  for (const d of w.divisions) if (d.country === c) p += d.str / 12000 * (d.type === 'armor' ? 1.6 : d.type === 'mechanized' ? 1.3 : 1);
  return p * tech;
}
const ideoDist = (w: World, a: number, b: number) => { const A = w.countries[a].ideology, B = w.countries[b].ideology; return Math.hypot(A[0] - B[0], A[1] - B[1]); };

/** An ultimatum asks for one border province: land we claim first, else their richest province touching ours (never the capital). */
export function demandTarget(w: World, S: MapStatic, from: number, to: number) {
  const cap = w.countries[to].capital;
  const border = w.provinces.filter(p => p.owner === to && p.controller === to && p.id !== cap && S.provinces[p.id].nbr.some(n => w.provinces[n].owner === from));
  return border.sort((a, b) => (+b.core.includes(from) - +a.core.includes(from)) || b.gdp - a.gdp)[0]?.id ?? -1;
}
/** A demand is met when resisting is hopeless: we are three times stronger than them and the allies who would help. */
export function demandAccepted(w: World, from: number, to: number) {
  const theirs = power(w, to) + defendersOf(w, to).filter(d => d !== from).reduce((a, d) => a + power(w, d) * 0.7, 0);
  return power(w, from) >= 3 * Math.max(0.5, theirs);
}
/** They hand the province over, or refuse: then we hold a claim on it, which makes a war for it justified. */
export function resolveDemand(w: World, from: number, to: number, prov: number, accepted: boolean) {
  const pr = w.provinces[prov]; if (!pr || pr.owner !== to) return;
  if (accepted) {
    pr.owner = from; pr.controller = from; pr.unrest = pr.core.includes(from) ? 0 : 1;
    addRel(w, to, from, -30, false); w.countries[to].stability = clamp01(w.countries[to].stability - 0.04); w.countries[from].stability = clamp01(w.countries[from].stability + 0.02);
    say(w, msg('log.demandMet', { a: { c: from }, b: { c: to }, p: { p: prov } }), 'diplo', { who: [from, to], prov });
  } else {
    if (!pr.core.includes(from)) pr.core.push(from);
    addRel(w, to, from, -15, false);
    say(w, msg('log.demandRefused', { a: { c: from }, b: { c: to }, p: { p: prov } }), 'diplo', { who: [from, to], prov });
  }
}

/** Would `to` accept `act` from `from`? Returns the answer and the main reason, for the UI. */
export function diploOdds(w: World, from: number, to: number, act: DiploAction, S?: MapStatic): { ok: boolean; why: Msg } {
  const A = w.countries[from], opinion = rel(w, to, from);
  if (from === to || !w.countries[to].alive) return { ok: false, why: msg('dip.why.invalid') };
  const cd = w.cooldowns[cdKey(from, to, act)];
  if (cd !== undefined && w.day < cd) return { ok: false, why: msg('dip.why.cooldown', { d: { d: cd } }) };
  if (A.polCap < DIPLO[act].cost) return { ok: false, why: msg('dip.why.influence', { n: DIPLO[act].cost }) };
  if (act !== 'denounce' && act !== 'break' && enemies(w, from, to)) return { ok: false, why: msg('dip.why.atWar') };
  switch (act) {
    case 'improve': return { ok: opinion < 90, why: msg(opinion < 90 ? 'dip.why.improve' : 'dip.why.maxed') };
    case 'denounce': return { ok: true, why: msg('dip.why.denounce') };
    case 'demand': { const prov = S ? demandTarget(w, S, from, to) : -1; if (prov < 0) return { ok: false, why: msg('dip.why.noBorder') };
      return { ok: true, why: msg(demandAccepted(w, from, to) ? 'dip.why.demandYes' : 'dip.why.demandNo', { p: { p: prov } }) }; }
    case 'break': { const t = w.treaties.find(t => t.type !== 'puppet' && ((t.a === from && t.b === to) || (t.a === to && t.b === from))); return { ok: !!t, why: msg(t ? 'dip.why.break' : 'dip.why.noTreaty') }; }
    case 'trade': if (hasTreaty(w, from, to, 'trade')) return { ok: false, why: msg('dip.why.already') };
      return opinion >= 10 ? { ok: true, why: msg('dip.why.tradeOk') } : { ok: false, why: msg('dip.why.opinion', { n: 10 }) };
    case 'nap': if (hasTreaty(w, from, to, 'nap') || allied(w, from, to)) return { ok: false, why: msg('dip.why.already') };
      if (opinion < -20) return { ok: false, why: msg('dip.why.opinion', { n: -20 }) };
      return power(w, from) >= power(w, to) * 0.8 || opinion > 30 ? { ok: true, why: msg('dip.why.napOk') } : { ok: false, why: msg('dip.why.napWeak') };
    case 'guarantee': if (hasTreaty(w, from, to, 'guarantee')) return { ok: false, why: msg('dip.why.already') };
      if (warsOf(w, to).length) return { ok: false, why: msg('dip.why.guaranteeWar') }; // a guarantee deters a war; it cannot stop one
      return opinion > -20 ? { ok: true, why: msg('dip.why.guaranteeOk') } : { ok: false, why: msg('dip.why.opinion', { n: -20 }) };
    case 'alliance': {
      if (allied(w, from, to)) return { ok: false, why: msg('dip.why.already') };
      if (defendersOf(w, from).some(x => rel(w, to, x) < -50)) return { ok: false, why: msg('dip.why.badFriends') };
      // allying with a country at war means joining its war: only a public ready for war, against an enemy it already hates
      const foes = warsOf(w, from).filter(x => !sideOf(x, to)).flatMap(x => sideOf(x, from) > 0 ? x.defenders : x.attackers);
      if (foes.length && (w.countries[to].warSupport < 0.5 || foes.some(f => allied(w, to, f) || rel(w, to, f) > -50))) return { ok: false, why: msg('dip.why.notThisWar') };
      const joins = warsOf(w, to).some(x => !sideOf(x, from)); // proposing to a country at war: you join its war
      // shared enemies make allies; a strong partner is attractive; ideology matters
      const sharedRival = w.countries.some(x => x.alive && rel(w, to, x.id) < -40 && rel(w, from, x.id) < -40);
      const score = opinion + (sharedRival ? 25 : 0) + Math.min(20, 10 * Math.log2(Math.max(0.25, power(w, from) / Math.max(1, power(w, to))))) - 20 * ideoDist(w, from, to);
      return score >= 60 ? { ok: true, why: msg(joins ? 'dip.why.joinsTheirWar' : sharedRival ? 'dip.why.allyRival' : 'dip.why.allyOk') } : { ok: false, why: msg('dip.why.allyNo', { n: Math.round(score), need: 60 }) };
    }
  }
}

/** Carry out an action (assumes the caller checked diploOdds, or is forcing a unilateral one). */
export function doDiplo(w: World, from: number, to: number, act: DiploAction, S?: MapStatic) {
  const A = w.countries[from], B = w.countries[to];
  A.polCap = Math.max(0, A.polCap - DIPLO[act].cost);
  w.cooldowns[cdKey(from, to, act)] = w.day + DIPLO[act].cooldown;
  const add = (type: TreatyType, years: number) => w.treaties.push({ type, a: from, b: to, since: w.day, until: years ? w.day + 365 * years : -1 });
  switch (act) {
    case 'improve': addRel(w, to, from, 12, false); addRel(w, from, to, 4, false); break;
    case 'denounce':
      addRel(w, from, to, -25); A.warSupport = clamp01(A.warSupport + 0.03);
      for (const c of w.countries) if (c.alive && c.id !== from && c.id !== to && rel(w, c.id, to) < -40) addRel(w, c.id, from, 5, false);
      say(w, msg('log.denounce', { a: { c: from }, b: { c: to } }), 'diplo', { who: [from, to] }); break;
    case 'break': {
      const i = w.treaties.findIndex(t => t.type !== 'puppet' && ((t.a === from && t.b === to) || (t.a === to && t.b === from)));
      const t = w.treaties[i]; if (i >= 0) w.treaties.splice(i, 1);
      addRel(w, to, from, t?.type === 'alliance' ? -40 : -20, false); A.stability = clamp01(A.stability - 0.02);
      say(w, msg('log.treatyBroken', { a: { c: from }, b: { c: to }, t: { m: msg('treaty.' + (t?.type || 'nap')) } }), 'diplo', { who: [from, to] }); break;
    }
    case 'trade': add('trade', 10); addRel(w, from, to, 5); say(w, msg('log.treaty.trade', { a: { c: from }, b: { c: to } }), 'diplo', { who: [from, to] }); break;
    case 'nap': add('nap', 10); addRel(w, from, to, 8); say(w, msg('log.treaty.nap', { a: { c: from }, b: { c: to } }), 'diplo', { who: [from, to] }); break;
    case 'guarantee': add('guarantee', 0); addRel(w, to, from, 15, false); say(w, msg('log.treaty.guarantee', { a: { c: from }, b: { c: to } }), 'diplo', { who: [from, to] }); break;
    case 'demand': if (S) resolveDemand(w, from, to, demandTarget(w, S, from, to), demandAccepted(w, from, to)); break;
    case 'alliance': add('alliance', 0); addRel(w, from, to, 15); say(w, msg('log.treaty.alliance', { a: { c: from }, b: { c: to } }), 'diplo', { who: [from, to], big: A.player || B.player ? 'big.alliance' : undefined }); break;
  }
}

/** Monthly: treaties expire, allies warm up, enemies at war grow bitter. */
export function monthlyDiplomacy(w: World) {
  for (const t of w.treaties) if (t.type === 'puppet' && t.until >= 0 && t.until <= w.day && w.countries[t.b].alive)
    say(w, msg('log.independent', { c: { c: t.b }, o: { c: t.a } }), 'diplo', { who: [t.b, t.a], big: w.countries[t.b].player ? 'big.independent' : undefined });
  w.treaties = w.treaties.filter(t => t.until < 0 || t.until > w.day);
  for (const t of w.treaties) if ((t.type === 'alliance' || t.type === 'trade') && rel(w, t.a, t.b) < 80) addRel(w, t.a, t.b, 1);
  for (const war of w.wars) if (!war.ended) for (const a of war.attackers) for (const d of war.defenders) addRel(w, a, d, -2);
}
/** Trade agreements add a little growth each (capped). */
export const tradeBonus = (w: World, c: number) => Math.min(4, w.treaties.filter(t => t.type === 'trade' && (t.a === c || t.b === c)).length) * 0.0025;
