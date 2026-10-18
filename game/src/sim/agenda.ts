import type { AgendaItem, MapStatic, World } from './types';
import { msg } from './types';
import { makePeace } from './war/war';
import { addRel, say } from './world';
import { DIPLO, doDiplo, type DiploAction } from './diplomacy';
import { applyEvent } from './events';

/** Apply the option a country chose on an agenda item. */
export function resolveAgenda(w: World, S: MapStatic, id: number, option: number) {
  const item = w.agenda.find(a => a.id === id); if (!item) return;
  w.agenda = w.agenda.filter(a => a.id !== id);
  const eff = item.options[option]?.effect;
  if (eff === 'peace.accept') { const war = w.wars.find(x => x.id === item.data.war); if (war && !war.ended) makePeace(w, S, war, item.data.side, item.data.terms); }
  else if (eff === 'peace.reject') say(w, msg('log.peaceRejected', { c: { c: item.country } }), 'diplo', { who: [item.country] });
  else if (eff === 'diplo.accept') { const { from, act } = item.data; doDiplo(w, from, item.country, act); w.countries[from].polCap += DIPLO[act as DiploAction].cost; }
  else if (eff === 'diplo.decline') addRel(w, item.data.from, item.country, -5, false);
  else if (eff?.startsWith('event.')) applyEvent(w, item, option);
}
export function expireAgenda(w: World) { if (w.day % 5) return; w.agenda = w.agenda.filter((a: AgendaItem) => a.expires < 0 || a.expires >= w.day); }
