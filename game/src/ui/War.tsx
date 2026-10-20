import { useEffect, useRef, useState } from 'preact/hooks';
import type { Game } from '../game/play';
import { resolveAgenda } from '../sim/agenda';
import { commitShare, warReserve } from '../sim/war/ai';
import { aimVerdict } from '../game/warfx';
import { armyWhere } from '../sim/war/armies';
import { GENERAL } from '../sim/war/theater';
import { UNIT_SPEC } from '../sim/economy';
import { acceptsPeace, heldDemand, sideOf, theatersOf, truceKey, warCost, warScoreParts, warsOf, type PeaceTerms } from '../sim/war/war';
import type { War } from '../sim/types';
import { armyName, countryName, fmtDate, provName, say, t } from '../i18n';
import { Block, Flag, Icon, Sheet, Tug, UnitSymbol } from './common';
import { fmt1, fmtBig, fmtInt, fmtMoney, pct, cssPct } from './format';

/** Postures map onto the same push strengths the AI uses. */
export const POSTURES = [{ id: 'hold', aggr: 0.9 }, { id: 'advance', aggr: 1.08 }, { id: 'offensive', aggr: 1.22 }] as const;
const COMMIT = [{ v: 0.3, id: 'token' }, { v: -1, id: 'normal' }, { v: 0.92, id: 'total' }];

