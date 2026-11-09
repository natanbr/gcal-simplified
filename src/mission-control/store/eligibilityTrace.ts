// ============================================================
// Mission Control — Quick-Game Eligibility Trace
// Sends quickGameEligibility, with what happened, to the main process, which
// writes it into the diagnostics folder when the parent chose one and drops it
// otherwise (electron/diagnostics.ts). The gate reads only current state, so
// without this record a past refusal could not be reconstructed.
//
// The picker's trace is the object and the list its render decided with
// (usePickerOpenTrace), never a second read: at 18:59:59.9 a second read is
// another answer. Event-driven only: the picker opening and the locked "+"
// (GoalPedestal), the session start and each mission end (useEligibilityTrace,
// mounted by MCStoreProvider). No timer, no store write, and nothing it does
// can break the app.
// ⚠️  Internal to src/mission-control/ only.
// ============================================================

import { useEffect, useRef } from 'react';
import type { MCState, MissionPhase } from '../types';
import { quickGameEligibility, type QuickGameEligibility } from './quickGameEligibility';

/** How a mission ended, read from what changed: an outcome date moved (completed, or missed when
 *  the run carries its timeout stamp), or the run left the screen with its outcome already
 *  recorded (ended: a timed-out run) or with none (stopped: the phone's Stop, a start time
 *  changed in Settings, a stale run ended at load). */
export type MissionEndCause = 'completed' | 'missed' | 'ended' | 'stopped';

export type EligibilityTraceEvent =
    | { event: 'session-start' }
    /** shownRewards: the reward ids the picker listed, in order (pickerRewards). */
    | { event: 'picker-open'; caseId: number; shownRewards: string[] }
    /** The locked "+" opens no picker: its tap is traced instead. */
    | { event: 'locked-tap'; caseId: number }
    /** endedMission: the mission on screen just before (a timeout records its outcome while it still is). */
    | { event: 'mission-end'; endedMission: MissionPhase; cause: MissionEndCause };

/** Sends an eligibility object as it is: the one a render decided with. */
export function sendEligibilityTrace(eligibility: QuickGameEligibility, what: EligibilityTraceEvent): void {
    const ipc = window.ipcRenderer;
    if (!ipc) return;
    try {
        Promise.resolve(ipc.invoke('diagnostics:trace', { ...eligibility, ...what }))
            .catch(() => { /* best-effort, like the audit trail */ });
    } catch {
        // A bridge that refuses the channel throws synchronously: a trace never breaks the app.
    }
}

/** For the events no render decided anything at: the state as it is now. */
export function traceEligibility(state: MCState, what: EligibilityTraceEvent, nowIso = new Date().toISOString()): void {
    sendEligibilityTrace(quickGameEligibility(state, nowIso), what);
}

/** Once each time the picker opens, with what the render that opened it decided. */
export function usePickerOpenTrace(open: boolean, decided: { eligibility: QuickGameEligibility; caseId: number; shownRewards: string[] }): void {
    // Kept from the render that committed: the effect below runs after it, before any next render.
    const latest = useRef(decided);
    latest.current = decided;
    useEffect(() => {
        if (!open) return;
        const { eligibility, caseId, shownRewards } = latest.current;
        sendEligibilityTrace(eligibility, { event: 'picker-open', caseId, shownRewards });
    }, [open]);
}

function timedOut(state: MCState, phase: MissionPhase): boolean {
    return Boolean(state.missions.find(m => m.phase === phase)?.loggedTimeoutAt);
}

/** One trace at mount, and one each time a mission ends or its outcome is recorded. */
export function useEligibilityTrace(state: MCState): void {
    const stateRef = useRef(state);
    stateRef.current = state;

    const started = useRef(false);
    useEffect(() => {
        if (started.current) return; // StrictMode runs a mount effect twice
        started.current = true;
        traceEligibility(stateRef.current, { event: 'session-start' });
    }, []);

    const activeMission = state.activeMission;
    const morning = state.lastCompletedOrFailedMorningDate;
    const evening = state.lastCompletedOrFailedEveningDate;
    const seen = useRef({ activeMission, morning, evening });
    useEffect(() => {
        const before = seen.current;
        seen.current = { activeMission, morning, evening };
        const runEnded = before.activeMission !== 'none' && activeMission === 'none';
        const outcomePhase: MissionPhase = before.morning !== morning ? 'morning' : before.evening !== evening ? 'evening' : 'none';
        if (!runEnded && outcomePhase === 'none') return;
        const now = stateRef.current;
        const cause: MissionEndCause = outcomePhase !== 'none'
            ? (timedOut(now, outcomePhase) ? 'missed' : 'completed')
            : (timedOut(now, before.activeMission) ? 'ended' : 'stopped');
        traceEligibility(now, { event: 'mission-end', endedMission: before.activeMission, cause });
    }, [activeMission, morning, evening]);
}
