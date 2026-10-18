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
  manpower: number; conscription: Conscription;
  polCap: number; research: number; tech: number;
  // politics
  gov: Gov; ideology: [number, number]; // [economy: -1 collective .. 1 market, authority: -1 liberty .. 1 order]
  stability: number; warSupport: number; groups: Group[]; leader: Leader; nextElection: number;
  // military
  production: ProdItem[];
  // diplomacy / AI
  bloc: string; personality: Personality; aiNext: number;
  stats: { casualties: number; captured: number; wars: number; peakProvinces: number };
}
export type Personality = 'expansionist' | 'opportunist' | 'defensive' | 'isolationist' | 'ideologue';

export interface Province {
  id: number; owner: number; controller: number;
  pop: number; gdp: number; // gdp baseline (grows with the economy)
  infra: number; unrest: number; devastation: number; core: number[]; // countries that claim it as core
}

export interface ProdItem { id: number; type: UnitType; progress: number; cost: number; days: number; prov: number }

export interface Division {
  id: number; country: number; type: UnitType; name: string;
  str: number; max: number; org: number; exp: number;
  army: number; prov: number; // where it is stationed (peace) or last province (war)
  theater: number; x: number; y: number; // position (lon/lat) when deployed in a theater, theater = -1 otherwise
  sup: number; retreat: number; // supply 0..1, retreating flag
  arrive: number; // day it reaches its theater (in transit until then)
}
export interface General { name: string; skill: number; traits: string[]; born: number }
export interface Army { id: number; country: number; name: string; general: General; theater: number; posture: Posture }
export type Posture = 'hold' | 'advance' | 'offensive';

export interface WarGoal { type: 'conquest' | 'claim' | 'liberate' | 'regime' | 'defend'; provinces: number[] }
export interface War {
  id: number; name: string; attackers: number[]; defenders: number[]; leadA: number; leadD: number;
  start: number; goal: WarGoal; score: number; // -100 (defenders win) .. 100 (attackers win)
  aggr: [number, number]; // how hard each side pushes (set by AI/player postures)
  exhaustion: [number, number]; casualties: [number, number]; theaters: number[]; ended: number;
}
export interface Bloc { name: string; members: number[]; alliance: boolean; leader: number }
export interface Treaty { type: TreatyType; a: number; b: number; since: number; until: number }
export type TreatyType = 'alliance' | 'nap' | 'guarantee' | 'access' | 'trade' | 'puppet';

export interface LogEntry { day: number; text: string; kind: LogKind; who?: number[]; prov?: number; big?: string }
export type LogKind = 'war' | 'peace' | 'diplo' | 'politics' | 'economy' | 'event' | 'city' | 'pocket' | 'player';

export interface AgendaItem { id: number; country: number; day: number; title: string; text: string; options: AgendaOption[]; kind: string; data?: any; expires: number }
export interface AgendaOption { label: string; effect: string; hint?: string }

export interface World {
  version: number; seed: number; rng: number; day: number; startDate: number; scenario: string;
  provinces: Province[]; countries: Country[];
  divisions: Division[]; armies: Army[]; nextId: number;
  wars: War[]; theaters: Theater[]; treaties: Treaty[]; blocs: Record<string, Bloc>;
  relations: Int8Array; // N*N opinion -100..100 (row = opinion of a about b)
  log: LogEntry[]; agenda: AgendaItem[];
  settings: { turnMode: 'continuous' | 'monthly'; difficulty: number };
}

export const DAY0 = Date.UTC(2026, 0, 1);
export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export function dateOf(w: World, day = w.day) { return new Date(w.startDate + day * 864e5); }
export function dateStr(w: World, day = w.day) { const d = dateOf(w, day); return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`; }
export const isMonthStart = (w: World) => dateOf(w).getUTCDate() === 1;
