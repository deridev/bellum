import { GOV_TITLE, TABLES_2026, type Tables } from './data';
import { leaderTraits, makeGeneral, personName } from './names';
import { nextRand } from './rng';
import type { Army, Conscription, Country, Division, Gov, Group, MapStatic, Msg, Personality, Province, UnitType, World } from './types';
import { DAY0 } from './types';

export const CONSCRIPTION_RATE: Record<Conscription, number> = { volunteer: 0.004, limited: 0.012, extensive: 0.03, total: 0.06 };
/** Drafting workers costs output: change in annual growth per law. */
export const CONSCRIPTION_GROWTH: Record<Conscription, number> = { volunteer: 0, limited: 0, extensive: -0.005, total: -0.015 };
const GOV_STABILITY: Record<Gov, number> = { democracy: 0.68, authoritarian: 0.62, oneparty: 0.7, junta: 0.42, monarchy: 0.66, theocracy: 0.55 };
const GROUP_POWER: Record<Gov, [number, number, number, number]> = { // military, industry, labor, rural
  democracy: [0.15, 0.35, 0.3, 0.2], authoritarian: [0.35, 0.3, 0.15, 0.2], oneparty: [0.3, 0.25, 0.3, 0.15], junta: [0.6, 0.15, 0.1, 0.15], monarchy: [0.3, 0.35, 0.1, 0.25], theocracy: [0.35, 0.15, 0.2, 0.3],
};

