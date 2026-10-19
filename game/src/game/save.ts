import type { World } from '../sim/types';
import { WORLD_VERSION } from '../sim/world';
/** Save games: JSON with typed arrays as base64, kept in localStorage slots. */
const KEY = 'bellum.saves.v1';
const b64 = (a: ArrayBufferView) => { const u = new Uint8Array(a.buffer, a.byteOffset, a.byteLength); let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000)); return btoa(s); };
const unb64 = (s: string) => { const bin = atob(s); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; };
export function serialize(w: World): string {
  return JSON.stringify(w, (k, v) => {
    if (v instanceof Int8Array) return { __t: 'i8', d: b64(v) };
    if (v instanceof Float32Array) return { __t: 'f32', d: b64(v) };
    if (v instanceof Uint8Array) return { __t: 'u8', d: b64(v) };
    if (v instanceof Int16Array) return { __t: 'i16', d: b64(v) };
    if (v instanceof Int32Array) return { __t: 'i32', d: b64(v) };
    return v;
  });
}
export function deserialize(s: string): World {
  return JSON.parse(s, (k, v) => {
    if (v && v.__t) { const u = unb64(v.d); const buf = u.buffer; return v.__t === 'i8' ? new Int8Array(buf) : v.__t === 'f32' ? new Float32Array(buf) : v.__t === 'i16' ? new Int16Array(buf) : v.__t === 'i32' ? new Int32Array(buf) : u; }
    return v;
  });
}
export interface SaveMeta { slot: string; country: string; date: string; saved: number }
export function listSaves(): SaveMeta[] { try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; } }
export function saveGame(slot: string, w: World, meta: Omit<SaveMeta, 'slot' | 'saved'>): string | null {
  try {
    localStorage.setItem(`${KEY}.${slot}`, serialize(w));
    const list = listSaves().filter(s => s.slot !== slot); list.unshift({ slot, saved: Date.now(), ...meta });
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, 12))); return null;
  } catch (e: any) { return 'Could not save: ' + (e?.message || e); }
}
/** Saves from older versions of the game can't be read (the world format changed); they load as null. */
export function loadGame(slot: string): World | null { try { const s = localStorage.getItem(`${KEY}.${slot}`); const w = s ? deserialize(s) : null; return w && w.version === WORLD_VERSION ? w : null; } catch { return null; } }
export function deleteSave(slot: string) { try { localStorage.removeItem(`${KEY}.${slot}`); localStorage.setItem(KEY, JSON.stringify(listSaves().filter(s => s.slot !== slot))); } catch { /* ignore */ } }
