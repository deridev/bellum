import { useEffect } from 'preact/hooks';
import type { Game } from '../game/play';
import { resolveAgenda } from '../sim/agenda';
import { commitShare } from '../sim/war/ai';
import { acceptsPeace, heldDemand, sideOf, theatersOf, warCost, warsOf, type PeaceTerms } from '../sim/war/war';
import { dateStr, type War } from '../sim/types';
import { Flag } from './Hud';
import { fmtBig, fmtInt, pct } from './format';

/** Postures map onto the same push strengths the AI uses. */
export const POSTURES = [{ id: 'hold', label: 'Hold', aggr: 0.9, hint: 'Dig in. Fewer losses, no offensives.' }, { id: 'advance', label: 'Advance', aggr: 1.08, hint: 'Steady pressure along the whole front.' }, { id: 'offensive', label: 'All-out', aggr: 1.22, hint: 'Push everywhere. Gains ground, costs men.' }] as const;
const COMMIT = [{ v: 0.3, label: 'Token' }, { v: -1, label: 'Normal' }, { v: 0.92, label: 'Total' }];

export function WarChip({ g }: { g: Game }) {
  const wars = warsOf(g.w, g.player); if (!wars.length) return null;
  const war = wars[0], s = war.score * sideOf(war, g.player);
  return <button class={`chip war-chip ${s < -20 ? 'bad' : s > 20 ? 'good' : ''}`} title="Open the war room" onClick={() => g.openPanel({ kind: 'war', id: war.id })}>
    <span class="chip-l">{wars.length > 1 ? `${wars.length} wars` : 'At war'}</span><span class="chip-v num">{s > 0 ? '+' : ''}{Math.round(s)}</span></button>;
}

export function WarPanel({ g, id }: { g: Game; id: number }) {
  const w = g.w, me = g.player, war = w.wars.find(x => x.id === id);
  if (!war) return null;
  const side = sideOf(war, me) as 1 | -1, si = side > 0 ? 0 : 1, oi = 1 - si;
  const ours = side > 0 ? war.attackers : war.defenders, theirs = side > 0 ? war.defenders : war.attackers;
  const score = war.score * side, ths = theatersOf(w, war);
  const inWar = (cs: number[]) => w.divisions.filter(d => cs.includes(d.country) && ths.some(t => t.id === d.theater));
  const oursD = inWar(ours), theirsD = inWar(theirs), transit = oursD.filter(d => d.arrive > w.day).length;
  const posture = POSTURES.reduce((b, p) => Math.abs(p.aggr - war.aggr[si]) < Math.abs(b.aggr - war.aggr[si]) ? p : b, POSTURES[1] as typeof POSTURES[number]);
  const offs = ths.flatMap(t => t.offensives.filter(o => !o.ended && o.country === me));
  const others = warsOf(w, me).filter(x => x.id !== id);
  const commit = war.commit?.[me];
  if (war.ended) return <Sheet g={g} title={<div class="h2">{war.name}</div>}><p>This war ended on {dateStr(w, war.ended)}.</p></Sheet>;
  return <Sheet g={g} title={<div><div class="h2">{war.name}</div><div class="eyebrow">Day {w.day - war.start} · {side > 0 ? 'You are attacking' : 'You are defending'}</div></div>}>
    {others.length > 0 && <div class="seg wrap">{warsOf(w, me).map(x => <button key={x.id} aria-pressed={x.id === id} onClick={() => g.openPanel({ kind: 'war', id: x.id })}>{x.name}</button>)}</div>}
    <div class="sides">
      <div class="side-col"><div class="flags">{ours.slice(0, 6).map(c => <Flag key={c} g={g} code={w.countries[c].code} h={16} />)}</div><b class="num">{fmtInt(oursD.length)}</b><small>divisions at the front{transit ? `, ${transit} on the way` : ''}</small></div>
      <div class="vs">vs</div>
      <div class="side-col right"><div class="flags">{theirs.slice(0, 6).map(c => <Flag key={c} g={g} code={w.countries[c].code} h={16} />)}</div><b class="num">{fmtInt(theirsD.length)}</b><small>divisions</small></div>
    </div>
    <div class="sl-top"><span>War score</span><b class={`num ${score < -20 ? 'bad' : score > 20 ? 'good' : ''}`}>{score > 0 ? '+' : ''}{Math.round(score)}</b></div>
    <div class="meter rel" title="From -100 (they win outright) to +100 (you win outright)"><div class="fill" style={{ left: score < 0 ? pct(0.5 + score / 200) : '50%', width: pct(Math.abs(score) / 200), background: score < 0 ? 'var(--bad)' : 'var(--good)' }} /></div>
    <dl class="stat">
      <dt>Casualties</dt><dd>{fmtBig(war.casualties[si])} vs {fmtBig(war.casualties[oi])}</dd>
      <dt>Exhaustion</dt><dd>{pct(Math.min(1, war.exhaustion[si]))} vs {pct(Math.min(1, war.exhaustion[oi]))}</dd>
    </dl>

    <h3 class="h3">Posture</h3>
    <div class="seg wrap" role="group" aria-label="Posture">{POSTURES.map(p => <button key={p.id} aria-pressed={posture.id === p.id} title={p.hint} onClick={() => { war.aggr[si] = p.aggr; g.bump(); }}>{p.label}</button>)}</div>
    <small class="muted">{posture.hint}</small>

    <h3 class="h3">Commitment</h3>
    <div class="seg wrap" role="group" aria-label="Commitment">{COMMIT.map(c => <button key={c.label} aria-pressed={c.v < 0 ? commit === undefined : commit === c.v} onClick={() => { war.commit ||= {}; if (c.v < 0) delete war.commit[me]; else war.commit[me] = c.v; g.bump(); }}>{c.label}</button>)}</div>
    <small class="muted">Sends {pct(commitShare(w, war, me))} of your army to this war. Reserves reinforce the most threatened sectors by rail.</small>

    <h3 class="h3">Offensives</h3>
    {offs.length > 0 && <ul class="offs">{offs.map(o => <li key={o.id}><span>{w.armies.find(a => a.id === o.army)?.name || 'Army'}</span><small>day {w.day - o.created}</small><div class="meter" title="Momentum: drains while attacking"><div class="fill amber" style={{ width: pct(o.org) }} /></div></li>)}</ul>}
    <button class="primary" disabled={posture.id === 'hold' || offs.length >= 3} onClick={() => g.setTool({ kind: 'offensive', war: war.id })}>Plan an offensive</button>
    <small class="muted">{posture.id === 'hold' ? 'Switch off Hold to attack.' : offs.length >= 3 ? 'Three offensives at once is the most your staff can run.' : 'Then click a target on enemy ground. The army nearest it attacks until it runs out of momentum.'}</small>

    <h3 class="h3">Peace</h3>
    <PeaceOptions g={g} war={war} side={side} />
  </Sheet>;
}

