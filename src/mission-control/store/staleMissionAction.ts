// ============================================================
// Mission Control — an action for a mission that is not the running one
// ------------------------------------------------------------
// CANCEL_MISSION ends whatever runs (`activeMission: 'none'`) but resets only
// the mission it names. A stale phone Stop naming the other phase (a second tap
// during the sync delay) hid the running mission's overlay and left it active
// with its timer, never to expire, while the log said "Mission stopped".
//
// The reducer AND createLogEntry call this one predicate (the
// isRefusedByShieldLock pattern), so a refused action changes nothing and
// writes no line. Guarded by store/__tests__/mcReducer.stale-mission-action.test.ts.
// ⚠️  Internal to src/mission-control/ only.
// ============================================================

import type { MCAction, MCState } from '../types';

export function isStaleMissionAction(state: MCState, action: MCAction): boolean {
    switch (action.type) {
        case 'CANCEL_MISSION':
            return action.missionPhase !== state.activeMission;
        default:
            return false;
    }
}
