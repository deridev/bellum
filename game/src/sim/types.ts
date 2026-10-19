// Bellum simulation state. Plain data (serializable); all money in US$ millions.
import type { CityData, CountryData, ProvinceData } from '../data/types';
import type { Theater } from './war/theater';

/** Static map data the simulation reads (never saved; rebuilt from game data files). */
export interface MapStatic { provinces: ProvinceData[]; countries: CountryData[]; cities: CityData[]; dem: Uint8Array; demW: number; demH: number; provRaster: Uint16Array }

export type Gov = 'democracy' | 'authoritarian' | 'oneparty' | 'junta' | 'monarchy' | 'theocracy';
export type GroupId = 'military' | 'industry' | 'labor' | 'rural';
export type UnitType = 'infantry' | 'armor' | 'mechanized' | 'marines' | 'airborne';
export type Conscription = 'volunteer' | 'limited' | 'extensive' | 'total';

export interface Leader { name: string; title: string; born: number; traits: string[]; since: number }
export interface Group { id: GroupId; support: number; power: number }

export interface Country {
  id: number; code: string; name: string; color: string; capital: number; alive: boolean; player: boolean;
  // economy
  treasury: number; debt: number; taxRate: number; deficit: number; // deficit: extra spending as a share of revenue (borrowed)
  budget: { military: number; investment: number; welfare: number; research: number }; // shares, sum 1
  gdp: number; gdpStart: number; growth: number; // growth: last yearly rate
  income: number; spending: number; upkeep: number; // last month
  unitCost: number; // monthly upkeep of one division (calibrated per economy)
  quality?: number; // equipment behind each division: how much money stands behind it, against the world's median (×0.7–×1.6)
  manpower: number; conscription: Conscription;
  polCap: number; research: number; tech: number; readiness?: number; // 0..1, military funds over upkeep
  // politics
  gov: Gov; ideology: [number, number]; // [economy: -1 collective .. 1 market, authority: -1 liberty .. 1 order]
  stability: number; warSupport: number; groups: Group[]; leader: Leader; nextElection: number;
  // military
  production: ProdItem[];
  // diplomacy / AI
  bloc: string; personality: Personality; aiNext: number; milBase: number; // peacetime military budget share the AI returns to
  stats: { casualties: number; captured: number; wars: number; peakProvinces: number };
}
export type Personality = 'expansionist' | 'opportunist' | 'defensive' | 'isolationist' | 'ideologue';

export interface Province {
  id: number; owner: number; controller: number;
  pop: number; gdp: number; // gdp baseline (grows with the economy)
  infra: number; unrest: number; devastation: number; core: number[]; // countries that claim it as core
}

export interface ProdItem { id: number; type: UnitType; progress: number; cost: number; days: number; prov: number; army?: number } // army: raised for that army (joins it when ready)

export interface Division {
  id: number; country: number; type: UnitType; num: number; // shown as e.g. 1st Infantry Division
  str: number; max: number; org: number; exp: number;
  army: number; prov: number; // where it is stationed (peace) or last province (war)
  theater: number; x: number; y: number; // position (lon/lat) when deployed in a theater, theater = -1 otherwise
  sup: number; retreat: number; // supply 0..1, retreating flag
  arrive: number; // day it reaches its theater (in transit until then)
  op?: number; // the offensive it is fighting in (0 or missing: holding the line)
  goal?: [number, number, number]; // where it stands (lon, lat, how): 1 = hold the front there (the player's order), 2 = its general's place in the line, 0 = wait there in reserve
}
export interface General { name: string; skill: number; traits: string[]; born: number }
export interface Army { id: number; country: number; num: number; general: General; theater: number; posture: Posture }
export type Posture = 'hold' | 'advance' | 'offensive';

