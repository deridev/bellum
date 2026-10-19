// Uprisings: a nation annexed in this game can rise again while its land is still unsettled under the conqueror
// (unrest fades over about five years). It takes back its provinces and fights a war of independence.
import type { MapStatic, World } from './types';
import { msg } from './types';
import { addRel, clamp01, newDivision, say } from './world';
import { atWar, computeGdp, popOf } from './economy';
import { declareWar } from './war/war';
import { makeGeneral } from './names';
import { newLeader } from './politics';
import { nextRand } from './rng';

const RATE = 0.04; // monthly chance at full unrest, before the conqueror's troubles

export function monthlyUprisings(w: World, S: MapStatic) {
  for (const d of w.countries) {
    if (d.alive || (w.cooldowns[`rose:${d.id}`] ?? 0) >= 2) continue; // a nation rises twice at most
    const key = `gone:${d.id}`; w.cooldowns[key] ??= w.day;
    if (w.day - w.cooldowns[key] < 270) continue; // not in the first months after the fall
    const lost = w.provinces.filter(p => p.core.includes(d.id) && !p.core.includes(p.owner) && p.owner !== d.id && p.owner === p.controller && w.countries[p.owner].alive); // never the conqueror's own core land
    if (!lost.length) continue;
    const by = new Map<number, number>(); for (const p of lost) by.set(p.owner, (by.get(p.owner) ?? 0) + 1);
    const occ = [...by.entries()].sort((a, b) => b[1] - a[1])[0][0], X = w.countries[occ];
    const land = lost.filter(p => p.owner === occ), unrest = land.reduce((a, p) => a + p.unrest, 0) / land.length;
    const chance = RATE * unrest * (X.stability < 0.5 ? 2 : 1) * (atWar(w, occ) ? 2 : 1);
    if (nextRand(w) > chance) continue;
    rise(w, S, d.id, occ, land.map(p => p.id));
    return; // one a month at most
  }
}
function rise(w: World, S: MapStatic, id: number, occ: number, provs: number[]) {
  const d = w.countries[id];
  w.cooldowns[`rose:${id}`] = (w.cooldowns[`rose:${id}`] ?? 0) + 1; delete w.cooldowns[`gone:${id}`]; // if it falls again, the clock starts over
  for (const k of provs) { const p = w.provinces[k]; p.owner = p.controller = id; p.unrest = 0; }
  d.alive = true; d.capital = provs.includes(d.capital) ? d.capital : provs.sort((a, b) => w.provinces[b].pop - w.provinces[a].pop)[0];
  d.gdp = computeGdp(w, id); d.debt = 0; d.deficit = 0; d.treasury = d.gdp * d.taxRate / 12 * 3; d.production = [];
  d.stability = 0.55; d.warSupport = 0.9; d.manpower = popOf(w, id) * 0.01; d.polCap = 50;
  newLeader(w, d);
  addRel(w, id, occ, -100);
  // the rebels take up arms: a militia of about one division a province, raised where they stand
  w.divisions = w.divisions.filter(x => x.country !== id); w.armies = w.armies.filter(a => a.country !== id);
  const army = { id: w.nextId++, country: id, num: 1, general: makeGeneral(w, d.code), theater: -1, posture: 'hold' as const }; w.armies.push(army);
  const n = Math.min(20, Math.max(2, Math.round(provs.length * 1.2)));
  for (let i = 0; i < n; i++) { const dv = newDivision(w, id, 'infantry', i + 1, provs[i % provs.length], army.id); dv.org = 0.8; w.divisions.push(dv); }
  say(w, msg('log.uprising', { c: { c: id }, o: { c: occ } }), 'war', { who: [id, occ], big: w.countries[occ].player ? 'big.uprising' : undefined, prov: d.capital });
  declareWar(w, S, id, occ, { goal: { type: 'liberate', provinces: provs }, silent: true, alone: true, name: msg('war.name.uprising', { c: { c: id } }) });
  w.countries[occ].stability = clamp01(w.countries[occ].stability - 0.03);
}
