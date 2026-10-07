// ============================================================
// Mission Control — an action for a mission that is not the running one
// ------------------------------------------------------------
// Every action below acts on the mission it NAMES, not on the running one, and
// the phone names it from each card's broadcast `active` flag, which can be
// stale (a second tap during the sync delay, a tap just after the mission
// expired). CANCEL_MISSION ends whatever runs (`activeMission: 'none'`) but
// resets only the mission it names: a stale Stop naming the other phase hid the
// running mission's overlay and left it active with its timer, never to expire,
// while the log said "Mission stopped". Both Resets set the mission they name
// `active: true` whatever runs, which brought an ended mission back hidden. The
// same card's +/-, whining toggle and task taps changed an ended mission too.
//
// The reducer AND createLogEntry call this one predicate (the
// isRefusedByShieldLock pattern), so a refused action changes nothing and
// writes no line. Guarded by store/__tests__/mcReducer.stale-mission-action.test.ts
// and mcReducer.stale-whining-task.test.ts.
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
        // Strict: both Resets set `active: true` whatever runs. The overlay's 2 s Reset
        // hold, still in progress when its mission ended, made a hidden mission that
        // never expired; a stale phone Reset (plain) did the same. And the end of a
        // mission that is not running means nothing, while the log said "Mission time
        // adjusted" for it. How far a running one's end may move: missionEndAdjust.ts.
        // The phone's "Whining?" and task checklist, picked the same way. TOGGLE_WHINING
        // flips the flag of the mission it names: an un-mark right behind a Stop (which
        // clears the flag) marked it instead, −10 on the gauge for a +2, on an ended
        // mission. COMPLETE_TASK ticked a task of an ended mission, and a Cream tick
        // counted a second application. The desktop sends both only from the running
        // mission's overlay; TaskCard asks this too, so a tap on an exiting card shows
        // no burst. Phase 'none' is the global whining flag, which names no mission.
        case 'TOGGLE_WHINING':
            if (action.missionPhase === 'none') return false;
            return action.missionPhase !== state.activeMission;
        case 'COMPLETE_TASK':
        case 'RESET_MISSION_WITH_TIMER':
        case 'RESET_MISSION':
        case 'ADJUST_MISSION_END':
            return state.activeMission === 'none' || action.missionPhase !== state.activeMission;
        default:
            return false;
    }
}