export function WarPanel({ g, id }: { g: Game; id: number }) {
  const w = g.w, me = g.player, war = w.wars.find(x => x.id === id);
  if (!war) return null;
  const close = () => g.openPanel(null);
  if (war.ended) return <Sheet onClose={close} icon="war" eyebrow={t('panel.war')} title={<div class="h2">{say(w, war.name)}</div>}><p>{t('war.endedOn', { d: fmtDate(w, war.ended) })}</p></Sheet>;
  const side = sideOf(war, me) as 1 | -1, si = side > 0 ? 0 : 1, oi = 1 - si;
  const ours = side > 0 ? war.attackers : war.defenders, theirs = side > 0 ? war.defenders : war.attackers;
  const score = war.score * side, ths = theatersOf(w, war);
  const inWar = (cs: number[]) => w.divisions.filter(d => cs.includes(d.country) && ths.some(x => x.id === d.theater));
  const oursD = inWar(ours), theirsD = inWar(theirs), transit = oursD.filter(d => d.arrive > w.day).length;
  const posture = POSTURES.reduce((b, p) => Math.abs(p.aggr - war.aggr[si]) < Math.abs(b.aggr - war.aggr[si]) ? p : b, POSTURES[1] as typeof POSTURES[number]);
  const offs = ths.flatMap(x => x.offensives.filter(o => !o.ended && o.country === me));
  const all = warsOf(w, me), commit = war.commit?.[me], waiting = oursD.filter(d => d.country === me && d.goal?.[2] === 0).length, reserve = warReserve(w, war, me).length + waiting, onFront = oursD.filter(d => d.country === me).length - waiting; // armies held back count as reserve, not as the line
  const flags = (cs: number[]) => <span class="flags">{cs.slice(0, 4).map(c => <Flag key={c} s={g.s} code={w.countries[c].code} h={14} />)}{cs.length > 4 && <small>+{cs.length - 4}</small>}</span>;
  const pair = (a: number, b: number, fmt: (v: number) => string, label: string, icon: string, lowerIsBetter?: boolean) => { const tot = a + b || 1, win = lowerIsBetter ? a < b : a > b;
    return <div class="pair"><span class="pair-l"><Icon name={icon} size={16} />{label}</span><b class={`num ${win ? 'good' : ''}`}>{fmt(a)}</b><span class={`pair-bar ${lowerIsBetter ? 'inv' : ''}`}><i style={{ width: `${a / tot * 100}%` }} /></span><b class="num">{fmt(b)}</b></div>; };
  return <Sheet onClose={close} icon="war" eyebrow={`${t(side > 0 ? 'war.attacking' : 'war.defending')} · ${t('war.day', { n: w.day - war.start })}`} title={<div class="h2">{say(w, war.name)}</div>}>
    {all.length > 1 && <div class="seg wrap">{all.map(x => <button key={x.id} aria-pressed={x.id === id} onClick={() => g.openPanel({ kind: 'war', id: x.id })}>{say(w, x.name)}</button>)}</div>}
    <div class="war-score" data-tip={t('war.scoreHint')}><span><span class="eyebrow">{t('war.score')}</span><small class="muted">{t(score > 20 ? 'war.winning' : score < -20 ? 'war.losing' : 'war.even')}</small></span><b class={`num big ${score < -20 ? 'bad' : score > 20 ? 'good' : ''}`}>{score > 0 ? '+' : ''}{Math.round(score)}</b></div>
    <Tug v={score} left={flags(ours)} right={flags(theirs)} />
    {(() => { const parts = warScoreParts(w, war), row = (k: keyof typeof parts) => { const v = Math.round(parts[k] * side); return <span key={k} class={v > 0 ? 'good' : v < 0 ? 'bad' : 'muted'}><small>{t('war.part.' + k)}</small><b class="num">{v > 0 ? '+' : ''}{v}</b></span>; };
      return <div class="score-parts" data-tip={t('war.partsHint')}>{(['land', 'casualties', 'lost', 'capitals'] as const).map(row)}</div>; })()}
    <div class="pairs">
      <div class="pair head"><span /><small>{t('war.us')}</small><span /><small>{t('war.them')}</small></div>
      {pair(oursD.length, theirsD.length, fmtInt, t('mil.divisions'), 'military')}
      {pair(war.casualties[si], war.casualties[oi], fmtBig, t('war.casualties'), 'manpower', true)}
      {pair(Math.min(1, war.exhaustion[si]), Math.min(1, war.exhaustion[oi]), pct, t('war.exhaustion'), 'trendDown', true)}
      {transit > 0 && <small class="muted">{t('war.onTheWay', { n: transit })}</small>}
    </div>
    <Block title={t('war.orders')} icon="hold" aside={<span class="muted">{t('war.commitment')} <b class="num">{pct(commitShare(w, war, me))}</b></span>}>
      <small class="row-k">{t('war.posture')}</small><div class="big-toggles" role="group" aria-label={t('war.posture')}>{POSTURES.map(p => <button key={p.id} aria-pressed={posture.id === p.id} data-tip={t('posture.' + p.id + '.hint')} onClick={() => { war.aggr[si] = p.aggr; g.bump(); g.sound('click'); }}><Icon name={p.id} size={22} /><span>{t('posture.' + p.id)}</span></button>)}</div>
      <small class="row-k">{t('war.commitment')} · {t('war.commitWhat')}</small><div class="steps commit" role="group" aria-label={t('war.commitment')}>{COMMIT.map((c, i) => { const cur = commit === undefined ? 'normal' : COMMIT.find(x => x.v === commit)?.id || 'normal', ci = COMMIT.findIndex(x => x.id === cur);
        return <button key={c.id} aria-pressed={cur === c.id} class={ci >= i ? 'on' : ''} data-tip={t('war.commitHint', { p: pct(c.v < 0 ? commitShare(w, { ...war, commit: {} }, me) : c.v) })} onClick={() => { war.commit ||= {}; if (c.v < 0) delete war.commit[me]; else war.commit[me] = c.v; g.bump(); }}><i style={{ height: `${8 + i * 6}px` }} /><span>{t('commit.' + c.id)}</span></button>; })}</div>
      <div class="war-force" data-tip={t('war.reserveHint')}><span><small>{t('war.onFront')}</small><b class="num">{fmtInt(onFront)}</b></span><span><small>{t('war.reserve')}</small><b class={`num ${reserve ? '' : 'muted'}`}>{fmtInt(reserve)}</b></span></div>
    </Block>
    {ths.length === 0 && <p class="muted">{t('war.noFront')}</p>}
    {(() => { const idle = w.divisions.filter(d => d.country === me && d.theater < 0 && w.armies.some(a => a.id === d.army)).length; return idle > 0 && ths.length > 0 ? <div class="idle-line"><span>{t('war.idle', { n: idle })}</span><button class="primary" onClick={() => g.sendIdle()}><Icon name="advance" size={14} />{t('war.sendIdle')}</button></div> : null; })()}
    <ArmyList g={g} />
    <Block title={t('war.offensives')} icon="offensive" aside={<b class="num">{offs.length}/3</b>}>
      {offs.length > 0 && <ul class="offs">{offs.map(o => { const us = w.divisions.filter(d => d.op === o.id), coming = us.some(d => d.arrive > w.day); return <li key={o.id}><Icon name="advance" size={14} /><span>{t('off.divs', { n: us.length })}</span><small class="num">{coming ? t('off.gathering') : t('war.day', { n: w.day - o.created })}</small><div class="meter" data-tip={t('war.momentum')}><div class="fill amber" style={{ width: cssPct(o.org) }} /></div></li>; })}</ul>}
      <small class="muted">{t('war.planArmy')}</small>
    </Block>
    <Block title={t('war.peace')} icon="peace"><PeaceOptions g={g} war={war} side={side} /></Block>
  </Sheet>;
}

