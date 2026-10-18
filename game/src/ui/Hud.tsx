import { useEffect, useRef, useState } from 'preact/hooks';
import { SPEEDS, type Game, type Panel } from '../game/play';
import { useTick } from '../game/store';
import { atWar, popOf, UNIT_SPEC, queueUnit, cancelUnit } from '../sim/economy';
import { groupMood, stabilityTarget } from '../sim/politics';
import { DIPLO, diploOdds, hasTreaty, type DiploAction } from '../sim/diplomacy';
import { type Conscription, type Country, type LogEntry, type UnitType } from '../sim/types';
import { CONSCRIPTION_RATE, rel } from '../sim/world';
import { armyName, countryName, fmtDate, say, t, unitName } from '../i18n';
import { HoverTip, MapModes } from './App';
import { Bar, Flag, Icon, Sheet, SignedBar, Slider } from './common';
import { fmtBig, fmtInt, fmtMoney, pct } from './format';
import { listSaves, loadGame, saveGame, deleteSave } from '../game/save';
import { AgendaCards, DeclareDialog, ToolHint, WarPanel } from './War';
import { ChroniclePanel, TimelapsePanel } from './Chronicle';
import { Settings } from './Settings';
import { enemies, sideOf, warsOf } from '../sim/war/war';

export function Hud({ g }: { g: Game }) {
  const st = useTick(g.st), p = st.panel;
  return <>
    <NationPlate g={g} />
    <Rail g={g} />
    <Ledger g={g} />
    <Clock g={g} />
    <Feed g={g} />
    <MapModes s={g.s} game />
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
    <AgendaCards g={g} />
    <ToolHint g={g} />
    {st.declare >= 0 && <DeclareDialog g={g} target={st.declare} />}
    {st.menu && <Menu g={g} />}
  </>;
}

// ---------------------------------------------------------------- frame
function NationPlate({ g }: { g: Game }) {
  const c = g.me;
  return <button class="ui nation-plate panel" onClick={() => g.openPanel({ kind: 'politics' })} title={t('hud.openNation')}>
    <Flag s={g.s} code={c.code} h={30} />
    <span><b>{countryName(g.w, c.id)}</b><small>{t('title.' + c.leader.title)} {c.leader.name}</small></span>
  </button>;
}

function Rail({ g }: { g: Game }) {
  const p = g.st.get().panel, wars = warsOf(g.w, g.player);
  const items: { kind: NonNullable<Panel>['kind']; icon: string; badge?: number; open: () => void }[] = [
    { kind: 'economy', icon: 'economy', open: () => g.openPanel({ kind: 'economy' }) },
    { kind: 'politics', icon: 'politics', open: () => g.openPanel({ kind: 'politics' }) },
    { kind: 'military', icon: 'military', open: () => g.openPanel({ kind: 'military' }) },
    { kind: 'diplomacy', icon: 'diplomacy', open: () => g.openPanel({ kind: 'diplomacy' }) },
    ...(wars.length ? [{ kind: 'war' as const, icon: 'war', badge: wars.length, open: () => g.openPanel({ kind: 'war', id: wars[0].id }) }] : []),
    { kind: 'chronicle', icon: 'chronicle', open: () => g.openPanel({ kind: 'chronicle' }) },
    { kind: 'timelapse', icon: 'timelapse', open: () => g.openPanel({ kind: 'timelapse' }) },
  ];
  return <nav class="ui rail panel" aria-label={t('hud.panels')}>{items.map(it =>
    <button key={it.kind} class={`rail-btn ${it.kind === 'war' ? 'war' : ''}`} aria-pressed={p?.kind === it.kind} onClick={() => p?.kind === it.kind ? g.openPanel(null) : it.open()}>
      <Icon name={it.icon} size={18} /><span>{t('panel.' + it.kind)}</span>{it.badge ? <i class="badge">{it.badge}</i> : null}</button>)}</nav>;
}

