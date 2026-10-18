// What the player is playing for, and how the game ended.
import type { Game } from '../game/play';
import { DOMINATION, endDay, goalWar, outputShare, powerScores } from '../sim/victory';
import { sideOf } from '../sim/war/war';
import { countryName, fmtDate, say, t } from '../i18n';
import { Flag, Icon } from './common';
import { cssPct, fmtBig, fmtInt, fmtMoney, pct } from './format';

/** The goals, with progress: a quarter of the world's output, the first power at the end date, and the scenario's great war. */
export function Goals({ g }: { g: Game }) {
  const w = g.w, me = g.player, share = outputShare(w, me), ranks = powerScores(w), rank = ranks.findIndex(x => x.c === me) + 1, gw = goalWar(w), end = endDay(w);
  const side = gw ? sideOf(gw, me) : 0;
  const warState = !gw || !side ? null : gw.ended ? (gw.winner === side ? 'won' : gw.winner ? 'lost' : 'drawn') : (gw.score * side > 20 ? 'winning' : gw.score * side < -20 ? 'losing' : 'even');
  return <section class="goals" aria-label={t('goal.title')}>
    <h3 class="h3"><Icon name="target" size={16} />{t('goal.title')}{w.outcome && <span class={`goal-out o-${w.outcome.kind}`}>{t('end.kind.' + w.outcome.kind)}</span>}</h3>
    <div class="goal" data-tip={t('goal.domHint', { p: pct(DOMINATION) })}><span class="goal-l">{t('goal.domination')}</span><span class="goal-bar"><i style={{ width: cssPct(Math.min(1, share / DOMINATION)) }} /></span><b class="num">{pct(share)} / {pct(DOMINATION)}</b></div>
    <div class="goal" data-tip={t('goal.powerHint')}><span class="goal-l">{t('goal.power', { d: fmtDate(w, end) })}</span>
      <span class="goal-top">{ranks.slice(0, 3).map((x, i) => <span key={x.c} class={x.c === me ? 'me' : ''}><small>{i + 1}</small><Flag s={g.s} code={w.countries[x.c].code} h={12} /></span>)}</span><b class="num">#{rank}</b></div>
    {warState && <div class="goal"><span class="goal-l">{t('goal.war', { war: say(w, gw!.name) })}</span><b class={`goal-st s-${warState}`}>{t('goal.st.' + warState)}</b></div>}
  </section>;
}

/** The end of the game: victory, defeat or the end date, with the nation's story in numbers. The player can play on. */
export function EndScreen({ g }: { g: Game }) {
  const w = g.w, o = w.outcome, c = g.me; if (!o || o.playOn) return null;
  const years = (o.day / 365).toFixed(1), provs = w.provinces.filter(p => p.owner === c.id).length, ranks = powerScores(w).slice(0, 5);
  const playOn = () => { o.playOn = true; g.bump(); };
  return <div class="ui modal-wrap end-wrap"><section class={`plate modal end o-${o.kind}`} role="dialog" aria-label={t('end.kind.' + o.kind)}>
    <div class="end-head"><div class="eyebrow">{fmtDate(w, o.day)}</div><div class="end-title">{t('end.kind.' + o.kind)}</div><p>{t('end.reason.' + o.reason, { c: countryName(w, c.id), n: o.rank ?? 0 })}</p></div>
    <dl class="stat end-stats">
      <dt>{t('end.years')}</dt><dd class="num">{years}</dd>
      <dt>{t('end.provinces')}</dt><dd class="num">{fmtInt(provs)} <small class="muted">({t('end.peak', { n: c.stats.peakProvinces })})</small></dd>
      <dt>{t('end.gdp')}</dt><dd class="num">{fmtMoney(c.gdpStart)} → {fmtMoney(c.gdp)}</dd>
      <dt>{t('end.wars')}</dt><dd class="num">{fmtInt(c.stats.wars)}</dd>
      <dt>{t('end.casualties')}</dt><dd class="num">{fmtBig(c.stats.casualties)}</dd>
    </dl>
    <h3 class="h3">{t('end.powers')}</h3>
    <ol class="end-powers">{ranks.map(x => <li key={x.c} class={x.c === c.id ? 'me' : ''}><Flag s={g.s} code={w.countries[x.c].code} h={14} /><span>{countryName(w, x.c)}</span><b class="num">{pct(x.v)}</b></li>)}</ol>
    <div class="end-acts">
      {c.alive && <button class="primary" onClick={playOn}><Icon name="play" size={14} />{t('end.playOn')}</button>}
      {!c.alive && <button class="primary" onClick={playOn}><Icon name="play" size={14} />{t('end.watch')}</button>}
      <button onClick={() => { playOn(); g.openPanel({ kind: 'chronicle' }); }}><Icon name="chronicle" size={14} />{t('end.chronicle')}</button>
      <button onClick={() => location.reload()}>{t('end.newGame')}</button>
    </div>
  </section></div>;
}