export interface WarGoal { type: 'conquest' | 'claim' | 'liberate' | 'regime' | 'defend'; provinces: number[] }
export interface War {
  id: number; name: Msg; attackers: number[]; defenders: number[]; leadA: number; leadD: number;
  start: number; goal: WarGoal; score: number; // -100 (defenders win) .. 100 (attackers win)
  aggr: [number, number]; // how hard each side pushes (set by AI/player postures)
  exhaustion: [number, number]; casualties: [number, number]; theaters: number[]; ended: number;
  commit?: Record<number, number>; // share of its army a country sends to this war (players choose; AI decides by role)
  plan?: Record<number, { at: [number, number]; r: number; w: number; until: number }>; // a general staff's war plan: where its lines are weighted heavier (km radius, weight), until a day
  lost?: [number, number]; // divisions each side has lost outright (destroyed, or captured in a pocket)
  winner?: 1 | -1 | 0; // set when it ends: the side that dictated the peace (0: white peace or ceasefire)
  total?: boolean; // a world war: the great powers fight it out rather than settle early
  left?: Record<number, 1 | -1>; // members who left it by a separate peace, and the side they fought on
}
export interface Bloc { name: string; members: number[]; alliance: boolean; leader: number }
export interface Treaty { type: TreatyType; a: number; b: number; since: number; until: number }
export type TreatyType = 'alliance' | 'nap' | 'guarantee' | 'access' | 'trade' | 'puppet';

/** A message the UI renders in the player's language: a dictionary key and its arguments. */
export interface Msg { k: string; a?: Record<string, MsgArg> }
/** Arguments: plain values, a country ({c}), a list of countries ({cs}), a date ({d}), a nested message ({m}), a division or army ({u}: type or 'army', number) or a province ({p}). */
export type MsgArg = string | number | { c: number } | { cs: number[] } | { d: number } | { m: Msg } | { u: [string, number] } | { p: number };
export const msg = (k: string, a?: Record<string, MsgArg>): Msg => (a ? { k, a } : { k });

export interface LogEntry { day: number; msg: Msg; kind: LogKind; who?: number[]; prov?: number; big?: string; at?: [number, number] }
export type LogKind = 'war' | 'peace' | 'diplo' | 'politics' | 'economy' | 'event' | 'city' | 'pocket' | 'player';

export interface AgendaItem { id: number; country: number; day: number; title: Msg; text: Msg; options: AgendaOption[]; kind: string; data?: any; expires: number; dflt?: number } // dflt: the option taken if it runs out unanswered
export interface AgendaOption { label: Msg; effect: string; hint?: Msg }

export interface World {
  version: number; seed: number; rng: number; day: number; startDate: number; scenario: string;
  provinces: Province[]; countries: Country[];
  divisions: Division[]; armies: Army[]; nextId: number;
  wars: War[]; theaters: Theater[]; treaties: Treaty[]; blocs: Record<string, Bloc>;
  relations: Int8Array; // N*N opinion -100..100 (row = opinion of a about b)
  log: LogEntry[]; agenda: AgendaItem[];
  cooldowns: Record<string, number>; // diplomacy and event cooldowns: key -> day it ends
  settings: { turnMode: 'continuous' | 'monthly'; difficulty: number };
  goalWar?: number; // the scenario's great war, whose outcome is a goal (1914, 1939)
  crisis?: { id: string; start: number; until: number; choice: Record<number, 0 | 1> }; // the world crisis under way, and how each nation met it
  landings?: { id: number; country: number; army: number; war: number; theater: number; at: [number, number]; prov: number; day: number; p: number }[]; // armies at sea, landing on `day` with chance `p`
  missions?: Mission[]; // the player's national missions under way
  chains?: { c: number; id: string; day: number; other: number }[]; // follow-up events owed by earlier choices
  outcome?: { kind: 'victory' | 'defeat' | 'end'; reason: string; day: number; rank?: number; playOn?: boolean }; // how the game ended for the player
}

/** A national mission: reach `target` (on the kind's measure) by `until`. */
export interface Mission { id: number; kind: string; start: number; until: number; base: number; target: number; other?: number; prov?: number }

export const DAY0 = Date.UTC(2026, 0, 1);
export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export function dateOf(w: World, day = w.day) { return new Date(w.startDate + day * 864e5); }
export function dateStr(w: World, day = w.day) { const d = dateOf(w, day); return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`; }
export const isMonthStart = (w: World) => dateOf(w).getUTCDate() === 1;
