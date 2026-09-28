// ============================================================
// Mission Control — an action for a mission that is not the running one
// ------------------------------------------------------------
// Both actions below act on the mission they NAME, not on the running one.
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
        // The phone picks the Stop's phase from each mission's broadcast `active`
        // flag, not from activeMission. So with nothing running, a Stop for a
        // mission still `active` (a desynced save) is the only way to clear it
        // and is let through; one for an inactive mission is a stale duplicate.
        case 'CANCEL_MISSION':
            if (state.activeMission === 'none') {
                return !state.missions.some(m => m.phase === action.missionPhase && m.active);
            }
            return action.missionPhase !== state.activeMission;
        // Strict: it sets `active: true` whatever runs. The overlay's 2 s Reset hold,
        // still in progress when its mission ended, made a hidden mission that never expired.
        case 'RESET_MISSION_WITH_TIMER':
            return action.missionPhase !== state.activeMission;
        default:
            return false;
    }
}
