// Wars: declaration and alliances, theaters, occupation, score, peace and border settlement.
import { km } from '../../geo';
import { nextRand } from '../rng';
import type { Division, MapStatic, Msg, War, WarGoal, World } from '../types';
import { msg } from '../types';
import { addRel, clamp01, rel, say } from '../world';
import { newLeader } from '../politics';
import { commitShare, frontAggr } from './ai';
import { deployLine } from './armies';
import { buildMasks, cellLonLat, cellOf, createTheater, stepTheater, T, work, type Theater } from './theater';

export const sideOf = (war: War, c: number): 1 | -1 | 0 => war.attackers.includes(c) ? 1 : war.defenders.includes(c) ? -1 : 0;
export const activeWars = (w: World) => w.wars.filter(x => !x.ended);
export const warsOf = (w: World, c: number) => activeWars(w).filter(x => sideOf(x, c) !== 0);
export const enemies = (w: World, a: number, b: number) => activeWars(w).some(x => sideOf(x, a) * sideOf(x, b) === -1);
export const theatersOf = (w: World, war: War) => w.theaters.filter(t => t.war === war.id);

/** Countries that will defend `c` if attacked: alliance blocs, bilateral alliances and guarantees. */
export function defendersOf(w: World, c: number): number[] {
  const out = new Set<number>();
  const me = w.countries[c];
  if (me.bloc && w.blocs[me.bloc]?.alliance) for (const m of w.blocs[me.bloc].members) if (m !== c) out.add(m);
  for (const t of w.treaties) {
    if (t.type === 'alliance' && (t.a === c || t.b === c)) out.add(t.a === c ? t.b : t.a);
    if (t.type === 'guarantee' && t.b === c) out.add(t.a);
  }
  return [...out].filter(x => w.countries[x].alive);
}
export const allied = (w: World, a: number, b: number) => defendersOf(w, a).includes(b);
/** A puppet's foreign policy belongs to its overlord until the treaty runs out. */
export const overlordOf = (w: World, c: number) => w.treaties.find(t => t.type === 'puppet' && t.b === c);
/** What declaring war would cost the attacker (shown before the player commits). */
export function warCost(w: World, a: number, b: number) {
  const claim = w.provinces.some(p => p.owner === b && p.core.includes(a));
  const rival = rel(w, a, b) <= -50;
  const justified = claim || rival;
  const A = w.countries[a], truce = inTruce(w, a, b), ally = allied(w, a, b), overlord = overlordOf(w, a);
  // Nothing forbids a war. What restrains it is the price: an unpopular war shakes the government, broken word costs trust, friends of the victim stop trading.
  const stability = (justified ? 0.03 : 0.04 + 0.16 * (1 - A.warSupport)) + (truce ? 0.06 : 0) + (ally ? 0.04 : 0);
  const warSupport = justified ? 0.2 : truce ? -0.1 : -0.03; // a just cause rallies the public; an unprovoked war starts under doubt
  const sanctions = justified ? [] : w.treaties.filter(t => t.type === 'trade' && (t.a === a || t.b === a)).map(t => t.a === a ? t.b : t.a).filter(x => x !== b && rel(w, x, b) > 25);
  return { justified, claim, truce, ally, overlord, independence: overlord?.a === b, stability, warSupport, sanctions, worldOpinion: (justified ? -8 : -25) * (truce ? 2 : 1), joiners: defendersOf(w, b).filter(x => x !== a && !allied(w, a, x)) };
}

export function declareWar(w: World, S: MapStatic, a: number, b: number, opts: { goal?: WarGoal; silent?: boolean; name?: Msg; sides?: { attackers: number[]; defenders: number[] }; alone?: boolean } = {}): War {
  const A = w.countries[a], B = w.countries[b];
  const cost = warCost(w, a, b);
  const war: War = {
    id: w.nextId++, name: opts.name || msg('war.name', { a: { c: a }, b: { c: b } }), attackers: [a], defenders: [b], leadA: a, leadD: b,
    start: w.day, goal: opts.goal || { type: cost.claim ? 'claim' : 'conquest', provinces: [] }, score: 0, aggr: [1.15, 0.9],
    exhaustion: [0, 0], casualties: [0, 0], theaters: [], ended: 0,
  };
  w.wars.push(war);
  // attacking a partner tears up every treaty with it, and leaves the bloc they share
  if (!opts.silent && (cost.ally || cost.independence)) {
    w.treaties = w.treaties.filter(t => !((t.a === a && t.b === b) || (t.a === b && t.b === a)));
    if (A.bloc && A.bloc === B.bloc) { const bl = w.blocs[A.bloc]; bl.members = bl.members.filter(m => m !== a); A.bloc = ''; }
  }
  // a scenario can set both coalitions at once (e.g. the July Crisis of 1914)
  if (opts.sides) { for (const c of opts.sides.attackers) if (!war.attackers.includes(c)) war.attackers.push(c); for (const c of opts.sides.defenders) if (!war.defenders.includes(c)) war.defenders.push(c); }
  // the defender's allies are called to arms (unless they are friends of the attacker)
  if (!opts.alone) for (const d of defendersOf(w, b)) if (!war.attackers.includes(d) && !war.defenders.includes(d) && !allied(w, a, d) && rel(w, d, a) < 40) war.defenders.push(d);
  // the attacker's allies may join an offensive war if they share the grudge
  if (!opts.alone) for (const d of defendersOf(w, a)) if (!war.defenders.includes(d) && rel(w, d, b) < -40 && nextRand(w) < 0.6) war.attackers.push(d);
  if (!opts.silent) {
    A.stability = clamp01(A.stability - cost.stability);
    if (cost.sanctions.length) { w.treaties = w.treaties.filter(t => !(t.type === 'trade' && ((t.a === a && cost.sanctions.includes(t.b)) || (t.b === a && cost.sanctions.includes(t.a))))); say(w, msg('log.sanctions', { a: { c: a }, cs: { cs: cost.sanctions.slice(0, 5) }, n: cost.sanctions.length }), 'diplo', { who: [a, ...cost.sanctions] }); }
    for (const c of w.countries) if (c.alive && c.id !== a && !war.attackers.includes(c.id)) addRel(w, c.id, a, cost.worldOpinion * (war.defenders.includes(c.id) ? 2 : 1), false);
    for (const d of war.defenders) w.countries[d].warSupport = clamp01(w.countries[d].warSupport + 0.35);
    A.warSupport = clamp01(A.warSupport + cost.warSupport);
    say(w, msg('log.warDeclared', { a: { c: a }, b: { c: b } }), 'war', { who: [a, b, ...war.defenders], big: 'big.war' });
    if (war.defenders.length > 1) say(w, msg('log.joinDefence', { cs: { cs: war.defenders.slice(1, 6) }, n: war.defenders.length - 1 }), 'war', { who: war.defenders });
  }
  for (const c of [...war.attackers, ...war.defenders]) w.countries[c].stats.wars++;
  openTheaters(w, S, war);
  return war;
}

