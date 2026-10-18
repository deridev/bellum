// Landings: an army crosses the sea to an enemy coast. The odds come from the fleets (each side's naval strength in the war)
// and the defenders near the beach; marines help. A landing that holds opens a front around its beachhead, supplied from the sea.
import { km } from '../../geo';
import type { Division, MapStatic, War, World } from '../types';
import { msg } from '../types';
import { say } from '../world';
import { nextRand } from '../rng';
import { activeWars, addTheater, placeUnit, sideOf, theatersOf, withdraw } from './war';
import { cellLonLat, cellOf, claimDisk, provAtLonLat, type Theater } from './theater';

/** A nation's fleet, abstract: its economy times its military share and equipment, if it has a coast at all. */
export function navalPower(w: World, S: MapStatic, c: number) {
  const C = w.countries[c]; if (!C.alive || !w.provinces.some(p => p.owner === c && S.provinces[p.id].coastal)) return 0;
  return C.gdp * C.budget.military * (C.quality ?? 1);
}
/** one side's share of the naval strength in a war (0..1) */
export function seaShare(w: World, S: MapStatic, war: War, side: 1 | -1) {
  const sum = (cs: number[]) => cs.reduce((a, c) => a + navalPower(w, S, c), 0), mine = sum(side > 0 ? war.attackers : war.defenders), theirs = sum(side > 0 ? war.defenders : war.attackers);
  return mine / Math.max(1e-9, mine + theirs);
}
export interface LandingPlan { err: string | null; war?: War; prov?: number; p: number; days: number; foes: number; share: number; units: Division[] }
/** What a landing by an army at a point would be: the target must be enemy coast. */
export function landingPlan(w: World, S: MapStatic, army: number, lon: number, lat: number): LandingPlan {
  const none = (err: string): LandingPlan => ({ err, p: 0, days: 0, foes: 0, share: 0, units: [] });
  const units = w.divisions.filter(d => d.army === army && !d.op && d.arrive <= w.day); if (!units.length) return none('army.empty');
  const c = units[0].country, prov = provAtLonLat(S, lon, lat); if (prov < 0) return none('army.notOurs');
  const owner = w.provinces[prov].controller, war = activeWars(w).find(x => sideOf(x, c) * sideOf(x, owner) === -1);
  if (!war) return none('army.notOurs');
  if (!S.provinces[prov].coastal) return none('land.inland');
  const side = sideOf(war, c) as 1 | -1, share = seaShare(w, S, war, side);
  // defenders near the beach: at the front or in garrison within 150 km
  let foes = 0;
  for (const d of w.divisions) { if (sideOf(war, d.country) !== -side) continue; const [x, y] = d.theater >= 0 ? [d.x, d.y] : S.provinces[d.prov].label; if (km(x, y, lon, lat) < 150) foes++; }
  const marines = units.filter(d => d.type === 'marines').length;
  const p = Math.max(0.05, Math.min(0.95, 0.12 + 0.8 * share ** 1.5 * (1 - Math.min(0.7, foes / units.length * 0.35)) + 0.05 * marines));
  // the crossing: from where the army stands (or its nearest port) to the beach, at 500 km a day
  const from = units.map(d => d.theater >= 0 ? [d.x, d.y] as [number, number] : S.provinces[d.prov].label)[0];
  const days = Math.round(4 + km(from[0], from[1], lon, lat) / 500);
  return { err: null, war, prov, p, days, foes, share, units };
}
/** Put to sea: the army leaves the map now, and lands (or is thrown back) when it arrives. */
export function launchLanding(w: World, S: MapStatic, army: number, lon: number, lat: number): string | null {
  const plan = landingPlan(w, S, army, lon, lat); if (plan.err || !plan.war) return plan.err;
  const war = plan.war, c = plan.units[0].country;
  // the war zone around the beach: an existing one that covers it, else a new one
  let t: Theater | undefined = theatersOf(w, war).find(x => { const k = cellOf(x, lon, lat); return k >= 0 && x.land[k]; });
  if (!t) { const cl = Math.cos(lat * Math.PI / 180); t = addTheater(w, S, war, [lon - 3.5 / cl, lat - 3.5, lon + 3.5 / cl, lat + 3.5]); }
  // the beach: the enemy land cell nearest the point (a click on the coast can fall just offshore)
  const side = t.sideOf[c]; let best = -1, bd = Infinity;
  for (let k = 0; k < t.W * t.H; k++) { if (!t.land[k] || t.c[k] * side > 0) continue; const [x, y] = cellLonLat(t, k), d = km(x, y, lon, lat); if (d < bd) { bd = d; best = k; } }
  if (best < 0 || bd > 80) return 'land.inland';
  [lon, lat] = cellLonLat(t, best);
  for (const d of plan.units) { d.op = 0; d.goal = [lon, lat, 1]; placeUnit(w, t, d, lon, lat, w.day + plan.days); } // at sea: its own order, out of the generals' line
  w.landings ||= []; w.landings.push({ id: w.nextId++, country: c, army, war: war.id, theater: t.id, at: [lon, lat], prov: plan.prov!, day: w.day + plan.days, p: plan.p });
  if (w.countries[c].player) say(w, msg('log.atSea', { a: { u: ['army', w.armies.find(a => a.id === army)?.num ?? 0] }, p: { p: plan.prov! }, n: plan.days }), 'war', { who: [c] });
  return null;
}
/** Daily: landings that reach their beach succeed (a beachhead, supplied from the sea) or fail (the army, battered, goes home). */
export function dailyLandings(w: World, S: MapStatic) {
  if (!w.landings?.length) return;
  for (const l of w.landings.filter(x => x.day <= w.day)) {
    const t = w.theaters.find(x => x.id === l.theater), war = w.wars.find(x => x.id === l.war), us = w.divisions.filter(d => d.army === l.army && d.theater === l.theater && d.arrive >= l.day - 1);
    const a = w.armies.find(x => x.id === l.army), name = { u: ['army', a?.num ?? 0] as [string, number] };
    if (!t || !war || war.ended || !us.length) continue;
    const side = t.sideOf[l.country];
    if (nextRand(w) < l.p) {
      claimDisk(t, l.at[0], l.at[1], 40, side);
      const k = cellOf(t, l.at[0], l.at[1]); (t.beach ||= []).push([k, side]);
      for (const d of us) d.goal = [d.x, d.y, 1];
      say(w, msg('log.landed', { a: name, c: { c: l.country }, p: { p: l.prov } }), 'war', { who: [l.country, w.provinces[l.prov].owner], at: l.at, big: w.countries[l.country].player ? 'big.landing' : undefined });
    } else {
      for (const d of us) { d.str *= 0.6; withdraw(d); d.prov = w.countries[l.country].capital; }
      say(w, msg('log.landingFailed', { a: name, c: { c: l.country }, p: { p: l.prov } }), 'war', { who: [l.country, w.provinces[l.prov].owner], at: l.at });
    }
  }
  w.landings = w.landings.filter(x => x.day > w.day);
}
