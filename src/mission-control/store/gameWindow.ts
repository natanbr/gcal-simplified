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
import { hhmmToMins } from './hhmm';

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
    // Unreadable config = shut, never open: a cleared time ('') compared as NaN,
    // `nowMins >= NaN` is false, and games stayed open all night; '25:00' is a
    // minute no wall clock reaches, which removed the gate the same way.
    if (eveningStartMins === null) return false;
    // Also covers an inverted overnight config, where the evening start
    // precedes the morning routine.
    if (nowMins >= eveningStartMins) return false;

    return state.lastCompletedOrFailedMorningDate === getLocalDateString(now);
}