/** Find where the coalitions touch on land and open a theater around each contact zone. */
export function openTheaters(w: World, S: MapStatic, war: War) {
  const contact: number[] = [];
  for (const p of w.provinces) {
    const sa = sideOf(war, p.controller); if (!sa) continue;
    if (S.provinces[p.id].nbr.some(n => sideOf(war, w.provinces[n].controller) === -sa)) contact.push(p.id);
  }
  // cluster contact provinces that lie within ~700 km of each other (union-find, so the order doesn't matter)
  const parent = contact.map((_, i) => i), root = (i: number): number => parent[i] === i ? i : (parent[i] = root(parent[i]));
  for (let i = 0; i < contact.length; i++) for (let j = i + 1; j < contact.length; j++) if (km(...S.provinces[contact[i]].label, ...S.provinces[contact[j]].label) < 700) parent[root(i)] = root(j);
  const byRoot = new Map<number, number[]>(); contact.forEach((p, i) => { const r = root(i); if (!byRoot.has(r)) byRoot.set(r, []); byRoot.get(r)!.push(p); });
  const groups = [...byRoot.values()];
  const covered = (p: number) => theatersOf(w, war).some(t => cellOf(t, ...S.provinces[p].label) >= 0);
  const boxes: [number, number, number, number][] = [];
  for (const g of groups) {
    if (g.length < 2 && groups.length > 1) continue;
    if (g.every(covered)) continue; // this stretch of front already has a theater
    let x0 = 180, y0 = 90, x1 = -180, y1 = -90;
    for (const p of g) { const [lon, lat] = S.provinces[p].label; x0 = Math.min(x0, lon); x1 = Math.max(x1, lon); y0 = Math.min(y0, lat); y1 = Math.max(y1, lat); }
    const m = 3.5, mx = m / Math.cos(((y0 + y1) / 2) * Math.PI / 180); boxes.push([x0 - mx, y0 - m, x1 + mx, y1 + m]);
  }
  // overlapping boxes become one theater: two fields must never cover the same ground
  for (let merged = true; merged;) {
    merged = false;
    for (let i = 0; i < boxes.length && !merged; i++) for (let j = i + 1; j < boxes.length && !merged; j++) {
      const a = boxes[i], b = boxes[j];
      if (a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3]) { boxes[i] = [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])]; boxes.splice(j, 1); merged = true; }
    }
  }
  for (const b of boxes) addTheater(w, S, war, b);
}
export function addTheater(w: World, S: MapStatic, war: War, box: [number, number, number, number], name?: string): Theater {
  // clamp size; keep in -180..180
  const cx = (box[0] + box[2]) / 2, cy = (box[1] + box[3]) / 2;
  const hw = Math.min(22, (box[2] - box[0]) / 2), hh = Math.min(15, (box[3] - box[1]) / 2);
  const b: [number, number, number, number] = [Math.max(-180, cx - hw), Math.max(-58, cy - hh), Math.min(180, cx + hw), Math.min(80, cy + hh)];
  const sideMap: Record<number, 1 | -1> = {}; for (const c of war.attackers) sideMap[c] = 1; for (const c of war.defenders) sideMap[c] = -1;
  const near = S.cities.filter(c => c.lon > b[0] && c.lon < b[2] && c.lat > b[1] && c.lat < b[3]).sort((x, y) => y.pop - x.pop)[0];
  const first = !w.theaters.some(x => x.war === war.id);
  const t = createTheater(w, S, war.id, b, sideMap, name || (first ? `${w.countries[war.leadD].name} front` : near ? `${near.name} front` : 'Front'));
  w.theaters.push(t); war.theaters.push(t.id);
  deployInto(w, S, t);
  return t;
}
/** Units already stationed inside a new theater's box enter it immediately, up to the share of the commitment that holds the line
 *  (the rest of the commitment waits as the war's reserve). */
