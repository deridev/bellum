import type { AgendaItem, MapStatic, World } from './types';
import { makePeace } from './war/war';
import { say } from './world';

/** Apply the option a country chose on an agenda item. */
export function resolveAgenda(w: World, S: MapStatic, id: number, option: number) {
  const item = w.agenda.find(a => a.id === id); if (!item) return;
  w.agenda = w.agenda.filter(a => a.id !== id);
  const eff = item.options[option]?.effect;
  if (eff === 'peace.accept') { const war = w.wars.find(x => x.id === item.data.war); if (war && !war.ended) makePeace(w, S, war, item.data.side, item.data.terms); }
  else if (eff === 'peace.reject') say(w, `${w.countries[item.country].name} rejects the peace offer`, 'diplo', { who: [item.country] });
  else if (item.data?.apply) item.data.apply(w, option);
}
export function expireAgenda(w: World) { if (w.day % 5) return; w.agenda = w.agenda.filter((a: AgendaItem) => a.expires < 0 || a.expires >= w.day); }
