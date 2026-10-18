import { useEffect, useState } from 'preact/hooks';
import type { Game } from '../game/play';
import type { LogEntry } from '../sim/types';
import { countryName, fmtDate, say, t } from '../i18n';
import { Icon, Sheet } from './common';
import { fmtBig, fmtInt } from './format';

/** What goes into the history book: the big moments, your wars and politics, and the world's wars. */
function chronicled(e: LogEntry, me: number) {
  if (e.big) return true;
  if (e.kind === 'war' || e.kind === 'peace') return true;
  if (e.who?.includes(me)) return e.kind === 'politics' || e.kind === 'diplo' || e.kind === 'pocket' || (e.kind === 'city' && e.who[0] === me);
  return false;
}

export function ChroniclePanel({ g }: { g: Game }) {
  const w = g.w, me = g.me, [note, setNote] = useState('');
  const entries = w.log.filter(e => chronicled(e, g.player));
  const years = new Map<number, LogEntry[]>();
  for (const e of entries) { const y = new Date(w.startDate + e.day * 864e5).getUTCFullYear(); if (!years.has(y)) years.set(y, []); years.get(y)!.push(e); }
  const nowProv = w.provinces.filter(p => p.owner === g.player).length, startProv = g.startProvinces;
  const text = () => [`${countryName(w, g.player)} — ${t('panel.chronicle')}`, ...[...years.entries()].flatMap(([y, es]) => [``, `${y}`, ...es.map(e => `${fmtDate(w, e.day)}  ${say(w, e.msg)}`)])].join('\n');
  const copy = async () => { try { await navigator.clipboard.writeText(text()); setNote(t('chron.copied')); } catch { setNote(t('chron.copyFailed')); } };
  return <Sheet onClose={() => g.openPanel(null)} eyebrow={t('panel.chronicle')} title={<div class="h2">{t('chron.title', { c: countryName(w, g.player) })}</div>}>
    <dl class="stat">
      <dt>{t('chron.since')}</dt><dd>{fmtDate(w, 0)}</dd>
      <dt>{t('chron.provinces')}</dt><dd class={nowProv < startProv ? 'bad' : nowProv > startProv ? 'good' : ''}>{t('chron.fromTo', { a: startProv, b: nowProv })}</dd>
      <dt>{t('chron.wars')}</dt><dd>{fmtInt(me.stats.wars)}</dd>
      <dt>{t('war.casualties')}</dt><dd>{fmtBig(me.stats.casualties)}</dd>
    </dl>
    <button onClick={copy}><Icon name="copy" size={14} />{t('chron.copy')}</button>
    {note && <small class="muted" role="status">{note}</small>}
    {!entries.length && <p class="muted">{t('chron.empty')}</p>}
    {[...years.entries()].reverse().map(([y, es]) => <section class="chron-year" key={y}>
      <h3 class="year num">{y}</h3>
      <ol class="chron">{es.slice().reverse().map((e, i) => <li key={i} class={`k-${e.kind} ${e.big ? 'big' : ''}`}><time class="mono">{fmtDate(w, e.day)}</time><span>{say(w, e.msg)}</span></li>)}</ol>
    </section>)}
  </Sheet>;
}

/** Replays the map month by month, from the start of the game. */
export function TimelapsePanel({ g }: { g: Game }) {
  const n = g.history.length, [i, setI] = useState(Math.max(0, n - 1)), [playing, setPlaying] = useState(false);
  useEffect(() => { g.showSnapshot(i); }, [i]);
  useEffect(() => () => g.showSnapshot(null), []);
  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => setI(x => { if (x >= n - 1) { setPlaying(false); return x; } return x + 1; }), 160);
    return () => clearInterval(id);
  }, [playing, n]);
  const snap = g.history[i];
  return <Sheet onClose={() => g.openPanel(null)} eyebrow={t('panel.timelapse')} title={<div class="h2 num">{snap ? fmtDate(g.w, snap.day, 'month') : '—'}</div>}>
    {n < 2 ? <p class="muted">{t('lapse.empty')}</p> : <>
      <div class="lapse-row">
        <button class="pp" aria-label={playing ? t('clock.pause') : t('clock.play')} onClick={() => { if (!playing && i >= n - 1) setI(0); setPlaying(!playing); }}><Icon name={playing ? 'pause' : 'play'} size={14} /></button>
        <input id="lapse" type="range" min={0} max={n - 1} step={1} value={i} aria-label={t('lapse.scrub')} onInput={e => { setPlaying(false); setI(+(e.target as HTMLInputElement).value); }} />
      </div>
      <small class="muted">{t('lapse.hint', { n })}</small>
    </>}
  </Sheet>;
}