function PeaceOptions({ g, war, side }: { g: Game; war: War; side: 1 | -1 }) {
  const w = g.w, score = Math.max(0, war.score * side), demand = heldDemand(w, war, side, score);
  const opts: { label: string; icon: string; terms: PeaceTerms }[] = [
    { label: t('peace.white'), icon: 'peace', terms: { type: 'white', provinces: [] } },
    { label: t('peace.ceasefire'), icon: 'hold', terms: { type: 'ceasefire', provinces: [] } },
  ];
  if (demand.length) opts.push({ label: t('peace.annex', { n: demand.length }), icon: 'city', terms: { type: 'treaty', provinces: demand } });
  return <div class="peace">{opts.map(o => { const r = acceptsPeace(w, war, side, o.terms);
    return <button key={o.label} class={`peace-card ${r.ok ? 'ok' : 'no'}`} data-tip={say(w, r.why)} onClick={() => g.proposePeace(war, o.terms)}>
      <Icon name={o.icon} size={20} /><span>{o.label}</span><span class="verdict">{t(r.ok ? 'peace.accepts' : 'peace.refuses')}</span></button>; })}</div>;
}

export function DeclareDialog({ g, target }: { g: Game; target: number }) {
  const w = g.w, me = g.me, T = w.countries[target], cost = warCost(w, me.id, target), name = countryName(w, target);
  const close = () => g.st.set({ declare: -1 });
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, []);
  const ws = Math.max(0, Math.min(1, me.warSupport + cost.warSupport));
  const Who = ({ cs }: { cs: number[] }) => <div class="flags wrap">{cs.map(c => <span class="joiner" key={c}><Flag s={g.s} code={w.countries[c].code} h={14} /> {countryName(w, c)}</span>)}</div>;
  // nothing forbids a war: the dialog shows its price, and the choice stays yours
  return <div class="ui modal-wrap" onClick={e => { if (e.target === e.currentTarget) close(); }}>
    <section class="plate modal" role="dialog" aria-label={t('declare.aria', { c: name })}>
      <header class="sheet-head"><div class="title-row"><Flag s={g.s} code={T.code} h={22} /><div><div class="eyebrow">{t('war.declare')}</div><div class="h2">{name}</div></div></div><button class="x" aria-label={t('ui.close')} onClick={close}><Icon name="x" /></button></header>
      <div class="sheet-body">
        <p>{t(cost.independence ? 'declare.independence' : cost.claim ? 'declare.claim' : cost.justified ? 'declare.rival' : 'declare.unprovoked', { c: name })}</p>
        <dl class="stat">
          <dt>{t('ledger.stability')}</dt><dd class="bad">−{pct(cost.stability)}</dd>
          <dt>{t('ledger.warSupport')}</dt><dd class={cost.warSupport < 0 ? 'bad' : 'good'}>{pct(me.warSupport)} → {pct(ws)}</dd>
          <dt>{t('declare.opinion')}</dt><dd class="bad">{cost.worldOpinion}</dd>
          {cost.sanctions.length > 0 && <><dt>{t('declare.sanctions')}</dt><dd class="bad">{t('declare.sanctionsN', { n: cost.sanctions.length })}</dd></>}
        </dl>
        {ws < 0.25 && <p class="bad">{t('declare.unpopular')}</p>}
        {cost.truce && <p class="bad">{t('declare.truceBreak', { d: fmtDate(w, w.cooldowns[truceKey(me.id, target)]) })}</p>}
        {cost.ally && <p class="bad">{t('declare.ally', { c: name })}</p>}
        {cost.sanctions.length > 0 && <><h3 class="h3">{t('declare.sanctionsBy')}</h3><Who cs={cost.sanctions} /></>}
        {cost.joiners.length > 0 ? <><h3 class="h3">{t('declare.defenders')}</h3><Who cs={cost.joiners} /></> : <small class="muted">{t('declare.alone')}</small>}
        <button class="primary danger" onClick={() => { g.declareWar(target); close(); }}>{t('war.declare')}</button>
        <button onClick={close}>{t('ui.cancel')}</button>
      </div>
    </section>
  </div>;
}

