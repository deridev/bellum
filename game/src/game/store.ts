import { useEffect, useState } from 'preact/hooks';
/** Minimal observable store shared by the game loop and the UI. */
export interface Store<T> { get(): T; set(patch: Partial<T>): void; sub(fn: () => void): () => void }
export function createStore<T extends object>(init: T): Store<T> {
  let s = init; const subs = new Set<() => void>();
  return { get: () => s, set(p) { s = { ...s, ...p }; subs.forEach(f => f()); }, sub(f) { subs.add(f); return () => subs.delete(f); } };
}
export function useStore<T extends object, R>(store: Store<T>, pick: (s: T) => R): R {
  const [v, setV] = useState(() => pick(store.get()));
  useEffect(() => store.sub(() => setV(() => pick(store.get()))), [store]);
  return v;
}
/** Re-render on every store change (for panels that read many fields). */
export function useTick<T extends object>(store: Store<T>): T { const [, f] = useState(0); useEffect(() => store.sub(() => f(x => x + 1)), [store]); return store.get(); }
