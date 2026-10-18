import { useEffect, useState } from 'preact/hooks';
import { SPEEDS, type Game } from '../game/play';
import { useTick } from '../game/store';
import { atWar, popOf, UNIT_SPEC, queueUnit, cancelUnit } from '../sim/economy';
import { groupMood, stabilityTarget } from '../sim/politics';
import { dateStr, type Conscription, type Country, type UnitType } from '../sim/types';
import { CONSCRIPTION_RATE, rel } from '../sim/world';
import { MapModes, HoverTip } from './App';
import { fmtBig, fmtInt, fmtMoney, pct } from './format';
import { listSaves, loadGame, saveGame, deleteSave } from '../game/save';

export function Flag({ g, code, h = 14 }: { g: Game; code: string; h?: number }) {
  const A = g.s.assets, fi = A.flagIndex[code]; if (!fi) return null;
  const w = h * 1.5, sx = w / A.flagW;
  return <span class="flag" style={{ width: w, height: h, backgroundImage: `url(${flagUrl(g)})`, backgroundPosition: `-${fi[0] * sx}px -${fi[1] * sx}px`, backgroundSize: `${(A.flags.width) * sx}px ${(A.flags.height) * sx}px` }} />;
}
let _flagUrl = ''; function flagUrl(g: Game) { if (_flagUrl) return _flagUrl; const c = document.createElement('canvas'); c.width = g.s.assets.flags.width; c.height = g.s.assets.flags.height; c.getContext('2d')!.drawImage(g.s.assets.flags, 0, 0); _flagUrl = c.toDataURL(); return _flagUrl; }

export function Hud({ g }: { g: Game }) {
  const st = useTick(g.st);
  return <>
    <TopBar g={g} />
    <Feed g={g} />
    <MapModes s={g.s} />
    <HoverTip s={g.s} />
    {st.panel?.kind === 'nation' && <NationPanel g={g} tab={st.panel.tab} />}
    {st.panel?.kind === 'province' && <ProvincePanel g={g} id={st.panel.id} />}
    {st.panel?.kind === 'country' && <CountryPanel g={g} id={st.panel.id} />}
    {st.menu && <Menu g={g} />}
  </>;
}

function Chip({ label, value, tone, title, onClick }: { label: string; value: string; tone?: 'good' | 'bad' | ''; title: string; onClick?: () => void }) {
  return <button class={`chip ${tone || ''}`} title={title} onClick={onClick}><span class="chip-l">{label}</span><span class="chip-v num">{value}</span></button>;
}