function deployInto(w: World, S: MapStatic, t: Theater) {
  const war = w.wars.find(x => x.id === t.war), room = new Map<number, number>();
  const roomFor = (c: number) => { let r = room.get(c); if (r === undefined) { const mine = w.divisions.filter(d => d.country === c); r = war ? Math.ceil(mine.length * commitShare(w, war, c) * T.line) - mine.filter(d => war.theaters.includes(d.theater)).length : Infinity; room.set(c, r); } return r; };
  // the player's armies go in whole (the AI's division by division); then every side's generals share out the front
  const groups = new Map<number, Division[]>();
  for (const d of w.divisions) {
    if (d.theater >= 0 || !t.sideOf[d.country]) continue;
    const [lon, lat] = S.provinces[d.prov].label; const k = cellOf(t, lon, lat);
    if (k < 0 || !t.land[k] || t.c[k] * t.sideOf[d.country] <= 0) continue;
    const key = w.countries[d.country].player ? d.army * 100000 + d.prov : -1 - d.id, l = groups.get(key) || []; l.push(d); groups.set(key, l); // the AI's divisions go one by one
  }
  for (const l of groups.values()) {
    const c = l[0].country; if (roomFor(c) <= 0) continue;
    const [lon, lat] = S.provinces[l[0].prov].label;
    for (const d of l) placeUnit(w, t, d, lon, lat);
    room.set(c, roomFor(c) - l.length);
  }
  for (const c of Object.keys(t.sideOf).map(Number)) deployLine(w, t, c); // each side's generals split the front between their armies
}
export function placeUnit(w: World, t: Theater, d: Division, lon: number, lat: number, arrive = 0) {
  d.theater = t.id; d.arrive = arrive;
  d.x = lon + (nextRand(w) - 0.5) * t.cw * 3; d.y = lat + (nextRand(w) - 0.5) * t.ch * 3;
  const k = cellOf(t, d.x, d.y); if (k < 0 || !t.land[k]) { d.x = lon; d.y = lat; }
}
/** Send a division to a theater, or move one already there (`from` = where it stands now).
 *  It goes where the front is most threatened, weighed against the trip, and arrives after travelling.
 *  A move within the theater only happens if the new sector is threatened by at least `minGain` more. */
export function sendToTheater(w: World, S: MapStatic, d: Division, t: Theater, from?: [number, number], minGain = 0) {
  const side = t.sideOf[d.country]; if (!side) return false;
  const [hx, hy] = from || S.provinces[d.prov].label;
  const step = Math.max(1, Math.floor(Math.sqrt(t.W * t.H) / 60));
  const wk = work(t), eff = side > 0 ? wk.eff0 : wk.eff1, haveEff = eff.some(v => v > 0);
  const own = side > 0 ? wk.P0 : wk.P1, foe = side > 0 ? wk.P1 : wk.P0;
  const [capx, capy] = S.provinces[w.countries[d.country].capital].label; // the sector in front of the capital matters most
  const threat = (k: number, x: number, y: number) => foe[k] / (own[k] + foe[k] + T.P0) * (1 + 1.5 * Math.max(0, 1 - km(capx, capy, x, y) / 300));
  let best = -1, bd = Infinity, bs = Infinity, bt = 0;
  for (let k = 0; k < t.W * t.H; k += step) {
    if (!t.land[k] || !t.main[k] || t.c[k] * side < 0.6 || (haveEff && eff[k] < 0.3)) continue;
    const [x, y] = cellLonLat(t, k), dd = km(hx, hy, x, y), df = wk.distF[k];
    const th = df >= 2 && df <= 4 ? threat(k, x, y) : 0;
    const sc = dd / 800 - 3 * th; if (sc < bs) { bs = sc; bd = dd; best = k; bt = th; }
  }
  if (best < 0) return false;
  if (from) { const k0 = cellOf(t, hx, hy); if (k0 < 0 || bt - threat(k0, hx, hy) < minGain) return false; }
  const overseas = !from && (!S.provinces[d.prov].nbr.length || bd > 2500);
  const days = Math.round(3 + bd / (overseas ? 300 : 450));
  const [x, y] = cellLonLat(t, best); placeUnit(w, t, d, x, y, w.day + days);
  return true;
}
export function withdraw(d: Division) { d.theater = -1; d.arrive = 0; d.op = 0; d.goal = undefined; d.sup = 1; } // at home a division is fully supplied

