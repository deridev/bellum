import { hooks } from './step';
import { stepWars } from './war/war';
import { warAI } from './war/ai';
import { expireAgenda } from './agenda';
import { monthlyDiplomacy } from './diplomacy';
import { aiMonthly } from './ai';
import { monthlyEvents } from './events';
let ready = false;
/** Register every system with the daily/monthly step (idempotent). */
export function initSim() {
  if (ready) return; ready = true;
  hooks.daily.push(stepWars, warAI, expireAgenda);
  hooks.monthly.push(monthlyDiplomacy, aiMonthly, monthlyEvents);
}