function TopBar({ g }: { g: Game }) {
  const st = g.st.get(), c = g.me, w = g.w;
  const balance = c.income - c.spending;
  return <header class="ui topbar card">
    <button class="nation" onClick={() => g.openPanel({ kind: 'nation', tab: 'economy' })} title="Open your nation"><Flag g={g} code={c.code} h={20} /><span><b>{c.name}</b><small>{c.leader.title} {c.leader.name}</small></span></button>
    <div class="chips">
      <Chip label="Treasury" value={fmtMoney(c.treasury)} title="Cash on hand. Borrowing adds to debt." onClick={() => g.openPanel({ kind: 'nation', tab: 'economy' })} />
      <Chip label="Monthly" value={(balance >= 0 ? '+' : '') + fmtMoney(balance)} tone={balance >= 0 ? 'good' : 'bad'} title="Revenue minus spending and interest, last month" onClick={() => g.openPanel({ kind: 'nation', tab: 'economy' })} />
      <Chip label="Manpower" value={fmtBig(c.manpower)} title="Recruits available for new divisions" onClick={() => g.openPanel({ kind: 'nation', tab: 'military' })} />
      <Chip label="Stability" value={pct(c.stability)} tone={c.stability < 0.35 ? 'bad' : ''} title="Low stability means lost revenue, unrest and, in the worst case, coups" onClick={() => g.openPanel({ kind: 'nation', tab: 'politics' })} />
      <Chip label="War support" value={pct(c.warSupport)} title="Public willingness to fight. Falls with casualties and long wars" onClick={() => g.openPanel({ kind: 'nation', tab: 'politics' })} />
      <Chip label="Influence" value={fmtInt(c.polCap)} title="Political capital: spent on laws and diplomacy" onClick={() => g.openPanel({ kind: 'nation', tab: 'politics' })} />
    </div>
    <div class="clock">
      <div class="date num">{dateStr(w)}</div>
      <div class="speeds">
        <button class="pp" aria-label={st.paused ? 'Play' : 'Pause'} onClick={() => g.togglePause()}>{st.paused ? <svg viewBox="0 0 16 16"><path d="M4 2.5v11l9-5.5z" /></svg> : <svg viewBox="0 0 16 16"><rect x="3" y="2" width="3.5" height="12" rx="1" /><rect x="9.5" y="2" width="3.5" height="12" rx="1" /></svg>}</button>
        <span class="seg">{SPEEDS.map((_, i) => <button key={i} aria-pressed={!st.paused && st.speed === i} onClick={() => g.setSpeed(i)} title={`${SPEEDS[i]} days per second`}>{'›'.repeat(i + 1)}</button>)}</span>
      </div>
      <button class="menu-btn" aria-label="Menu" title="Menu (save, load)" onClick={() => g.st.set({ menu: true, paused: true })}><svg viewBox="0 0 16 16"><rect x="2" y="3" width="12" height="1.8" rx=".9" /><rect x="2" y="7.1" width="12" height="1.8" rx=".9" /><rect x="2" y="11.2" width="12" height="1.8" rx=".9" /></svg></button>
      <button class="turnmode" onClick={() => g.setTurnMode(st.turnMode === 'continuous' ? 'monthly' : 'continuous')} title="Monthly turns pause at the start of every month">{st.turnMode === 'continuous' ? 'Continuous' : 'Monthly turns'}</button>
    </div>
  </header>;
}

function Feed({ g }: { g: Game }) {
  const w = g.w, me = g.player;
  const items = w.log.filter(l => l.who?.includes(me) || l.big || l.kind === 'war' || l.kind === 'peace').slice(-6).reverse();
  if (!items.length) return null;
  return <aside class="ui feed card"><div class="eyebrow">Dispatches</div><ol>{items.map((l, i) => <li key={i} class={`k-${l.kind}`}><time>{dateStr(w, l.day)}</time><span>{l.text}</span></li>)}</ol></aside>;
}

function Sheet({ g, title, children, wide }: { g: Game; title: any; children: any; wide?: boolean }) {
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape') g.openPanel(null); }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, []);
  return <section class={`ui sheet card ui-scroll ${wide ? 'wide' : ''}`}>
    <div class="sheet-head">{title}<button class="x" aria-label="Close" onClick={() => g.openPanel(null)}>✕</button></div>
    <div class="sheet-body">{children}</div>
  </section>;
}

function Bar({ v, tone, mark }: { v: number; tone?: string; mark?: number }) {
  return <div class="meter"><div class={`fill ${tone || ''}`} style={{ width: pct(Math.max(0, Math.min(1, v))) }} />{mark !== undefined && <div class="mark" style={{ left: pct(mark) }} />}</div>;
}

function Slider({ id, label, value, min, max, step, fmt, onInput, hint }: { id: string; label: string; value: number; min: number; max: number; step: number; fmt: (v: number) => string; onInput: (v: number) => void; hint?: string }) {
  return <label class="slider" for={id}><span class="sl-top"><span>{label}</span><b class="num">{fmt(value)}</b></span>
    <input id={id} type="range" min={min} max={max} step={step} value={value} onInput={e => onInput(+(e.target as HTMLInputElement).value)} />
    {hint && <small>{hint}</small>}</label>;
}

