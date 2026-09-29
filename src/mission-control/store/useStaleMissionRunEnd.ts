// ============================================================
// Mission Control — an earlier day's stuck run is ended after load, logged
// ------------------------------------------------------------
// See staleMissionRun.ts for why. Ended here, through END_STALE_MISSION_RUN
// attributed `system`, rather than inside loadPersistedState: a line written
// there would never reach the audit trail, because useAuditTrail treats the
// loaded log as already written. Same pattern as useGameTokenCapSettle.
//
// Once per launch, before paint (a layout effect), and only for a run found at
// load. MCStoreProvider mounts it only then, so it does not re-render on every
// store change for the rest of the session.
// ⚠️  Internal to src/mission-control/ only.
// ============================================================

import { useLayoutEffect, useRef, useState } from 'react';
import { useMCStore, useMCDispatch } from './useMCStore';
import { staleIncompleteRunPhases } from './staleMissionRun';

export function useStaleMissionRunEnd(): void {
    const { state } = useMCStore();
    const dispatch = useMCDispatch();
    const [phasesAtLoad] = useState(() => staleIncompleteRunPhases(state));
    // StrictMode runs the effect twice against the same pre-end state; the
    // interceptor would derive a second log line from it.
    const ended = useRef(false);

    useLayoutEffect(() => {
        if (ended.current) return;
        ended.current = true;
        for (const missionPhase of phasesAtLoad) {
            dispatch({ type: 'END_STALE_MISSION_RUN', missionPhase, origin: 'system' });
        }
    }, [phasesAtLoad, dispatch]);
}
