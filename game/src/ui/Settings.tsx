import type { Session } from '../game/session';
import type { Game } from '../game/play';
import { prefs } from '../game/settings';
import { useStore } from '../game/store';
import { getLang, LANGS, setLang, t } from '../i18n';
import { pct } from './format';
import { Seg, Slider } from './common';

export function Settings({ g }: { s?: Session; g?: Game }) {
  const p = useStore(prefs, x => x);
  return <div class="settings">
    <div class="field"><span class="eyebrow">{t('set.language')}</span><Seg label={t('set.language')} value={getLang()} options={LANGS.map(l => ({ v: l.id, label: l.label }))} onPick={setLang} /></div>
    <div class="field"><span class="eyebrow">{t('set.sound')}</span>
      <Seg label={t('set.sound')} value={p.muted ? 'off' : 'on'} options={[{ v: 'on', label: t('set.on') }, { v: 'off', label: t('set.off') }]} onPick={v => prefs.set({ muted: v === 'off' })} />
      <Slider id="volume" label={t('set.volume')} value={p.volume} min={0} max={1} step={0.05} fmt={pct} onInput={v => prefs.set({ volume: v, muted: false })} /></div>
    {g && <div class="field"><span class="eyebrow">{t('set.turns')}</span>
      <Seg label={t('set.turns')} value={g.st.get().turnMode} options={[{ v: 'continuous', label: t('set.continuous') }, { v: 'monthly', label: t('set.monthly') }]} onPick={v => g.setTurnMode(v)} />
      <small class="muted">{t('set.turnsHint')}</small></div>}
    <div class="field"><span class="eyebrow">{t('set.pauseOn')}</span>
      <Seg label={t('set.pauseOn')} value={p.pauseOn} options={(['big', 'all', 'never'] as const).map(v => ({ v, label: t('set.pauseOn.' + v) }))} onPick={v => prefs.set({ pauseOn: v as 'big' })} />
      <small class="muted">{t('set.pauseOnHint')}</small></div>
  </div>;
}