/** Decisions waiting for the player: peace offers, proposals, events. The newest is open, the rest wait as one-line slips. */
/** what accepting or refusing a peace offer does, as short chips */
function peaceFx(a: { data?: any }, i: number): [string, string][] {
  const n = a.data?.terms?.provinces?.length ?? 0;
  return i === 0 ? [[t('fx.endsWar'), 'good'], n ? [t('fx.provinces', { n }), 'bad'] : [t('fx.noLand'), '']] : [[t('fx.warGoesOn'), 'bad']];
}
const AGENDA_ICON: Record<string, string> = { peace: 'peace', diplo: 'diplomacy', event: 'chronicle', crisis: 'trendDown', mission: 'target', history: 'chronicle' };
/** The rail shows the single most urgent decision; the strip's Decisions button opens the drawer with all of them. */
export function AgendaCards({ g, slim, drawer, onDrawer }: { g: Game; slim?: boolean; drawer?: boolean; onDrawer: (open: boolean) => void }) {
  // highest stakes first: peace, then proposals, then reports
  const RANK: Record<string, number> = { peace: 0, history: 1, crisis: 1, diplo: 2, event: 3, mission: 3 };
  const items = g.w.agenda.filter(a => a.country === g.player).sort((a, b) => (RANK[a.kind] ?? 3) - (RANK[b.kind] ?? 3));
  // a new decision opens for a few seconds, then folds into a one-line slip; a click on a slip opens it again
  const [open, setOpen] = useState<number | null>(null), [asked, setAsked] = useState<number | null>(null), seen = useRef(new Set<number>());
  useEffect(() => {
    const fresh = items.find(a => !seen.current.has(a.id)); items.forEach(a => seen.current.add(a.id));
    if (!fresh || (open !== null && items.find(a => a.id === open && (RANK[a.kind] ?? 3) < (RANK[fresh.kind] ?? 3)))) return; // never bury a bigger decision
    // a decision big enough to stop the clock opens by itself; the rest arrive folded, and the strip's button carries the urgency
    if (fresh.kind === 'history' || fresh.kind === 'crisis' || fresh.kind === 'peace' || fresh.data?.act === 'demand') { setOpen(fresh.id); setAsked(fresh.id); }
  }, [items.map(a => a.id).join()]);
  if (!items.length) return null;
  const decide = (id: number, i: number) => { resolveAgenda(g.w, g.S, id, i); g.afterOrder(); g.sound('click'); };
  // while a panel is open the left rail stays slim: a card opens only when asked for
  const showOpen = slim && !drawer ? asked : open;
  const shown = drawer ? items : [items.find(a => a.id === showOpen) || items[0]];
  return <div class={`ui agenda ${drawer ? 'drawer plate' : ''}`}>
    {drawer && <header class="drawer-head"><Icon name="ballot" size={18} /><b>{t('hud.decisions', { n: items.length })}</b><button class="x" aria-label={t('ui.close')} onClick={() => onDrawer(false)}><Icon name="x" size={16} /></button></header>}
    {drawer && (() => { const props = items.filter(a => a.kind === 'diplo'); return props.length > 1 ? <div class="bulk"><span>{t('agenda.proposals', { n: props.length })}</span>
      <button onClick={() => { for (const a of props) resolveAgenda(g.w, g.S, a.id, 0); g.afterOrder(); g.sound('click'); }}><Icon name="check" size={14} />{t('agenda.acceptAll')}</button>
      <button onClick={() => { for (const a of props) resolveAgenda(g.w, g.S, a.id, 1); g.afterOrder(); g.sound('click'); }}><Icon name="cross" size={14} />{t('agenda.declineAll')}</button></div> : null; })()}
    {shown.map(a => a.id === showOpen
    ? <section class={`agenda-card plate k-${a.kind}`} key={a.id} role="dialog" aria-label={say(g.w, a.title)}>
      <div class="cable-head"><span class="cable-ic"><Icon name={AGENDA_ICON[a.kind] || 'chronicle'} size={18} /></span><span class="eyebrow">{t('agenda.' + a.kind)}</span><time class="mono">{a.expires ? t('agenda.daysLeft', { n: Math.max(0, a.expires - g.w.day) }) : fmtDate(g.w, a.day, 'short')}</time><button class="x" aria-label={t('agenda.fold')} onClick={() => { setOpen(null); setAsked(null); }}><Icon name="down" size={12} /></button></div>
      <div class="h3 plain">{say(g.w, a.title)}</div><p>{say(g.w, a.text)}</p>
      <div class="opts">{a.options.map((o, i) => <button key={i} onClick={() => decide(a.id, i)}><span>{say(g.w, o.label)}</span>{o.hint && <small>{say(g.w, o.hint)}</small>}{a.kind === 'peace' && <span class="fx">{peaceFx(a, i).map(([txt, tone]) => <i key={txt} class={tone}>{txt}</i>)}</span>}</button>)}</div>
      {a.dflt !== undefined && a.options[a.dflt] && <small class="if-ignored">{t('agenda.ifIgnored', { o: say(g.w, a.options[a.dflt].label) })}</small>}
    </section>
    : <div class={`agenda-slip plate k-${a.kind}`} key={a.id}><button class="slip-open" onClick={() => { setOpen(a.id); setAsked(a.id); }}><span class="cable-ic"><Icon name={AGENDA_ICON[a.kind] || 'chronicle'} size={16} /></span><span class="slip-tt">{a.kind === 'diplo' && a.data?.act ? <><span class="slip-t slip-terms"><Icon name={a.data.act} size={14} />{t('treaty.' + a.data.act)}</span><small class="slip-from"><Flag s={g.s} code={g.w.countries[a.data.from].code} h={11} />{countryName(g.w, a.data.from)}</small></> : <span class="slip-t">{say(g.w, a.title)}</span>}</span></button>
      {a.kind !== 'diplo' ? <button class="slip-review" onClick={() => { setOpen(a.id); setAsked(a.id); }}>{t('agenda.review')}</button> : a.options.length === 2 && <><button class="slip-yes" aria-label={say(g.w, a.options[0].label)} data-tip={say(g.w, a.options[0].label)} onClick={() => decide(a.id, 0)}><Icon name="check" size={16} /></button><button class="slip-no" aria-label={say(g.w, a.options[1].label)} data-tip={say(g.w, a.options[1].label)} onClick={() => decide(a.id, 1)}><Icon name="cross" size={16} /></button></>}</div>)}
    {!drawer && items.length > 1 && <button class="slip-count link" onClick={() => onDrawer(true)}>{t('agenda.moreIn', { n: items.length - 1 })}</button>}
  </div>;
}

