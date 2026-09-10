// ============================================================
// Mission Control — Quick-Game Availability Window
// Games are playable only in the gap BETWEEN the day's missions:
// from the morning mission concluding until the evening one starts.
//
// Deliberately separate from `isWakingHour` in behaviorSync.ts,
// which spans a wider window (morning START → evening END) and is
// the divisor of the mood-token accrual rate — widening that one
// to serve this rule would silently rescale the token economy.
// ⚠️  Internal to src/mission-control/ only.
// ============================================================

import type { MCState } from '../types';
import { getLocalDateString } from './behaviorSync';

/** Minutes since midnight, or NaN when the string is not HH:MM. Callers must
 *  treat NaN as "shut": clearing the settings time field yields '', and
 *  `nowMins >= NaN` is false, which silently removed the evening gate and left
 *  games open all night. */
function hhmmToMins(hhmm: string): number {
    if (!/^\d{1,2}:\d{2}$/.test(hhmm ?? '')) return Number.NaN;
    const [h, m] = hhmm.split(':').map(Number);
    // Shape alone is not enough: '25:00' parses to 1500, a minute no wall clock
    // reaches, so `nowMins >= 1500` is never true and the gate disappears again.
    if (h > 23 || m > 59) return Number.NaN;
    return h * 60 + m;
}

/**
 * True when a quick game may be started at `nowIso`.
 *
 * Three conditions, all of which the child can see on screen:
 *   1. No mission is running — a game must never cover a live routine.
 *   2. TODAY's morning mission has CONCLUDED, completed OR failed. Failing
 *      already costs a shield segment and behaviour progress; forfeiting the
 *      day's games on top of that was not asked for.
 *   3. The evening mission has not started yet.
 *
 * Condition 2 is DELIBERATELY LITERAL: "the morning window has simply passed"
 * is not enough — opening at 06:30 whether or not the routine ran hands the
 * whole day's games to a child who keeps the app closed until 07:00, deleting
 * the rule. The genuinely-skipped case (machine asleep at 06:00) has a human
 * escape hatch instead: the parent starts the mission by hand from Settings.
 *
 * Does NOT check mood or the game-token balance — separate, older gates that
 * still live at the pedestal.
 */
export function isQuickGameWindowOpen(state: MCState, nowIso: string): boolean {
    if (state.activeMission !== 'none') return false;

    const now = new Date(nowIso);
    const nowMins = now.getHours() * 60 + now.getMinutes();

    const eveningStartMins = hhmmToMins(state.settings.eveningStartsAt);
    // Unreadable config = shut, never open. Also covers an inverted overnight
    // window, where the evening start precedes the morning routine.
    if (!Number.isFinite(eveningStartMins)) return false;
    if (nowMins >= eveningStartMins) return false;

    return state.lastCompletedOrFailedMorningDate === getLocalDateString(now);
}