/** Daily war step: theaters, occupation, score, exhaustion. */
export function stepWars(w: World, S: MapStatic) {
  for (const war of activeWars(w)) {
    for (const t of theatersOf(w, war)) {
      if (t.frozen) continue;
      const units = w.divisions.filter(d => d.theater === t.id && d.arrive <= w.day);
      stepTheater(w, S, t, units, { aggr: frontAggr(w, war, t) });
      cullUnits(w, t, war, units);
      if (w.day % 2 === 0) { updateOccupation(w, S, t, war); maybeExpand(w, S, t); }
      reportCities(w, t, war);
    }
    if (w.day % 7 === 0) weeklyWar(w, S, war);
  }
}
function cullUnits(w: World, t: Theater, war: War, units: Division[]) {
  const gone: Division[] = [];
  for (const d of units) {
    if (d.sup === 0 && d.str < 0.42 * d.max) { w.countries[d.country].stats.captured += d.str; gone.push(d); }
    else if (d.str < 0.12 * d.max) gone.push(d);
  }
  if (!gone.length) return;
  war.lost ||= [0, 0]; for (const d of gone) war.lost[t.sideOf[d.country] > 0 ? 0 : 1]++;
  const cap = gone.filter(d => d.sup === 0);
  if (cap.length >= 2) say(w, msg('log.surrender', { n: cap.length, c: { c: cap[0].country } }), 'pocket', { who: [cap[0].country] });
  const ids = new Set(gone.map(d => d.id)); w.divisions = w.divisions.filter(d => !ids.has(d.id));
  (w as any)._removed = ((w as any)._removed || []).concat(gone.map(d => ({ ...d, gone: d.sup === 0 ? 'captured' : 'destroyed' })));
}
/** province controllers follow the field: the side holding its centre (or most of it) controls it */
function updateOccupation(w: World, S: MapStatic, t: Theater, war: War) {
  const counts = new Map<number, [number, number]>();
  for (let k = 0; k < t.W * t.H; k++) { if (!t.land[k]) continue; const p = t.prov[k]; let e = counts.get(p); if (!e) counts.set(p, e = [0, 0]); e[t.c[k] >= 0 ? 0 : 1]++; }
  const lead = leaders(w, t);
  for (const [p, [a, b]] of counts) {
    const prov = w.provinces[p], [lon, lat] = S.provinces[p].label, k = cellOf(t, lon, lat);
    let side: number = a >= b ? 1 : -1;
    if (k >= 0 && t.land[k]) side = t.c[k] >= 0 ? 1 : -1;
    const ownerSide = sideOf(war, prov.owner);
    const ctrl = ownerSide === side ? prov.owner : (prov.controller >= 0 && sideOf(war, prov.controller) === side ? prov.controller : takerNear(w, t, lon, lat, side as 1 | -1, side > 0 ? lead[0] : lead[1]));
    if (ctrl >= 0 && prov.controller !== ctrl) { prov.controller = ctrl; prov.devastation = Math.min(1, prov.devastation + 0.15); }
  }
}
/** Who takes ground: the country of the nearest division of that side (so France, not Russia, takes Stuttgart). */
function takerNear(w: World, t: Theater, lon: number, lat: number, side: 1 | -1, fallback: number) {
  let best = fallback, bd = Infinity;
  for (const d of w.divisions) { if (d.theater !== t.id || t.sideOf[d.country] !== side) continue; const dd = (d.x - lon) ** 2 + (d.y - lat) ** 2; if (dd < bd) { bd = dd; best = d.country; } }
  return best;
}
function leaders(w: World, t: Theater): [number, number] {
  const n = new Map<number, number>(); for (const d of w.divisions) if (d.theater === t.id) n.set(d.country, (n.get(d.country) || 0) + d.str);
  const best = (s: number) => { let b = -1, bv = -1; for (const [c, v] of n) if (t.sideOf[c] === s && v > bv) { bv = v; b = c; } if (b < 0) b = +(Object.entries(t.sideOf).find(([, x]) => x === s)?.[0] ?? -1); return b; };
  t.lead = [best(1), best(-1)]; return t.lead;
}
function reportCities(w: World, t: Theater, war: War) {
  for (const city of t.cities) {
    const s = t.c[city.k] >= 0 ? 1 : -1;
    if (s !== city.side) { city.side = s; const [cx, cy] = cellLonLat(t, city.k), who = takerNear(w, t, cx, cy, s as 1 | -1, s > 0 ? t.lead[0] : t.lead[1]); if (who >= 0) say(w, msg('log.cityFalls', { city: city.name, c: { c: who } }), 'city', { who: [who, ...(s > 0 ? war.defenders : war.attackers)], at: cellLonLat(t, city.k) }); }
  }
}
/** grow a theater when the front nears its edge */
function maybeExpand(w: World, S: MapStatic, t: Theater) {
  const wk = work(t), d = wk.distF, W = t.W, H = t.H; let n = false, s = false, e = false, west = false;
  for (let i = 0; i < W; i++) { if (d[3 * W + i] === 0) n = true; if (d[(H - 4) * W + i] === 0) s = true; }
  for (let j = 0; j < H; j++) { if (d[j * W + 3] === 0) west = true; if (d[j * W + W - 4] === 0) e = true; }
  if (!(n || s || e || west)) return;
  const grow = 3, box: [number, number, number, number] = [t.lon0 - (west ? grow / Math.cos(t.lat0 * Math.PI / 180) : 0), t.lat0 - t.H * t.ch - (s ? grow : 0), t.lon0 + t.W * t.cw + (e ? grow / Math.cos(t.lat0 * Math.PI / 180) : 0), t.lat0 + (n ? grow : 0)];
  if ((box[2] - box[0]) > 44 || (box[3] - box[1]) > 30) return;
  resample(w, S, t, box);
}
export function resample(w: World, S: MapStatic, t: Theater, box: [number, number, number, number]) {
  const old = { ...t, c: t.c.slice(), ent: t.ent.slice(), flip: t.flip.slice(), heat: t.heat.slice() };
  const nt = createTheater(w, S, t.war, box, t.sideOf, t.name);
  w.nextId--; // createTheater consumed an id; keep the old one
  // copy old control where it existed; elsewhere seed from province controllers (done by createTheater)
  for (let k = 0; k < nt.W * nt.H; k++) {
    const [lon, lat] = cellLonLat(nt, k), ok = cellOf(old as Theater, lon, lat);
    if (ok >= 0 && old.land[ok]) { nt.c[k] = old.c[ok]; nt.ent[k] = old.ent[ok]; nt.flip[k] = old.flip[ok]; nt.heat[k] = old.heat[ok]; }
  }
  Object.assign(t, { lon0: nt.lon0, lat0: nt.lat0, cw: nt.cw, ch: nt.ch, W: nt.W, H: nt.H, cellKm: nt.cellKm, land: nt.land, prov: nt.prov, mtn: nt.mtn, c: nt.c, ent: nt.ent, flip: nt.flip, heat: nt.heat, pocket: nt.pocket, main: nt.main, cities: nt.cities.map(cc => ({ ...cc, side: nt.c[cc.k] >= 0 ? 1 : -1 })) });
  (w as any)._theaterResized = true;
}
/** a country joining a war mid-way: its land becomes playable in every theater of the war */
export function joinWar(w: World, S: MapStatic, war: War, c: number, side: 1 | -1, silent = false) {
  if (sideOf(war, c)) return; (side > 0 ? war.attackers : war.defenders).push(c);
  for (const t of theatersOf(w, war)) { t.sideOf[c] = side; buildMasks(t, w, S, false); for (let k = 0; k < t.W * t.H; k++) if (t.land[k] && t.c[k] === 0) t.c[k] = side; deployInto(w, S, t); }
  openTheaters(w, S, war); // new fronts where the newcomer touches the enemy
  if (!silent) say(w, msg('log.joinsWar', { c: { c }, war: { m: war.name }, b: { c: side > 0 ? war.leadA : war.leadD } }), 'war', { who: [c] });
}