/** Build the 2026 world from the static map and scenario tables. */
/** Bumped when saves from before cannot be read: 3 = provinces are regions around cities (§22) */
export const WORLD_VERSION = 3;
export function createWorld(S: MapStatic, opts: { seed?: number; player?: number; startDate?: number; scenario?: string; tables?: Tables } = {}): World {
  const TB = opts.tables ?? TABLES_2026, modern = (opts.scenario ?? '2026') === '2026';
  const nC = S.countries.length;
  const w: World = {
    version: WORLD_VERSION, seed: opts.seed ?? 2026, rng: opts.seed ?? 2026, day: 0, startDate: opts.startDate ?? DAY0, scenario: opts.scenario ?? '2026',
    provinces: [], countries: [], divisions: [], armies: [], nextId: 1, wars: [], theaters: [], treaties: [], blocs: {},
    relations: new Int8Array(nC * nC), log: [], agenda: [], cooldowns: {}, settings: { turnMode: 'continuous', difficulty: 1 },
  };
  const ci: Record<string, number> = {}; S.countries.forEach((c, i) => (ci[c.code] = i));
  w.provinces = S.provinces.map((p): Province => ({ id: p.id, owner: ci[p.country], controller: ci[p.country], pop: p.pop, gdp: p.gdp, infra: 0.5, unrest: 0, devastation: 0, core: [ci[p.country]] }));
  const provsOf: number[][] = S.countries.map(() => []); w.provinces.forEach(p => provsOf[p.owner].push(p.id));

  for (let i = 0; i < nC; i++) {
    const sc = S.countries[i], code = sc.code;
    const pop = provsOf[i].reduce((a, p) => a + w.provinces[p].pop, 0) || sc.pop;
    const gdp = provsOf[i].reduce((a, p) => a + w.provinces[p].gdp, 0) || sc.gdp;
    const pc = gdp * 1e6 / Math.max(1, pop), rich = Math.min(1, pc / 45000);
    for (const p of provsOf[i]) w.provinces[p].infra = 0.25 + 0.7 * rich;
    const taxRate = pc > 40000 ? 0.32 : pc > 12000 ? 0.25 : pc > 4000 ? 0.2 : 0.16;
    const milPct = (TB.milGdp[code] ?? 1.5) / 100;
    const military = Math.min(0.62, Math.max(0.04, milPct / taxRate));
    const deficit = Math.max(0, milPct / taxRate - 0.62) + (modern && code === 'UKR' ? 0.4 : modern && code === 'USA' ? 0.2 : 0);
    const research = 0.03 + 0.03 * rich, investment = 0.2, welfare = Math.max(0.05, 1 - military - research - investment);
    const gov: Gov = TB.gov[code] ?? (pc < 2500 && nextRand(w) < 0.25 ? 'authoritarian' : 'democracy');
    const nudge = TB.ideology[code];
    const ideology: [number, number] = nudge ? [...nudge] as [number, number] : [
      (gov === 'oneparty' ? -0.5 : 0.2) + (nextRand(w) - 0.5) * 0.6,
      ({ democracy: -0.35, authoritarian: 0.6, oneparty: 0.8, junta: 0.85, monarchy: 0.7, theocracy: 0.85 } as Record<Gov, number>)[gov] + (nextRand(w) - 0.5) * 0.3,
    ];
    const conscription: Conscription = TB.conscription ? (TB.conscription[code] ?? 'limited') : ['PRK', 'ISR', 'ERI'].includes(code) ? 'extensive' : ['UKR'].includes(code) ? 'total' : ['RUS', 'KOR', 'TWN', 'IRN', 'TUR', 'EGY', 'VNM', 'CHN', 'SYR', 'FIN', 'GRC', 'ARM', 'AZE'].includes(code) ? 'limited' : 'volunteer';
    const power = GROUP_POWER[gov];
    const groups: Group[] = (['military', 'industry', 'labor', 'rural'] as const).map((id, k) => ({ id, power: power[k], support: 0.45 + nextRand(w) * 0.2 }));
    let stability = GOV_STABILITY[gov] + (rich - 0.4) * 0.2 + (nextRand(w) - 0.5) * 0.1;
    if (modern && code === 'UKR') stability = 0.55; if (['SDN', 'SSD', 'SOM', 'YEM', 'SYR', 'AFG', 'MMR', 'HTI', 'LBY'].includes(code)) stability = 0.3;
    const title = TB.titles?.[code] ?? (TB.pm.has(code) && gov === 'democracy' ? 'Prime Minister' : GOV_TITLE[gov]);
    const bloc = Object.entries(TB.blocs).find(([, b]) => b.members.includes(code))?.[0] ?? '';
    const personality: Personality = TB.personality[code] ?? (['defensive', 'defensive', 'opportunist', 'isolationist', 'opportunist'] as Personality[])[Math.floor(nextRand(w) * 5)];
    const revenue = gdp * taxRate / 12;
    const c: Country = {
      id: i, code, name: sc.name, color: sc.color, capital: sc.capital, alive: true, player: i === opts.player,
      treasury: revenue * 2, debt: gdp * ((modern ? ({ JPN: 2.4, USA: 1.2, ITA: 1.4, GRC: 1.6, FRA: 1.1, GBR: 1.0, CAN: 1.05 } as Record<string, number>)[code] : undefined) ?? (rich > 0.5 ? 0.6 : 0.45)),
      taxRate, deficit, budget: { military, investment, welfare, research },
      gdp, gdpStart: gdp, growth: 0.02, income: revenue, spending: revenue, upkeep: 0, unitCost: 1,
      manpower: pop * CONSCRIPTION_RATE[conscription] * 0.6, conscription, polCap: 50, research: 0, tech: TB.tech?.[code] ?? Math.round(4 * rich),
      gov, ideology, stability: clamp01(stability), warSupport: TB.warSupport?.[code] ?? (modern ? (code === 'UKR' ? 0.82 : code === 'RUS' ? 0.6 : code === 'ISR' ? 0.65 : 0.32) : 0.4),
      groups, leader: { name: personName(w, code), title, born: 1950 + Math.floor(nextRand(w) * 25), traits: leaderTraits(w), since: 0 },
      nextElection: gov === 'democracy' ? Math.floor(nextRand(w) * 365 * 4) + 30 : -1,
      production: [], bloc, personality, aiNext: Math.floor(nextRand(w) * 30), milBase: military,
      stats: { casualties: 0, captured: 0, wars: 0, peakProvinces: provsOf[i].length },
    };
    w.countries.push(c);
    // ---- standing army ----
    const activeK = TB.active[code] ?? Math.max(2, Math.min(120, pop * 0.0035 / 1000 * (0.5 + rich)));
    const nDiv = Math.max(1, Math.round(activeK * 1000 / 12000));
    const net = revenue * (0.55 + 0.45 * c.stability), milMonthly = Math.max(0, net - Math.min(net * 0.6, c.debt * 0.04 / 12)) * (1 + deficit) * military; // as monthlyEconomy collects it
    c.unitCost = Math.max(2, milMonthly * 0.7 / nDiv);
    const coastal = provsOf[i].some(p => S.provinces[p].coastal);
    const mixOf = TB.mix?.[code] ?? (TB.mix ? [0.02, 0.03] : [0.08 + 0.12 * rich, 0.12 + 0.2 * rich]);
    const mix: [UnitType, number][] = [['armor', mixOf[0]], ['mechanized', mixOf[1]], ['marines', coastal && nDiv > 15 ? 0.05 : 0], ['airborne', nDiv > 25 ? 0.04 : 0]];
    const border = provsOf[i].filter(p => S.provinces[p].nbr.some(n => w.provinces[n].owner !== i));
    const counts: Record<string, number> = {};
    const armies: Army[] = []; let station = c.capital;
    for (let k = 0; k < nDiv; k++) {
      let type: UnitType = 'infantry'; let r = nextRand(w);
      for (const [t, share] of mix) { if (r < share) { type = t; break; } r -= share; }
      counts[type] = (counts[type] || 0) + 1;
      // an army is stationed in one place: a border province or the capital
      if (k % 12 === 0) { const a: Army = { id: w.nextId++, country: i, num: armies.length + 1, general: makeGeneral(w, code), theater: -1, posture: 'hold' }; armies.push(a); w.armies.push(a); station = border.length && nextRand(w) < 0.55 ? border[Math.floor(nextRand(w) * border.length)] : c.capital; }
      w.divisions.push(newDivision(w, i, type, counts[type], station, armies[armies.length - 1].id));
    }
    c.upkeep = nDiv * c.unitCost; c.spending = revenue * (1 + deficit) + c.debt * 0.04 / 12;
  }
  // ---- equipment: the money behind each division, against the world's median division, sets how well it fights ----
  const costs = w.countries.flatMap(c => w.divisions.filter(d => d.country === c.id).map(() => c.unitCost)).sort((a, b) => a - b), median = costs[Math.floor(costs.length / 2)] || 1;
  for (const c of w.countries) c.quality = qualityOf(c.unitCost, median);
  // ---- blocs, treaties, relations ----
  for (const [key, b] of Object.entries(TB.blocs)) {
    const members = b.members.map(m => ci[m]).filter(x => x !== undefined);
    w.blocs[key] = { name: b.name, members, alliance: b.alliance, leader: members.slice().sort((x, y) => w.countries[y].gdp - w.countries[x].gdp)[0] };
  }
  for (const [a, b, type] of TB.treaties) if (ci[a] !== undefined && ci[b] !== undefined) w.treaties.push({ type, a: ci[a], b: ci[b], since: 0, until: -1 });
  const setRel = (a: number, b: number, v: number) => { w.relations[a * nC + b] = clampRel(v); w.relations[b * nC + a] = clampRel(v); };
  for (let a = 0; a < nC; a++) for (let b = a + 1; b < nC; b++) {
    const A = w.countries[a], B = w.countries[b];
    let v = 10 - 25 * Math.hypot(A.ideology[0] - B.ideology[0], A.ideology[1] - B.ideology[1]);
    if (A.bloc && A.bloc === B.bloc) v += 55;
    if ((A.bloc === 'atlantic' && B.bloc === 'csto') || (A.bloc === 'csto' && B.bloc === 'atlantic')) v -= 40;
    setRel(a, b, v);
  }
  for (const [x, y, v] of [...TB.rivals, ...TB.friends]) if (ci[x] !== undefined && ci[y] !== undefined) setRel(ci[x], ci[y], v);
  for (const t of w.treaties) if (t.type === 'alliance') setRel(t.a, t.b, Math.max(rel(w, t.a, t.b), 60));
  return w;
}

