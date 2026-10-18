import { CONSCRIPTION_GROWTH, CONSCRIPTION_RATE, clamp01, newDivision, say } from './world';
import type { Army, Country, MapStatic, ProdItem, UnitType, World } from './types';
import { makeGeneral } from './names';
import { msg } from './types';
import { tradeBonus } from './diplomacy';
import { researchNeed } from './policies';

/** Cost of a new division: a year of its upkeep (so richer militaries pay more per unit). Days to build. */
export const UNIT_SPEC: Record<UnitType, { costMul: number; days: number; men: number; label: string }> = {
  infantry: { costMul: 10, days: 75, men: 12000, label: 'Infantry' },
  mechanized: { costMul: 16, days: 110, men: 12000, label: 'Mechanized' },
  armor: { costMul: 22, days: 140, men: 10000, label: 'Armor' },
  marines: { costMul: 18, days: 120, men: 9000, label: 'Marines' },
  airborne: { costMul: 18, days: 120, men: 9000, label: 'Airborne' },
};
export const atWar = (w: World, c: number) => w.wars.some(x => !x.ended && (x.attackers.includes(c) || x.defenders.includes(c)));

/** National output from the provinces a country controls this month. */
export function computeGdp(w: World, c: number): number {
  let g = 0;
  for (const p of w.provinces) {
    if (p.controller !== c) continue;
    g += p.gdp * (1 - 0.7 * p.devastation) * (p.owner === c ? 1 - 0.5 * p.unrest : 0.35); // fresh conquests produce little until integrated
  }
  return g;
}
export function monthlyEconomy(w: World, S: MapStatic) {
  for (const c of w.countries) {
    if (!c.alive) continue;
    c.gdp = computeGdp(w, c.id);
    const { revenue, interest, spending } = cashFlow(c);
    const nDiv = w.divisions.filter(d => d.country === c.id).length;
    c.upkeep = nDiv * c.unitCost;
    c.income = revenue; c.spending = spending + interest;
    c.treasury += revenue - spending - interest;
    if (c.treasury < 0) { c.debt += -c.treasury; c.treasury = 0; }
    else if (c.deficit <= 0 && c.treasury > revenue * 12) { const pay = (c.treasury - revenue * 12) * 0.5; c.debt = Math.max(0, c.debt - pay); c.treasury -= pay; } // savings beyond a year's revenue pay down debt
    // an army bigger than its budget loses readiness (organisation caps at 60% when nothing is funded: a penalty, not a death spiral)
    c.readiness = c.upkeep > 0 ? Math.min(1, spending * c.budget.military / c.upkeep) : 1;
    // conquests settle in over about five years, then count as core land
    for (const p of w.provinces) if (p.owner === c.id && p.unrest > 0) { p.unrest = Math.max(0, p.unrest - 1 / 60); if (p.unrest === 0 && !p.core.includes(c.id)) p.core.push(c.id); }
    // growth (annual), applied monthly to province output
    const pc = c.gdp * 1e6 / Math.max(1, popOf(w, c.id));
    const debtRatio = c.debt / Math.max(1, c.gdp);
    let g = 0.004 + 0.08 * (c.budget.investment - 0.18) + (c.stability - 0.6) * 0.04 - (c.taxRate - 0.25) * 0.05 + 0.016 * (1 - Math.min(1, pc / 40000));
    if (debtRatio > 1.2) g -= 0.01 * (debtRatio - 1.2);
    if (atWar(w, c.id)) g -= 0.02;
    g += tradeBonus(w, c.id) + CONSCRIPTION_GROWTH[c.conscription];
    g += (nextNoise(w, c.id) - 0.5) * 0.01;
    c.growth = g = Math.max(-0.25, Math.min(0.12, g)); // a collapsed economy shrinks, it does not explode
    const f = Math.pow(1 + g, 1 / 12);
    for (const p of w.provinces) if (p.owner === c.id && p.controller === c.id) { p.gdp *= f; p.devastation = Math.max(0, p.devastation - 0.02); }
    // research -> technology level (each level: +5% unit power)
    c.research += spending * c.budget.research;
    const need = researchNeed(c); // ~2-3 years per level at a normal research share
    if (c.research >= need) { c.research -= need; c.tech++; if (c.player) say(w, msg('log.tech', { n: c.tech }), 'economy', { who: [c.id] }); }
    // manpower and political capital
    const pop = popOf(w, c.id), max = pop * CONSCRIPTION_RATE[c.conscription];
    c.manpower = Math.min(max, c.manpower + max * 0.025);
    c.polCap = Math.min(300, c.polCap + 4 + 6 * c.stability);
  }
}
/** One month of money, from the current settings: what monthlyEconomy books, and what the Economy panel shows. */
export function cashFlow(c: Country) {
  const collect = 0.55 + 0.45 * c.stability, revenue = c.gdp * c.taxRate / 12 * collect; // unrest and corruption: low stability loses taxes
  // interest comes off the top; the budget spends the rest, plus what is borrowed (or minus what is saved)
  const interest = Math.min(revenue * 0.6, c.debt * 0.04 / 12), spending = Math.max(0, revenue - interest) * (1 + c.deficit);
  const free = Math.max(0, spending * c.budget.military - c.upkeep);
  // production the military budget cannot cover is paid from savings (up to half a month of revenue)
  const need = c.production.reduce((a, i) => a + Math.min(i.cost - i.progress, i.cost / Math.max(1, i.days) * 1.5 * 30), 0);
  const fromSavings = Math.min(c.treasury, c.income * 0.5, Math.max(0, need - free));
  return { collect, revenue, interest, spending, free, fromSavings, net: revenue - spending - interest - fromSavings };
}
/** Daily production: military funds left after upkeep build the queue in order. */
export function dailyProduction(w: World) {
  for (const c of w.countries) {
    if (!c.alive || !c.production.length) continue;
    const milFunds = c.spending * c.budget.military; // monthly
    const free = Math.max(0, milFunds - c.upkeep) / 30, chest = Math.min(c.treasury, c.income * 0.5) / 30; // savings speed up production
    let budget = free + chest, spent = 0;
    for (const item of c.production) {
      if (budget <= 0) break;
      const take = Math.min(budget, item.cost - item.progress, item.cost / Math.max(1, item.days) * 1.5);
      item.progress += take; budget -= take; spent += take; item.days = Math.max(0, item.days - 1);
    }
    if (spent > free) c.treasury = Math.max(0, c.treasury - (spent - free));
    const done = c.production.filter(i => i.progress >= i.cost - 1e-6 && i.days <= 0);
    if (!done.length) continue;
    c.production = c.production.filter(i => !done.includes(i));
    for (const item of done) {
      const n = w.divisions.filter(d => d.country === c.id && d.type === item.type).length + 1;
      const prov = w.provinces[item.prov]?.controller === c.id ? item.prov : c.capital;
      const d = newDivision(w, c.id, item.type, n, prov, recruitArmy(w, c, prov).id);
      d.exp = 0; w.divisions.push(d);
      if (c.player) say(w, msg('log.unitReady', { unit: { u: [d.type, d.num] } }), 'player', { who: [c.id], prov });
    }
  }
}
/** New divisions join an army waiting where they are raised, with room for them (12 at most); otherwise they form a new army there. */
function recruitArmy(w: World, c: Country, prov: number): Army {
  const mine = w.armies.filter(a => a.country === c.id);
  for (const a of mine) { const ds = w.divisions.filter(d => d.army === a.id); if (ds.length && ds.length < 12 && ds.every(d => d.theater < 0 && d.prov === prov)) return a; }
  const a: Army = { id: w.nextId++, country: c.id, num: mine.reduce((m, x) => Math.max(m, x.num), 0) + 1, general: makeGeneral(w, c.code), theater: -1, posture: 'hold' };
  w.armies.push(a); return a;
}
export function queueUnit(w: World, c: Country, type: UnitType, prov = c.capital): string | null {
  const spec = UNIT_SPEC[type];
  if (c.manpower < spec.men) return 'Not enough manpower';
  c.manpower -= spec.men;
  const item: ProdItem = { id: w.nextId++, type, progress: 0, cost: c.unitCost * spec.costMul, days: spec.days, prov };
  c.production.push(item); return null;
}
/** Stand down one reserve division of a type (never one at the front): its upkeep stops and most of its men return to the pool. */
export const reservesOf = (w: World, c: Country, type: UnitType) => w.divisions.filter(d => d.country === c.id && d.type === type && d.theater < 0);
export function demobilize(w: World, c: Country, type: UnitType) {
  const mine = reservesOf(w, c, type).sort((a, b) => a.str - b.str);
  const d = mine[0]; if (!d) return false;
  w.divisions = w.divisions.filter(x => x !== d); c.manpower += d.str * 0.8; c.upkeep = Math.max(0, c.upkeep - c.unitCost);
  return true;
}
export function cancelUnit(w: World, c: Country, id: number) {
  const i = c.production.findIndex(p => p.id === id); if (i < 0) return;
  c.manpower += UNIT_SPEC[c.production[i].type].men; c.production.splice(i, 1);
}
export const popOf = (w: World, c: number) => { let s = 0; for (const p of w.provinces) if (p.owner === c) s += p.pop; return s; };
function nextNoise(w: World, k: number) { const x = Math.sin((w.day + 1) * 12.9898 + k * 78.233) * 43758.5453; return x - Math.floor(x); }
export { clamp01 };