function weeklyWar(w: World, S: MapStatic, war: War) {
  const sc = warScore(w, war); if (Math.abs(sc - war.score) >= 4) (war as any).lastChange = w.day; war.score = sc;
  for (const [i, side] of [[0, war.attackers], [1, war.defenders]] as const) {
    const pop = side.reduce((a, c) => a + popTotal(w, c), 0);
    war.exhaustion[i] = clamp01(war.casualties[i] / Math.max(1, pop) * 40 + Math.max(0, w.day - war.start) / 3650);
    for (const c of side) { const C = w.countries[c]; C.warSupport = clamp01(C.warSupport - war.exhaustion[i] * 0.01 - (C.gov === 'democracy' ? 0.002 : 0)); }
  }
  for (const side of [1, -1] as const) if (!war.ended && surrenders(w, S, war, side)) { capitulate(w, S, war, side); return; }
  // in a world war, smaller members whose homeland is overrun make a separate peace too (Belgium, the Netherlands, 1940)
  if (war.total) for (const side of [1, -1] as const) for (const c of [...(side > 0 ? war.attackers : war.defenders)]) {
    const members = side > 0 ? war.attackers : war.defenders, lead = side > 0 ? war.leadA : war.leadD;
    if (c === lead || !members.includes(c) || !overrun(w, S, war, c, side)) continue;
    say(w, msg('log.capitulates', { c: { c } }), 'war', { who: [...war.attackers, ...war.defenders], big: 'big.capitulation' });
    separatePeace(w, S, war, c, side, members.filter(x => x !== c && w.countries[x].alive));
  }
  callToArms(w, S, war);
  for (const c of [...war.attackers, ...war.defenders]) governmentCrisis(w, S, war, c);
}
/** Signing an alliance (or a guarantee) with a country at war means joining its war. Older treaties were weighed at the declaration. */
function callToArms(w: World, S: MapStatic, war: War) {
  for (const t of w.treaties) {
    if (t.since <= war.start || (t.type !== 'alliance' && t.type !== 'guarantee')) continue;
    for (const [member, partner] of [[t.a, t.b], [t.b, t.a]]) {
      if (t.type === 'guarantee' && member !== t.b) continue; // a guarantee binds only the guarantor
      const side = sideOf(war, member); if (!side || sideOf(war, partner) || !w.countries[partner].alive) continue;
      const foes = side > 0 ? war.defenders : war.attackers;
      if (foes.some(f => allied(w, partner, f) || inTruce(w, partner, f))) continue;
      joinWar(w, S, war, partner, side);
    }
  }
}
/** A side gives up when its leader has lost the capital and most of its land, or is completely exhausted. */
function surrenders(w: World, S: MapStatic, war: War, side: 1 | -1) {
  const lead = side > 0 ? war.leadA : war.leadD;
  return overrun(w, S, war, lead, side) || (war.exhaustion[side > 0 ? 0 : 1] >= 1 && war.score * side < -40);
}
/** A nation is beaten when its capital and three quarters of its homeland (1000 km around the capital) are taken, or it holds nothing: colonies far away
 *  do not keep a nation fighting once the homeland is lost (France, 1940). */