function NationPanel({ g, tab }: { g: Game; tab: 'economy' | 'politics' | 'military' }) {
  const c = g.me;
  return <Sheet g={g} wide title={<div class="title-row"><Flag g={g} code={c.code} h={22} /><div><div class="h2">{c.name}</div><div class="eyebrow">{govLabel(c)} · {c.leader.title} {c.leader.name}</div></div></div>}>
    <div class="tabs" role="tablist">{(['economy', 'politics', 'military'] as const).map(t => <button key={t} role="tab" aria-selected={tab === t} aria-pressed={tab === t} onClick={() => g.openPanel({ kind: 'nation', tab: t })}>{t[0].toUpperCase() + t.slice(1)}</button>)}</div>
    {tab === 'economy' && <EconomyTab g={g} c={c} />}
    {tab === 'politics' && <PoliticsTab g={g} c={c} />}
    {tab === 'military' && <MilitaryTab g={g} c={c} />}
  </Sheet>;
}
const govLabel = (c: Country) => ({ democracy: 'Democracy', authoritarian: 'Authoritarian state', oneparty: 'One-party state', junta: 'Military junta', monarchy: 'Monarchy', theocracy: 'Theocracy' } as const)[c.gov];

function EconomyTab({ g, c }: { g: Game; c: Country }) {
  const [, force] = useState(0); const upd = () => { force(x => x + 1); g.st.set({ tick: g.st.get().tick + 1 }); };
  const setShare = (k: keyof Country['budget'], v: number) => {
    const others = (Object.keys(c.budget) as (keyof Country['budget'])[]).filter(x => x !== k);
    const rest = others.reduce((a, x) => a + c.budget[x], 0) || 1; const left = 1 - v;
    c.budget[k] = v; for (const x of others) c.budget[x] = c.budget[x] / rest * left; upd();
  };
  const mil = c.spending * c.budget.military, free = Math.max(0, mil - c.upkeep);
  return <div class="tab-body">
    <dl class="stat">
      <dt>Economy (GDP)</dt><dd>{fmtMoney(c.gdp)} / yr</dd>
      <dt>Growth</dt><dd class={c.growth < 0 ? 'bad' : 'good'}>{(c.growth * 100).toFixed(1)}%</dd>
      <dt>Revenue</dt><dd>{fmtMoney(c.income)} / mo</dd>
      <dt>Spending (incl. interest)</dt><dd>{fmtMoney(c.spending)} / mo</dd>
      <dt>Debt</dt><dd class={c.debt / c.gdp > 1.2 ? 'bad' : ''}>{fmtMoney(c.debt)} ({pct(c.debt / Math.max(1, c.gdp))} of GDP)</dd>
    </dl>
    <h3 class="h3">Taxes and borrowing</h3>
    <Slider id="tax" label="Tax rate" value={c.taxRate} min={0.08} max={0.55} step={0.01} fmt={pct} onInput={v => { c.taxRate = v; upd(); }} hint="Higher taxes: more revenue, slower growth, unhappy industry and farmers." />
    <Slider id="deficit" label="Borrowing" value={c.deficit} min={0} max={0.8} step={0.01} fmt={v => '+' + pct(v) + ' of revenue'} onInput={v => { c.deficit = v; upd(); }} hint="Spend beyond revenue. Debt costs 4% a year, and heavy debt slows growth." />
    <h3 class="h3">Budget</h3>
    <Slider id="b-mil" label="Military" value={c.budget.military} min={0.02} max={0.8} step={0.01} fmt={pct} onInput={v => setShare('military', v)} hint={`Upkeep ${fmtMoney(c.upkeep)}/mo · production ${fmtMoney(free)}/mo`} />
    <Slider id="b-inv" label="Investment" value={c.budget.investment} min={0.02} max={0.7} step={0.01} fmt={pct} onInput={v => setShare('investment', v)} hint="Infrastructure and industry: drives growth." />
    <Slider id="b-wel" label="Welfare" value={c.budget.welfare} min={0.02} max={0.85} step={0.01} fmt={pct} onInput={v => setShare('welfare', v)} hint="Health, pensions, services: stability and labour support." />
    <Slider id="b-res" label="Research" value={c.budget.research} min={0.0} max={0.3} step={0.005} fmt={pct} onInput={v => setShare('research', v)} hint={`Military technology level ${c.tech}. Each level makes units 5% stronger.`} />
  </div>;
}

