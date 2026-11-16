// ============================================================
// Mission Control — the log line for a save that covers an open window
// ------------------------------------------------------------
// A Settings save that puts a window under the clock is never a start
// (savedIntoWindowAt, missionActivity.ts): the scheduler counts that window as
// handled, so nothing starts, no miss is charged and no "skipped" line is
// written. Left silent, a child could skip an unstarted mission with no trace.
// So the save writes one line (owner decision 2026-11-16), decided by the
// stamp's own predicate (opensWindow) over the windows the reducer would
// derive, with no reducer pass. createLogEntry asks it.
// ⚠️  Internal to src/mission-control/ only.
// ============================================================

import type { MCSettings, MCState } from '../types';
import { deriveMissionWindow, withoutInvalidMissionTimes } from './hhmm';
import { opensWindow } from './missionActivity';

type TimedPhase = 'morning' | 'evening';
const LABEL: Record<TimedPhase, string> = { morning: 'Morning', evening: 'Evening' };

/** What the line says and which phase it is for (none when both phases opened). */
export interface CoveredWindowLine {
    message: string;
    colorKey: TimedPhase | undefined;
}

/**
 * The line for a SET_SETTINGS `patch` made at `instant`, or null when it opens no
 * window. Derives the windows as the reducer does (the validated patch, then
 * deriveMissionWindow) and asks opensWindow of each, so it agrees with the stamp.
 */
export function coveredWindowLine(state: MCState, patch: Partial<MCSettings>, instant: string): CoveredWindowLine | null {
    const nextSettings: MCSettings = { ...state.settings, ...withoutInvalidMissionTimes(patch) };
    const opened = state.missions.flatMap(m => {
        const phase = m.phase;
        if (phase === 'none') return [];
        const after = deriveMissionWindow(m, nextSettings);
        return opensWindow(m, state.settings, after, nextSettings, instant) ? [{ phase, startsAt: after.startsAt }] : [];
    });
    if (opened.length === 0) return null;
    if (opened.length === 1) {
        const { phase, startsAt } = opened[0];
        return {
            message: `${LABEL[phase]} mission not started: its ${startsAt} window was already open when Settings was saved (start it from the phone)`,
            colorKey: phase,
        };
    }
    return {
        message: 'Morning and evening missions not started: their windows were already open when Settings was saved (start them from the phone)',
        colorKey: undefined,
    };
}