function overrun(w: World, S: MapStatic, war: War, c: number, side: 1 | -1) {
  const C = w.countries[c], foes = side > 0 ? war.defenders : war.attackers, cap = S.provinces[C.capital].label;
  const own = w.provinces.filter(p => p.owner === c), held = own.filter(p => p.controller === c).length; if (held === 0) return true;
  if (!foes.includes(w.provinces[C.capital].controller)) return false;
  const home = own.filter(p => km(...S.provinces[p.id].label, ...cap) < 1000);
  return home.filter(p => p.controller === c).length <= home.length * 0.25;
}
/** The winners dictate the peace: everything they hold of the leader's land, and a puppet if nothing is left to take. */
function capitulate(w: World, S: MapStatic, war: War, side: 1 | -1) {
  const lead = side > 0 ? war.leadA : war.leadD, win = -side as 1 | -1;
  say(w, msg('log.capitulates', { c: { c: lead } }), 'war', { who: [...war.attackers, ...war.defenders], big: 'big.capitulation' });
  // a world war goes on while its allies still stand: the fallen country makes a separate peace and the strongest ally leads
  const foes = side > 0 ? war.defenders : war.attackers;
  const rest = (side > 0 ? war.attackers : war.defenders).filter(c => c !== lead && w.countries[c].alive && !foes.includes(w.provinces[w.countries[c].capital].controller));
  if (war.total && rest.length) { separatePeace(w, S, war, lead, side, rest); return; }
  const held = w.provinces.filter(p => sideOf(war, p.owner) === side && sideOf(war, p.controller) === win).map(p => p.id);
  const keep = w.provinces.filter(p => p.owner === lead && !held.includes(p.id)).length;
  makePeace(w, S, war, win, { type: 'treaty', provinces: held, puppet: keep > 0 && w.countries[lead].alive });
}
/** A fallen member leaves a world war: the winners keep the land they hold (it becomes their puppet if anything is left), it leaves every front,
 *  and the strongest of its allies leads the side. */
