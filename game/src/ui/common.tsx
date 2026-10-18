// Shared UI pieces: flags, the dossier sheet, gauges, sparklines, unit symbols and the icon set.
import { useEffect, useRef, useState } from 'preact/hooks';
import type { Session } from '../game/session';
import { t } from '../i18n';
import { pct, cssPct } from './format';

export function Flag({ s, code, h = 14 }: { s: Session; code: string; h?: number }) {
  const A = s.assets, fi = A.flagIndex[s.flagOf[code] || code]; if (!fi) return <span class="flag" style={{ width: h * 1.5, height: h }} />;
  const w = h * 1.5, sx = w / A.flagW;
  return <span class="flag" style={{ width: w, height: h, backgroundImage: `url(${flagUrl(s)})`, backgroundPosition: `-${fi[0] * sx}px -${fi[1] * sx}px`, backgroundSize: `${A.flags.width * sx}px ${A.flags.height * sx}px` }} />;
}
let _flagUrl = '';
function flagUrl(s: Session) { if (_flagUrl) return _flagUrl; const c = document.createElement('canvas'); c.width = s.assets.flags.width; c.height = s.assets.flags.height; c.getContext('2d')!.drawImage(s.assets.flags, 0, 0); _flagUrl = c.toDataURL(); return _flagUrl; }

/** The dossier on the right edge. Escape closes it. */
export function Sheet({ title, onClose, children, eyebrow, icon, head }: { title: any; onClose: () => void; children: any; eyebrow?: any; icon?: string; head?: any }) {
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [onClose]);
  const [body, more, check] = useMore();
  return <section class={`ui sheet plate d-${icon || 'none'}`}>
    <header class="sheet-head">
      {icon && <span class="sheet-icon"><Icon name={icon} size={20} /></span>}
      <div class="sheet-title">{eyebrow && <div class="eyebrow">{eyebrow}</div>}{title}</div>
      <button class="x" aria-label={t('ui.close')} onClick={onClose}><Icon name="x" /></button>
    </header>
    {head}
    <div class="sheet-body" ref={body} onScroll={check}>{children}</div>
    <MoreFooter body={body} more={more} />
  </section>;
}
/** Whether a scroll box has more below; the footer strip shows it without covering content. */
export function useMore() {
  const body = useRef<HTMLDivElement>(null), [more, setMore] = useState(false);
  // the footer takes room itself, so it stays only if the content would still overflow without it
  // while the pointer is inside, only scrolling re-measures: a tooltip near the bottom adds height, and toggling the footer then would move the content under the pointer (flicker)
  const check = (e?: Event) => { const b = body.current; if (!b || (!e && b.matches(':hover'))) return; const f = b.nextElementSibling as HTMLElement | null, foot = f?.classList.contains('more-foot') ? f.offsetHeight : 0; setMore(b.scrollHeight - b.scrollTop - b.clientHeight - foot > 8); };
  useEffect(check);
  useEffect(() => { const id = setInterval(check, 500); return () => clearInterval(id); }, []); // cheap, and catches every late layout change
  return [body, more, check] as const;
}
export function MoreFooter({ body, more }: { body: { current: HTMLDivElement | null }; more: boolean }) {
  return more ? <footer class="more-foot"><button class="more-cue" onClick={() => body.current?.scrollBy({ top: body.current.clientHeight * 0.7, behavior: 'smooth' })}><Icon name="down" size={12} />{t('ui.more')}</button></footer> : null;
}
/** A titled block inside a sheet. */
export function Block({ title, icon, aside, children }: { title?: string; icon?: string; aside?: any; children: any }) {
  return <section class="block">{title && <h3 class="block-h">{icon && <Icon name={icon} size={14} />}<span>{title}</span>{aside && <span class="block-aside">{aside}</span>}</h3>}{children}</section>;
}

