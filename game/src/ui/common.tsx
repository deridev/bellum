// Shared UI pieces: flags, panels, meters, sliders, icons.
import { useEffect } from 'preact/hooks';
import type { Session } from '../game/session';
import { t } from '../i18n';
import { pct } from './format';

export function Flag({ s, code, h = 14 }: { s: Session; code: string; h?: number }) {
  const A = s.assets, fi = A.flagIndex[s.flagOf[code] || code]; if (!fi) return <span class="flag" style={{ width: h * 1.5, height: h }} />;
  const w = h * 1.5, sx = w / A.flagW;
  return <span class="flag" style={{ width: w, height: h, backgroundImage: `url(${flagUrl(s)})`, backgroundPosition: `-${fi[0] * sx}px -${fi[1] * sx}px`, backgroundSize: `${A.flags.width * sx}px ${A.flags.height * sx}px` }} />;
}
let _flagUrl = '';
function flagUrl(s: Session) { if (_flagUrl) return _flagUrl; const c = document.createElement('canvas'); c.width = s.assets.flags.width; c.height = s.assets.flags.height; c.getContext('2d')!.drawImage(s.assets.flags, 0, 0); _flagUrl = c.toDataURL(); return _flagUrl; }

/** A dossier panel on the right edge. Escape closes it. */
export function Sheet({ title, onClose, children, wide, eyebrow }: { title: any; onClose: () => void; children: any; wide?: boolean; eyebrow?: any }) {
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [onClose]);
  return <section class={`ui sheet panel ui-scroll ${wide ? 'wide' : ''}`}>
    <header class="sheet-head"><div class="sheet-title">{eyebrow && <div class="eyebrow">{eyebrow}</div>}{title}</div><button class="x" aria-label={t('ui.close')} onClick={onClose}><Icon name="x" /></button></header>
    <div class="sheet-body">{children}</div>
  </section>;
}

export function Bar({ v, tone, mark }: { v: number; tone?: string; mark?: number }) {
  return <div class="meter"><div class={`fill ${tone || ''}`} style={{ width: pct(Math.max(0, Math.min(1, v))) }} />{mark !== undefined && <div class="mark" style={{ left: pct(Math.max(0, Math.min(1, mark))) }} />}</div>;
}
/** A centred bar for values from -100 to 100 (opinion, war score). */
export function SignedBar({ v, title }: { v: number; title?: string }) {
  return <div class="meter rel" title={title}><div class="fill" style={{ left: v < 0 ? pct(0.5 + v / 200) : '50%', width: pct(Math.abs(v) / 200), background: v < 0 ? 'var(--bad)' : 'var(--good)' }} /></div>;
}

export function Slider({ id, label, value, min, max, step, fmt, onInput, hint }: { id: string; label: string; value: number; min: number; max: number; step: number; fmt: (v: number) => string; onInput: (v: number) => void; hint?: string }) {
  return <label class="slider" for={id}><span class="sl-top"><span>{label}</span><b class="num">{fmt(value)}</b></span>
    <input id={id} type="range" min={min} max={max} step={step} value={value} onInput={e => onInput(+(e.target as HTMLInputElement).value)} />
    {hint && <small>{hint}</small>}</label>;
}

/** Segmented control. */
export function Seg<T extends string | number>({ value, options, onPick, label }: { value: T; options: { v: T; label: string; title?: string }[]; onPick: (v: T) => void; label: string }) {
  return <div class="seg" role="group" aria-label={label}>{options.map(o => <button key={String(o.v)} aria-pressed={o.v === value} title={o.title} onClick={() => onPick(o.v)}>{o.label}</button>)}</div>;
}

const PATHS: Record<string, string> = {
  x: 'M4 4l8 8M12 4l-8 8',
  economy: 'M3 13V9M7 13V6M11 13V3M2 13.5h12',
  politics: 'M2 6l6-3.5L14 6M3 6.5v5M6.3 6.5v5M9.7 6.5v5M13 6.5v5M2 13h12',
  military: 'M8 2l5 2v4c0 3-2.2 5-5 6-2.8-1-5-3-5-6V4z',
  diplomacy: 'M5.5 8a2.5 2.5 0 1 0 0-.01M10.5 8a2.5 2.5 0 1 0 0-.01',
  war: 'M3 3l10 10M13 3L3 13M3 10.5L5.5 13M13 10.5L10.5 13',
  chronicle: 'M3 3h4.5A1.5 1.5 0 0 1 9 4.5V13a1.5 1.5 0 0 0-1.5-1.5H3zM13 3H10.5A1.5 1.5 0 0 0 9 4.5V13a1.5 1.5 0 0 1 1.5-1.5H13z',
  timelapse: 'M8 3a5 5 0 1 1-5 5M3 3v3h3M8 5.5V8l2 1.5',
  menu: 'M2.5 4h11M2.5 8h11M2.5 12h11',
  play: 'M5 3.5v9l7-4.5z', pause: 'M4.5 3.5h2.5v9H4.5zM9 3.5h2.5v9H9z',
  sound: 'M3 6h2l3-2.5v9L5 10H3zM10.5 5.5a3.5 3.5 0 0 1 0 5M12 4a5.5 5.5 0 0 1 0 8', mute: 'M3 6h2l3-2.5v9L5 10H3zM10.5 6l3 4M13.5 6l-3 4',
  copy: 'M5 5h7v8H5zM3.5 10.5V3h6',
};
export function Icon({ name, size = 16 }: { name: string; size?: number }) {
  const fill = name === 'play' || name === 'pause';
  return <svg class="icon" width={size} height={size} viewBox="0 0 16 16" aria-hidden="true"><path d={PATHS[name]} fill={fill ? 'currentColor' : 'none'} stroke={fill ? 'none' : 'currentColor'} stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" /></svg>;
}
