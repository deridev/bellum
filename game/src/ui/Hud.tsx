import { useEffect, useRef, useState } from 'preact/hooks';
import { SPEEDS, type Game, type Panel } from '../game/play';
import { useStore, useTick } from '../game/store';
import { atWar, popOf, UNIT_SPEC, queueUnit, cancelUnit } from '../sim/economy';
import { groupMood, stabilityTarget } from '../sim/politics';
import { DIPLO, diploOdds, type DiploAction } from '../sim/diplomacy';
import { type Conscription, type Country, type LogEntry, type UnitType, type War } from '../sim/types';
import { CONSCRIPTION_RATE, rel } from '../sim/world';
import { armyName, countryName, fmtDate, say, t, unitName } from '../i18n';
import { HoverTip } from './App';
import { Bar, Block, Delta, Flag, Icon, IconBtn, Ring, Sheet, SignedBar, Slider, Spark, StackBar, UnitSymbol } from './common';
import { LedgerScreen } from './Ledger';
import { fmtBig, fmtInt, fmtMoney, pct } from './format';
import { listSaves, loadGame, saveGame, deleteSave } from '../game/save';
import { AgendaCards, DeclareDialog, ToolHint, WarPanel } from './War';
import { ChroniclePanel, TimelapsePanel } from './Chronicle';
import { Settings } from './Settings';
import { enemies, sideOf, warsOf } from '../sim/war/war';

type PanelKind = 'economy' | 'politics' | 'military' | 'diplomacy' | 'war' | 'ledger' | 'chronicle' | 'timelapse';
const LENSES = [{ id: 'political', icon: 'political' }, { id: 'terrain', icon: 'terrain' }, { id: 'diplomacy', icon: 'relations' }, { id: 'population', icon: 'population' }, { id: 'economy', icon: 'wealth' }] as const;

export function Hud({ g }: { g: Game }) {
  const st = useTick(g.st), p = st.panel;
  const [agenda, setAgenda] = useState(() => !matchMedia('(max-width: 760px)').matches); // phones start with decisions folded into the strip
  useShortcuts(g);
  return <>
    <CommandStrip g={g} onDecisions={() => setAgenda(!agenda)} />
    <Toasts g={g} />
    <HoverTip s={g.s} />
    <Banner g={g} />
    {p?.kind === 'economy' && <EconomyPanel g={g} />}
    {p?.kind === 'politics' && <PoliticsPanel g={g} />}
    {p?.kind === 'military' && <MilitaryPanel g={g} />}
    {p?.kind === 'diplomacy' && <DiplomacyPanel g={g} />}
    {p?.kind === 'province' && <ProvincePanel g={g} id={p.id} />}
    {p?.kind === 'country' && <CountryPanel g={g} id={p.id} />}
    {p?.kind === 'war' && <WarPanel g={g} id={p.id} />}
    {p?.kind === 'chronicle' && <ChroniclePanel g={g} />}
    {p?.kind === 'timelapse' && <TimelapsePanel g={g} />}
    {p?.kind === 'ledger' && <LedgerScreen g={g} />}
    <Dock g={g} />
    <LensRail g={g} />
    {p?.kind !== 'ledger' && agenda && <AgendaCards g={g} slim={!!p} />}
    <ToolHint g={g} />
    {st.declare >= 0 && <DeclareDialog g={g} target={st.declare} />}
    {st.menu && <Menu g={g} />}
  </>;
}

/** 1–8 open panels, space pauses, +/- change speed. */
function useShortcuts(g: Game) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input, textarea') || e.ctrlKey || e.metaKey || e.altKey) return;
      const i = '12345678'.indexOf(e.key);
      if (i >= 0) { const kind = panelOrder(g)[i]; if (kind) togglePanel(g, kind); e.preventDefault(); }
      else if (e.key === ' ') { g.togglePause(); e.preventDefault(); }
      else if (e.key === '+' || e.key === '=') g.setSpeed(Math.min(SPEEDS.length - 1, g.st.get().speed + 1));
      else if (e.key === '-') g.setSpeed(Math.max(0, g.st.get().speed - 1));
    };
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k);
  }, []);
}
const panelOrder = (g: Game): PanelKind[] => ['economy', 'politics', 'military', 'diplomacy', ...(warsOf(g.w, g.player).length ? ['war' as const] : []), 'ledger', 'chronicle', 'timelapse'];
function togglePanel(g: Game, kind: PanelKind) {
  const cur = g.st.get().panel;
  if (cur?.kind === kind) { g.openPanel(null); return; }
  if (kind === 'war') { const w = warsOf(g.w, g.player)[0]; if (w) g.openPanel({ kind: 'war', id: w.id }); return; }
  g.openPanel({ kind } as Panel);
}

