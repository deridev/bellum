import { hooks } from './step';
import { stepWars } from './war/war';
import { warAI } from './war/ai';
import { expireAgenda } from './agenda';
import { historyDaily } from './history';
import { monthlyDiplomacy } from './diplomacy';
import { aiMonthly } from './ai';
import { monthlyEvents } from './events';
import { checkOutcome, dailyOutcome } from './victory';
import { dailyLandings } from './war/landing';
import { monthlyCrises } from './crises';
let ready = false;
/** Register every system with the daily/monthly step (idempotent). */
export function initSim() {
  if (ready) return; ready = true;
  hooks.daily.push(dailyLandings, stepWars, warAI, expireAgenda, historyDaily, dailyOutcome); // landings resolve before the day's fighting
  hooks.monthly.push(monthlyDiplomacy, aiMonthly, monthlyEvents, monthlyCrises, checkOutcome);
}