function separatePeace(w: World, S: MapStatic, war: War, c: number, side: 1 | -1, rest: number[], puppet = true) {
  const win = -side as 1 | -1, winners = win > 0 ? war.attackers : war.defenders, capHolder = w.provinces[w.countries[c].capital].controller, lead = winners.includes(capHolder) ? capHolder : (win > 0 ? war.leadA : war.leadD); // the winner in its capital becomes its overlord
  for (const p of w.provinces) if (p.owner === c && winners.includes(p.controller)) { p.owner = p.controller; p.unrest = p.core.includes(p.owner) ? 0 : 1; }
  for (const p of w.provinces) if (p.controller === c && p.owner !== c) p.controller = p.owner; // what it held of others returns
  if (w.provinces.some(p => p.owner === c)) { if (puppet) w.treaties.push({ type: 'puppet', a: lead, b: c, since: w.day, until: w.day + 365 * 10 }); }
  else { w.countries[c].alive = false; say(w, msg('log.gone', { c: { c } }), 'war', { who: [c], big: 'big.annexed' }); }
  if (side > 0) war.attackers = war.attackers.filter(x => x !== c); else war.defenders = war.defenders.filter(x => x !== c);
  war.score = warScore(w, war); // the score now counts only those still fighting
  for (const e of winners) w.cooldowns[truceKey(c, e)] = w.day + 365 * 5;
  const strongest = rest.slice().sort((a, b) => w.divisions.filter(d => d.country === b).length - w.divisions.filter(d => d.country === a).length)[0];
  if (side > 0) war.leadA = strongest; else war.leadD = strongest;
  for (const d of w.divisions) if (d.country === c && d.theater >= 0) withdraw(d);
  for (const t of theatersOf(w, war)) { delete t.sideOf[c]; buildMasks(t, w, S, false); }
  say(w, msg('log.separatePeace', { c: { c }, war: { m: war.name }, b: { c: strongest } }), 'peace', { who: [c, ...winners], big: 'big.capitulation' });
  // what is left of a side that has lost its great powers gives in with them
  const divs = (cs: number[]) => w.divisions.filter(d => cs.includes(d.country)).length, losers = side > 0 ? war.attackers : war.defenders;
  if (war.total && divs(losers) < 0.35 * divs(winners)) makePeace(w, S, war, win, { type: 'treaty', provinces: w.provinces.filter(p => losers.includes(p.owner) && winners.includes(p.controller)).map(p => p.id) });
}
/** A member leaves a world war of its own accord (a revolution, say): the enemy keeps what it holds, but there is no overlord. */
export function leaveWar(w: World, S: MapStatic, war: War, c: number) {
  const side = sideOf(war, c); if (!side) return;
  const rest = (side > 0 ? war.attackers : war.defenders).filter(x => x !== c && w.countries[x].alive);
  if (!rest.length) { makePeace(w, S, war, -side as 1 | -1, { type: 'treaty', provinces: w.provinces.filter(p => p.owner === c && sideOf(war, p.controller) === -side).map(p => p.id) }); return; }
  separatePeace(w, S, war, c, side, rest, false);
}
/** At home, a war that has lost all support brings the government down; a democracy's new government sues for peace. */
function governmentCrisis(w: World, S: MapStatic, war: War, c: number) {
  const C = w.countries[c]; if (C.warSupport > 0.02 || (w.cooldowns[`crisis:${c}`] ?? -1) > w.day) return;
  w.cooldowns[`crisis:${c}`] = w.day + 365;
  const old = C.leader.name; newLeader(w, C);
  C.stability = clamp01(C.stability - 0.06); C.warSupport = 0.2; C.polCap = Math.max(0, C.polCap - 30);
  say(w, msg('log.govFalls', { c: { c }, old, leader: C.leader.name }), 'politics', { who: [c], big: C.player ? 'big.govFalls' : undefined });
  if (C.gov === 'democracy') { const side = sideOf(war, c) as 1 | -1; if (acceptsPeace(w, war, side, { type: 'white', provinces: [] }).ok) makePeace(w, S, war, side, { type: 'white', provinces: [] }); }
}
const popTotal = (w: World, c: number) => { let s = 0; for (const p of w.provinces) if (p.owner === c) s += p.pop; return s; };
/** -100..100 from the attackers' view: occupied value, casualties, capitals */
export function warScore(w: World, war: War): number {
  const p = warScoreParts(w, war);
  return Math.max(-100, Math.min(100, Math.round(p.land + p.casualties + p.lost + p.capitals)));
}
/** What the war score is made of, in points for the attackers: land held, casualties, whole divisions lost, capitals taken. */
export function warScoreParts(w: World, war: War) {
  const val = (side: number[]) => { let g = 0, p = 0; for (const pr of w.provinces) if (side.includes(pr.owner)) { g += pr.gdp; p += pr.pop; } return { g: g || 1, p: p || 1 }; };
  const VA = val(war.attackers), VD = val(war.defenders);
  // the share of each province each side holds on the ground (inside a war zone), else who controls it: every kilometre the front moves counts
  const held = new Map<number, [number, number]>(); // province -> [cells held by attackers, cells]
  for (const t of theatersOf(w, war)) for (let k = 0; k < t.W * t.H; k++) { if (!t.land[k]) continue; let e = held.get(t.prov[k]); if (!e) held.set(t.prov[k], e = [0, 0]); e[1]++; if (t.c[k] >= 0) e[0]++; }
  let occD = 0, occA = 0;
  for (const pr of w.provinces) {
    const e = held.get(pr.id), fa = e ? e[0] / e[1] : war.attackers.includes(pr.controller) ? 1 : war.defenders.includes(pr.controller) ? 0 : -1;
    if (fa < 0) continue;
    if (war.defenders.includes(pr.owner)) occD += fa * (pr.gdp / VD.g + pr.pop / VD.p) / 2;
    if (war.attackers.includes(pr.owner)) occA += (1 - fa) * (pr.gdp / VA.g + pr.pop / VA.p) / 2;
  }
  const [ca, cd] = war.casualties; const cas = (cd - ca) / (ca + cd + 1) * 15;
  // whole divisions lost (pockets, routs), as a share of each side's army: a quarter of it is worth 10 points
  const [la, ld] = war.lost || [0, 0], army = (side: number[]) => w.divisions.filter(d => side.includes(d.country)).length;
  const lost = 40 * (ld / Math.max(1, army(war.defenders) + ld) - la / Math.max(1, army(war.attackers) + la));
  const capA = war.attackers.some(c => war.defenders.includes(w.provinces[w.countries[c].capital].controller)) ? -25 : 0;
  const capD = war.defenders.some(c => war.attackers.includes(w.provinces[w.countries[c].capital].controller)) ? 25 : 0;
  return { land: (occD - occA) * 160, casualties: cas, lost, capitals: capA + capD };
}

