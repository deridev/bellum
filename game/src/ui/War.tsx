import { useEffect } from 'preact/hooks';
import type { Game } from '../game/play';
import { resolveAgenda } from '../sim/agenda';
import { commitShare } from '../sim/war/ai';
import { acceptsPeace, heldDemand, sideOf, theatersOf, warCost, warsOf, type PeaceTerms } from '../sim/war/war';
import type { War } from '../sim/types';
import { armyName, countryName, fmtDate, say, t } from '../i18n';
import { Flag, Icon, Seg, Sheet, SignedBar } from './common';
import { fmtBig, fmtInt, pct } from './format';

/** Postures map onto the same push strengths the AI uses. */
export const POSTURES = [{ id: 'hold', aggr: 0.9 }, { id: 'advance', aggr: 1.08 }, { id: 'offensive', aggr: 1.22 }] as const;
const COMMIT = [{ v: 0.3, id: 'token' }, { v: -1, id: 'normal' }, { v: 0.92, id: 'total' }];

export function WarPanel({ g, id }: { g: Game; id: number }) {
  const w = g.w, me = g.player, war = w.wars.find(x => x.id === id);
  if (!war) return null;
  const close = () => g.openPanel(null);
  if (war.ended) return <Sheet onClose={close} eyebrow={t('panel.war')} title={<div class="h2">{say(w, war.name)}</div>}><p>{t('war.endedOn', { d: fmtDate(w, war.ended) })}</p></Sheet>;
  const side = sideOf(war, me) as 1 | -1, si = side > 0 ? 0 : 1, oi = 1 - si;
  const ours = side > 0 ? war.attackers : war.defenders, theirs = side > 0 ? war.defenders : war.attackers;
  const score = war.score * side, ths = theatersOf(w, war);
  const inWar = (cs: number[]) => w.divisions.filter(d => cs.includes(d.country) && ths.some(x => x.id === d.theater));
  const oursD = inWar(ours), theirsD = inWar(theirs), transit = oursD.filter(d => d.arrive > w.day).length;
  const posture = POSTURES.reduce((b, p) => Math.abs(p.aggr - war.aggr[si]) < Math.abs(b.aggr - war.aggr[si]) ? p : b, POSTURES[1] as typeof POSTURES[number]);
  const offs = ths.flatMap(x => x.offensives.filter(o => !o.ended && o.country === me));
  const all = warsOf(w, me), commit = war.commit?.[me];
  return <Sheet onClose={close} eyebrow={t('war.day', { n: w.day - war.start })} title={<div><div class="h2">{say(w, war.name)}</div><div class="sub">{t(side > 0 ? 'war.attacking' : 'war.defending')}</div></div>}>
    {all.length > 1 && <div class="seg wrap">{all.map(x => <button key={x.id} aria-pressed={x.id === id} onClick={() => g.openPanel({ kind: 'war', id: x.id })}>{say(w, x.name)}</button>)}</div>}
    <div class="sides">
      <div class="side-col"><div class="flags">{ours.slice(0, 6).map(c => <Flag key={c} s={g.s} code={w.countries[c].code} h={16} />)}</div><b class="num">{fmtInt(oursD.length)}</b><small>{transit ? t('war.atFrontTransit', { n: transit }) : t('war.atFront')}</small></div>
      <div class="vs">{t('war.vs')}</div>
      <div class="side-col right"><div class="flags">{theirs.slice(0, 6).map(c => <Flag key={c} s={g.s} code={w.countries[c].code} h={16} />)}</div><b class="num">{fmtInt(theirsD.length)}</b><small>{t('war.divisions')}</small></div>
    </div>
    <div class="sl-top"><span>{t('war.score')}</span><b class={`num ${score < -20 ? 'bad' : score > 20 ? 'good' : ''}`}>{score > 0 ? '+' : ''}{Math.round(score)}</b></div>
    <SignedBar v={score} title={t('war.scoreHint')} />
    <dl class="stat">
      <dt>{t('war.casualties')}</dt><dd>{t('war.vsPair', { a: fmtBig(war.casualties[si]), b: fmtBig(war.casualties[oi]) })}</dd>
      <dt>{t('war.exhaustion')}</dt><dd>{t('war.vsPair', { a: pct(Math.min(1, war.exhaustion[si])), b: pct(Math.min(1, war.exhaustion[oi])) })}</dd>
    </dl>
    <h3 class="h3">{t('war.posture')}</h3>
    <Seg label={t('war.posture')} value={posture.id as string} options={POSTURES.map(p => ({ v: p.id as string, label: t('posture.' + p.id), title: t('posture.' + p.id + '.hint') }))} onPick={v => { war.aggr[si] = POSTURES.find(p => p.id === v)!.aggr; g.bump(); g.sound('click'); }} />
    <small class="muted">{t('posture.' + posture.id + '.hint')}</small>
    <h3 class="h3">{t('war.commitment')}</h3>
    <Seg label={t('war.commitment')} value={commit === undefined ? 'normal' : COMMIT.find(c => c.v === commit)?.id || 'normal'} options={COMMIT.map(c => ({ v: c.id, label: t('commit.' + c.id) }))} onPick={v => { const c = COMMIT.find(x => x.id === v)!; war.commit ||= {}; if (c.v < 0) delete war.commit[me]; else war.commit[me] = c.v; g.bump(); }} />
    <small class="muted">{t('war.commitHint', { p: pct(commitShare(w, war, me)) })}</small>
    <h3 class="h3">{t('war.offensives')}</h3>
    {offs.length > 0 && <ul class="offs">{offs.map(o => { const a = w.armies.find(x => x.id === o.army); return <li key={o.id}><span>{a ? armyName(a.num) : t('war.army')}</span><small>{t('war.day', { n: w.day - o.created })}</small><div class="meter" title={t('war.momentum')}><div class="fill amber" style={{ width: pct(o.org) }} /></div></li>; })}</ul>}
    <button class="primary" disabled={posture.id === 'hold' || offs.length >= 3} onClick={() => g.setTool({ kind: 'offensive', war: war.id })}>{t('war.plan')}</button>
    <small class="muted">{t(posture.id === 'hold' ? 'war.planHold' : offs.length >= 3 ? 'war.planMax' : 'war.planHint')}</small>
    <h3 class="h3">{t('war.peace')}</h3>
    <PeaceOptions g={g} war={war} side={side} />
  </Sheet>;
}

