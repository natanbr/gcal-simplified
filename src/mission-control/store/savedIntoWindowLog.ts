// ============================================================
// Mission Control — the log line for a save that covers an open window
// ------------------------------------------------------------
// A Settings save that opens a window already open at the save is never a start
// (savedIntoWindowAt, missionActivity.ts): the scheduler counts that window as
// handled, so nothing starts, no miss is charged and no "skipped" line is
// written. Left silent, a child could skip an unstarted mission with no trace.
// So the save writes one line (owner decision 2026-11-16) for each mission it
// stamped, unless that mission already ran in the window ("not started" would
// be false). Both are read from the state the reducer produces, so the line
// follows the stamp and the scheduler's own answer, not a second reading of the
// old state (a save that moves the start also writes startsAtChangedAt).
// A cheap check comes first: a save that cannot open a window costs no reducer
// pass. createLogEntry asks it.
// ⚠️  Internal to src/mission-control/ only.
// ============================================================

import type { MCAction, MCState } from '../types';
import { deriveMissionWindow, missionDurationMins, withoutInvalidMissionTimes } from './hhmm';
import { mcReducer } from './mcReducer';
import { openOccurrence } from './missionOccurrence';
import { ranOrConcluded, type Phase } from './occurrenceHandled';

const LABEL: Record<Phase, string> = { morning: 'Morning', evening: 'Evening' };

/** What the line says and which phase it is for (none when both phases opened). */
export interface CoveredWindowLine {
    message: string;
    colorKey: Phase | undefined;
}

/**
 * The line for a SET_SETTINGS `action` made at `instant`, or null when the save
 * stamped no mission that had not run in its window.
 */
export function coveredWindowLine(state: MCState, action: Extract<MCAction, { type: 'SET_SETTINGS' }>, instant: string): CoveredWindowLine | null {
    const at = new Date(instant);
    const nextSettings = { ...state.settings, ...withoutInvalidMissionTimes(action.settings) };
    // A superset of what the stamp needs: a changed window with one open at the save.
    const candidates = state.missions.filter(m => {
        if (m.phase === 'none') return false;
        const after = deriveMissionWindow(m, nextSettings);
        const changed = after.startsAt !== m.startsAt || missionDurationMins(after, nextSettings) !== missionDurationMins(m, state.settings);
        return changed && openOccurrence(after, nextSettings, at) !== null;
    });
    if (candidates.length === 0) return null;
    const next = mcReducer(state, action);
    const opened = candidates.flatMap(m => {
        const phase = m.phase;
        const saved = next.missions.find(x => x.phase === phase);
        if (phase === 'none' || saved?.savedIntoWindowAt === undefined || saved.savedIntoWindowAt === m.savedIntoWindowAt) return [];
        const stampMs = Date.parse(saved.savedIntoWindowAt);
        const occurrence = openOccurrence(saved, next.settings, new Date(stampMs));
        if (occurrence === null || ranOrConcluded(next, phase, saved, occurrence, stampMs)) return [];
        return [{ phase, startsAt: saved.startsAt }];
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