// ---------------------------------------------------------------- the command strip
/** change of a recorded statistic since the previous month */
function monthly(g: Game, k: 'manpower' | 'stability' | 'warSupport') { const v = g.series(k); return v.length > 1 ? v[v.length - 1] - v[v.length - 2] : 0; }
const pts = (v: number) => t('hud.pts', { n: Math.round(v * 100) });
function CommandStrip({ g, onDecisions }: { g: Game; onDecisions: () => void }) {
  const c = g.me, st = g.st.get(), bal = c.income - c.spending, wars = warsOf(g.w, g.player), waiting = g.w.agenda.filter(a => a.country === g.player).length;
  const war = wars[0], score = war ? war.score * sideOf(war, g.player) : 0;
  return <><header class="ui strip strip-l plate">
    <button class="emblem" onClick={() => togglePanel(g, 'politics')} data-tip={`${t('title.' + c.leader.title)} ${c.leader.name}`}>
      <Flag s={g.s} code={c.code} h={30} /><span class="em-name">{countryName(g.w, c.id)}</span>
    </button>
    <div class="res">
      <Res icon="treasury" tone="gold" k="treasury" v={fmtMoney(c.treasury)} danger={c.treasury <= 0 || (bal < 0 && c.treasury < -bal * 3)} onClick={() => togglePanel(g, 'economy')}
        sub={<span class={`delta ${bal < 0 ? 'bad' : 'good'}`}><Icon name={bal < 0 ? 'down' : 'up'} size={9} />{fmtMoney(Math.abs(bal))}{t('hud.perMo')}</span>} />
      <Res minor icon="manpower" tone="steel" k="manpower" v={fmtBig(c.manpower)} sub={<Delta v={monthly(g, 'manpower')} fmt={fmtBig} />} onClick={() => togglePanel(g, 'military')} />
      <Res icon="stability" tone="teal" k="stability" v={pct(c.stability)} gauge={c.stability} sub={<Delta v={monthly(g, 'stability')} fmt={pts} />} onClick={() => togglePanel(g, 'politics')} />
      <Res icon="warSupport" tone="rust" k="warSupport" v={pct(c.warSupport)} gauge={c.warSupport} sub={<Delta v={monthly(g, 'warSupport')} fmt={pts} />} onClick={() => togglePanel(g, 'politics')} />
      <Res minor icon="influence" tone="violet" k="influence" v={fmtInt(c.polCap)} onClick={() => togglePanel(g, 'diplomacy')} />
    </div>
  </header>
  <header class="ui strip strip-r plate">
    <div class="alerts">
      {war && <button class={`alert war phone-only ${score < -20 ? 'bad' : score > 20 ? 'good' : ''}`} onClick={() => togglePanel(g, 'war')}>
        <Icon name="war" size={20} /><span class="al-txt"><b class="num">{score > 0 ? '+' : ''}{Math.round(score)}</b><small>{t('war.score')}</small></span>{wars.length > 1 && <i class="badge">{wars.length}</i>}</button>}
      {waiting > 0 && <button class="alert wait" data-tip={t('hud.decisions', { n: waiting })} onClick={onDecisions}><Icon name="ballot" size={20} /><span class="al-txt"><b class="num">{waiting}</b><small>{t('hud.decisionsShort')}</small></span></button>}
    </div>
    <div class="time">
      <div class="date-box"><div class="date num">{fmtDate(g.w)}</div><div class={`speed-l ${st.paused ? 'paused' : ''}`}>{st.paused ? t('clock.paused') : t('clock.speedN', { n: st.speed + 1 })}</div></div>
      <button class={`pp ${st.paused ? 'is-paused' : ''}`} aria-label={st.paused ? t('clock.play') : t('clock.pause')} data-tip={`${st.paused ? t('clock.play') : t('clock.pause')}  ·  ␣`} onClick={() => g.togglePause()}><Icon name={st.paused ? 'play' : 'pause'} size={16} /></button>
      <div class="pips" role="group" aria-label={t('clock.speed')}>{SPEEDS.map((sp, i) => <button key={i} class="pip" aria-pressed={!st.paused && st.speed >= i} aria-label={t('clock.speedN', { n: i + 1 })} data-tip={t('clock.perSec', { n: sp })} onClick={() => g.setSpeed(i)}><i style={{ height: `${6 + i * 3}px` }} /></button>)}</div>
      {st.turnMode === 'monthly' && <span class="turn-tag" data-tip={t('set.turnsHint')}>M</span>}
      <IconBtn icon="menu" label={t('menu.title')} onClick={() => g.st.set({ menu: true, paused: true })} size={20} />
    </div>
  </header>
  {war && <WarBanner g={g} war={war} more={wars.length - 1} />}</>;
}
/** The war you are fighting, always in view under the strip: both sides, the tug of war and the score. */
function WarBanner({ g, war, more }: { g: Game; war: War; more: number }) {
  const side = sideOf(war, g.player), score = war.score * side, ours = side > 0 ? war.attackers : war.defenders, theirs = side > 0 ? war.defenders : war.attackers;
  const x = 50 + Math.max(-100, Math.min(100, score)) / 2;
  const flags = (cs: number[]) => cs.slice(0, 3).map(c => <Flag key={c} s={g.s} code={g.w.countries[c].code} h={16} />);
  return <button class={`ui war-banner plate ${score < -20 ? 'bad' : score > 20 ? 'good' : ''}`} onClick={() => togglePanel(g, 'war')} data-tip={t('war.scoreHint')}>
    <span class="wb-name"><Icon name="war" size={16} />{say(g.w, war.name)}{more > 0 && <i class="wb-more">+{more}</i>}</span>
    <span class="wb-row"><span class="wb-flags">{flags(ours)}</span><span class="wb-bar"><i style={{ width: `${x}%` }} /><b style={{ left: `${x}%` }} /></span><span class="wb-flags">{flags(theirs)}</span>
      <b class="wb-score num">{score > 0 ? '+' : ''}{Math.round(score)}</b></span>
  </button>;
}
function Res({ icon, k, v, tone, gauge, sub, danger, minor, onClick }: { icon: string; k: string; v: string; tone: string; gauge?: number; sub?: any; danger?: boolean; minor?: boolean; onClick: () => void }) {
  return <button class={`res-cell t-${tone} ${danger ? 'danger' : ''} ${minor ? 'minor' : ''}`} aria-label={`${t('ledger.' + k)} ${v}`} data-tip={`${t('ledger.' + k)} — ${t('ledger.' + k + '.hint')}`} onClick={onClick}>
    {gauge !== undefined ? <Ring v={gauge} size={42} tone="currentColor"><Icon name={icon} size={20} /></Ring> : <span class="res-badge"><Icon name={icon} size={20} /></span>}
    <span class="res-txt"><span class="res-top"><b class="res-v num">{v}</b>{sub}</span><span class="res-k">{t('ledger.' + k)}</span></span></button>;
}