function PoliticsTab({ g, c }: { g: Game; c: Country }) {
  const target = stabilityTarget(g.w, c), mood = groupMood(g.w, c);
  const GL: Record<string, string> = { military: 'Military', industry: 'Industry', labor: 'Labour', rural: 'Rural' };
  const [ex, au] = c.ideology;
  return <div class="tab-body">
    <div class="leader card-inner"><div class="eyebrow">{c.leader.title}</div><div class="h3">{c.leader.name}</div><div class="traits">{c.leader.traits.map(t => <span class="trait" key={t}>{t}</span>)}</div>
      {c.gov === 'democracy' && c.nextElection >= 0 && <small>Next election: {dateStr(g.w, c.nextElection)}</small>}</div>
    <div class="two">
      <div><div class="sl-top"><span>Stability</span><b class="num">{pct(c.stability)}</b></div><Bar v={c.stability} mark={target} tone={c.stability < 0.35 ? 'bad' : ''} /><small>Heading to {pct(target)}</small></div>
      <div><div class="sl-top"><span>War support</span><b class="num">{pct(c.warSupport)}</b></div><Bar v={c.warSupport} tone="amber" /></div>
    </div>
    <h3 class="h3">Interest groups</h3>
    <div class="groups">{c.groups.map(gr => <div class="group" key={gr.id}><div class="sl-top"><span>{GL[gr.id]} <small>power {pct(gr.power)}</small></span><b class="num">{pct(gr.support)}</b></div><Bar v={gr.support} mark={mood[gr.id]} tone={gr.support < 0.35 ? 'bad' : gr.support > 0.65 ? 'good' : ''} /></div>)}</div>
    <small class="muted">The marker shows where each group's mood is heading under your current policies.</small>
    <h3 class="h3">Ideology</h3>
    <div class="compass"><svg viewBox="-110 -110 220 220" role="img" aria-label="Ideology compass">
      <rect x="-100" y="-100" width="200" height="200" class="cmp-bg" /><line x1="-100" y1="0" x2="100" y2="0" class="cmp-ax" /><line x1="0" y1="-100" x2="0" y2="100" class="cmp-ax" />
      <text x="0" y="-88" class="cmp-t">Order</text><text x="0" y="96" class="cmp-t">Liberty</text><text x="-96" y="4" class="cmp-t" text-anchor="start">Collective</text><text x="96" y="4" class="cmp-t" text-anchor="end">Market</text>
      <circle cx={ex * 90} cy={-au * 90} r="7" class="cmp-dot" style={{ fill: c.color }} />
    </svg></div>
  </div>;
}

