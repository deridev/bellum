import { useEffect } from 'preact/hooks';
import type { Game } from '../game/play';
import { resolveAgenda } from '../sim/agenda';
import { commitShare } from '../sim/war/ai';
import { acceptsPeace, heldDemand, sideOf, theatersOf, warCost, warsOf, type PeaceTerms } from '../sim/war/war';
import type { War } from '../sim/types';
import { armyName, countryName, fmtDate, say, t } from '../i18n';
import { Block, Flag, Icon, Sheet, Tug } from './common';
import { fmtBig, fmtInt, pct } from './format';

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
  const all = warsOf(w, me), commit = war.commit?.[me];
  const flags = (cs: number[]) => <span class="flags">{cs.slice(0, 4).map(c => <Flag key={c} s={g.s} code={w.countries[c].code} h={14} />)}{cs.length > 4 && <small>+{cs.length - 4}</small>}</span>;
  const pair = (a: number, b: number, fmt: (v: number) => string, label: string, icon: string) => { const tot = a + b || 1;
    return <div class="pair" data-tip={label}><Icon name={icon} size={14} /><b class="num">{fmt(a)}</b><span class="pair-bar"><i style={{ width: `${a / tot * 100}%` }} /></span><b class="num">{fmt(b)}</b></div>; };
  return <Sheet onClose={close} icon="war" eyebrow={`${t(side > 0 ? 'war.attacking' : 'war.defending')} · ${t('war.day', { n: w.day - war.start })}`} title={<div class="h2">{say(w, war.name)}</div>}>
    {all.length > 1 && <div class="seg wrap">{all.map(x => <button key={x.id} aria-pressed={x.id === id} onClick={() => g.openPanel({ kind: 'war', id: x.id })}>{say(w, x.name)}</button>)}</div>}
    <div class="war-score" data-tip={t('war.scoreHint')}><span class="eyebrow">{t('war.score')}</span><b class={`num big ${score < -20 ? 'bad' : score > 20 ? 'good' : ''}`}>{score > 0 ? '+' : ''}{Math.round(score)}</b></div>
    <Tug v={score} left={flags(ours)} right={flags(theirs)} />
    <div class="pairs">
      {pair(oursD.length, theirsD.length, fmtInt, transit ? t('war.atFrontTransit', { n: transit }) : t('war.atFront'), 'military')}
      {pair(war.casualties[si], war.casualties[oi], fmtBig, t('war.casualties'), 'manpower')}
      {pair(Math.min(1, war.exhaustion[si]), Math.min(1, war.exhaustion[oi]), pct, t('war.exhaustion'), 'trendDown')}
    </div>
    <Block title={t('war.posture')} icon="hold">
      <div class="big-toggles" role="group" aria-label={t('war.posture')}>{POSTURES.map(p => <button key={p.id} aria-pressed={posture.id === p.id} data-tip={t('posture.' + p.id + '.hint')} onClick={() => { war.aggr[si] = p.aggr; g.bump(); g.sound('click'); }}><Icon name={p.id} size={22} /><span>{t('posture.' + p.id)}</span></button>)}</div>
    </Block>
    <Block title={t('war.commitment')} icon="manpower" aside={<b class="num">{pct(commitShare(w, war, me))}</b>}>
      <div class="steps" role="group" aria-label={t('war.commitment')}>{COMMIT.map((c, i) => { const cur = commit === undefined ? 'normal' : COMMIT.find(x => x.v === commit)?.id || 'normal', ci = COMMIT.findIndex(x => x.id === cur);
        return <button key={c.id} aria-pressed={cur === c.id} class={ci >= i ? 'on' : ''} data-tip={t('war.commitHint', { p: pct(c.v < 0 ? commitShare(w, { ...war, commit: {} }, me) : c.v) })} onClick={() => { war.commit ||= {}; if (c.v < 0) delete war.commit[me]; else war.commit[me] = c.v; g.bump(); }}><i style={{ height: `${8 + i * 6}px` }} /><span>{t('commit.' + c.id)}</span></button>; })}</div>
    </Block>
    <Block title={t('war.offensives')} icon="offensive" aside={<b class="num">{offs.length}/3</b>}>
      {offs.length > 0 && <ul class="offs">{offs.map(o => { const a = w.armies.find(x => x.id === o.army); return <li key={o.id}><Icon name="advance" size={14} /><span>{a ? armyName(a.num) : t('war.army')}</span><small class="num">{t('war.day', { n: w.day - o.created })}</small><div class="meter" data-tip={t('war.momentum')}><div class="fill amber" style={{ width: pct(o.org) }} /></div></li>; })}</ul>}
      <button class="primary" disabled={posture.id === 'hold' || offs.length >= 3} data-tip={t(posture.id === 'hold' ? 'war.planHold' : offs.length >= 3 ? 'war.planMax' : 'war.planHint')} onClick={() => g.setTool({ kind: 'offensive', war: war.id })}><Icon name="target" size={16} />{t('war.plan')}</button>
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
      <Icon name={o.icon} size={20} /><span>{o.label}</span><span class="verdict"><Icon name={r.ok ? 'check' : 'cross'} size={16} /></span></button>; })}</div>;
}

