/** Seeded RNG stored in the world (deterministic replays). */
export function nextRand(state: { rng: number }): number {
  let a = (state.rng = (state.rng + 0x6D2B79F5) | 0);
  let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
export const pick = <T>(s: { rng: number }, arr: T[]): T => arr[Math.floor(nextRand(s) * arr.length)];
export function hash32(n: number) { n = Math.imul(n ^ (n >>> 15), 2246822507); n = Math.imul(n ^ (n >>> 13), 3266489909); return (n ^ (n >>> 16)) >>> 0; }
