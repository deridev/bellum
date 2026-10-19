// Historical scenarios: 1914 and 1939. Tables for building the world, period economics, and the opening moves.
import type { ProvinceData } from '../data/types';
import { CULTURE_OF, type Tables } from './data';
import type { AgendaItem, MapStatic, War, World } from './types';
import { msg } from './types';
import { declareWar, joinWar, leaveWar, sideOf } from './war/war';
import { newLeader } from './politics';
import { addRel, clamp01, say } from './world';
import { cellLonLat, deployAlongFront } from './war/theater';
import { nextRand } from './rng';

// names for historical states
Object.assign(CULTURE_OF, { GER: 'german', AUH: 'german', OTT: 'turkic', SOV: 'slavic_e', YUG: 'slavic', MAN: 'chinese', TIB: 'chinese', NEJ: 'arabic', SVK: 'slavic' });

// ---------------------------------------------------------------- economics
// The base map carries present-day population and output. A province's period population is today's times the
// share its region had then; its output is that population times the region's output per person in the period
// (rough 2011-dollar levels after Maddison). That keeps the early 20th century's huge gaps between regions.
type Region = 'euw' | 'eue' | 'rus' | 'na' | 'lat' | 'mena' | 'ssa' | 'sas' | 'eas' | 'sea' | 'oce';
const REGION: Record<string, Region> = {};
const put = (r: Region, codes: string) => codes.split(' ').forEach(c => (REGION[c] = r));
put('euw', 'GBR IRL FRA BEL NLD LUX DEU CHE AUT DNK SWE NOR FIN ISL ITA ESP PRT MLT AND MCO LIE SMR');
put('eue', 'POL CZE SVK HUN ROU BGR SRB HRV SVN BIH MNE MKD ALB GRC CYP CYN EST LVA LTU BLR UKR MDA KOS');
put('rus', 'RUS GEO ARM AZE KAZ UZB TKM KGZ TJK');
put('na', 'USA CAN');
put('mena', 'TUR SYR LBN ISR PSX JOR IRQ IRN SAU YEM OMN ARE QAT KWT BHR EGY LBY TUN DZA MAR SAH');
put('sas', 'IND PAK BGD NPL LKA BTN AFG');
put('eas', 'CHN JPN KOR PRK TWN MNG');
put('sea', 'VNM THA LAO KHM MMR MYS SGP IDN PHL BRN TLS PNG');
put('oce', 'AUS NZL FJI SLB VUT NCL');
const POP: Record<'1914' | '1939', Record<Region, number>> = {
  '1914': { euw: 0.62, eue: 0.62, rus: 0.5, na: 0.27, lat: 0.12, mena: 0.09, ssa: 0.08, sas: 0.16, eas: 0.32, sea: 0.13, oce: 0.19 },
  '1939': { euw: 0.7, eue: 0.72, rus: 0.6, na: 0.36, lat: 0.19, mena: 0.14, ssa: 0.11, sas: 0.2, eas: 0.36, sea: 0.18, oce: 0.24 },
};
const PER_HEAD: Record<'1914' | '1939', Record<Region, number>> = { // dollars per person per year
  '1914': { euw: 5200, eue: 2800, rus: 2300, na: 8500, lat: 2500, mena: 1400, ssa: 900, sas: 1000, eas: 1000, sea: 1100, oce: 7500 },
  '1939': { euw: 6800, eue: 3600, rus: 3800, na: 9500, lat: 3100, mena: 1700, ssa: 1000, sas: 1050, eas: 1050, sea: 1300, oce: 8300 },
};
const PER_HEAD_C: Record<'1914' | '1939', Record<string, number>> = { '1914': { GBR: 8100, DEU: 6000, JPN: 2300, ARG: 6500, URY: 5800, ITA: 3800, ESP: 3400, PRT: 2200 }, '1939': { GBR: 9800, DEU: 8500, JPN: 4300, ARG: 7000, ITA: 5000, ESP: 3300, SWE: 7500 } };
function regionOf(code: string, lon: number, lat: number): Region {
  if (REGION[code]) return REGION[code];
  if (lon < -30) return lat > 15 && lon < -50 && code !== 'MEX' ? 'na' : 'lat';
  if (lon < 52 && lat < 20 && lat > -36) return 'ssa';
  if (lon > 110 && lat < -10) return 'oce';
  return lon > 95 ? 'sea' : 'mena';
}
/** Provinces with period population and output (owners stay as the scenario sets them). */
export function eraProvinces(provinces: ProvinceData[], year: '1914' | '1939', modernOwner: string[]): ProvinceData[] {
  return provinces.map((p, i) => {
    const m = modernOwner[i], r = regionOf(m, p.label[0], p.label[1]);
    const pop = p.pop * POP[year][r];
    return { ...p, pop, gdp: pop * (PER_HEAD_C[year][m] ?? PER_HEAD[year][r]) / 1e6 };
  });
}