/** +12% for each doubling of the money behind a division, between ×0.7 and ×1.6: a cheap mass army is a weaker army. */
export const qualityOf = (unitCost: number, median: number) => Math.max(0.7, Math.min(1.6, 1 + 0.12 * Math.log2(Math.max(1e-6, unitCost) / Math.max(1e-6, median))));
export function newDivision(w: World, country: number, type: UnitType, num: number, prov: number, army: number): Division {
  const max = type === 'armor' ? 10000 : type === 'airborne' || type === 'marines' ? 9000 : 12000;
  return { id: w.nextId++, country, type, num, str: max, max, org: 1, exp: 0.1, army, prov, theater: -1, x: 0, y: 0, sup: 1, retreat: 0, arrive: 0 };
}
export const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const clampRel = (v: number) => Math.max(-100, Math.min(100, Math.round(v)));
export const rel = (w: World, a: number, b: number) => w.relations[a * w.countries.length + b];
export function addRel(w: World, a: number, b: number, d: number, both = true) {
  const n = w.countries.length; w.relations[a * n + b] = clampRel(w.relations[a * n + b] + d); if (both) w.relations[b * n + a] = clampRel(w.relations[b * n + a] + d);
}
export function say(w: World, m: Msg, kind: World['log'][number]['kind'], extra: Partial<World['log'][number]> = {}) {
  w.log.push({ day: w.day, msg: m, kind, ...extra }); if (w.log.length > 3000) w.log.splice(0, 500);
}
export const provincesOf = (w: World, c: number) => w.provinces.filter(p => p.owner === c);
export const divisionsOf = (w: World, c: number) => w.divisions.filter(d => d.country === c);
