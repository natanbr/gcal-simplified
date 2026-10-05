// ============================================================
// Mission Control — a mission time repaired at load is logged after load
// ------------------------------------------------------------
// See missionTimeRepair.ts for why. Written here, through the interceptor's
// dispatch, rather than inside loadPersistedState: a line written there would
// never reach the audit trail, because useAuditTrail treats the loaded log as
// already written. Same timing as useGameTokenCapSettle.
//
// Once per launch, before paint (a layout effect), and only when hydration
// reset something: MCStoreProvider mounts it only then, so it does not
// re-render on every store change for the rest of the session.
// ⚠️  Internal to src/mission-control/ only.
// ============================================================

import { useLayoutEffect, useRef } from 'react';
import { useMCDispatch } from './useMCStore';
import { missionTimeRepairLogEntry, type MissionTimeRepair } from './missionTimeRepair';

export function useMissionTimeRepairLog(repairs: readonly MissionTimeRepair[]): void {
    const dispatch = useMCDispatch();
    // StrictMode runs the effect twice; the line describes one load.
    const logged = useRef(false);

    useLayoutEffect(() => {
        if (logged.current) return;
        logged.current = true;
        const log = missionTimeRepairLogEntry(repairs, new Date().toISOString());
        if (log) dispatch({ type: 'ADD_LOG', log, origin: 'system' });
    }, [repairs, dispatch]);
}