function PeaceOptions({ g, war, side }: { g: Game; war: War; side: 1 | -1 }) {
  const w = g.w, score = Math.max(0, war.score * side), demand = heldDemand(w, war, side, score);
  const opts: { label: string; terms: PeaceTerms }[] = [
    { label: t('peace.white'), terms: { type: 'white', provinces: [] } },
    { label: t('peace.ceasefire'), terms: { type: 'ceasefire', provinces: [] } },
  ];
  if (demand.length) opts.push({ label: t('peace.annex', { n: demand.length }), terms: { type: 'treaty', provinces: demand } });
  return <div class="peace">{opts.map(o => { const r = acceptsPeace(w, war, side, o.terms);
    return <div class="peace-opt" key={o.label}><button class={r.ok ? 'primary' : ''} onClick={() => g.proposePeace(war, o.terms)}>{o.label}</button><small class={r.ok ? 'good' : 'muted'}>{r.ok ? t('peace.wouldAccept') + ' ' : ''}{say(w, r.why)}</small></div>; })}</div>;
}

export function DeclareDialog({ g, target }: { g: Game; target: number }) {
  const w = g.w, me = g.me, T = w.countries[target], cost = warCost(w, me.id, target), name = countryName(w, target);
  const close = () => g.st.set({ declare: -1 });
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, []);
  const short = me.polCap < cost.influence;
  return <div class="ui modal-wrap" onClick={e => { if (e.target === e.currentTarget) close(); }}>
    <section class="panel modal" role="dialog" aria-label={t('declare.aria', { c: name })}>
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
  return <div class="ui agenda">{items.map(a => <section class={`agenda-card panel k-${a.kind}`} key={a.id} role="dialog" aria-label={say(g.w, a.title)}>
    <div class="cable-head"><span class="eyebrow">{t('agenda.' + a.kind)}</span><time class="mono">{fmtDate(g.w, a.day)}</time></div>
    <div class="h3 plain">{say(g.w, a.title)}</div><p>{say(g.w, a.text)}</p>
    <div class="row">{a.options.map((o, i) => <button key={i} class={i === 0 ? 'primary' : ''} title={o.hint ? say(g.w, o.hint) : undefined} onClick={() => { resolveAgenda(g.w, g.S, a.id, i); g.afterOrder(); g.sound('click'); }}>{say(g.w, o.label)}</button>)}</div>
    {a.options.some(o => o.hint) && <ul class="hints">{a.options.map((o, i) => o.hint ? <li key={i}><b>{say(g.w, o.label)}:</b> {say(g.w, o.hint)}</li> : null)}</ul>}
  </section>)}</div>;
}

export function ToolHint({ g }: { g: Game }) {
  const st = g.st.get();
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape') g.setTool(null); }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, []);
  if (st.tool) return <div class="ui toolhint panel" role="status">{t('war.aim')} <button onClick={() => g.setTool(null)}>{t('ui.cancel')}</button></div>;
  if (st.toast) return <div class="ui toolhint panel" role="status">{st.toast}</div>;
  return null;
}