// ---------------------------------------------------------------- 1914
const EUROPE_POWERS = { GER: 'expansionist', AUH: 'opportunist', RUS: 'opportunist', FRA: 'defensive', GBR: 'defensive', ITA: 'opportunist', OTT: 'opportunist', SRB: 'defensive', BGR: 'opportunist', ROU: 'opportunist', USA: 'isolationist', JPN: 'expansionist' } as const;
export const TABLES_1914: Tables = {
  // standing armies on mobilization, thousands (a division is 12,000 men)
  active: { GER: 1250, FRA: 1000, RUS: 1400, AUH: 1000, GBR: 260, SRB: 250, BEL: 120, OTT: 400, ITA: 420, MNE: 40, USA: 100, JPN: 300, BGR: 220, ROU: 260, GRC: 110, CHN: 300, ESP: 120, NLD: 90, SWE: 80, CHE: 100, DNK: 50, NOR: 40, PRT: 40, BRA: 30, ARG: 30, MEX: 50 },
  milGdp: { GER: 3.5, FRA: 4, RUS: 4.5, AUH: 3, GBR: 3.2, ITA: 3, OTT: 3, SRB: 5, JPN: 4 },
  gov: { GER: 'monarchy', AUH: 'monarchy', RUS: 'monarchy', ITA: 'monarchy', OTT: 'monarchy', SRB: 'monarchy', MNE: 'monarchy', BGR: 'monarchy', ROU: 'monarchy', GRC: 'monarchy', JPN: 'monarchy', ESP: 'monarchy', BEL: 'monarchy', NLD: 'monarchy', SWE: 'monarchy', NOR: 'monarchy', DNK: 'monarchy', THA: 'monarchy', IRN: 'monarchy', AFG: 'monarchy', NPL: 'monarchy', BTN: 'monarchy', NEJ: 'monarchy', ETH: 'monarchy', CHN: 'authoritarian', MEX: 'junta', TIB: 'theocracy', MNG: 'theocracy' },
  ideology: { GER: [0.3, 0.75], AUH: [0.2, 0.8], RUS: [0, 0.95], GBR: [0.6, 0.1], FRA: [0.3, -0.2], USA: [0.7, -0.1], OTT: [0, 0.8] },
  personality: { ...EUROPE_POWERS },
  blocs: { entente: { name: 'Triple Entente', alliance: true, members: ['FRA', 'RUS', 'GBR'] }, central: { name: 'Central Powers', alliance: true, members: ['GER', 'AUH'] } },
  treaties: [['RUS', 'SRB', 'guarantee'], ['GBR', 'BEL', 'guarantee'], ['GBR', 'JPN', 'alliance'], ['RUS', 'MNE', 'guarantee']],
  rivals: [['AUH', 'SRB', -95], ['GER', 'FRA', -80], ['GER', 'RUS', -60], ['AUH', 'RUS', -75], ['GER', 'GBR', -50], ['OTT', 'RUS', -70], ['ITA', 'AUH', -30], ['BGR', 'SRB', -60], ['OTT', 'GRC', -60], ['JPN', 'GER', -30], ['JPN', 'CHN', -50], ['OTT', 'BGR', -40]],
  friends: [['GER', 'AUH', 85], ['GER', 'OTT', 40], ['FRA', 'RUS', 80], ['FRA', 'GBR', 70], ['GBR', 'RUS', 50], ['RUS', 'SRB', 80], ['GBR', 'USA', 40], ['FRA', 'BEL', 60], ['GBR', 'BEL', 60]],
  pm: new Set(['GBR', 'CAN', 'AUS', 'NZL', 'ZAF']),
  titles: { GER: 'Emperor', AUH: 'Emperor', RUS: 'Tsar', OTT: 'Sultan', JPN: 'Emperor', FRA: 'President', ITA: 'King', CHN: 'President' },
  tech: { GER: 3, GBR: 2, FRA: 2, USA: 2, AUH: 1, RUS: 0, ITA: 1, OTT: 0, SRB: 1, BEL: 2, JPN: 2 },
  mix: {},
  conscription: { GER: 'extensive', FRA: 'extensive', RUS: 'extensive', AUH: 'extensive', ITA: 'limited', OTT: 'limited', SRB: 'extensive', BEL: 'limited', GBR: 'volunteer', USA: 'volunteer', JPN: 'limited' },
  warSupport: { GER: 0.7, FRA: 0.75, RUS: 0.6, AUH: 0.65, GBR: 0.6, SRB: 0.85, BEL: 0.8 },
};