// ---------------------------------------------------------------- the dock and the map lenses
function Dock({ g }: { g: Game }) {
  const p = g.st.get().panel, wars = warsOf(g.w, g.player).length, lens = useStore(g.s.ui, u => u.mapMode);
  return <nav class="ui dock plate" aria-label={t('hud.panels')}>
    {panelOrder(g).map((kind, i) => <button key={kind} class={`dock-btn d-${kind}`} aria-pressed={p?.kind === kind} data-tip={`${t('panel.' + kind)}  ·  ${i + 1}`} onClick={() => togglePanel(g, kind)}>
      <Icon name={kind} size={26} /><span>{t('panel.' + kind)}</span><kbd>{i + 1}</kbd>{kind === 'war' && <i class="badge">{wars}</i>}</button>)}
    <span class="dock-sep" aria-hidden="true"><span>{t('hud.map')}</span></span>
    <span class="lenses" role="group" aria-label={t('modes.label')}>{LENSES.map(l => <button key={l.id} class="lens-btn" aria-pressed={lens === l.id} data-tip={t('modes.' + l.id)} aria-label={t('modes.' + l.id)} onClick={() => g.s.setMapMode(l.id)}><Icon name={l.icon} size={20} /><span>{t('modes.' + l.id)}</span></button>)}</span>
  </nav>;
}

/** On phones the map lenses get their own rail on the right, since the dock has no room. */
function LensRail({ g }: { g: Game }) {
  const lens = useStore(g.s.ui, u => u.mapMode);
  return <nav class="ui lens-rail plate" aria-label={t('modes.label')}>{LENSES.map(l => <button key={l.id} class="lens-btn" aria-pressed={lens === l.id} aria-label={t('modes.' + l.id)} onClick={() => g.s.setMapMode(l.id)}><Icon name={l.icon} size={20} /></button>)}</nav>;
}

// ---------------------------------------------------------------- news: short-lived dispatches with an icon each
const KIND_ICON: Record<string, string> = { war: 'war', peace: 'peace', city: 'city', pocket: 'target', diplo: 'diplomacy', politics: 'ballot', event: 'chronicle', economy: 'economy', player: 'military' };
function Toasts({ g }: { g: Game }) {
  const w = g.w, me = g.player, seen = useRef(w.log.length);
  const [items, setItems] = useState<{ e: LogEntry; t0: number }[]>([]);
  useEffect(() => {
    const id = setInterval(() => {
      if (w.log.length < seen.current) seen.current = w.log.length;
      const fresh = w.log.slice(seen.current).filter(l => l.who?.includes(me) || l.big || l.kind === 'war' || l.kind === 'peace'); seen.current = w.log.length;
      const now = Date.now();
      setItems(list => { const next = [...list.filter(x => now - x.t0 < 7000), ...fresh.map(e => ({ e, t0: now }))]; return next.length === list.length && !fresh.length ? list : next.slice(-3); });
    }, 300);
    return () => clearInterval(id);
  }, [w]);
  if (!items.length) return null;
  return <ol class="ui toasts" aria-live="polite">{items.map(({ e, t0 }) => <li key={t0 + e.msg.k + e.day}>
    <button class={`toast k-${e.kind}`} disabled={!e.at && e.prov === undefined} onClick={() => g.focusLog(e)}>
      <span class="toast-ic"><Icon name={KIND_ICON[e.kind] || 'chronicle'} size={18} /></span><span class="toast-t">{say(w, e.msg)}</span><time class="mono">{fmtDate(w, e.day, 'short')}</time>
    </button></li>)}</ol>;
}

/** Big moments get a banner across the map: war, peace, coups, annexations. */
function Banner({ g }: { g: Game }) {
  const [cur, setCur] = useState<LogEntry | null>(null);
  const seen = useRef(g.w.log.length), queue = useRef<LogEntry[]>([]);
  const w = g.w;
  useEffect(() => {
    const id = setInterval(() => {
      if (w.log.length < seen.current) seen.current = w.log.length;
      for (const e of w.log.slice(seen.current)) if (e.big && (e.who?.includes(g.player) || e.big === 'big.war' || e.big === 'big.peace')) queue.current.push(e);
      seen.current = w.log.length;
      if (!cur && queue.current.length) { const e = queue.current.shift()!; setCur(e); g.sound(e.big === 'big.war' ? 'war' : e.big === 'big.peace' ? 'peace' : 'alert'); setTimeout(() => setCur(null), 3600); }
    }, 200);
    return () => clearInterval(id);
  }, [cur, w]);
  if (!cur) return null;
  return <div class="ui banner" role="status" key={cur.day + cur.msg.k}><div class="banner-date mono">{fmtDate(w, cur.day)}</div><div class="banner-title">{t(cur.big!)}</div><div class="banner-text">{say(w, cur.msg)}</div></div>;
}