export function DeclareDialog({ g, target }: { g: Game; target: number }) {
  const w = g.w, me = g.me, T = w.countries[target], cost = warCost(w, me.id, target), name = countryName(w, target);
  const close = () => g.st.set({ declare: -1 });
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, []);
  const short = me.polCap < cost.influence;
  return <div class="ui modal-wrap" onClick={e => { if (e.target === e.currentTarget) close(); }}>
    <section class="plate modal" role="dialog" aria-label={t('declare.aria', { c: name })}>
      <header class="sheet-head"><div class="title-row"><Flag s={g.s} code={T.code} h={22} /><div><div class="eyebrow">{t('war.declare')}</div><div class="h2">{name}</div></div></div><button class="x" aria-label={t('ui.close')} onClick={close}><Icon name="x" /></button></header>
      <div class="sheet-body">
        <p>{t(cost.claim ? 'declare.claim' : cost.justified ? 'declare.rival' : 'declare.unprovoked', { c: name })}</p>
        <dl class="stat">
          <dt>{t('ledger.stability')}</dt><dd class="bad">−{pct(cost.stability)}</dd>
          <dt>{t('ledger.influence')}</dt><dd class={short ? 'bad' : ''}>{t('declare.influence', { n: cost.influence, have: fmtInt(me.polCap) })}</dd>
          <dt>{t('declare.opinion')}</dt><dd class="bad">{cost.worldOpinion}</dd>
        </dl>
        {cost.joiners.length > 0 ? <><h3 class="h3">{t('declare.defenders')}</h3><div class="flags wrap">{cost.joiners.map(c => <span class="joiner" key={c}><Flag s={g.s} code={w.countries[c].code} h={14} /> {countryName(w, c)}</span>)}</div></> : <small class="muted">{t('declare.alone')}</small>}
        <button class="primary danger" disabled={short} onClick={() => { g.declareWar(target); close(); }}>{short ? t('declare.short') : t('war.declare')}</button>
        <button onClick={close}>{t('ui.cancel')}</button>
      </div>
    </section>
  </div>;
}

/** Decisions waiting for the player: peace offers, proposals, events. */
export function AgendaCards({ g }: { g: Game }) {
  const items = g.w.agenda.filter(a => a.country === g.player).slice(0, 2);
  if (!items.length) return null;
  return <div class="ui agenda">{items.map(a => <section class={`agenda-card plate k-${a.kind}`} key={a.id} role="dialog" aria-label={say(g.w, a.title)}>
    <div class="cable-head"><Icon name={a.kind === 'peace' ? 'peace' : a.kind === 'diplo' ? 'diplomacy' : 'chronicle'} size={16} /><span class="eyebrow">{t('agenda.' + a.kind)}</span><time class="mono">{fmtDate(g.w, a.day)}</time></div>
    <div class="h3 plain">{say(g.w, a.title)}</div><p>{say(g.w, a.text)}</p>
    <div class="row">{a.options.map((o, i) => <button key={i} class={i === 0 ? 'primary' : ''} title={o.hint ? say(g.w, o.hint) : undefined} onClick={() => { resolveAgenda(g.w, g.S, a.id, i); g.afterOrder(); g.sound('click'); }}>{say(g.w, o.label)}</button>)}</div>
    {a.options.some(o => o.hint) && <ul class="hints">{a.options.map((o, i) => o.hint ? <li key={i}><b>{say(g.w, o.label)}:</b> {say(g.w, o.hint)}</li> : null)}</ul>}
  </section>)}</div>;
}

export function ToolHint({ g }: { g: Game }) {
  const st = g.st.get();
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape') g.setTool(null); }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, []);
  if (st.tool) return <div class="ui toolhint plate" role="status"><Icon name="target" size={16} />{t('war.aim')} <button onClick={() => g.setTool(null)}>{t('ui.cancel')}</button></div>;
  if (st.toast) return <div class="ui toolhint plate" role="status">{st.toast}</div>;
  return null;
}
