// ============================================================
// Mission Control — a new attempt at a mission
// ------------------------------------------------------------
// What every new attempt resets: a start (SET_ACTIVE_MISSION's fresh start, by
// the scheduler, by hand or from the phone) and a full Reset
// (RESET_MISSION_WITH_TIMER, a second attempt at the same occurrence). One
// definition, so the two cannot drift. The occurrence's day is NOT here: a
// start decides it (occurrenceDay.ts), a full Reset keeps it.
// ⚠️  Internal to src/mission-control/ only.
// ============================================================

import type { MCSettings, Mission } from '../types';
import { missionDurationMins } from './hhmm';

export function freshAttempt(m: Mission, settings: MCSettings, nowIso: string): Partial<Mission> {
    const durationMins = missionDurationMins(m, settings); // no minimum: allows sub-minute test durations
    return {
        active: true,
        startedAt: nowIso,
        durationMins,
        baseDurationMins: durationMins, // the +/- cap counts from it, not from a later Settings save
        loggedTimeoutAt: undefined, // a fresh attempt: a stale stamp capped the streak at 2
        whiningDetected: false,
        whiningLocked: false,
    };
}