// ---------------------------------------------------------------- panels
function NationSheet({ g, children, kind }: { g: Game; children: any; kind: PanelKind }) {
  const c = g.me;
  return <Sheet onClose={() => g.openPanel(null)} icon={kind} eyebrow={t('panel.' + kind)} title={<div class="title-row"><Flag s={g.s} code={c.code} h={18} /><div class="h2">{countryName(g.w, c.id)}</div></div>}>{children}</Sheet>;
}
/** Big figure with a label and an optional trend line. */
function Figure({ label, value, tone, spark, icon, sub }: { label: string; value: string; tone?: string; spark?: number[]; icon?: string; sub?: any }) {
  return <div class={`figure ${tone || ''}`}><span class="fig-l">{icon && <Icon name={icon} size={15} />}{label}</span><b class="fig-v num">{value}</b>{sub && <span class="fig-sub">{sub}</span>}{spark && <Spark values={spark} w={150} h={34} tone={tone === 'bad' ? 'var(--red)' : tone === 'good' ? 'var(--green)' : 'var(--brass)'} />}</div>;
}

const BUDGET = [{ k: 'military', color: '#c8604b', icon: 'military' }, { k: 'investment', color: '#c8a04b', icon: 'economy' }, { k: 'welfare', color: '#5f9fd8', icon: 'population' }, { k: 'research', color: '#8ec27a', icon: 'target' }] as const;
function EconomyPanel({ g }: { g: Game }) {
  const c = g.me; const [, force] = useState(0); const upd = () => { force(x => x + 1); g.bump(); };
  const setShare = (k: keyof Country['budget'], v: number) => {
    const others = (Object.keys(c.budget) as (keyof Country['budget'])[]).filter(x => x !== k);
    const rest = others.reduce((a, x) => a + c.budget[x], 0) || 1; const left = 1 - v;
    c.budget[k] = v; for (const x of others) c.budget[x] = c.budget[x] / rest * left; upd();
  };
  const free = Math.max(0, c.spending * c.budget.military - c.upkeep), bal = c.income - c.spending, debt = c.debt / Math.max(1, c.gdp);
  const hints: Record<string, string> = { military: t('eco.milHint', { up: fmtMoney(c.upkeep), prod: fmtMoney(free) }), investment: t('eco.invHint'), welfare: t('eco.welHint'), research: t('eco.resHint', { n: c.tech }) };
  return <NationSheet g={g} kind="economy">
    <div class="figures three">
      <Figure icon="gdp" label={t('led.col.gdp')} value={fmtMoney(c.gdp)} spark={g.series('gdp')} sub={<span class={c.growth < 0 ? 'bad' : 'good'}><Icon name={c.growth < 0 ? 'trendDown' : 'trend'} size={13} /> {t('eco.perYear', { v: pct(c.growth) })}</span>} />
      <Figure icon="treasury" label={t('ledger.treasury')} value={fmtMoney(c.treasury)} tone={c.treasury <= 0 ? 'bad' : ''} spark={g.series('treasury')} sub={<span class={bal < 0 ? 'bad' : 'good'}>{t('eco.perMonth', { v: (bal >= 0 ? '+' : '−') + fmtMoney(Math.abs(bal)) })}</span>} />
      <Figure icon="trendDown" label={t('eco.debt')} value={pct(debt)} tone={debt > 0.8 ? 'bad' : ''} sub={<span class="muted">{fmtMoney(c.debt)}</span>} />
    </div>
    {(debt > 0.8 || (bal < 0 && c.treasury <= 0)) && <div class={`debt-row ${debt > 0.8 ? 'danger' : 'warn'}`} data-tip={t('eco.borrowHint')}><Icon name="coup" size={20} /><small>{t(debt > 1.2 ? 'eco.debtHigh' : bal < 0 && c.treasury <= 0 ? 'eco.debtBorrowing' : 'eco.debtMid', { v: fmtMoney(-bal) })}</small></div>}
    <Block title={t('eco.budget')} icon="economy">
      <StackBar parts={BUDGET.map(b => ({ v: c.budget[b.k], color: b.color, label: t('eco.' + b.k) }))} />
      {BUDGET.map(b => <Slider key={b.k} id={'b-' + b.k} color={b.color} label={t('eco.' + b.k)} value={c.budget[b.k]} min={b.k === 'research' ? 0 : 0.02} max={b.k === 'research' ? 0.3 : 0.8} step={0.01} fmt={pct} onInput={v => setShare(b.k, v)} hint={hints[b.k]} sub={t('eco.perMonth', { v: fmtMoney(c.spending * c.budget[b.k]) })} />)}
    </Block>
    <Block title={t('eco.taxes')} icon="treasury">
      <Slider id="tax" label={t('eco.taxRate')} value={c.taxRate} min={0.08} max={0.55} step={0.01} fmt={pct} onInput={v => { c.taxRate = v; upd(); }} hint={t('eco.taxHint')} sub={t('eco.revenueIs', { v: t('eco.perMonth', { v: fmtMoney(c.income) }) })} />
      <Slider id="deficit" label={t('eco.borrowing')} value={c.deficit} min={0} max={0.8} step={0.01} fmt={v => t('eco.ofRevenue', { p: pct(v) })} onInput={v => { c.deficit = v; upd(); }} hint={t('eco.borrowHint')} danger={c.deficit > 0.4} sub={c.deficit > 0.4 ? t('eco.borrowWarn') : undefined} />
    </Block>
  </NationSheet>;
}