function Ledger({ g }: { g: Game }) {
  const c = g.me, bal = c.income - c.spending;
  const cells: { k: string; v: string; tone?: string; open: 'economy' | 'politics' | 'military' | 'diplomacy' }[] = [
    { k: 'treasury', v: fmtMoney(c.treasury), open: 'economy' },
    { k: 'monthly', v: (bal >= 0 ? '+' : '') + fmtMoney(bal), tone: bal >= 0 ? 'good' : 'bad', open: 'economy' },
    { k: 'manpower', v: fmtBig(c.manpower), open: 'military' },
    { k: 'stability', v: pct(c.stability), tone: c.stability < 0.35 ? 'bad' : '', open: 'politics' },
    { k: 'warSupport', v: pct(c.warSupport), open: 'politics' },
    { k: 'influence', v: fmtInt(c.polCap), open: 'diplomacy' },
  ];
  return <div class="ui ledger panel">{cells.map(x => <button key={x.k} class={`cell ${x.tone || ''}`} title={t('ledger.' + x.k + '.hint')} onClick={() => g.openPanel({ kind: x.open })}>
    <span class="cell-k">{t('ledger.' + x.k)}</span><span class="cell-v num">{x.v}</span></button>)}</div>;
}

function Clock({ g }: { g: Game }) {
  const st = g.st.get();
  return <div class="ui clock panel">
    <div class="date num">{fmtDate(g.w)}</div>
    <button class="pp" aria-label={st.paused ? t('clock.play') : t('clock.pause')} onClick={() => g.togglePause()}><Icon name={st.paused ? 'play' : 'pause'} size={14} /></button>
    <div class="pips" role="group" aria-label={t('clock.speed')}>{SPEEDS.map((sp, i) => <button key={i} class="pip" aria-pressed={!st.paused && st.speed >= i} aria-label={t('clock.speedN', { n: i + 1 })} title={t('clock.perSec', { n: sp })} onClick={() => g.setSpeed(i)}><i style={{ height: `${6 + i * 3}px` }} /></button>)}</div>
    {st.turnMode === 'monthly' && <span class="turn-tag" title={t('set.turnsHint')}>{t('set.monthly')}</span>}
    <button class="menu-btn" aria-label={t('menu.title')} onClick={() => g.st.set({ menu: true, paused: true })}><Icon name="menu" /></button>
  </div>;
}