// ---------------------------------------------------------------- 1939
export const TABLES_1939: Tables = {
  active: { GER: 1600, POL: 450, FRA: 1000, GBR: 300, SOV: 2000, ITA: 700, JPN: 1100, CHN: 1700, USA: 190, MAN: 100, HUN: 200, ROU: 450, YUG: 400, TUR: 200, FIN: 130, SVK: 50, BEL: 250, NLD: 200, CZE: 0, GRC: 150, BGR: 120, ESP: 300, PRT: 50, SWE: 100, NOR: 30, DNK: 20, CHE: 120, IRN: 100, EGY: 30, IRQ: 30, THA: 60, MNG: 50, CAN: 50, AUS: 50, BRA: 80, ARG: 50 },
  milGdp: { GER: 18, SOV: 12, JPN: 22, ITA: 8, FRA: 8, GBR: 7, POL: 6, USA: 1.5, CHN: 8 },
  gov: { GER: 'authoritarian', ITA: 'authoritarian', SOV: 'oneparty', JPN: 'monarchy', ESP: 'authoritarian', POL: 'authoritarian', HUN: 'monarchy', ROU: 'monarchy', YUG: 'monarchy', BGR: 'monarchy', GRC: 'authoritarian', TUR: 'oneparty', CHN: 'oneparty', MAN: 'monarchy', SVK: 'authoritarian', PRT: 'authoritarian', THA: 'junta', IRN: 'monarchy', IRQ: 'monarchy', EGY: 'monarchy', SAU: 'monarchy', YEM: 'monarchy', AFG: 'monarchy', NPL: 'monarchy', BTN: 'monarchy', MNG: 'oneparty', TIB: 'theocracy', BEL: 'monarchy', NLD: 'monarchy', NOR: 'monarchy', SWE: 'monarchy', DNK: 'monarchy' },
  ideology: { GER: [0.2, 1], ITA: [0.1, 0.95], SOV: [-1, 0.95], JPN: [0.2, 0.9], GBR: [0.5, 0.05], FRA: [0.1, -0.2], USA: [0.4, -0.2], POL: [0.2, 0.5], CHN: [0, 0.7] },
  personality: { GER: 'expansionist', ITA: 'expansionist', SOV: 'expansionist', JPN: 'expansionist', HUN: 'opportunist', BGR: 'opportunist', USA: 'isolationist', GBR: 'defensive', FRA: 'defensive', POL: 'defensive', TUR: 'isolationist', ESP: 'isolationist', SWE: 'isolationist', CHE: 'isolationist' },
  blocs: { allies: { name: 'Allies', alliance: true, members: ['GBR', 'FRA', 'POL'] }, axis39: { name: 'Axis', alliance: true, members: ['GER', 'ITA'] } },
  treaties: [['GER', 'SOV', 'nap'], ['GER', 'SVK', 'puppet'], ['JPN', 'MAN', 'puppet'], ['SOV', 'MNG', 'alliance'], ['GBR', 'ROU', 'guarantee'], ['GBR', 'GRC', 'guarantee'], ['FRA', 'ROU', 'guarantee']],
  rivals: [['GER', 'POL', -90], ['GER', 'FRA', -65], ['GER', 'GBR', -55], ['GER', 'SOV', -45], ['JPN', 'CHN', -100], ['JPN', 'USA', -45], ['JPN', 'SOV', -55], ['ITA', 'FRA', -40], ['ITA', 'GBR', -30], ['SOV', 'POL', -65], ['SOV', 'FIN', -55], ['SOV', 'EST', -40], ['SOV', 'LVA', -40], ['SOV', 'LTU', -40], ['SOV', 'ROU', -40], ['HUN', 'ROU', -55], ['HUN', 'SVK', -40], ['BGR', 'ROU', -30], ['ITA', 'GRC', -40], ['ITA', 'YUG', -35], ['GER', 'CZE', -60]],
  friends: [['GER', 'ITA', 70], ['GER', 'HUN', 45], ['GER', 'JPN', 40], ['GER', 'SVK', 60], ['GBR', 'FRA', 85], ['GBR', 'POL', 60], ['FRA', 'POL', 60], ['GBR', 'USA', 55], ['USA', 'CHN', 40], ['SOV', 'MNG', 80], ['JPN', 'MAN', 80], ['GBR', 'CAN', 80], ['GBR', 'AUS', 80], ['GBR', 'NZL', 80]],
  pm: new Set(['GBR', 'CAN', 'AUS', 'NZL', 'ZAF', 'FRA']),
  titles: { GER: 'Führer', ITA: 'Duce', SOV: 'General Secretary', JPN: 'Emperor', FRA: 'Premier', MAN: 'Emperor', HUN: 'King', ROU: 'King', YUG: 'King', CHN: 'President' },
  tech: { GER: 7, GBR: 4, FRA: 4, USA: 4, SOV: 3, JPN: 6, ITA: 2, POL: 1, CHN: 0, MAN: 1, HUN: 2, ROU: 1, YUG: 1, FIN: 3 }, // doctrine and equipment, 5% each
  mix: { GER: [0.1, 0.05], FRA: [0.06, 0.04], GBR: [0.08, 0.1], SOV: [0.06, 0.02], USA: [0.05, 0.05], JPN: [0.02, 0.04], ITA: [0.03, 0.03] },
  conscription: { GER: 'extensive', FRA: 'extensive', SOV: 'extensive', JPN: 'extensive', ITA: 'extensive', POL: 'extensive', GBR: 'limited', USA: 'volunteer', CHN: 'extensive' },
  warSupport: { GER: 0.55, POL: 0.85, FRA: 0.45, GBR: 0.55, JPN: 0.7, CHN: 0.85 },
};