export function Bar({ v, tone, mark }: { v: number; tone?: string; mark?: number }) {
  return <div class="meter"><div class={`fill ${tone || ''}`} style={{ width: cssPct(Math.max(0, Math.min(1, v))) }} />{mark !== undefined && <div class="mark" style={{ left: cssPct(Math.max(0, Math.min(1, mark))) }} />}</div>;
}
/** A centred bar for values from -100 to 100 (opinion). */
export function SignedBar({ v, title }: { v: number; title?: string }) {
  return <div class="meter rel" title={title}><div class="fill" style={{ left: v < 0 ? cssPct(0.5 + v / 200) : '50%', width: cssPct(Math.abs(v) / 200), background: v < 0 ? 'var(--red)' : 'var(--green)' }} /></div>;
}
/** Ring gauge for a 0..1 value, with an optional target tick. */
export function Ring({ v, size = 26, tone, target, danger, children }: { v: number; size?: number; tone?: string; target?: number; danger?: number; children?: any }) {
  const r = size / 2 - 3, c = 2 * Math.PI * r, x = Math.max(0, Math.min(1, v));
  const col = tone || (x < 0.35 ? 'var(--red)' : x > 0.65 ? 'var(--green)' : 'var(--brass)');
  const tick = target === undefined ? null : (() => { const a = -Math.PI / 2 + 2 * Math.PI * Math.max(0, Math.min(1, target)); return <line x1={size / 2 + Math.cos(a) * (r - 4)} y1={size / 2 + Math.sin(a) * (r - 4)} x2={size / 2 + Math.cos(a) * (r + 2.5)} y2={size / 2 + Math.sin(a) * (r + 2.5)} class="ring-tick" />; })();
  const dz = danger === undefined ? null : (() => { const a = -Math.PI / 2 + 2 * Math.PI * danger; return <line x1={size / 2 + Math.cos(a) * (r - 4)} y1={size / 2 + Math.sin(a) * (r - 4)} x2={size / 2 + Math.cos(a) * (r + 2.5)} y2={size / 2 + Math.sin(a) * (r + 2.5)} class="ring-danger" />; })();
  return <span class="ring" style={{ width: size, height: size }}>
    <svg width={size} height={size} aria-hidden="true"><circle cx={size / 2} cy={size / 2} r={r} class="ring-bg" /><circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={col} stroke-width="4" stroke-dasharray={`${c * x} ${c}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} stroke-linecap="round" />{dz}{tick}</svg>
    {children && <span class="ring-in">{children}</span>}
  </span>;
}
/** A small line chart of recent values, with the last point marked. */
export function Spark({ values, w = 120, h = 30, tone = 'var(--brass)' }: { values: number[]; w?: number; h?: number; tone?: string }) {
  if (values.length < 2) return <svg class="spark" width={w} height={h} aria-hidden="true"><line x1="0" y1={h - 1} x2={w} y2={h - 1} class="spark-base" /></svg>;
  const lo = Math.min(...values), hi = Math.max(...values), span = hi - lo || Math.abs(hi) || 1;
  const pts = values.map((v, i) => [i / (values.length - 1) * (w - 4) + 2, h - 3 - (v - lo) / span * (h - 6)]);
  const line = pts.map(p => p.join(',')).join(' '), last = pts[pts.length - 1];
  return <svg class="spark" width={w} height={h} aria-hidden="true">
    <polygon points={`2,${h} ${line} ${last[0]},${h}`} fill={tone} opacity="0.14" />
    <polyline points={line} fill="none" stroke={tone} stroke-width="1.5" stroke-linejoin="round" />
    <circle cx={last[0]} cy={last[1]} r="2.5" fill={tone} />
  </svg>;
}
/** One bar split into coloured shares. */
export function StackBar({ parts }: { parts: { v: number; color: string; label: string }[] }) {
  return <div class="stackbar" role="img" aria-label={parts.map(p => `${p.label} ${pct(p.v)}`).join(', ')}>{parts.map(p => <i key={p.label} style={{ flexGrow: p.v, background: p.color }} title={`${p.label} ${pct(p.v)}`} />)}</div>;
}
/** Tug of war from -100 to 100, with each side's flags at the ends. */
export function Tug({ v, left, right }: { v: number; left: any; right: any }) {
  const x = 50 + Math.max(-100, Math.min(100, v)) / 2;
  return <div class="tug"><span class="tug-end">{left}</span><div class="tug-bar"><i class="tug-us" style={{ width: `${x}%` }} /><i class="tug-mark" style={{ left: `${x}%` }} /></div><span class="tug-end">{right}</span></div>;
}

/** A unit type as a tinted chip with its own silhouette (rifleman, tank, carrier, anchor, parachute). */
export function UnitSymbol({ type, size = 28 }: { type: string; size?: number }) {
  return <span class={`unit-chip u-${type}`} style={{ width: size, height: size }} aria-hidden="true"><Icon name={'u_' + type} size={Math.round(size * 0.66)} /></span>;
}

// Icons on a 24-unit grid: a 2px outline, and closed shapes get a tinted fill (duotone) so they read at a glance.
const P: Record<string, string> = {
  x: 'M6 6l12 12M18 6L6 18',
  menu: 'M4 7h16M4 12h16M4 17h16',
  play: 'M8 5v14l11-7z', pause: 'M7 5h3.5v14H7zM13.5 5H17v14h-3.5z',
  // resources
  treasury: 'M5 7a7 2.5 0 1 0 14 0a7 2.5 0 1 0-14 0M5 7v5c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5V7M5 12v5c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5v-5',
  trend: 'M3 17l6-6 4 4 8-8M15 7h6v6', trendDown: 'M3 7l6 6 4-4 8 8M15 17h6v-6',
  manpower: 'M4 15a8 8 0 0 1 16 0zM2.5 15h19M7 15v2.5h10V15M12 7V5',
  stability: 'M12 4v16M8 20h8M5 8h14M5 8l-3 6a3 3 0 0 0 6 0zM19 8l-3 6a3 3 0 0 0 6 0z',
  warSupport: 'M5 21V3M5 4h13l-3 4 3 4H5z',
  influence: 'M12 3l2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.6l-5.4 2.9 1.2-6-4.5-4.2 6.1-.7z',
  // panels
  economy: 'M3 21V11l5 3v-3l5 3v-3l5 3V5h3v16zM3 21h18',
  politics: 'M3 21h18M5 21v-8h14v8zM9 21v-5M12 21v-5M15 21v-5M6 13a6 5 0 0 1 12 0zM12 8V3l4 1.5L12 6',
  military: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6zM8 10l4 2.5 4-2.5M8 13.5l4 2.5 4-2.5',
  diplomacy: 'M2.5 14l4-6 3.5 1.5 3-1.5h4l4.5 6-3 2.5-5.5-5-2.5 1.5M2.5 14l7 6.5 2-1.5 2 1.5 3.5-2.5-3-3M16.5 16.5l-3.5-3',
  war: 'M5 5l11 11M19 5L8 16M14 18l4-4M10 18l-4-4M17.5 17.5L20 20M6.5 17.5L4 20',
  ledger: 'M4 4h16v16H4zM8 16v-3M12 16V8M16 16v-5',
  chronicle: 'M6 4h11a2 2 0 0 1 2 2v12M6 4a2 2 0 0 0-2 2v2h4M6 4a2 2 0 0 1 2 2v12a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2v-2H10v2a2 2 0 0 1-2 2M11 9h5M11 12.5h4',
  timelapse: 'M7 3h10M7 21h10M8 3c0 5 8 5 8 9s-8 4-8 9h8c0-5-8-5-8-9s8-4 8-9z',
  // map lenses
  political: 'M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2zM9 4v14M15 6v14',
  terrain: 'M2 19l6.5-11 4.5 7 2.5-3.5L21 19z',
  population: 'M9 11a3 3 0 1 0 0-6a3 3 0 1 0 0 6M3 20a6 6 0 0 1 12 0zM17 11a2.5 2.5 0 1 0 0-5a2.5 2.5 0 1 0 0 5M15.5 14.2A5 5 0 0 1 21 20h-4',
  relations: 'M9 12a4.5 4.5 0 1 0-9 0a4.5 4.5 0 1 0 9 0M24 12a4.5 4.5 0 1 0-9 0a4.5 4.5 0 1 0 9 0M8 12h8',
  wealth: 'M12 2v20M17 6.5c-1-1.5-2.8-2.3-5-2.3-3 0-5 1.5-5 3.6 0 5 10 2.5 10 7.6 0 2.1-2.2 3.6-5 3.6-2.4 0-4.4-.9-5.4-2.6',
  // feed and treaties
  city: 'M4 21V10h2.5V7H9v3h2V7h2v3h2V7h2.5v3H20v11zM10 21v-4h4v4',
  peace: 'M12 21C7 18 4 14 4 9c3 0 6 1.5 8 4 2-2.5 5-4 8-4 0 5-3 9-8 12zM12 13v8',
  ballot: 'M4 11h16v9H4zM8 11V4h8v7M10 7.5l1.5 1.5 3-3',
  coup: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6zM12 8v5M12 16v.5',
  alliance: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6zM8.5 12l2.5 2.5 4.5-5',
  nap: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6zM7 7l10 10',
  guarantee: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6zM12 8.5l1.4 2.9 3.1.4-2.3 2.1.6 3.1-2.8-1.5-2.8 1.5.6-3.1-2.3-2.1 3.1-.4z',
  trade: 'M3 9h14l-3-3M21 15H7l3 3', treaty: 'M6 3h9l4 4v14H6zM15 3v4h4M9 12h7M9 15.5h7M9 19h4',
  puppet: 'M9 15l6-6M10.5 6.5l1.4-1.4a4 4 0 0 1 5.7 5.7l-1.4 1.4M13.5 17.5l-1.4 1.4a4 4 0 0 1-5.7-5.7l1.4-1.4',
  improve: 'M6 15l6-6 6 6M6 20l6-6 6 6M6 10l6-6 6 6',
  denounce: 'M3 10v4h3l7 4.5V5.5L6 10zM16.5 9a4 4 0 0 1 0 6M19 6.5a7.5 7.5 0 0 1 0 11',
  break: 'M9 15l-1.5 1.5a3.5 3.5 0 0 1-5-5L4 10M15 9l1.5-1.5a3.5 3.5 0 0 1 5 5L20 14M8 3v3M3 8h3M16 21v-3M21 16h-3',
  // postures
  hold: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z',
  advance: 'M5 12h13M13 6l6 6-6 6',
  offensive: 'M3 12h9M8 6l6 6-6 6M12 12h9M17 6l6 6-6 6',
  // interest groups
  g_military: 'M4 15a8 8 0 0 1 16 0zM2.5 15h19M7 15v2.5h10V15',
  g_industry: 'M3 21V11l5 3v-3l5 3v-3l5 3V5h3v16z',
  g_labor: 'M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.5-.5-.5-2.5z',
  g_rural: 'M12 21V6M12 10c-2.5 0-4-1.5-4-4 2.5 0 4 1.5 4 4zm0 0c2.5 0 4-1.5 4-4-2.5 0-4 1.5-4 4zM12 15.5c-2.5 0-4-1.5-4-4 2.5 0 4 1.5 4 4zm0 0c2.5 0 4-1.5 4-4-2.5 0-4 1.5-4 4z',
  // misc
  copy: 'M8 8h11v12H8zM5 16V4h11', target: 'M12 12m-8 0a8 8 0 1 0 16 0a8 8 0 1 0-16 0M12 12m-3 0a3 3 0 1 0 6 0a3 3 0 1 0-6 0M12 2v4M12 18v4M2 12h4M18 12h4',
  check: 'M5 12.5l4.5 4.5L19 7.5', cross: 'M7 7l10 10M17 7L7 17', save: 'M5 4h11l3 3v13H5zM8 4v5h7V4M8 20v-6h8v6',
  settings: 'M12 15a3 3 0 1 0 0-6a3 3 0 1 0 0 6M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
  gdp: 'M3 20h18M6 17V11M10 17V7M14 17v-4M18 17V5', divisions: 'M3 7h18v10H3zM3 7l18 10M21 7L3 17', calendar: 'M4 6h16v14H4zM4 10h16M8 3v5M16 3v5',
  flat: 'M5 12h14', up: 'M12 3l9 13H3z',
  // unit types
  u_infantry: 'M12 3.5a2.6 2.6 0 1 0 0 5.2a2.6 2.6 0 1 0 0-5.2M7.5 21v-6.5a4.5 4.5 0 0 1 9 0V21zM15.5 11.5L20 3',
  u_armor: 'M4.5 14.5h15a3 3 0 0 1 0 6h-15a3 3 0 0 1 0-6zM7 17.5h.01M12 17.5h.01M17 17.5h.01M6.5 14.5l1.5-4h8l1.5 4M11 10.5V8h4.5v2.5M15.5 9h6.5',
  u_mechanized: 'M2.5 16l2-6h11l3.5 3h2.5v3zM4 18.5a2 2 0 1 0 4 0a2 2 0 1 0-4 0M10 18.5a2 2 0 1 0 4 0a2 2 0 1 0-4 0M16 18.5a2 2 0 1 0 4 0a2 2 0 1 0-4 0',
  u_marines: 'M10 5a2 2 0 1 0 4 0a2 2 0 1 0-4 0M12 7v14M8 10.5h8M4.5 13.5a7.5 7.5 0 0 0 15 0M4.5 13.5L3 15M19.5 13.5L21 15',
  u_airborne: 'M3 11a9 7 0 0 1 18 0zM3 11l9 9 9-9M8.5 11l3.5 9 3.5-9M12 20v1.5', down: 'M12 21l9-13H3z',
};
const FILLED = new Set(['play', 'pause', 'up', 'down']);
const DUO = new Set(['treasury', 'manpower', 'stability', 'warSupport', 'influence', 'economy', 'politics', 'military', 'ledger', 'chronicle', 'timelapse', 'political', 'terrain', 'population', 'city', 'peace', 'ballot', 'coup', 'alliance', 'nap', 'guarantee', 'hold', 'g_military', 'g_industry', 'g_labor', 'save', 'calendar', 'divisions', 'denounce', 'treaty', 'u_infantry', 'u_armor', 'u_mechanized', 'u_airborne']);
export function Icon({ name, size = 18 }: { name: string; size?: number }) {
  const d = P[name] || P.target, fill = FILLED.has(name);
  return <svg class="icon" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
    {DUO.has(name) && <path d={d} fill="currentColor" fill-opacity="0.3" stroke="none" />}
    <path d={d} fill={fill ? 'currentColor' : 'none'} stroke={fill ? 'none' : 'currentColor'} stroke-width="2" stroke-linecap="round" stroke-linejoin="round" /></svg>;
}
/** Change since last month: a small arrow and the amount, green when it helps. */
export function Delta({ v, fmt, invert }: { v: number; fmt: (v: number) => string; invert?: boolean }) {
  if (!isFinite(v) || Math.abs(v) < 1e-9) return <span class="delta flat">—</span>;
  const good = (v > 0) !== !!invert;
  return <span class={`delta ${good ? 'good' : 'bad'}`}><Icon name={v > 0 ? 'up' : 'down'} size={9} />{fmt(Math.abs(v))}</span>;
}

/** A smooth line through points that never overshoots between them (monotone cubic). */
function smooth(p: number[][]) {
  if (p.length < 3) return 'M' + p.map(q => q.join(',')).join('L');
  const n = p.length, d: number[] = [], m: number[] = [];
  for (let i = 0; i < n - 1; i++) d.push((p[i + 1][1] - p[i][1]) / (p[i + 1][0] - p[i][0] || 1));
  m.push(d[0]); for (let i = 1; i < n - 1; i++) m.push(d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2); m.push(d[n - 2]);
  let s = `M${p[0][0]},${p[0][1]}`;
  for (let i = 0; i < n - 1; i++) { const dx = (p[i + 1][0] - p[i][0]) / 3; s += `C${p[i][0] + dx},${p[i][1] + m[i] * dx} ${p[i + 1][0] - dx},${p[i + 1][1] - m[i + 1] * dx} ${p[i + 1][0]},${p[i + 1][1]}`; }
  return s;
}
/** Round numbers for an axis between lo and hi. */
function ticks(lo: number, hi: number, n = 5) {
  if (hi - lo < 1e-9) { hi = lo + 1; }
  const raw = (hi - lo) / n, mag = Math.pow(10, Math.floor(Math.log10(raw))), step = [1, 2, 5, 10].map(m => m * mag).find(s => s >= raw)!;
  const a = Math.floor(lo / step) * step, out: number[] = [];
  for (let v = a; v <= hi + step * 0.5; v += step) out.push(+v.toFixed(10));
  return out;
}
 /** line styles per series slot, so overlapping lines stay apart without colour */
const DASH = ['', '7 4', '2 4', '10 4 2 4'];
export const dashOf = (i: number) => DASH[i % DASH.length];
export type Series = { id: string | number; label: string; color: string; values: number[] };
/** Line chart over months: one y axis, recessive grid, direct labels at the line ends, a crosshair on hover. */
export function LineChart({ series, xs, fmtX, fmtY, height = 180, zero, marks = [], invert }: { series: Series[]; xs: number[]; fmtX: (x: number) => string; fmtY: (v: number) => string; height?: number; zero?: boolean; marks?: { x: number; label: string; n: number; minor?: boolean }[]; invert?: boolean }) {
  const ref = useRef<HTMLDivElement>(null), [W, setW] = useState(480), [hi, setHi] = useState<number | null>(null);
  useEffect(() => { const el = ref.current; if (!el) return; const ro = new ResizeObserver(() => setW(el.clientWidth || 480)); ro.observe(el); return () => ro.disconnect(); }, []);
  const n = xs.length;
  if (n < 2) return <div ref={ref} class="chart empty" style={{ height }}><span>{t('led.empty')}</span></div>;
  const minorMarks = marks.some(m => m.minor), labels = series.length > 1, L = 54, R = labels ? 96 : 14, T = 10 + (marks.length && !minorMarks ? 16 : 0), B = minorMarks ? 38 : 24, w = Math.max(60, W - L - R), h = height - T - B;
  const all = series.flatMap(s => s.values), mn = Math.min(...all), mx = Math.max(...all), pad = Math.max((mx - mn) * 0.12, Math.abs(mx) * 0.03, 1e-6);
  const y0 = zero ? Math.min(0, mn) : (mn >= 0 && mn - pad < 0 ? 0 : mn - pad), y1 = mx + pad; // the axis fits the data, not the round numbers
  const tk0 = ticks(y0, y1, 6).filter(v => v >= y0 - 1e-9 && v <= y1 + 1e-9);
  const tk = tk0.filter((v, i) => i === 0 || fmtY(v) !== fmtY(tk0[i - 1])); // no repeated labels after rounding
  const X = (i: number) => L + i / (n - 1) * w, Y = (v: number) => T + h - (v - y0) / (y1 - y0 || 1) * h;
  // direct labels, nudged apart so they never collide
  const ends0 = series.map(s => ({ s, y: Y(s.values[n - 1]), label: s.values.every(v => v === s.values[0]) ? `${s.label} · ${t('led.noChange')}` : s.label })).sort((a, b) => a.y - b.y), ends: typeof ends0 = [];
  for (const e of ends0) { const last = ends[ends.length - 1]; if (last && e.y - last.y < 6) last.label += ', ' + e.label; else ends.push({ ...e }); }
  for (let i = 1; i < ends.length; i++) if (ends[i].y - ends[i - 1].y < 20) ends[i].y = ends[i - 1].y + 20;
  const path = (v: number[]) => smooth(v.map((y, i) => [X(i), Y(y)]));
  // event pins: the month each event fell in
  const pins0 = marks.map(m => ({ ...m, i: Math.max(0, xs.findIndex((x, j) => j === n - 1 || xs[j + 1] > m.x)) }));
  const pins = pins0.filter((m, k) => pins0.findIndex(q => q.i === m.i) === k).map(m => ({ ...m, label: pins0.filter(q => q.i === m.i).map(q => q.label).join(' · '), px: Math.min(L + w - 12, Math.max(L + 10, X(m.i))) }));
  const move = (e: PointerEvent) => { const r = (e.currentTarget as SVGElement).getBoundingClientRect(); const i = Math.round((e.clientX - r.left - L) / w * (n - 1)); setHi(i >= 0 && i < n ? i : null); };
  const hx = hi === null ? 0 : X(hi);
  return <div ref={ref} class="chart">
    <svg width={W} height={height} onPointerMove={move} onPointerLeave={() => setHi(null)} role="img" aria-label={series.map(s => `${s.label} ${fmtY(s.values[n - 1])}`).join(', ')}>
      {tk.map(v => <g key={v}><line x1={L} x2={L + w} y1={Y(v)} y2={Y(v)} class="grid" /><text x={L - 8} y={Y(v) + 4} class="axis" text-anchor="end">{fmtY(v)}</text></g>)}
      <text x={L} y={height - 6} class="axis">{fmtX(xs[0])}</text><text x={L + w} y={height - 6} class="axis" text-anchor="end">{fmtX(xs[n - 1])}</text>
      {<g class={hi !== null ? 'pins dim' : 'pins'}>{pins.map((m, k) => m.minor ? <g key={k}><path class="pin-minor" d={`M${m.px} ${T + h + 3}l4 6h-8z`} /><text x={m.px} y={T + h + 20} text-anchor="middle" class="pin-minor-n">{m.n}</text></g> : <g key={k} class="pin"><line x1={m.px} x2={m.px} y1={T + 8} y2={T + h} /><path d={`M${m.px} ${T - 7}l8 8-8 8-8-8z`} /><text x={m.px} y={T + 5} text-anchor="middle">{m.n}</text></g>)}</g>}
      {!labels && <path d={`${path(series[0].values)}L${X(n - 1)},${T + h}L${X(0)},${T + h}Z`} fill={series[0].color} opacity="0.16" />}
      {series.map((s, i) => <path key={s.id} d={path(s.values)} fill="none" stroke={s.color} stroke-width={i === 0 ? 3 : 2} stroke-dasharray={DASH[i % DASH.length]} stroke-linejoin="round" stroke-linecap="round" />)}
      {series.map(s => <circle key={s.id} cx={X(n - 1)} cy={Y(s.values[n - 1])} r="4" fill={s.color} class="end-dot" />)}
      {labels && ends.map(({ s, y, label }) => <g key={s.id}>{Math.abs(y - Y(s.values[n - 1])) > 3 && <line x1={L + w + 4} x2={L + w + 9} y1={Y(s.values[n - 1])} y2={y} stroke={s.color} stroke-width="1.5" />}<text x={L + w + 12} y={y + 4} class="end-label">{label}</text></g>)}
      {hi !== null && <g><line x1={hx} x2={hx} y1={T} y2={T + h} class="cross" />{series.map(s => <circle key={s.id} cx={hx} cy={Y(s.values[hi])} r="4" fill={s.color} class="end-dot" />)}</g>}
    </svg>
    {hi !== null && <div class={`chart-tip ${labels ? '' : 'above'}`} style={(() => { // the top corner where the lines leave the most room
      const half = (a: number, b: number) => Math.min(...series.flatMap(s => s.values.slice(a, b).map(Y)));
      const top = pins.length && !pins[0].minor ? T + 12 : undefined;
      return half(0, Math.ceil(n / 2)) > half(Math.floor(n / 2), n) ? { left: L + 6, top } : { right: R + 6, top }; })()}><b>{fmtX(xs[hi])}</b>{pins.filter(m => m.i === hi).map((m, k) => <em key={k} class="pin-n">◆{m.n} {(s => s.length > 34 ? s.slice(0, 33) + '…' : s)(m.label.split(' · ')[0])}</em>)}
      {series.slice().sort((a, b) => b.values[hi] - a.values[hi]).map(s => { const d0 = hi > 0 ? s.values[hi] - s.values[hi - 1] : 0, d = Math.abs(d0) < Math.abs(s.values[hi]) * 0.01 ? 0 : d0; return <span key={s.id}><i style={{ background: s.color }} />{labels ? s.label : ''}<b class="num">{fmtY(s.values[hi])}</b>{hi > 0 && d !== 0 && <small class={`num ${(d > 0) !== !!invert ? 'up' : 'dn'}`}>{d > 0 ? '▴' : '▾'}{fmtY(Math.abs(d))}</small>}</span>; })}</div>}
  </div>;
}
/** An icon button whose label shows as a tooltip (and is its accessible name). */
export function IconBtn({ icon, label, onClick, pressed, badge, cls, size = 20, disabled, kbd }: { icon: string; label: string; onClick: () => void; pressed?: boolean; badge?: any; cls?: string; size?: number; disabled?: boolean; kbd?: string }) {
  return <button class={`icon-btn ${cls || ''}`} aria-label={label} data-tip={kbd ? `${label}  ·  ${kbd}` : label} aria-pressed={pressed} disabled={disabled} onClick={onClick}><Icon name={icon} size={size} />{badge ? <i class="badge">{badge}</i> : null}</button>;
}

export function Slider({ id, label, value, min, max, step, fmt, onInput, hint, color, sub, danger }: { id: string; label: string; value: number; min: number; max: number; step: number; fmt: (v: number) => string; onInput: (v: number) => void; hint?: string; color?: string; sub?: string; danger?: boolean }) {
  const c = danger ? 'var(--red)' : color || 'var(--brass)', f = (value - min) / (max - min) * 100;
  return <label class={`slider ${danger ? 'danger' : ''}`} for={id} title={hint}><span class="sl-top"><span class="sl-l">{color && <i class="chip-dot" style={{ background: color }} />}{label}</span>{sub && <small class="sl-sub">{sub}</small>}<b class="num">{fmt(value)}</b></span>
    <input id={id} type="range" min={min} max={max} step={step} value={value} style={{ '--c': c, '--f': `${f}%` }} onInput={e => onInput(+(e.target as HTMLInputElement).value)} /></label>;
}
/** Segmented control (text or icons). */
export function Seg<T extends string | number>({ value, options, onPick, label }: { value: T; options: { v: T; label: string; icon?: string; title?: string }[]; onPick: (v: T) => void; label: string }) {
  return <div class="seg" role="group" aria-label={label}>{options.map(o => <button key={String(o.v)} aria-pressed={o.v === value} title={o.title} aria-label={o.icon ? o.label : undefined} onClick={() => onPick(o.v)}>{o.icon && <Icon name={o.icon} size={16} />}{(!o.icon || o.title) && <span>{o.label}</span>}</button>)}</div>;
}
