import { createStore } from './store';
// Per-player preferences, remembered in this browser when storage is available.
export interface Prefs { volume: number; muted: boolean }
const KEY = 'bellum.prefs';
function load(): Prefs { try { return { volume: 0.6, muted: false, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { return { volume: 0.6, muted: false }; } }
export const prefs = createStore<Prefs>(load());
prefs.sub(() => { try { localStorage.setItem(KEY, JSON.stringify(prefs.get())); } catch { /* storage blocked */ } });
