// The first-game guide: seven short steps, each pointing at the part of the screen it explains. Skippable; replayable from the menu.
import { useEffect, useLayoutEffect, useState } from 'preact/hooks';
import type { Game } from '../game/play';
import { countryName, t } from '../i18n';
import { Icon } from './common';

const KEY = 'bellum.guide';
export const guideSeen = () => { try { return localStorage.getItem(KEY) === 'done'; } catch { return false; } };
const STEPS: { id: string; at?: string | ((g: Game) => DOMRect | null) }[] = [
  { id: 'welcome', at: '.date-box' }, { id: 'nation', at: '.topbar .res' }, { id: 'dock', at: '.dock' },
  { id: 'map' }, { id: 'armies', at: g => g.fx.firstArmy() }, { id: 'provinces' }, { id: 'goals', at: '.dock-btn.d-ledger' },
];
export function Guide({ g }: { g: Game }) {
  const [i, setI] = useState(0), [box, setBox] = useState<DOMRect | null>(null), step = STEPS[i];
  const done = () => { try { localStorage.setItem(KEY, 'done'); } catch { /* private mode */ } g.st.set({ guide: false }); };
  useLayoutEffect(() => { const find = () => setBox(typeof step.at === 'function' ? step.at(g) : step.at ? document.querySelector(step.at)?.getBoundingClientRect() ?? null : null); find(); window.addEventListener('resize', find); return () => window.removeEventListener('resize', find); }, [i]);
  useEffect(() => { const k = (e: KeyboardEvent) => {
    if (e.key === 'Escape') done(); else if (e.key === 'Enter' || e.key === 'ArrowRight') i < STEPS.length - 1 ? setI(i + 1) : done(); else if (e.key === 'ArrowLeft') setI(Math.max(0, i - 1)); else return;
    e.preventDefault(); e.stopPropagation(); // the guide's keys do not reach the game
  }; window.addEventListener('keydown', k, true); return () => window.removeEventListener('keydown', k, true); }, [i]);
  // the card sits below its target, or above it near the bottom of the screen, or in the middle when it points at the map
  const H = window.innerHeight, W = window.innerWidth, cw = Math.min(420, W - 24);
  const pos = !box ? { left: (W - cw) / 2, top: H * 0.3 } : box.bottom + 230 < H ? { left: Math.max(12, Math.min(W - cw - 12, box.left + box.width / 2 - cw / 2)), top: box.bottom + 14 } : { left: Math.max(12, Math.min(W - cw - 12, box.left + box.width / 2 - cw / 2)), top: Math.max(12, box.top - 230) };
  return <div class="ui guide" role="dialog" aria-label={t('guide.title')}>
    {box ? <Spot b={box} /> : <div class="guide-dim" />}
    <section class="plate guide-card" style={{ left: `${pos.left}px`, top: `${pos.top}px`, width: `${cw}px` }}>
      <div class="eyebrow">{t('guide.step', { n: i + 1, m: STEPS.length })}</div>
      <div class="h3">{t(`guide.${step.id}.t`, { c: countryName(g.w, g.player) })}</div>
      <p>{t(`guide.${step.id}.p`, { c: countryName(g.w, g.player) })}</p>
      <div class="guide-acts"><button class="link" onClick={done}>{t('guide.skip')}</button><span />
        {i > 0 && <button onClick={() => setI(i - 1)}>{t('ui.back')}</button>}
        <button class="primary" onClick={() => i < STEPS.length - 1 ? setI(i + 1) : done()}>{i < STEPS.length - 1 ? <>{t('guide.next')}<Icon name="advance" size={14} /></> : t('guide.start')}</button></div>
    </section>
  </div>;
}
/** Dims everything but the target: four panels around it and a ring on it. */
function Spot({ b }: { b: DOMRect }) {
  const l = b.left - 6, t = b.top - 6, r = b.right + 6, bt = b.bottom + 6, px = (n: number) => `${Math.max(0, n)}px`;
  return <>
    <div class="guide-dim" style={{ bottom: 'auto', height: px(t) }} />
    <div class="guide-dim" style={{ top: px(bt) }} />
    <div class="guide-dim" style={{ top: px(t), height: px(bt - t), right: 'auto', width: px(l) }} />
    <div class="guide-dim" style={{ top: px(t), height: px(bt - t), left: px(r) }} />
    <div class="guide-spot" style={{ left: px(l), top: px(t), width: px(r - l), height: px(bt - t) }} />
  </>;
}