// Equipment and training in each era's great armies, where money alone misjudges them: the German army of 1914 was the best
// in Europe and Russia's ran short of guns and shells; in 1939 the Wehrmacht led, and the Red Army was still reeling from the purges.
const QUALITY: Record<'1914' | '1939', Record<string, number>> = {
  '1914': { GER: 1.3, AUH: 0.95, RUS: 0.78, FRA: 1.05, GBR: 1.2, BEL: 0.9, SRB: 0.85, MNE: 0.8, OTT: 0.8, ITA: 0.85, BGR: 0.85, ROU: 0.8, USA: 1.15, JPN: 1.05 },
  '1939': { GER: 1.35, ITA: 0.85, SOV: 0.8, FRA: 1.0, GBR: 1.2, POL: 0.85, JPN: 1.15, CHN: 0.7, USA: 1.25, FIN: 1.0, HUN: 0.85, ROU: 0.8 },
};

// ---------------------------------------------------------------- scripted moments
/** The moments history fixes in advance, by date: nations entering the great war, Russia's revolution, Barbarossa, Pearl Harbor.
 *  Each happens only if the world still allows it (the war goes on, the nation stands and is not already fighting). When it is the
 *  player's nation that history would move, the player decides instead, on a card. */
interface Moment {
  date: string; id: string; c: string; side?: 1 | -1; kind: 'join' | 'revolution' | 'invade';
  by?: string; with?: string[]; also?: string[]; // an invasion: the aggressor, who marches with it, and other nations attacked with the target
  until?: string; when?: (w: World, war: War) => boolean; // if the world is not ready on the day, try again each month until then
}
const TIMELINE: Record<string, Moment[]> = {
  '1914': [
    { date: '1914-10-29', id: 'ott', c: 'OTT', side: 1, kind: 'join' },
    { date: '1915-05-23', id: 'ita', c: 'ITA', side: -1, kind: 'join' },
    { date: '1915-10-14', id: 'bgr', c: 'BGR', side: 1, kind: 'join' },
    { date: '1916-08-27', id: 'rou', c: 'ROU', side: -1, kind: 'join' },
    { date: '1917-04-06', id: 'usa', c: 'USA', side: -1, kind: 'join' },
    { date: '1917-11-07', id: 'rus', c: 'RUS', kind: 'revolution' },
  ],
  '1939': [
    { date: '1940-06-10', id: 'ita', c: 'ITA', side: 1, kind: 'join' },
    { date: '1940-05-10', id: 'gelb', c: 'BEL', also: ['NLD', 'LUX'], side: -1, by: 'GER', kind: 'invade' },
    { date: '1941-06-22', until: '1942-06-22', id: 'barbarossa', c: 'SOV', side: -1, by: 'GER', with: ['HUN', 'FIN'], kind: 'invade', when: (w, war) => war.score >= 40 || !war.defenders.some(c => w.countries[c].code === 'FRA') }, // only once the West is won
    { date: '1941-12-07', id: 'pearl', c: 'USA', side: -1, by: 'JPN', kind: 'invade' },
  ],
};
const dayOf = (w: World, date: string) => Math.round((Date.parse(date + 'T00:00:00Z') - w.startDate) / 864e5);
/** Daily: today's moments, and the Soviet invasion of Poland (17 September 1939), which is a war of its own. */
export function historyDaily(w: World, S: MapStatic) {
  if (w.scenario === '1939' && w.day === 16) {
    const sov = w.countries.find(c => c.code === 'SOV'), pol = w.countries.find(c => c.code === 'POL');
    if (sov && pol && sov.alive && pol.alive && !sov.player && !w.wars.some(x => !x.ended && (x.attackers.includes(sov.id) || x.defenders.includes(sov.id)))) { const war = declareWar(w, S, sov.id, pol.id, { alone: true }); war.aggr = [1.22, 0.9]; }
  }
  for (const m of TIMELINE[w.scenario] ?? []) {
    const d0 = dayOf(w, m.date), d1 = m.until ? dayOf(w, m.until) : d0;
    if (w.day < d0 || w.day > d1 || (w.day - d0) % 30 !== 0 || w.cooldowns[`hist:${m.id}`]) continue;
    const war = w.wars.find(x => x.id === w.goalWar);
    if (war && !war.ended && m.when && !m.when(w, war)) continue;
    w.cooldowns[`hist:${m.id}`] = w.day; moment(w, S, m);
  }
}
const code = (w: World, k: string) => w.countries.findIndex(c => c.code === k && c.alive);
function moment(w: World, S: MapStatic, m: Moment) {
  const war = w.wars.find(x => x.id === w.goalWar); if (!war || war.ended) return;
  const c = code(w, m.c); if (c < 0) return;
  if (m.kind === 'revolution') {
    if (!sideOf(war, c)) return;
    if (w.countries[c].player) return ask(w, war, m, c, -1);
    return revolution(w, S, war, c);
  }
  const side = m.side!, foes = side > 0 ? war.defenders : war.attackers, friends = side > 0 ? war.attackers : war.defenders;
  const ok = (k: number) => k >= 0 && !sideOf(war, k) && !w.wars.some(x => !x.ended && x !== war && (sideOf(x, k) !== 0) && [...friends, ...foes].some(f => sideOf(x, f) === -sideOf(x, k)));
  if (m.kind === 'join') {
    if (!ok(c)) return;
    if (w.countries[c].player) return ask(w, war, m, c, side);
    return enter(w, S, war, m, c, side);
  }
  // an invasion: the aggressors (or the one already in the war) attack the target, which joins the other side
  const lead = code(w, m.by!);
  if (lead < 0 || !ok(c) || (sideOf(war, lead) !== -side && !ok(lead))) return; // the aggressor must be in the war on the other side, or free to join it
  if (w.countries[lead].player) return ask(w, war, m, c, side);
  invade(w, S, war, m, c, side);
}
function enter(w: World, S: MapStatic, war: War, m: Moment, c: number, side: 1 | -1) {
  joinWar(w, S, war, c, side, true);
  const big = (side > 0 ? war.attackers : war.defenders).filter(k => k !== c).sort((a, b) => w.divisions.filter(d => d.country === b).length - w.divisions.filter(d => d.country === a).length)[0];
  say(w, msg('hist.joins', { c: { c }, war: { m: war.name }, o: { c: big } }), 'war', { who: [c, ...war.attackers, ...war.defenders], big: 'big.war', prov: w.countries[c].capital });
}
function invade(w: World, S: MapStatic, war: War, m: Moment, c: number, side: 1 | -1) {
  const lead = code(w, m.by!), targets = [c, ...(m.also ?? []).map(x => code(w, x)).filter(k => k >= 0 && !sideOf(war, k))];
  w.treaties = w.treaties.filter(t => !(targets.includes(t.a) && t.b === lead) && !(targets.includes(t.b) && t.a === lead)); // the pact is torn up
  if (!sideOf(war, lead)) joinWar(w, S, war, lead, -side as 1 | -1, true);
  for (const k of (m.with ?? []).map(x => code(w, x))) if (k >= 0 && !sideOf(war, k)) joinWar(w, S, war, k, -side as 1 | -1);
  for (const k of targets) joinWar(w, S, war, k, side, k === c);
  say(w, msg('hist.' + m.id, { c: { c: lead }, o: { c } }), 'war', { who: [c, lead, ...war.attackers, ...war.defenders], big: 'big.war', prov: w.countries[c].capital });
}
function revolution(w: World, S: MapStatic, war: War, c: number) {
  const C = w.countries[c];
  C.gov = 'oneparty'; C.ideology = [-1, 0.9]; newLeader(w, C); C.stability = clamp01(C.stability - 0.1);
  say(w, msg('hist.revolution', { c: { c } }), 'politics', { who: [c, ...war.attackers, ...war.defenders], big: 'big.revolution', prov: C.capital });
  leaveWar(w, S, war, c);
}
/** The player's nation is the one history would move: a card. Option 0 does what history did. */
function ask(w: World, war: War, m: Moment, c: number, side: 1 | -1) {
  const lead = side > 0 ? war.leadA : war.leadD, foe = side > 0 ? war.leadD : war.leadA;
  const k = m.kind === 'revolution' ? 'revolution' : m.kind === 'invade' ? m.id : 'join';
  const a = { c: { c: w.countries.findIndex(x => x.player) }, o: { c: m.kind === 'invade' ? c : lead }, e: { c: foe }, war: { m: war.name } };
  w.agenda.push({ id: w.nextId++, country: w.countries.findIndex(x => x.player), day: w.day, kind: 'history', title: msg(`hist.ask.${k}.title`, a), text: msg(`hist.ask.${k}.text`, a), expires: w.day + 60, dflt: 0,
    data: { moment: m.id, war: war.id, c, side }, options: [0, 1].map(i => ({ label: msg(`hist.ask.${k}.o${i}`, a), hint: msg(`hist.ask.${k}.h${i}`, a), effect: 'history.' + i })) });
}
/** The player's answer to a history card. */
export function resolveHistory(w: World, S: MapStatic, item: AgendaItem, option: number) {
  const war = w.wars.find(x => x.id === item.data.war); if (!war || war.ended) return;
  const m = (TIMELINE[w.scenario] ?? []).find(x => x.id === item.data.moment); if (!m) return;
  const { c, side } = item.data, me = item.country;
  if (m.kind === 'revolution') { if (option === 0) revolution(w, S, war, c); else { const C = w.countries[c]; C.stability = clamp01(C.stability - 0.15); C.warSupport = clamp01(C.warSupport - 0.1); } return; }
  if (option === 1) { if (m.kind === 'join') addRel(w, side > 0 ? war.leadA : war.leadD, me, -15, false); return; } // turning down an ally costs its goodwill
  if (m.kind === 'join') enter(w, S, war, m, c, side); else invade(w, S, war, m, c, side);
}