function MilitaryTab({ g, c }: { g: Game; c: Country }) {
  const [, force] = useState(0); const upd = () => force(x => x + 1);
  const [msg, setMsg] = useState('');
  const divs = g.w.divisions.filter(d => d.country === c.id);
  const byType: Record<string, number> = {}; divs.forEach(d => (byType[d.type] = (byType[d.type] || 0) + 1));
  const men = divs.reduce((a, d) => a + d.str, 0);
  const mil = c.spending * c.budget.military, free = Math.max(0, mil - c.upkeep);
  const pop = popOf(g.w, c.id);
  const laws: Conscription[] = ['volunteer', 'limited', 'extensive', 'total'];
  return <div class="tab-body">
    <dl class="stat">
      <dt>Divisions</dt><dd>{divs.length} ({fmtBig(men)} men)</dd>
      <dt>Mix</dt><dd>{Object.entries(byType).map(([t, n]) => `${n} ${UNIT_SPEC[t as UnitType].label.toLowerCase()}`).join(', ')}</dd>
      <dt>Upkeep</dt><dd>{fmtMoney(c.upkeep)} / mo</dd>
      <dt>Production funds</dt><dd class={free <= 0 ? 'bad' : ''}>{fmtMoney(free)} / mo</dd>
      <dt>Technology</dt><dd>Level {c.tech}</dd>
    </dl>
    <h3 class="h3">Build</h3>
    <div class="build">{(Object.keys(UNIT_SPEC) as UnitType[]).map(t => { const s = UNIT_SPEC[t];
      return <button key={t} onClick={() => { const e = queueUnit(g.w, c, t); setMsg(e || `${s.label} division queued`); upd(); }} disabled={c.manpower < s.men}>
        <b>{s.label}</b><small>{fmtMoney(c.unitCost * s.costMul)} · {s.days} days · {fmtBig(s.men)} men</small></button>; })}</div>
    {msg && <small class="muted" role="status">{msg}</small>}
    {c.production.length > 0 && <><h3 class="h3">Production queue</h3><ol class="queue">{c.production.map(p => <li key={p.id}><span>{UNIT_SPEC[p.type].label}</span><Bar v={p.progress / p.cost} /><button class="x" aria-label="Cancel" onClick={() => { cancelUnit(g.w, c, p.id); upd(); }}>✕</button></li>)}</ol>
      {free <= 0 && <small class="bad">No production funds: upkeep uses the whole military budget. Raise the military share or borrow.</small>}</>}
    <h3 class="h3">Conscription</h3>
    <div class="seg wrap">{laws.map(l => <button key={l} aria-pressed={c.conscription === l} title={`Up to ${pct(CONSCRIPTION_RATE[l])} of the population (${fmtBig(pop * CONSCRIPTION_RATE[l])})`} onClick={() => {
      if (l === c.conscription) return; const cost = 25 * Math.abs(laws.indexOf(l) - laws.indexOf(c.conscription));
      if (c.polCap < cost) { setMsg(`Needs ${cost} influence`); return; }
      c.polCap -= cost; const harsher = laws.indexOf(l) > laws.indexOf(c.conscription); c.conscription = l; if (harsher) c.stability = Math.max(0, c.stability - (atWar(g.w, c.id) ? 0.02 : 0.08)); setMsg(`Conscription: ${l}`); upd();
    }}>{l[0].toUpperCase() + l.slice(1)}</button>)}</div>
    <small class="muted">Harsher laws cost influence and stability (less in wartime).</small>
    <h3 class="h3">Armies</h3>
    <ul class="armies">{g.w.armies.filter(a => a.country === c.id).map(a => { const n = divs.filter(d => d.army === a.id).length; return <li key={a.id}><b>{a.name}</b><span>Gen. {a.general.name} · {n} div</span><small>{a.general.traits.join(', ')}</small></li>; })}</ul>
  </div>;
}

function ProvincePanel({ g, id }: { g: Game; id: number }) {
  const P = g.s.assets.provinces[id], p = g.w.provinces[id], owner = g.w.countries[p.owner], ctrl = g.w.countries[p.controller];
  const here = g.w.divisions.filter(d => d.prov === id && d.theater < 0);
  return <Sheet g={g} title={<div><div class="h2">{P.name}</div><div class="eyebrow">{owner.name}{p.controller !== p.owner ? ` · occupied by ${ctrl.name}` : ''}</div></div>}>
    <dl class="stat">
      <dt>Terrain</dt><dd style={{ textTransform: 'capitalize' }}>{P.terrain}</dd>
      <dt>Population</dt><dd>{fmtBig(p.pop)}</dd>
      <dt>Output</dt><dd>{fmtMoney(p.gdp)} / yr</dd>
      <dt>Area</dt><dd>{fmtBig(P.area)} km²</dd>
      <dt>Infrastructure</dt><dd>{pct(p.infra)}</dd>
      {p.devastation > 0.01 && <><dt>War damage</dt><dd class="bad">{pct(p.devastation)}</dd></>}
    </dl>
    {here.length > 0 && <><h3 class="h3">Stationed here</h3><ul class="armies">{here.slice(0, 12).map(d => <li key={d.id}><Flag g={g} code={g.w.countries[d.country].code} h={12} /> <span>{d.name}</span></li>)}{here.length > 12 && <li><small>and {here.length - 12} more</small></li>}</ul></>}
  </Sheet>;
}