function PoliticsPanel({ g }: { g: Game }) {
  const c = g.me, target = stabilityTarget(g.w, c), mood = groupMood(g.w, c), [ex, au] = c.ideology;
  const initials = c.leader.name.split(' ').map(x => x[0]).slice(0, 2).join('');
  return <NationSheet g={g} kind="politics">
    <div class="leader-row">
      <div class="leader-card">
        <span class="monogram" style={{ borderColor: c.color }}>{initials}</span>
        <div><div class="eyebrow">{t('title.' + c.leader.title)} · {t('gov.' + c.gov)}</div><div class="h3 plain">{c.leader.name}</div>
          <div class="traits">{c.leader.traits.map(x => <span class="trait" key={x}>{t('trait.' + x)}</span>)}</div>
          {c.gov === 'democracy' && c.nextElection >= 0 && <small class="muted elect"><Icon name="ballot" size={13} /> {t('pol.nextElection', { d: fmtDate(g.w, c.nextElection) })}</small>}</div>
      </div>
      <div class="compass" data-tip={t('pol.ideology')}><svg viewBox="-110 -110 220 220" role="img" aria-label={t('pol.ideology')}>
        <rect x="-100" y="-100" width="200" height="200" class="cmp-bg" /><line x1="-100" y1="0" x2="100" y2="0" class="cmp-ax" /><line x1="0" y1="-100" x2="0" y2="100" class="cmp-ax" />
        <text x="0" y="-80" class="cmp-t" text-anchor="middle">{t('pol.order')}</text><text x="0" y="94" class="cmp-t" text-anchor="middle">{t('pol.liberty')}</text>
        <circle cx={ex * 90} cy={-au * 90} r="11" class="cmp-dot" style={{ fill: c.color }} />
      </svg><small class="cmp-x"><span>{t('pol.collective')}</span><span>{t('pol.market')}</span></small></div>
    </div>
    <div class="gauges">
      <div class="gauge" data-tip={t('ledger.stability.hint')}><Ring v={c.stability} size={60} target={target}><b class="num">{Math.round(c.stability * 100)}</b></Ring><span class="gauge-t"><b>{t('ledger.stability')}</b><small class={target < c.stability - 0.01 ? 'bad' : target > c.stability + 0.01 ? 'good' : 'muted'}>{t('pol.heading', { p: pct(target) })}</small></span></div>
      <div class="gauge" data-tip={t('ledger.warSupport.hint')}><Ring v={c.warSupport} size={60}><b class="num">{Math.round(c.warSupport * 100)}</b></Ring><span class="gauge-t"><b>{t('ledger.warSupport')}</b><Spark values={g.series('warSupport')} w={80} h={20} /></span></div>
    </div>
    <Block title={t('pol.groups')} icon="population">
      <div class="groups">{c.groups.map(gr => { const dir = mood[gr.id] - gr.support; return <div class="group" key={gr.id} data-tip={t('pol.markerHint')}>
        <span class="g-badge"><Icon name={'g_' + gr.id} size={20} /></span>
        <span class="g-name"><b>{t('group.' + gr.id)} <small>· {t('pol.power', { p: pct(gr.power) })}</small></b><small>{t('group.want.' + gr.id)}</small></span>
        <Bar v={gr.support} tone={gr.support < 0.35 ? 'bad' : gr.support > 0.6 ? 'good' : 'amber'} mark={mood[gr.id]} />
        <b class="num g-v">{pct(gr.support)}</b>
        <span class={`g-dir ${dir > 0.02 ? 'good' : dir < -0.02 ? 'bad' : ''}`}><Icon name={dir > 0.02 ? 'up' : dir < -0.02 ? 'down' : 'flat'} size={14} /></span></div>; })}</div>
    </Block>
  </NationSheet>;
}

