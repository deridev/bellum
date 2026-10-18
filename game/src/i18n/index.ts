// Localization: UI strings and the simulation's messages (which carry a key and arguments, never finished text).
import type { Msg, MsgArg, World } from '../sim/types';
import { en } from './en';
import { pt } from './pt';
import { es } from './es';

export type Lang = 'en' | 'pt' | 'es';
export const LANGS: { id: Lang; label: string }[] = [{ id: 'en', label: 'English' }, { id: 'pt', label: 'Português (Brasil)' }, { id: 'es', label: 'Español' }];
/** A dictionary entry: plain text with {placeholders}, or plural forms picked by the `n` argument. */
export type Entry = string | { zero?: string; one: string; other: string };
const DICTS: Record<Lang, Record<string, Entry>> = { en, pt, es };
const LOCALE: Record<Lang, string> = { en: 'en-US', pt: 'pt-BR', es: 'es-ES' };

let lang: Lang = detect();
const listeners = new Set<() => void>();
function detect(): Lang {
  try { const s = localStorage.getItem('bellum.lang'); if (s === 'en' || s === 'pt' || s === 'es') return s; } catch { /* storage blocked */ }
  const n = (typeof navigator !== 'undefined' && navigator.language || 'en').toLowerCase();
  return n.startsWith('pt') ? 'pt' : n.startsWith('es') ? 'es' : 'en';
}
export const getLang = () => lang;
export const locale = () => LOCALE[lang];
export function setLang(l: Lang) { lang = l; try { localStorage.setItem('bellum.lang', l); } catch { /* storage blocked */ } regionNames = null; listeners.forEach(f => f()); }
export function onLang(f: () => void) { listeners.add(f); return () => listeners.delete(f); }

/** Translate a UI key. Missing keys fall back to English, then to the key itself. */
export function t(key: string, args: Record<string, string | number> = {}): string {
  let e = DICTS[lang][key] ?? en[key];
  if (e === undefined) return key;
  if (typeof e !== 'string') e = Number(args.n ?? 0) === 0 && e.zero ? e.zero : new Intl.PluralRules(LOCALE[lang]).select(Number(args.n ?? 0)) === 'one' ? e.one : e.other;
  return e.replace(/\{(\w+)\}/g, (_, k) => k in args ? (typeof args[k] === 'number' ? fmtNum(args[k] as number) : String(args[k])) : `{${k}}`);
}
export const has = (key: string) => key in DICTS[lang] || key in en;

/** Render a simulation message in the current language. */
export function say(w: World, m: Msg): string {
  const args: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(m.a || {})) args[k] = arg(w, v);
  return t(m.k, args);
}
function arg(w: World, v: MsgArg): string | number {
  if (typeof v === 'string' || typeof v === 'number') return v;
  if ('c' in v) return countryName(w, v.c);
  if ('cs' in v) return new Intl.ListFormat(LOCALE[lang], { type: 'conjunction' }).format(v.cs.map(c => countryName(w, c)));
  if ('d' in v) return fmtDate(w, v.d);
  if ('m' in v) return say(w, v.m);
  if ('u' in v) return v.u[0] === 'army' ? armyName(v.u[1]) : unitName(v.u[0], v.u[1]);
  if ('p' in v) return provNames[v.p] ?? '';
  return '';
}
/** Province names come with the map data, not the simulation; the session registers them once loaded. */
let provNames: string[] = [];
export function setProvinceNames(names: string[]) { provNames = names; }

// ---- names ----
let regionNames: Intl.DisplayNames | null = null;
const ISO2: Record<string, string> = {};
/** Tell the localizer each country code's ISO 3166 alpha-2 code (for built-in translated names). */
export function registerCountries(list: { code: string; iso2?: string; name: string }[]) { for (const c of list) { MODERN_NAME[c.code] = c.name; if (c.iso2 && /^[A-Z]{2}$/.test(c.iso2)) ISO2[c.code] = c.iso2; } }
export function countryName(w: World, id: number): string { const c = w.countries[id]; return c ? nameFor(c.code, c.name, w.scenario === '2026' || !w.scenario ? ISO2[c.code] : histIso(c.code, c.name)) : '?'; }
/** A historical country gets its modern name only if it is the same state under the same name (France 1914 = France). */
const MODERN_NAME: Record<string, string> = {}; const histIso = (code: string, name: string) => MODERN_NAME[code] === name ? ISO2[code] : '';
/** A country's name in the current language: our own dictionary first, then the browser's region names. */
export function nameFor(code: string, name: string, iso2 = ISO2[code]): string {
  const hist = DICTS[lang]['cname.' + name]; if (typeof hist === 'string') return hist; // historical names ("Kingdom of Italy")
  const own = DICTS[lang]['country.' + code]; if (typeof own === 'string') return own;
  if (lang === 'en' || !iso2 || !/^[A-Z]{2}$/.test(iso2)) return name;
  try { regionNames ||= new Intl.DisplayNames([LOCALE[lang]], { type: 'region' }); return regionNames.of(iso2) || name; } catch { return name; }
}
const ordEn = (n: number) => { const s = n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th'; return n + s; };
/** "1st Infantry Division" / "1ª Divisão de Infantaria" */
export function unitName(type: string, n: number) { return t('unit.name', { ord: lang === 'en' ? ordEn(n) : String(n), type: t('unitType.' + type) }); }
export function armyName(n: number) { return t('army.name', { ord: lang === 'en' ? ordEn(n) : String(n) }); }

// ---- numbers and dates ----
export const fmtNum = (v: number, digits = 0) => v.toLocaleString(LOCALE[lang], { maximumFractionDigits: digits });
export function fmtDate(w: World, day = w.day, style: 'long' | 'month' | 'short' = 'long') {
  const d = new Date(w.startDate + day * 864e5);
  return d.toLocaleDateString(lang === 'en' ? 'en-GB' : LOCALE[lang], style === 'month' ? { month: 'short', year: 'numeric', timeZone: 'UTC' } : style === 'short' ? { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' } : { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}
