// ============================================================
// Mission Control — a settings save that moves a mission's start time
// ------------------------------------------------------------
// SET_SETTINGS deactivates the RUNNING mission when its start time changes, or
// its cleared duration would hang the expiry check (open decision, PR 170).
// The reducer and activityLog.ts share these checks, so the log line "… mission
// ended: its start time was changed in Settings" is decided without a second
// reducer pass and cannot disagree with the reducer.
// ⚠️  Internal to src/mission-control/ only.
// ============================================================

import type { MCSettings, MCState } from '../types';
import { isValidHhmm } from './hhmm';

/** A time the reducer refuses (not HH:MM, e.g. a cleared field) is kept, so it is no change. */
export function startTimeChanged(state: MCState, settings: Partial<MCSettings>, phase: 'morning' | 'evening'): boolean {
    const key = phase === 'morning' ? 'morningStartsAt' : 'eveningStartsAt';
    const next = settings[key];
    return isValidHhmm(next) && next !== state.settings[key];
}

/** Whether this save ends the running mission. */
export function reschedulesRunningMission(state: MCState, settings: Partial<MCSettings>): boolean {
    return state.activeMission !== 'none' && startTimeChanged(state, settings, state.activeMission);
}
