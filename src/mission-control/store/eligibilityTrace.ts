// ============================================================
// Mission Control — Quick-Game Eligibility Trace
// Sends quickGameEligibility, with what happened, to the main process, which
// writes it into the diagnostics folder when the parent chose one and drops it
// otherwise (electron/diagnostics.ts). The gate reads only current state, so
// without this record a past refusal could not be reconstructed.
//
// Event-driven only: a "+" tap (GoalPedestal), the session start and each
// mission end (useEligibilityTrace, mounted by MCStoreProvider). No timer, no
// store write, and nothing it does can break the app.
// ⚠️  Internal to src/mission-control/ only.
// ============================================================

import { useEffect, useRef } from 'react';
import type { MCState, MissionPhase } from '../types';
import { quickGameEligibility } from './quickGameEligibility';

export type EligibilityTraceEvent =
    | { event: 'session-start' }
    /** pickerOpened is false for the locked "+", which opens nothing. */
    | { event: 'plus-tap'; caseId: number; pickerOpened: boolean }
    /** endedMission: the mission on screen just before (a timeout records its outcome while it still is). */
    | { event: 'mission-end'; endedMission: MissionPhase };

export function traceEligibility(state: MCState, what: EligibilityTraceEvent, nowIso = new Date().toISOString()): void {
    const ipc = window.ipcRenderer;
    if (!ipc) return;
    try {
        Promise.resolve(ipc.invoke('diagnostics:trace', { ...quickGameEligibility(state, nowIso), ...what }))
            .catch(() => { /* best-effort, like the audit trail */ });
    } catch {
        // A bridge that refuses the channel throws synchronously: a trace never breaks the app.
    }
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
        if (runEnded || before.morning !== morning || before.evening !== evening) {
            traceEligibility(stateRef.current, { event: 'mission-end', endedMission: before.activeMission });
        }
    }, [activeMission, morning, evening]);
}
