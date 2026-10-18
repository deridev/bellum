import { useEffect, useRef, useState } from 'preact/hooks';
/** Minimal observable store shared by the game loop and the UI. */
export interface Store<T> { get(): T; set(patch: Partial<T>): void; sub(fn: () => void): () => void }
export function createStore<T extends object>(init: T): Store<T> {
  let s = init; const subs = new Set<() => void>();
  return { get: () => s, set(p) { s = { ...s, ...p }; subs.forEach(f => f()); }, sub(f) { subs.add(f); return () => { subs.delete(f); }; }, _subs: subs } as Store<T>;
}
export function useStore<T extends object, R>(store: Store<T>, pick: (s: T) => R): R {
  const [, force] = useState(0);
  const ref = useRef(pick); ref.current = pick;
  const last = useRef<R>(pick(store.get()));
  useEffect(() => {
    const check = () => { const v = ref.current(store.get()); if (!Object.is(v, last.current)) { last.current = v; force(x => x + 1); } };
    const off = store.sub(check); check(); // catch changes made before we subscribed
    return off;
  }, [store]);
  last.current = pick(store.get());
  return last.current;
}
/** Re-render on every store change (for panels that read many fields). */
export function useTick<T extends object>(store: Store<T>): T { const [, f] = useState(0); useEffect(() => { const off = store.sub(() => f(x => x + 1)); f(x => x + 1); return off; }, [store]); return store.get(); }