function PeaceOptions({ g, war, side }: { g: Game; war: War; side: 1 | -1 }) {
  const w = g.w, score = Math.max(0, war.score * side), demand = heldDemand(w, war, side, score);
  const opts: { label: string; terms: PeaceTerms }[] = [
    { label: 'White peace', terms: { type: 'white', provinces: [] } },
    { label: 'Ceasefire on the front', terms: { type: 'ceasefire', provinces: [] } },
  ];
  if (demand.length) opts.push({ label: `Annex ${demand.length} held province${demand.length > 1 ? 's' : ''}`, terms: { type: 'treaty', provinces: demand } });
  return <div class="peace">{opts.map(o => { const r = acceptsPeace(w, war, side, o.terms);
    return <div class="peace-opt" key={o.label}><button class={r.ok ? 'primary' : ''} onClick={() => g.proposePeace(war, o.terms)}>{o.label}</button><small class={r.ok ? 'good' : 'muted'}>{r.ok ? 'They would accept. ' : ''}{r.why}</small></div>; })}</div>;
}

export function DeclareDialog({ g, target }: { g: Game; target: number }) {
  const w = g.w, me = g.me, T = w.countries[target], cost = warCost(w, me.id, target);
  const close = () => g.st.set({ declare: -1 });
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, []);
  const short = me.polCap < cost.influence;
  return <div class="ui modal-wrap" onClick={e => { if (e.target === e.currentTarget) close(); }}>
    <section class="card modal" role="dialog" aria-label={`Declare war on ${T.name}`}>
      <div class="sheet-head"><div class="title-row"><Flag g={g} code={T.code} h={22} /><div><div class="eyebrow">Declare war</div><div class="h2">{T.name}</div></div></div><button class="x" aria-label="Close" onClick={close}>✕</button></div>
      <div class="sheet-body">
        <p>{cost.claim ? `You have claims on ${T.name}'s land: the public will back this war.` : cost.justified ? `${T.name} is a rival: the war is seen as justified.` : `There is no claim or grudge. The world will see an unprovoked war.`}</p>
        <dl class="stat">
          <dt>Stability</dt><dd class="bad">−{pct(cost.stability)}</dd>
          <dt>Influence</dt><dd class={short ? 'bad' : ''}>−{cost.influence} (you have {fmtInt(me.polCap)})</dd>
          <dt>World opinion</dt><dd class="bad">{cost.worldOpinion}</dd>
        </dl>
        {cost.joiners.length > 0 ? <><h3 class="h3">They will be defended by</h3><div class="flags wrap">{cost.joiners.map(c => <span class="joiner" key={c}><Flag g={g} code={w.countries[c].code} h={14} /> {w.countries[c].name}</span>)}</div></> : <small class="muted">No one is bound to defend them.</small>}
        <button class="primary danger" disabled={short} onClick={() => { g.declareWar(target); close(); }}>{short ? 'Not enough influence' : 'Declare war'}</button>
        <button onClick={close}>Cancel</button>
      </div>
    </section>
  </div>;
}

export function AgendaCards({ g }: { g: Game }) {
  const items = g.w.agenda.filter(a => a.country === g.player).slice(0, 2);
  if (!items.length) return null;
  return <div class="ui agenda">{items.map(a => <section class="card agenda-card" key={a.id} role="dialog" aria-label={a.title}>
    <div class="eyebrow">{dateStr(g.w, a.day)}</div><div class="h3">{a.title}</div><p>{a.text}</p>
    <div class="row">{a.options.map((o, i) => <button key={i} class={i === 0 ? 'primary' : ''} onClick={() => { resolveAgenda(g.w, g.S, a.id, i); g.afterOrder(); }}>{o.label}</button>)}</div>
  </section>)}</div>;
}

export function ToolHint({ g }: { g: Game }) {
  const st = g.st.get();
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape') g.setTool(null); }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, []);
  if (st.tool) return <div class="ui toolhint card" role="status">Click enemy ground to aim the offensive <button onClick={() => g.setTool(null)}>Cancel</button></div>;
  if (st.toast) return <div class="ui toolhint card" role="status">{st.toast}</div>;
  return null;
}

function Sheet({ g, title, children }: { g: Game; title: any; children: any }) {
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape' && !g.st.get().tool) g.openPanel(null); }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, []);
  return <section class="ui sheet card ui-scroll"><div class="sheet-head">{title}<button class="x" aria-label="Close" onClick={() => g.openPanel(null)}>✕</button></div><div class="sheet-body">{children}</div></section>;
}