export interface PeaceTerms { type: 'white' | 'ceasefire' | 'treaty'; provinces: number[]; puppet?: boolean; reparations?: boolean }
/** War-score price of terms demanded by `side` (+1 attackers) */
export function termsCost(w: World, war: War, side: 1 | -1, terms: PeaceTerms): number {
  if (terms.type !== 'treaty') return 0;
  const losers = side > 0 ? war.defenders : war.attackers; let tot = 0, g = 0, p = 0;
  for (const pr of w.provinces) if (losers.includes(pr.owner)) { g += pr.gdp; p += pr.pop; }
  for (const id of terms.provinces) { const pr = w.provinces[id]; tot += (pr.gdp / (g || 1) + pr.pop / (p || 1)) / 2 * 130; }
  if (terms.puppet) tot += 45; if (terms.reparations) tot += 15;
  return Math.round(tot);
}
/** Would the other side accept? (AI) */
/** The provinces a side holds of its enemies' land, most valuable first, as many as a war score of `budget` pays for. */
export const truceKey = (a: number, b: number) => `truce:${Math.min(a, b)}:${Math.max(a, b)}`;
export const inTruce = (w: World, a: number, b: number) => (w.cooldowns[truceKey(a, b)] ?? -1) > w.day;
export function heldDemand(w: World, war: War, side: 1 | -1, budget: number): number[] {
  const losers = side > 0 ? war.defenders : war.attackers, winners = side > 0 ? war.attackers : war.defenders;
  const held = w.provinces.filter(p => losers.includes(p.owner) && winners.includes(p.controller)).sort((a, b) => b.gdp - a.gdp);
  const pick: number[] = [];
  for (const p of held) if (termsCost(w, war, side, { type: 'treaty', provinces: [...pick, p.id] }) <= budget) pick.push(p.id);
  return pick;
}
export function acceptsPeace(w: World, war: War, from: 1 | -1, terms: PeaceTerms): { ok: boolean; why: Msg } {
  const myScore = war.score * from; // from proposer's view
  const theirEx = war.exhaustion[from > 0 ? 1 : 0];
  // a world war is fought out: no settlement while a side has allies standing, or until it is worn out or crushed
  if (war.total) { // a world war ends with a winner: no white peace, no ceasefire; allies who still stand fall one by one, the last gives in when worn out
    const losers = from > 0 ? war.defenders : war.attackers;
    if (terms.type !== 'treaty' || myScore <= 0 || theirEx < (losers.length > 1 ? 0.85 : 0.6)) return { ok: false, why: msg('why.total') };
  }
  if (terms.type === 'white') { const ok = myScore < 15 || theirEx > 0.5 || w.day - war.start > 900; return { ok, why: msg(ok ? 'why.white.ok' : 'why.white.no') }; }
  if (terms.type === 'ceasefire') { const static_ = w.day - ((war as any).lastChange ?? war.start) > 180; const ok = myScore > -25 && (theirEx > 0.4 || (static_ && Math.abs(war.score) < 20)); return { ok, why: msg(ok ? 'why.cease.ok' : 'why.cease.no') }; }
  const cost = termsCost(w, war, from, terms), days = w.day - war.start;
  const ok = cost <= myScore + theirEx * 40 && (theirEx > 0.25 || myScore > 65 || days > 300);
  return { ok, why: ok ? msg('why.treaty.ok') : msg('why.treaty.no', { cost, score: Math.max(0, myScore) }) };
}
export function makePeace(w: World, S: MapStatic, war: War, winnerSide: 1 | -1, terms: PeaceTerms) {
  war.ended = w.day; war.winner = terms.type === 'treaty' ? winnerSide : 0;
  for (const a of war.attackers) for (const d of war.defenders) w.cooldowns[truceKey(a, d)] = w.day + 365 * 5; // a truce follows every peace
  const winners = winnerSide > 0 ? war.attackers : war.defenders, losers = winnerSide > 0 ? war.defenders : war.attackers;
  const ths = theatersOf(w, war);
  // ceded land takes its share of the national debt with it (a rump state is not crushed by the old country's loans)
  const output = (c: number) => w.provinces.reduce((a, p) => a + (p.owner === c ? p.gdp : 0), 0), before = losers.map(output);
  if (terms.type === 'treaty') {
    for (const id of terms.provinces) {
      const pr = w.provinces[id]; if (!losers.includes(pr.owner)) continue;
      const to = winners.includes(pr.controller) ? pr.controller : winners[0];
      pr.owner = to; pr.controller = to; pr.unrest = pr.core.includes(to) ? 0 : 1; // a conquest must be integrated before it is truly yours; land returned to its people is calm
    }
    if (terms.puppet) for (const l of losers.slice(0, 1)) w.treaties.push({ type: 'puppet', a: winners[0], b: l, since: w.day, until: w.day + 365 * 10 });
    if (terms.reparations) for (const l of losers) { const L = w.countries[l]; const amount = L.gdp * 0.05; L.debt += amount; w.countries[winners[0]].treasury += amount; }
  }
  if (terms.type === 'ceasefire') {
    // the line of contact becomes the border: provinces go to whoever holds them; the front freezes as a DMZ
    for (const pr of w.provinces) if (sideOf(war, pr.owner) && sideOf(war, pr.controller) && sideOf(war, pr.owner) !== sideOf(war, pr.controller)) { pr.owner = pr.controller; pr.unrest = pr.core.includes(pr.owner) ? 0 : 1; }
    for (const t of ths) { t.frozen = true; t.dmz = t.c.slice(); }
  }
  losers.forEach((l, i) => { if (before[i] > 0) w.countries[l].debt *= output(l) / before[i]; });
  // everything else returns to its owner
  for (const pr of w.provinces) if (sideOf(war, pr.owner) || sideOf(war, pr.controller)) { if (pr.controller !== pr.owner && (sideOf(war, pr.controller) || !w.countries[pr.controller].alive)) pr.controller = pr.owner; }
  for (const d of w.divisions) if (ths.some(t => t.id === d.theater)) { withdraw(d); if (w.provinces[d.prov].owner !== d.country) d.prov = w.countries[d.country].capital; }
  if (terms.type !== 'ceasefire') w.theaters = w.theaters.filter(t => t.war !== war.id);
  // countries that lost everything are gone
  for (const c of [...war.attackers, ...war.defenders]) if (!w.provinces.some(p => p.owner === c)) { w.countries[c].alive = false; say(w, msg('log.gone', { c: { c } }), 'war', { who: [c], big: 'big.annexed' }); }
  say(w, msg('log.peace.' + terms.type, { war: { m: war.name }, n: terms.provinces.length }), 'peace', { who: [...war.attackers, ...war.defenders], big: 'big.peace' });
  for (const c of [...war.attackers, ...war.defenders]) { const C = w.countries[c]; C.warSupport = 0.3; C.stability = clamp01(C.stability + (winners.includes(c) ? 0.06 : -0.04)); }
}
