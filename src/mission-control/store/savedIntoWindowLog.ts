// ============================================================
// Mission Control — the log line for a save that covers an open window
// ------------------------------------------------------------
// A Settings save that opens a window, one open at the save and not open at that
// start before, is never a start (savedIntoWindows, missionActivity.ts): the
// scheduler counts that window as handled, so nothing starts, no miss is
// charged and no "skipped" line is written. Left silent, a child could skip an
// unstarted mission with no trace. So the save writes one line (owner decision
// 2026-11-16), naming each mission it covered (both phases share the one line),
// less a mission that already ran in the window ("not started" would be false).
// Which window the save opened is the stamp's own answer (openedWindow,
// missionActivity.ts), asked with the same missions, settings and instant, so
// the line and the stamp cannot disagree. It is never read off the stored list:
// a window covered again keeps its earliest entry, so the list can be unchanged
// by a save that covered it (06:59, then 07:01, then 06:59 at one instant wrote
// no line), and comparing entries cost a pass over every pair of them. Whether
// the mission already ran is read from the state the reducer produces, so it
// follows the scheduler's own answer (a save that moves the start also writes
// startsAtChangedAt).
// A cheap check comes first: a save that cannot open a window costs no reducer
// pass; one that may runs the reducer once here, and a written line runs it once
// more for its balance snapshot (createLogEntry's snap). createLogEntry asks it.
// ⚠️  Internal to src/mission-control/ only.
// ============================================================

import type { MCAction, MCState } from '../types';
import { deriveMissionWindow, missionDurationMins, withoutInvalidMissionTimes } from './hhmm';
import { mcReducer } from './mcReducer';
import { openedWindow } from './missionActivity';
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
    // At `instant`, the instant the stamp is made at.
    const next = mcReducer(state, { ...action, timestamp: instant });
    const opened = candidates.flatMap(m => {
        const phase = m.phase;
        const saved = next.missions.find(x => x.phase === phase);
        const occurrence = saved === undefined ? null : openedWindow(m, state.settings, saved, next.settings, instant);
        if (phase === 'none' || saved === undefined || occurrence === null) return [];
        if (ranOrConcluded(next, phase, saved, occurrence, at.getTime())) return [];
        return [{ phase, startsAt: saved.startsAt }];
    });
    if (opened.length === 0) return null;
    if (opened.length === 1) {
        const { phase, startsAt } = opened[0];
        return {
            message: `${LABEL[phase]} mission not started: its ${startsAt} window was open when Settings was saved (start it from the phone)`,
            colorKey: phase,
        };
    }
    return {
        message: 'Morning and evening missions not started: their windows were open when Settings was saved (start them from the phone)',
        colorKey: undefined,
    };
}