function CountryPanel({ g, id }: { g: Game; id: number }) {
  const c = g.w.countries[id], me = g.player, r = rel(g.w, id, me);
  const divs = g.w.divisions.filter(d => d.country === id).length;
  const treaties = g.w.treaties.filter(t => (t.a === id && t.b === me) || (t.b === id && t.a === me));
  const bloc = c.bloc ? g.w.blocs[c.bloc] : null;
  return <Sheet g={g} title={<div class="title-row"><Flag g={g} code={c.code} h={22} /><div><div class="h2">{c.name}</div><div class="eyebrow">{govLabel(c)} · {c.leader.title} {c.leader.name}</div></div></div>}>
    <div class="sl-top"><span>Opinion of you</span><b class={`num ${r < -25 ? 'bad' : r > 25 ? 'good' : ''}`}>{r > 0 ? '+' : ''}{r}</b></div>
    <div class="meter rel"><div class="fill" style={{ left: r < 0 ? pct(0.5 + r / 200) : '50%', width: pct(Math.abs(r) / 200), background: r < 0 ? 'var(--bad)' : 'var(--good)' }} /></div>
    <dl class="stat">
      <dt>Economy</dt><dd>{fmtMoney(c.gdp)}</dd>
      <dt>Population</dt><dd>{fmtBig(popOf(g.w, id))}</dd>
      <dt>Military</dt><dd>{divs} divisions</dd>
      <dt>Stability</dt><dd>{pct(c.stability)}</dd>
      {bloc && <><dt>Bloc</dt><dd>{bloc.name}</dd></>}
      {treaties.length > 0 && <><dt>Treaties with you</dt><dd>{treaties.map(t => t.type).join(', ')}</dd></>}
    </dl>
    <div class="traits">{c.leader.traits.map(t => <span class="trait" key={t}>{t}</span>)}</div>
  </Sheet>;
}

function Menu({ g }: { g: Game }) {
  const [msg, setMsg] = useState(''); const [, force] = useState(0);
  const saves = listSaves();
  const close = () => g.st.set({ menu: false });
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, []);
  return <div class="ui modal-wrap" onClick={e => { if (e.target === e.currentTarget) close(); }}>
    <section class="card modal" role="dialog" aria-label="Menu">
      <div class="sheet-head"><div><div class="eyebrow">Paused</div><div class="h2">Menu</div></div><button class="x" aria-label="Close" onClick={close}>✕</button></div>
      <div class="sheet-body">
        <button class="primary" onClick={() => { const err = saveGame(`${g.me.code}-${g.w.day}`, g.w, { country: g.me.name, date: dateStr(g.w) }); setMsg(err || 'Game saved'); force(x => x + 1); }}>Save game</button>
        {msg && <small class="muted" role="status">{msg}</small>}
        {saves.length > 0 && <><h3 class="h3">Load</h3><ul class="saves">{saves.map(sv => <li key={sv.slot}>
          <button onClick={() => { const w = loadGame(sv.slot); if (w) g.replaceWorld(w); else setMsg('That save could not be read'); }}><b>{sv.country}</b><span>{sv.date}</span></button>
          <button class="x" aria-label={`Delete save ${sv.country} ${sv.date}`} onClick={() => { deleteSave(sv.slot); force(x => x + 1); }}>✕</button></li>)}</ul></>}
        <h3 class="h3">Game</h3>
        <button onClick={() => location.reload()}>New game (choose another nation)</button>
        <button onClick={close}>Resume</button>
      </div>
    </section>
  </div>;
}