// ---------------------------------------------------------------- opening moves
export function setupHistory(w: World, S: MapStatic) {
  const ci: Record<string, number> = {}; w.countries.forEach(c => (ci[c.code] = c.id));
  const has = (...cs: string[]) => cs.every(c => ci[c] !== undefined);
  const era = QUALITY[w.scenario as '1914' | '1939']; if (era) for (const [k, q] of Object.entries(era)) if (ci[k] !== undefined) w.countries[ci[k]].quality = q;
  const ids = (cs: string[]) => cs.filter(c => ci[c] !== undefined).map(c => ci[c]);
  /** Send each country's divisions to its fronts by plan: [lon, lat, share] picks the theater nearest that point. The rest stay in reserve. */
  const deploy = (war: ReturnType<typeof declareWar>, plans: Record<string, [number, number, number][]>) => {
    const ths = w.theaters.filter(x => x.war === war.id), target = new Map<number, [number, number]>();
    const center = (t: typeof ths[number]) => [t.lon0 + t.W * t.cw / 2, t.lat0 - t.H * t.ch / 2];
    for (const d of w.divisions) {
      const plan = plans[w.countries[d.country].code]; if (!plan) continue;
      d.theater = -1; let r = nextRand(w);
      for (const [lon, lat, share] of plan) {
        if (r < share) { const t = ths.filter(x => x.sideOf[d.country]).sort((a, b) => Math.hypot(center(a)[0] - lon, center(a)[1] - lat) - Math.hypot(center(b)[0] - lon, center(b)[1] - lat))[0]; if (t) { d.theater = t.id; target.set(d.id, [lon, lat]); } break; }
        r -= share;
      }
    }
    for (const t of ths) deployAlongFront(w, t, w.divisions.filter(d => d.theater === t.id), () => nextRand(w), u => target.get(u.id));
  };
  if (w.scenario === '1914' && has('AUH', 'SRB')) {
    // the July Crisis: Austria-Hungary attacks Serbia; Russia mobilises; Germany strikes France through Belgium
    const war = declareWar(w, S, ci.AUH, ci.SRB, { name: msg('war.name.ww1'), sides: { attackers: ids(['GER']), defenders: ids(['RUS', 'FRA', 'GBR', 'BEL', 'MNE']) } });
    war.aggr = [1.15, 1.0]; war.total = true; w.goalWar = war.id;
    const W = [6, 49.5], E = [21, 52], B = [20, 44.5];
    deploy(war, { GER: [[W[0], W[1], 0.72], [E[0], E[1], 0.22]], FRA: [[W[0], W[1], 0.88]], GBR: [[W[0], W[1], 0.6]], BEL: [[W[0], W[1], 0.9]], RUS: [[E[0], E[1], 0.75]], AUH: [[E[0], E[1], 0.5], [B[0], B[1], 0.35]], SRB: [[B[0], B[1], 0.95]], MNE: [[B[0], B[1], 0.9]] });
  }
  if (w.scenario === '1939' && has('GER', 'POL')) {
    // Fall Weiss: Germany invades Poland; Britain and France stand by their guarantee
    const war = declareWar(w, S, ci.GER, ci.POL, { name: msg('war.name.ww2'), sides: { attackers: ids(['SVK']), defenders: ids(['GBR', 'FRA']) } });
    war.aggr = [1.22, 0.95]; war.total = true; w.goalWar = war.id;
    // the German army masses on the Polish border; France waits behind the Maginot line, Germany behind the West Wall
    const P = [19, 52], W = [7, 49.5];
    deploy(war, { GER: [[P[0], P[1], 0.6], [W[0], W[1], 0.36]], POL: [[P[0], P[1], 0.95]], SVK: [[P[0], P[1], 0.8]], FRA: [[W[0], W[1], 0.7]], GBR: [[W[0], W[1], 0.35]] });
    for (const t of w.theaters.filter(x => x.war === war.id)) for (let k = 0; k < t.W * t.H; k++) if (cellLonLat(t, k)[0] < 9) t.ent[k] = 1; // the Maginot line and the West Wall
    if (has('JPN', 'CHN')) { const sino = declareWar(w, S, ci.JPN, ci.CHN, { silent: true, name: msg('war.name', { a: { c: ci.JPN }, b: { c: ci.CHN } }), sides: { attackers: ids(['MAN']), defenders: [] } }); (sino as any).lastChange = 0; deploy(sino, { JPN: [[115, 33, 0.85]], CHN: [[112, 30, 0.9]], MAN: [[123, 43, 0.5]] }); }
  }
}