function MilitaryPanel({ g }: { g: Game }) {
  const c = g.me; const [, force] = useState(0); const upd = () => force(x => x + 1);
  const [note, setNote] = useState('');
  const divs = g.w.divisions.filter(d => d.country === c.id);
  const byType: Record<string, number> = {}; divs.forEach(d => (byType[d.type] = (byType[d.type] || 0) + 1));
  const men = divs.reduce((a, d) => a + d.str, 0), front = divs.filter(d => d.theater >= 0).length;
  const free = Math.max(0, c.spending * c.budget.military - c.upkeep), pop = popOf(g.w, c.id);
  const laws: Conscription[] = ['volunteer', 'limited', 'extensive', 'total'];
  return <NationSheet g={g} kind="military">
    <div class="figures three">
      <Figure label={t('mil.divisions')} value={fmtInt(divs.length)} spark={g.series('divisions')} />
      <Figure label={t('mil.atFront')} value={fmtInt(front)} />
      <Figure label={t('ledger.manpower')} value={fmtBig(c.manpower)} spark={g.series('manpower')} />
    </div>
    <div class="order-of-battle">{(Object.keys(UNIT_SPEC) as UnitType[]).filter(k => byType[k]).map(k => <span key={k} class={`oob u-${k}`} data-tip={t('unitShort.' + k)}><UnitSymbol type={k} size={40} /><span class="oob-t"><b class="num">{byType[k]}</b><small>{t('unitShort.' + k)}</small></span></span>)}
      <span class="oob-men" data-tip={t('mil.divCount', { n: divs.length, men: fmtBig(men) })}><Icon name="population" size={14} /> {fmtBig(men)}</span></div>
    <Block title={t('mil.build')} icon="economy" aside={<span class={free <= 0 ? 'bad' : 'muted'} data-tip={t('mil.funds')}>{t('eco.perMonth', { v: fmtMoney(free) })}</span>}>
      <div class="build">{(Object.keys(UNIT_SPEC) as UnitType[]).map(k => { const s = UNIT_SPEC[k];
        return <button key={k} data-tip={t('mil.cost', { v: fmtMoney(c.unitCost * s.costMul), d: s.days, m: fmtBig(s.men) })} onClick={() => { const e = queueUnit(g.w, c, k); setNote(e ? t('mil.noManpower') : t('mil.queued', { u: t('unitShort.' + k) })); upd(); g.sound('click'); }} disabled={c.manpower < s.men}>
          <UnitSymbol type={k} size={36} /><b>{t('unitShort.' + k)}</b><small class="num">{fmtMoney(c.unitCost * s.costMul)} · {s.days}d</small></button>; })}</div>
      {note && <small class="muted" role="status">{note}</small>}
      {c.production.length > 0 && <ol class="queue">{c.production.map(p => <li key={p.id}><UnitSymbol type={p.type} size={22} /><Bar v={p.progress / p.cost} tone="amber" /><button class="x" aria-label={t('ui.cancel')} onClick={() => { cancelUnit(g.w, c, p.id); upd(); }}><Icon name="x" size={12} /></button></li>)}</ol>}
      {c.production.length > 0 && free <= 0 && <small class="bad">{t('mil.noFunds')}</small>}
    </Block>
    <Block title={t('mil.conscription')} icon="manpower">
      <div class="steps" role="group" aria-label={t('mil.conscription')}>{laws.map((l, i) => <button key={l} aria-pressed={c.conscription === l} class={laws.indexOf(c.conscription) >= i ? 'on' : ''} data-tip={t('mil.lawHint', { p: pct(CONSCRIPTION_RATE[l]), n: fmtBig(pop * CONSCRIPTION_RATE[l]) })} onClick={() => {
        if (l === c.conscription) return; const cost = 25 * Math.abs(laws.indexOf(l) - laws.indexOf(c.conscription));
        if (c.polCap < cost) { setNote(t('mil.needInfluence', { n: cost })); return; }
        c.polCap -= cost; const harsher = laws.indexOf(l) > laws.indexOf(c.conscription); c.conscription = l; if (harsher) c.stability = Math.max(0, c.stability - (atWar(g.w, c.id) ? 0.02 : 0.08)); setNote(t('mil.lawSet', { l: t('law.' + l) })); upd();
      }}><i style={{ height: `${8 + i * 5}px` }} /><span>{t('law.' + l)}</span></button>)}</div>
      <small class="muted">{t('mil.lawCost')}</small>
    </Block>
    <Block title={t('mil.armies')} icon="military">
      <ul class="armies">{g.w.armies.filter(a => a.country === c.id).map(a => { const n = divs.filter(d => d.army === a.id).length; return <li key={a.id} data-tip={a.general.traits.map(x => t('gtrait.' + x)).join(', ')}>
        <span class="monogram sm">{a.general.name.split(' ').map(x => x[0]).slice(0, 2).join('')}</span><span><b>{armyName(a.num)}</b><small>{a.general.name}</small></span><span class="num stars">{'★'.repeat(a.general.skill)}</span><b class="num">{n}</b></li>; })}</ul>
    </Block>
    <div class="tech-row" data-tip={t('eco.resHint', { n: c.tech })}><Icon name="target" size={14} /> {t('mil.tech')} <b class="num">{c.tech}</b></div>
  </NationSheet>;
}