/** The player's armies: what each is doing, its size and strength; a click picks it up on the map. */
export function ArmyList({ g, title = true }: { g: Game; title?: boolean }) {
  const w = g.w, sel = g.st.get().army;
  const rows = w.armies.filter(a => a.country === g.player).map(a => ({ a, at: armyWhere(w, g.S, a) })).filter(r => r.at) as { a: typeof w.armies[number]; at: NonNullable<ReturnType<typeof armyWhere>> }[];
  if (!rows.length) return null;
  const list = <ul class="army-list">{rows.map(({ a, at }) => <li key={a.id}><button aria-pressed={sel === a.id} data-tip={t('army.hint')} onClick={() => { g.selectArmy(sel === a.id ? null : a.id); g.focusArmy(a.id); }}>
    <span class="army-n">{armyName(a.num)}</span><small class={`army-st s-${at.state}`}>{t('army.st.' + at.state)}{at.state === 'moving' && at.eta !== undefined ? ' · ' + t('army.eta', { n: Math.max(1, at.eta - w.day) }) : ''}</small>
    <span class="num">{t('army.size', { n: at.total })}</span><span class="army-str"><i style={{ width: cssPct(Math.min(1, at.str)) }} /></span></button></li>)}</ul>;
  return title ? <Block title={t('war.armies')} icon="military" aside={<span class="num muted">{rows.length}</span>}>{list}</Block> : list;
}

