import { createStore } from './store';
// Per-player preferences, remembered in this browser when storage is available.
export interface Prefs { volume: number; muted: boolean; pauseOn: 'big' | 'all' | 'never' } // pauseOn: which new decisions stop the clock
const KEY = 'bellum.prefs';
const DEFAULTS: Prefs = { volume: 0.6, muted: false, pauseOn: 'big' };
function load(): Prefs { try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { return { ...DEFAULTS }; } }
export const prefs = createStore<Prefs>(load());
prefs.sub(() => { try { localStorage.setItem(KEY, JSON.stringify(prefs.get())); } catch { /* storage blocked */ } });