const TREATY_ICON: Record<string, string> = { alliance: 'alliance', guarantee: 'guarantee', nap: 'nap', trade: 'trade', puppet: 'puppet', access: 'advance' };
function DiplomacyPanel({ g }: { g: Game }) {
  const w = g.w, me = g.player;
  const mine = w.treaties.filter(x => x.a === me || x.b === me);
  const other = (x: { a: number; b: number }) => x.a === me ? x.b : x.a;
  const others = w.countries.filter(c => c.alive && c.id !== me);
  const rivals = others.slice().sort((a, b) => rel(w, me, a.id) - rel(w, me, b.id)).slice(0, 6);
  const friends = others.filter(c => !mine.some(x => other(x) === c.id)).sort((a, b) => rel(w, b.id, me) - rel(w, a.id, me)).slice(0, 6);
  const Chip = ({ c }: { c: number }) => { const r = rel(w, c, me); return <button class="nation-chip" onClick={() => g.openPanel({ kind: 'country', id: c })}><Flag s={g.s} code={w.countries[c].code} h={14} /><span>{countryName(w, c)}</span><b class={`num ${r < -25 ? 'bad' : r > 25 ? 'good' : ''}`}>{r > 0 ? '+' : ''}{r}</b></button>; };
  const Row = ({ c }: { c: number }) => { const r = rel(w, c, me); return <button class="nation-row" onClick={() => g.openPanel({ kind: 'country', id: c })}><Flag s={g.s} code={w.countries[c].code} h={16} /><span class="nr-name">{countryName(w, c)}</span><SignedBar v={r} /><b class={`num ${r < -25 ? 'bad' : r > 25 ? 'good' : ''}`}>{r > 0 ? '+' : ''}{r}</b></button>; };
  return <NationSheet g={g} kind="diplomacy">
    <div class="figures two"><Figure icon="influence" label={t('ledger.influence')} value={fmtInt(g.me.polCap)} sub={<small class="muted">{t('dip.influenceHint')}</small>} /></div>
    {(['alliance', 'guarantee', 'nap', 'trade', 'puppet'] as const).map(type => { const list = mine.filter(x => x.type === type).map(other); return list.length ? <Block key={type} title={t('treaty.' + type + '.list')} icon={TREATY_ICON[type]} aside={<b class="num">{list.length}</b>}><div class="chips">{list.map(c => <Chip key={c} c={c} />)}</div></Block> : null; })}
    <Block title={t('dip.rivals')} icon="war" aside={<small class="muted">{t('dip.opinion')}</small>}><div class="rows">{rivals.map(c => <Row key={c.id} c={c.id} />)}</div></Block>
    <Block title={t('dip.friends')} icon="peace" aside={<small class="muted">{t('dip.opinion')}</small>}><div class="rows">{friends.map(c => <Row key={c.id} c={c.id} />)}</div></Block>
    <button class="ghost" onClick={() => g.s.setMapMode('diplomacy')}><Icon name="relations" size={18} />{t('modes.diplomacy')}</button>
  </NationSheet>;
}

function ProvincePanel({ g, id }: { g: Game; id: number }) {
  const P = g.s.assets.provinces[id], p = g.w.provinces[id];
  const here = g.w.divisions.filter(d => d.prov === id && d.theater < 0);
  return <Sheet onClose={() => g.openPanel(null)} icon="political" eyebrow={t('panel.province')} title={<div><div class="h2">{P.name}</div><div class="sub"><Flag s={g.s} code={g.w.countries[p.owner].code} h={11} /> {countryName(g.w, p.owner)}{p.controller !== p.owner ? <span class="bad"> · {t('tip.heldBy', { c: countryName(g.w, p.controller) })}</span> : null}</div></div>}>
    <div class="facts">
      <Fact icon="terrain" label={t('stat.terrain')} v={t('terrain.' + P.terrain)} />
      <Fact icon="population" label={t('stat.population')} v={fmtBig(p.pop)} />
      <Fact icon="gdp" label={t('prov.output')} v={fmtMoney(p.gdp)} />
      <Fact icon="political" label={t('stat.area')} v={`${fmtBig(P.area)} km²`} />
    </div>
    <div class="sl-top"><span>{t('prov.infra')}</span><b class="num">{pct(p.infra)}</b></div><Bar v={p.infra} />
    {p.devastation > 0.01 && <><div class="sl-top"><span>{t('prov.damage')}</span><b class="num bad">{pct(p.devastation)}</b></div><Bar v={p.devastation} tone="bad" /></>}
    {here.length > 0 && <Block title={t('prov.stationed')} icon="military" aside={<b class="num">{here.length}</b>}><ul class="units">{here.slice(0, 10).map(d => <li key={d.id}><UnitSymbol type={d.type} size={22} /><Flag s={g.s} code={g.w.countries[d.country].code} h={11} /><span>{unitName(d.type, d.num)}</span></li>)}{here.length > 10 && <li><small>{t('prov.more', { n: here.length - 10 })}</small></li>}</ul></Block>}
  </Sheet>;
}