function Feed({ g }: { g: Game }) {
  const w = g.w, me = g.player;
  const [open, setOpen] = useState(true);
  // your own news, plus the world's wars beginning and ending (not every far-away city)
  const items = w.log.filter(l => l.who?.includes(me) || l.big || l.kind === 'war' || l.kind === 'peace').slice(-6).reverse();
  if (!items.length) return null;
  return <aside class={`ui feed panel ${open ? '' : 'closed'}`}>
    <button class="feed-head" onClick={() => setOpen(!open)} aria-expanded={open}><span class="eyebrow">{t('feed.title')}</span><span class="muted">{open ? '–' : '+'}</span></button>
    {open && <ol>{items.map((l, i) => <li key={i} class={`k-${l.kind}`}><time class="mono">{fmtDate(w, l.day, 'short')}</time>
      <button class="feed-line" disabled={!l.at && l.prov === undefined} onClick={() => g.focusLog(l)}>{say(w, l.msg)}</button></li>)}</ol>}
  </aside>;
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
const govLabel = (c: Country) => t('gov.' + c.gov);
function NationSheet({ g, children, eyebrow }: { g: Game; children: any; eyebrow: string }) {
  const c = g.me;
  return <Sheet onClose={() => g.openPanel(null)} eyebrow={eyebrow} title={<div class="title-row"><Flag s={g.s} code={c.code} h={22} /><div><div class="h2">{countryName(g.w, c.id)}</div><div class="sub">{govLabel(c)} · {t('title.' + c.leader.title)} {c.leader.name}</div></div></div>}>{children}</Sheet>;
}

function EconomyPanel({ g }: { g: Game }) {
  const c = g.me; const [, force] = useState(0); const upd = () => { force(x => x + 1); g.bump(); };
  const setShare = (k: keyof Country['budget'], v: number) => {
    const others = (Object.keys(c.budget) as (keyof Country['budget'])[]).filter(x => x !== k);
    const rest = others.reduce((a, x) => a + c.budget[x], 0) || 1; const left = 1 - v;
    c.budget[k] = v; for (const x of others) c.budget[x] = c.budget[x] / rest * left; upd();
  };
  const mil = c.spending * c.budget.military, free = Math.max(0, mil - c.upkeep);
  return <NationSheet g={g} eyebrow={t('panel.economy')}>
    <dl class="stat">
      <dt>{t('stat.gdp')}</dt><dd>{t('eco.perYear', { v: fmtMoney(c.gdp) })}</dd>
      <dt>{t('eco.growth')}</dt><dd class={c.growth < 0 ? 'bad' : 'good'}>{pct(c.growth)}</dd>
      <dt>{t('eco.revenue')}</dt><dd>{t('eco.perMonth', { v: fmtMoney(c.income) })}</dd>
      <dt>{t('eco.spending')}</dt><dd>{t('eco.perMonth', { v: fmtMoney(c.spending) })}</dd>
      <dt>{t('eco.debt')}</dt><dd class={c.debt / c.gdp > 1.2 ? 'bad' : ''}>{t('eco.debtOf', { v: fmtMoney(c.debt), p: pct(c.debt / Math.max(1, c.gdp)) })}</dd>
    </dl>
    <h3 class="h3">{t('eco.taxes')}</h3>
    <Slider id="tax" label={t('eco.taxRate')} value={c.taxRate} min={0.08} max={0.55} step={0.01} fmt={pct} onInput={v => { c.taxRate = v; upd(); }} hint={t('eco.taxHint')} />
    <Slider id="deficit" label={t('eco.borrowing')} value={c.deficit} min={0} max={0.8} step={0.01} fmt={v => t('eco.ofRevenue', { p: pct(v) })} onInput={v => { c.deficit = v; upd(); }} hint={t('eco.borrowHint')} />
    <h3 class="h3">{t('eco.budget')}</h3>
    <Slider id="b-mil" label={t('eco.military')} value={c.budget.military} min={0.02} max={0.8} step={0.01} fmt={pct} onInput={v => setShare('military', v)} hint={t('eco.milHint', { up: fmtMoney(c.upkeep), prod: fmtMoney(free) })} />
    <Slider id="b-inv" label={t('eco.investment')} value={c.budget.investment} min={0.02} max={0.7} step={0.01} fmt={pct} onInput={v => setShare('investment', v)} hint={t('eco.invHint')} />
    <Slider id="b-wel" label={t('eco.welfare')} value={c.budget.welfare} min={0.02} max={0.85} step={0.01} fmt={pct} onInput={v => setShare('welfare', v)} hint={t('eco.welHint')} />
    <Slider id="b-res" label={t('eco.research')} value={c.budget.research} min={0} max={0.3} step={0.005} fmt={pct} onInput={v => setShare('research', v)} hint={t('eco.resHint', { n: c.tech })} />
  </NationSheet>;
}

function PoliticsPanel({ g }: { g: Game }) {
  const c = g.me, target = stabilityTarget(g.w, c), mood = groupMood(g.w, c), [ex, au] = c.ideology;
  return <NationSheet g={g} eyebrow={t('panel.politics')}>
    <div class="leader"><div class="eyebrow">{t('title.' + c.leader.title)}</div><div class="h3 plain">{c.leader.name}</div><div class="traits">{c.leader.traits.map(x => <span class="trait" key={x}>{t('trait.' + x)}</span>)}</div>
      {c.gov === 'democracy' && c.nextElection >= 0 && <small>{t('pol.nextElection', { d: fmtDate(g.w, c.nextElection) })}</small>}</div>
    <div class="two">
      <div><div class="sl-top"><span>{t('ledger.stability')}</span><b class="num">{pct(c.stability)}</b></div><Bar v={c.stability} mark={target} tone={c.stability < 0.35 ? 'bad' : ''} /><small>{t('pol.heading', { p: pct(target) })}</small></div>
      <div><div class="sl-top"><span>{t('ledger.warSupport')}</span><b class="num">{pct(c.warSupport)}</b></div><Bar v={c.warSupport} tone="amber" /></div>
    </div>
    <h3 class="h3">{t('pol.groups')}</h3>
    <div class="groups">{c.groups.map(gr => <div class="group" key={gr.id}><div class="sl-top"><span>{t('group.' + gr.id)} <small>{t('pol.power', { p: pct(gr.power) })}</small></span><b class="num">{pct(gr.support)}</b></div><Bar v={gr.support} mark={mood[gr.id]} tone={gr.support < 0.35 ? 'bad' : gr.support > 0.65 ? 'good' : ''} /></div>)}</div>
    <small class="muted">{t('pol.markerHint')}</small>
    <h3 class="h3">{t('pol.ideology')}</h3>
    <div class="compass"><svg viewBox="-110 -110 220 220" role="img" aria-label={t('pol.ideology')}>
      <rect x="-100" y="-100" width="200" height="200" class="cmp-bg" /><line x1="-100" y1="0" x2="100" y2="0" class="cmp-ax" /><line x1="0" y1="-100" x2="0" y2="100" class="cmp-ax" />
      <text x="0" y="-88" class="cmp-t">{t('pol.order')}</text><text x="0" y="96" class="cmp-t">{t('pol.liberty')}</text><text x="-96" y="4" class="cmp-t" text-anchor="start">{t('pol.collective')}</text><text x="96" y="4" class="cmp-t" text-anchor="end">{t('pol.market')}</text>
      <circle cx={ex * 90} cy={-au * 90} r="7" class="cmp-dot" style={{ fill: c.color }} />
    </svg></div>
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
  return <NationSheet g={g} eyebrow={t('panel.military')}>
    <dl class="stat">
      <dt>{t('mil.divisions')}</dt><dd>{t('mil.divCount', { n: divs.length, men: fmtBig(men) })}</dd>
      {front > 0 && <><dt>{t('mil.atFront')}</dt><dd>{front}</dd></>}
      <dt>{t('mil.mix')}</dt><dd>{Object.entries(byType).map(([k, n]) => `${n} ${t('unitShort.' + k)}`).join(', ')}</dd>
      <dt>{t('mil.upkeep')}</dt><dd>{t('eco.perMonth', { v: fmtMoney(c.upkeep) })}</dd>
      <dt>{t('mil.funds')}</dt><dd class={free <= 0 ? 'bad' : ''}>{t('eco.perMonth', { v: fmtMoney(free) })}</dd>
      <dt>{t('mil.tech')}</dt><dd>{t('mil.level', { n: c.tech })}</dd>
    </dl>
    <h3 class="h3">{t('mil.build')}</h3>
    <div class="build">{(Object.keys(UNIT_SPEC) as UnitType[]).map(k => { const s = UNIT_SPEC[k];
      return <button key={k} onClick={() => { const e = queueUnit(g.w, c, k); setNote(e ? t('mil.noManpower') : t('mil.queued', { u: t('unitShort.' + k) })); upd(); g.sound('click'); }} disabled={c.manpower < s.men}>
        <b>{t('unitShort.' + k)}</b><small>{t('mil.cost', { v: fmtMoney(c.unitCost * s.costMul), d: s.days, m: fmtBig(s.men) })}</small></button>; })}</div>
    {note && <small class="muted" role="status">{note}</small>}
    {c.production.length > 0 && <><h3 class="h3">{t('mil.queue')}</h3><ol class="queue">{c.production.map(p => <li key={p.id}><span>{t('unitShort.' + p.type)}</span><Bar v={p.progress / p.cost} /><button class="x" aria-label={t('ui.cancel')} onClick={() => { cancelUnit(g.w, c, p.id); upd(); }}><Icon name="x" size={12} /></button></li>)}</ol>
      {free <= 0 && <small class="bad">{t('mil.noFunds')}</small>}</>}
    <h3 class="h3">{t('mil.conscription')}</h3>
    <div class="seg wrap">{laws.map(l => <button key={l} aria-pressed={c.conscription === l} title={t('mil.lawHint', { p: pct(CONSCRIPTION_RATE[l]), n: fmtBig(pop * CONSCRIPTION_RATE[l]) })} onClick={() => {
      if (l === c.conscription) return; const cost = 25 * Math.abs(laws.indexOf(l) - laws.indexOf(c.conscription));
      if (c.polCap < cost) { setNote(t('mil.needInfluence', { n: cost })); return; }
      c.polCap -= cost; const harsher = laws.indexOf(l) > laws.indexOf(c.conscription); c.conscription = l; if (harsher) c.stability = Math.max(0, c.stability - (atWar(g.w, c.id) ? 0.02 : 0.08)); setNote(t('mil.lawSet', { l: t('law.' + l) })); upd();
    }}>{t('law.' + l)}</button>)}</div>
    <small class="muted">{t('mil.lawCost')}</small>
    <h3 class="h3">{t('mil.armies')}</h3>
    <ul class="armies">{g.w.armies.filter(a => a.country === c.id).map(a => { const n = divs.filter(d => d.army === a.id).length; return <li key={a.id}><b>{armyName(a.num)}</b><span>{t('mil.general', { g: a.general.name, n })}</span><small>{a.general.traits.map(x => t('gtrait.' + x)).join(', ')}</small></li>; })}</ul>
  </NationSheet>;
}

function DiplomacyPanel({ g }: { g: Game }) {
  const w = g.w, me = g.player;
  const mine = w.treaties.filter(x => x.a === me || x.b === me);
  const other = (x: { a: number; b: number }) => x.a === me ? x.b : x.a;
  const others = w.countries.filter(c => c.alive && c.id !== me);
  const rivals = others.slice().sort((a, b) => rel(w, me, a.id) - rel(w, me, b.id)).slice(0, 5);
  const friends = others.filter(c => !mine.some(x => other(x) === c.id)).sort((a, b) => rel(w, b.id, me) - rel(w, a.id, me)).slice(0, 5);
  const Row = ({ c }: { c: number }) => { const r = rel(w, c, me); return <li><button class="row-btn" onClick={() => g.openPanel({ kind: 'country', id: c })}><Flag s={g.s} code={w.countries[c].code} h={12} /><span>{countryName(w, c)}</span><b class={`num ${r < -25 ? 'bad' : r > 25 ? 'good' : ''}`}>{r > 0 ? '+' : ''}{r}</b></button></li>; };
  return <NationSheet g={g} eyebrow={t('panel.diplomacy')}>
    <div class="sl-top"><span>{t('ledger.influence')}</span><b class="num">{fmtInt(g.me.polCap)}</b></div>
    <small class="muted">{t('dip.influenceHint')}</small>
    {(['alliance', 'guarantee', 'nap', 'trade', 'puppet'] as const).map(type => { const list = mine.filter(x => x.type === type).map(other); return list.length ? <div key={type}><h3 class="h3">{t('treaty.' + type + '.list')}</h3><ul class="clist">{list.map(c => <Row key={c} c={c} />)}</ul></div> : null; })}
    <h3 class="h3">{t('dip.rivals')}</h3><ul class="clist">{rivals.map(c => <Row key={c.id} c={c.id} />)}</ul>
    <h3 class="h3">{t('dip.friends')}</h3><ul class="clist">{friends.map(c => <Row key={c.id} c={c.id} />)}</ul>
    <small class="muted">{t('dip.mapHint')}</small>
  </NationSheet>;
}

function ProvincePanel({ g, id }: { g: Game; id: number }) {
  const P = g.s.assets.provinces[id], p = g.w.provinces[id];
  const here = g.w.divisions.filter(d => d.prov === id && d.theater < 0);
  return <Sheet onClose={() => g.openPanel(null)} eyebrow={t('panel.province')} title={<div><div class="h2">{P.name}</div><div class="sub">{countryName(g.w, p.owner)}{p.controller !== p.owner ? ` · ${t('tip.heldBy', { c: countryName(g.w, p.controller) })}` : ''}</div></div>}>
    <dl class="stat">
      <dt>{t('stat.terrain')}</dt><dd>{t('terrain.' + P.terrain)}</dd>
      <dt>{t('stat.population')}</dt><dd>{fmtBig(p.pop)}</dd>
      <dt>{t('prov.output')}</dt><dd>{t('eco.perYear', { v: fmtMoney(p.gdp) })}</dd>
      <dt>{t('stat.area')}</dt><dd>{fmtBig(P.area)} km²</dd>
      <dt>{t('prov.infra')}</dt><dd>{pct(p.infra)}</dd>
      {p.devastation > 0.01 && <><dt>{t('prov.damage')}</dt><dd class="bad">{pct(p.devastation)}</dd></>}
    </dl>
    {here.length > 0 && <><h3 class="h3">{t('prov.stationed')}</h3><ul class="armies">{here.slice(0, 12).map(d => <li key={d.id} class="row"><Flag s={g.s} code={g.w.countries[d.country].code} h={12} /> <span>{unitName(d.type, d.num)}</span></li>)}{here.length > 12 && <li><small>{t('prov.more', { n: here.length - 12 })}</small></li>}</ul></>}
  </Sheet>;
}

const ACTIONS: DiploAction[] = ['improve', 'trade', 'nap', 'alliance', 'guarantee', 'denounce', 'break'];
function CountryPanel({ g, id }: { g: Game; id: number }) {
  const w = g.w, c = w.countries[id], me = g.player, r = rel(w, id, me);
  const [, force] = useState(0);
  const divs = w.divisions.filter(d => d.country === id).length;
  const treaties = w.treaties.filter(x => (x.a === id && x.b === me) || (x.b === id && x.a === me));
  const bloc = c.bloc ? w.blocs[c.bloc] : null, war = enemies(w, me, id);
  const shown = ACTIONS.filter(a => a !== 'break' || treaties.some(x => x.type !== 'puppet'));
  return <Sheet onClose={() => g.openPanel(null)} eyebrow={t('panel.country')} title={<div class="title-row"><Flag s={g.s} code={c.code} h={22} /><div><div class="h2">{countryName(w, id)}</div><div class="sub">{govLabel(c)} · {t('title.' + c.leader.title)} {c.leader.name}</div></div></div>}>
    <div class="sl-top"><span>{t('dip.opinion')}</span><b class={`num ${r < -25 ? 'bad' : r > 25 ? 'good' : ''}`}>{r > 0 ? '+' : ''}{r}</b></div>
    <SignedBar v={r} />
    <dl class="stat">
      <dt>{t('stat.gdp')}</dt><dd>{fmtMoney(c.gdp)}</dd>
      <dt>{t('stat.population')}</dt><dd>{fmtBig(popOf(w, id))}</dd>
      <dt>{t('mil.divisions')}</dt><dd>{divs}</dd>
      <dt>{t('ledger.stability')}</dt><dd>{pct(c.stability)}</dd>
      {bloc && <><dt>{t('dip.bloc')}</dt><dd>{t('bloc.' + c.bloc)}</dd></>}
      {treaties.length > 0 && <><dt>{t('dip.withYou')}</dt><dd>{treaties.map(x => t('treaty.' + x.type)).join(', ')}</dd></>}
    </dl>
    <div class="traits">{c.leader.traits.map(x => <span class="trait" key={x}>{t('trait.' + x)}</span>)}</div>
    {c.alive && id !== me && !war && <>
      <h3 class="h3">{t('panel.diplomacy')}</h3>
      <ul class="actions">{shown.map(a => { const o = diploOdds(w, me, id, a);
        return <li key={a}><button class={a === 'denounce' || a === 'break' ? 'danger' : ''} disabled={!o.ok} onClick={() => { g.diplo(id, a); force(x => x + 1); }}>
          <span>{t('dip.act.' + a)}</span><small class="num">{DIPLO[a].cost ? t('dip.cost', { n: DIPLO[a].cost }) : ''}</small></button><small class={o.ok ? 'muted' : 'why'}>{say(w, o.why)}</small></li>; })}</ul>
    </>}
    {c.alive && id !== me && (war
      ? <button class="primary" onClick={() => { const x = warsOf(w, me).find(x => sideOf(x, id)); if (x) g.openPanel({ kind: 'war', id: x.id }); }}>{t('war.open')}</button>
      : <button class="danger" onClick={() => g.st.set({ declare: id, paused: true })}>{t('war.declare')}</button>)}
    {hasTreaty(w, me, id, 'alliance') && <small class="muted">{t('dip.allyNote')}</small>}
  </Sheet>;
}

function Menu({ g }: { g: Game }) {
  const [note, setNote] = useState(''); const [, force] = useState(0); const [view, setView] = useState<'main' | 'settings'>('main');
  const saves = listSaves();
  const close = () => g.st.set({ menu: false });
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, []);
  return <div class="ui modal-wrap" onClick={e => { if (e.target === e.currentTarget) close(); }}>
    <section class="panel modal" role="dialog" aria-label={t('menu.title')}>
      <header class="sheet-head"><div class="sheet-title"><div class="eyebrow">{t('menu.paused')}</div><div class="h2">{t('menu.title')}</div></div><button class="x" aria-label={t('ui.close')} onClick={close}><Icon name="x" /></button></header>
      <div class="sheet-body">
        {view === 'main' ? <>
          <button class="primary" onClick={() => { const err = saveGame(`${g.me.code}-${g.w.scenario}-${g.w.day}`, g.w, { country: countryName(g.w, g.player), date: fmtDate(g.w) }); setNote(err ? t('menu.saveFailed') : t('menu.saved')); force(x => x + 1); }}>{t('menu.save')}</button>
          {note && <small class="muted" role="status">{note}</small>}
          {saves.length > 0 && <><h3 class="h3">{t('title.load')}</h3><ul class="saves">{saves.map(sv => <li key={sv.slot}>
            <button onClick={() => { const w = loadGame(sv.slot); if (w) g.loadWorld(w); else setNote(t('menu.loadFailed')); }}><b>{sv.country}</b><span>{sv.date}</span></button>
            <button class="x" aria-label={t('menu.delete', { s: `${sv.country} ${sv.date}` })} onClick={() => { deleteSave(sv.slot); force(x => x + 1); }}><Icon name="x" size={12} /></button></li>)}</ul></>}
          <button onClick={() => setView('settings')}>{t('title.settings')}</button>
          <button onClick={() => location.reload()}>{t('menu.exit')}</button>
          <button onClick={close}>{t('menu.resume')}</button>
        </> : <><Settings g={g} /><button onClick={() => setView('main')}>{t('ui.back')}</button></>}
      </div>
    </section>
  </div>;
}