/** The army picked up: its general and what they do, what it is made of, its condition, what an order at the pointer would do, and what else it can do. */
function ArmyCard({ g, id }: { g: Game; id: number }) {
  const w = g.w, a = w.armies.find(x => x.id === id), at = a && armyWhere(w, g.S, a), m = g.st.get().aim;
  if (!a || !at) return null;
  const ds = w.divisions.filter(d => d.army === id), by: Record<string, number> = {}; ds.forEach(d => (by[d.type] = (by[d.type] || 0) + 1));
  const avg = (f: (d: typeof ds[number]) => number) => ds.reduce((s, d) => s + f(d), 0) / Math.max(1, ds.length);
  const org = avg(d => d.org), sup = avg(d => d.theater < 0 ? 1 : d.sup), atWar = at.theater >= 0, gen = a.general;
  const v = m && !m.err && m.kind === 'attack' ? aimVerdict(m) : null;
  const meter = (label: string, short: string, x: number, tip: string) => <span class="ac-m" data-tip={tip}><small><span class="l-long">{label}</span><span class="l-short">{short}</span></small><span class="army-str"><i class={x < 0.4 ? 'bad' : x < 0.7 ? 'amber' : ''} style={{ width: cssPct(Math.min(1, x)) }} /></span><b class="num">{pct(x)}</b></span>;
  const act = (k: 'release' | 'reserve' | 'split' | 'raise', icon: string, key: string, ok: boolean, tip: string, sub?: string) => <button disabled={!ok} data-tip={tip} onClick={() => g.armyAction(k)}><Icon name={icon} size={14} />{t('army.do.' + k)}{sub && <small class="ac-sub">{sub}</small>}<kbd>{key}</kbd></button>;
  return <div class="ui army-card plate" role="dialog" aria-label={armyName(a.num)}>
    <div class="ac-head"><Icon name="military" size={18} /><b class="army-n">{armyName(a.num)}</b><small class={`army-st s-${at.state}`}>{t('army.st.' + at.state)}{at.state === 'moving' && at.eta !== undefined ? ' · ' + t('army.eta', { n: Math.max(1, at.eta - w.day) }) : ''}</small>
      <span class="ac-gen" data-tip={t('army.skill', { n: gen.skill, p: pct(GENERAL.skill(gen.skill) - 1) })}>{t('army.general', { g: gen.name })} <span class="stars">{'★'.repeat(gen.skill)}{'☆'.repeat(4 - gen.skill)}</span></span>
      <span class="chip" data-tip={t('army.equipHint')}>{t('army.equip', { x: fmt1(w.countries[a.country].quality ?? 1) })}</span>
      {gen.traits.map(tr => <span key={tr} class={`chip ${tr in GENERAL ? '' : 'muted'}`} data-tip={t(tr in GENERAL ? 'gfx.' + tr : 'gfx.none')}>{t('gtrait.' + tr)}</span>)}
      <button class="x" aria-label={t('ui.close')} onClick={() => g.selectArmy(null)}><Icon name="x" size={14} /></button></div>
    <div class="ac-body"><span class="ac-units">{Object.entries(by).map(([k, n]) => <span key={k} data-tip={t('unitShort.' + k)}><UnitSymbol type={k} size={18} /><b class="num">{n}</b></span>)}</span>
      {meter(t('army.strength'), t('army.strengthS'), at.str, t('army.strengthHint'))}{meter(t('army.org'), t('army.orgS'), org, t('army.orgHint'))}{meter(t('army.supply'), t('army.supplyS'), sup, t('army.supplyHint'))}</div>
    <div class="ac-order">{!m ? <span class="muted">{t(g.s.touch ? 'army.hintTouch' : 'army.hint')}</span> : m.err ? <span class="muted">{t(m.err)}</span>
      : m.kind === 'attack' ? <span class="aim"><b class={`verdict v-${v}`}>{t('aim.' + v)}</b><span>{t('aim.force', { n: m.n, m: m.foes })}<small> · {t('aim.def', { x: fmt1(m.def) })}{m.fort ? ' · ' + t('aim.fort', { n: m.fort }) : ''}{m.days && m.days > 1 ? ' · ' + t('aim.arrive', { n: m.days }) : ''}{m.orgTo !== undefined ? ' · ' + t('aim.orgTo', { p: pct(m.orgTo) }) : ''}</small></span>{m.foes > 0 && <b class="num">{m.odds >= 10 ? '10+' : fmt1(m.odds)} : 1</b>}<small class="aim-sup" data-tip={t('aim.supHint')}>{t('aim.supThere', { p: pct(m.supTo ?? 1) })}</small></span>
      : m.kind === 'landing' ? <span class="aim"><b class={`verdict v-${m.odds >= 0.6 ? 'likely' : m.odds >= 0.35 ? 'hard' : 'stall'}`}>{t('aim.landing')}</b><span>{t('aim.landingOdds', { p: pct(m.odds), n: m.days ?? 0, m: m.foes })}</span></span>
      : m.kind === 'merge' ? <span class="aim"><b class="verdict v-move">{t('army.go.merge', { a: armyName(w.armies.find(x => x.id === m.into)?.num ?? 0) })}</b></span>
      : <span class="aim"><b class="verdict v-move">{m.kind === 'station' && m.place !== undefined ? t('army.go.stationAt', { p: provName(m.place) }) : t('army.go.' + m.kind)}</b>{m.days ? <span>{t('aim.arrive', { n: m.days })}{m.orgTo !== undefined ? <small> · {t('aim.orgTo', { p: pct(m.orgTo) })}</small> : null}</span> : null}</span>}
      {g.st.get().pend && <span class="ac-confirm">{!m?.err && <button class="primary" onClick={() => g.confirmOrder()}>{t('army.confirm')}</button>}<button onClick={() => g.cancelOrder()}>{t('ui.cancel')}</button></span>}</div>
    <div class="ac-acts">
      {act('release', 'advance', 'L', atWar && at.state !== 'front', t('army.tip.release'))}
      {act('reserve', 'hold', 'R', atWar && at.state !== 'wait', t('army.tip.reserve'))}
      {act('split', 'diplomacy', 'S', ds.length >= 2, t('army.tip.split'))}
      {(() => { const at = g.raiseAt(a.id); return act('raise', 'improve', 'N', g.me.manpower >= UNIT_SPEC.infantry.men && at !== undefined, at !== undefined ? t('army.tip.raiseAt', { v: fmtMoney(g.me.unitCost * UNIT_SPEC.infantry.costMul), d: UNIT_SPEC.infantry.days, p: provName(at) }) : t('mil.noBarracks'), at !== undefined ? t('army.raiseWhere', { p: provName(at), d: UNIT_SPEC.infantry.days }) : undefined); })()}
      <small class="muted ac-keys">{t('army.keys')}</small></div>
  </div>;
}

export function ToolHint({ g }: { g: Game }) {
  const st = g.st.get();
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape') g.selectArmy(null); }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, []);
  if (st.army !== null) return <>{st.toast && <div class="ui toolhint plate over-card" role="status">{st.toast}</div>}<ArmyCard g={g} id={st.army} /></>;
  if (st.toast) return <div class="ui toolhint plate" role="status">{st.toast}</div>;
  return null;
}