const Fact = ({ icon, label, v }: { icon: string; label: string; v: string }) => <span class="fact"><Icon name={icon} size={18} /><span><small>{label}</small><b>{v}</b></span></span>;
const ACTIONS: DiploAction[] = ['improve', 'trade', 'nap', 'alliance', 'guarantee', 'denounce', 'break'];
function CountryPanel({ g, id }: { g: Game; id: number }) {
  const w = g.w, c = w.countries[id], me = g.player, r = rel(w, id, me);
  const [, force] = useState(0); const [focus, setFocus] = useState<DiploAction | null>(null);
  const divs = w.divisions.filter(d => d.country === id).length;
  const treaties = w.treaties.filter(x => (x.a === id && x.b === me) || (x.b === id && x.a === me));
  const war = enemies(w, me, id);
  const shown = ACTIONS.filter(a => a !== 'break' || treaties.some(x => x.type !== 'puppet'));
  const fo = focus ? diploOdds(w, me, id, focus) : null;
  return <Sheet onClose={() => g.openPanel(null)} icon="diplomacy" eyebrow={t('panel.country')}
    title={<div class="title-row"><Flag s={g.s} code={c.code} h={26} /><div><div class="h2">{countryName(w, id)}</div><div class="sub">{t('gov.' + c.gov)} · {c.leader.name}</div></div></div>}>
    <div class="opinion"><span class="eyebrow">{t('dip.opinion')}</span><b class={`num ${r < -25 ? 'bad' : r > 25 ? 'good' : ''}`}>{r > 0 ? '+' : ''}{r}</b><SignedBar v={r} />
      {treaties.length > 0 && <span class="treaty-icons">{treaties.map(x => <span key={x.type} data-tip={t('treaty.' + x.type)}><Icon name={TREATY_ICON[x.type]} size={16} /></span>)}</span>}</div>
    <div class="facts">
      <Fact icon="gdp" label={t('stat.gdp')} v={fmtMoney(c.gdp)} />
      <Fact icon="population" label={t('stat.population')} v={fmtBig(popOf(w, id))} />
      <Fact icon="military" label={t('mil.divisions')} v={fmtInt(divs)} />
      <Fact icon="stability" label={t('ledger.stability')} v={pct(c.stability)} />
    </div>
    {c.alive && id !== me && !war && <Block title={t('panel.diplomacy')} icon="diplomacy">
      <div class="action-grid">{shown.map(a => { const o = diploOdds(w, me, id, a);
        const cost = DIPLO[a].cost, poor = cost > g.me.polCap;
        return <button key={a} class={`act ${a === 'denounce' || a === 'break' ? 'hostile' : ''} ${o.ok ? 'ok' : ''} ${focus === a ? 'focus' : ''}`} aria-disabled={!o.ok}
          onMouseEnter={() => setFocus(a)} onFocus={() => setFocus(a)} onClick={() => { if (o.ok) { g.diplo(id, a); force(x => x + 1); } else setFocus(a); }}>
          <Icon name={a} size={20} /><span class="act-l">{t('dip.act.' + a)}{cost ? <small class={`act-c num ${poor ? 'poor' : ''}`}><Icon name="influence" size={12} />{t('dip.costOf', { n: cost, have: fmtInt(g.me.polCap) })}</small> : null}</span>{!o.ok && <i class="act-s bad"><Icon name="cross" size={12} /></i>}</button>; })}</div>
      <div class={`act-why ${fo ? (fo.ok ? 'ok' : 'no') : ''}`}>{focus && fo ? <><b>{t('dip.act.' + focus)}</b> <span>{say(w, fo.why)}</span></> : <span class="muted">{t('dip.hover')}</span>}</div>
    </Block>}
    {c.alive && id !== me && (war
      ? <button class="primary" onClick={() => { const x = warsOf(w, me).find(x => sideOf(x, id)); if (x) g.openPanel({ kind: 'war', id: x.id }); }}><Icon name="war" size={16} />{t('war.open')}</button>
      : <button class="danger wide" onClick={() => g.st.set({ declare: id, paused: true })}><Icon name="war" size={16} />{t('war.declare')}</button>)}
  </Sheet>;
}

function Menu({ g }: { g: Game }) {
  const [note, setNote] = useState(''); const [, force] = useState(0); const [view, setView] = useState<'main' | 'settings'>('main');
  const saves = listSaves();
  const close = () => g.st.set({ menu: false });
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, []);
  return <div class="ui modal-wrap" onClick={e => { if (e.target === e.currentTarget) close(); }}>
    <section class="plate modal" role="dialog" aria-label={t('menu.title')}>
      <header class="sheet-head"><div class="sheet-title"><div class="eyebrow">{t('menu.paused')}</div><div class="h2">{t('menu.title')}</div></div><button class="x" aria-label={t('ui.close')} onClick={close}><Icon name="x" /></button></header>
      <div class="sheet-body">
        {view === 'main' ? <>
          <button class="primary" onClick={() => { const err = saveGame(`${g.me.code}-${g.w.scenario}-${g.w.day}`, g.w, { country: countryName(g.w, g.player), date: fmtDate(g.w) }); setNote(err ? t('menu.saveFailed') : t('menu.saved')); force(x => x + 1); }}><Icon name="save" size={16} />{t('menu.save')}</button>
          {note && <small class="muted" role="status">{note}</small>}
          {saves.length > 0 && <Block title={t('title.load')}><ul class="saves">{saves.map(sv => <li key={sv.slot}>
            <button onClick={() => { const w = loadGame(sv.slot); if (w) g.loadWorld(w); else setNote(t('menu.loadFailed')); }}><b>{sv.country}</b><span>{sv.date}</span></button>
            <button class="x" aria-label={t('menu.delete', { s: `${sv.country} ${sv.date}` })} onClick={() => { deleteSave(sv.slot); force(x => x + 1); }}><Icon name="x" size={12} /></button></li>)}</ul></Block>}
          <button onClick={() => setView('settings')}><Icon name="settings" size={16} />{t('title.settings')}</button>
          <button onClick={() => location.reload()}>{t('menu.exit')}</button>
          <button onClick={close}><Icon name="play" size={14} />{t('menu.resume')}</button>
        </> : <><Settings g={g} /><button onClick={() => setView('main')}>{t('ui.back')}</button></>}
      </div>
    </section>
  </div>;
}
