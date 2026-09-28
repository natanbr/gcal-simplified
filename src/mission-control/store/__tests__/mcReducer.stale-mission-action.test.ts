// ============================================================
// Mission Control — an action for a mission that is not running is refused
// ------------------------------------------------------------
// CANCEL_MISSION sets `activeMission: 'none'` but resets only the mission it
// names. A phone Stop for morning arriving while evening runs (a second tap in
// the sync delay) hid evening's overlay and left it `active` with its timer:
// the expiry check is gated on `activeMission`, so it never expired and no miss
// was counted, while the log said "Mission stopped" (review of 985592f).
//
// `isStaleMissionAction` is the one predicate: the reducer returns the state
// unchanged and `createLogEntry` writes no line, the `isRefusedByShieldLock`
// pattern. The last case pins that both files still call it.
// ============================================================

import { describe, it, expect } from 'vitest';
import { mcReducer, initialState } from '../mcReducer';
import { createLogEntry } from '../activityLog';
import { isStaleMissionAction } from '../staleMissionAction';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { MCAction, MCState, Mission } from '../../types';

const T = '2026-09-28T19:05:00.000Z';

function mission(state: MCState, phase: 'morning' | 'evening'): Mission {
    const m = state.missions.find(x => x.phase === phase);
    if (!m) throw new Error(`no ${phase} mission`);
    return m;
}

const eveningRunning = mcReducer(initialState, { type: 'SET_ACTIVE_MISSION', phase: 'evening', timestamp: T });
const stop = (missionPhase: 'morning' | 'evening'): MCAction =>
    ({ type: 'CANCEL_MISSION', missionPhase, origin: 'remote', isRemote: true, timestamp: T });

describe('a Stop for a mission that is not running', () => {
    it('a stale morning Stop while evening runs leaves evening running, and logs nothing', () => {
        expect(mission(eveningRunning, 'evening').active, 'fixture: evening runs').toBe(true);

        const after = mcReducer(eveningRunning, stop('morning'));

        expect(after.activeMission).toBe('evening');
        expect(mission(after, 'evening').active).toBe(true);
        expect(mission(after, 'evening').startedAt).toBe(mission(eveningRunning, 'evening').startedAt);
        expect(after.missions, 'no mission changed').toBe(eveningRunning.missions);
        expect(createLogEntry(stop('morning'), eveningRunning)).toBeNull();
    });

    it('a Stop with nothing running changes nothing, and logs nothing', () => {
        const after = mcReducer(initialState, stop('morning'));

        expect(after.activeMission).toBe('none');
        expect(after.missions).toBe(initialState.missions);
        expect(createLogEntry(stop('morning'), initialState)).toBeNull();
    });

    it('the matching Stop still stops the running mission, and logs it', () => {
        const after = mcReducer(eveningRunning, stop('evening'));

        expect(after.activeMission).toBe('none');
        expect(mission(after, 'evening').active).toBe(false);
        expect(mission(after, 'evening').startedAt).toBeUndefined();
        expect(createLogEntry(stop('evening'), eveningRunning)).toMatchObject({ message: 'Mission stopped', colorKey: 'evening', source: 'remote' });
    });
});

// The overlay's 2 s Reset hold used to fire for the mission it began on even
// after that mission had ended (expired, or stopped from the phone). The reducer
// then set it active again with nothing running: hidden, never expiring, saved.
// The overlay now drops the hold on a phase change; this is the reducer's half.
describe('a full Reset (tasks + timer) for a mission that is not running', () => {
    const resetWithTimer = (missionPhase: 'morning' | 'evening'): MCAction =>
        ({ type: 'RESET_MISSION_WITH_TIMER', missionPhase, timestamp: T });

    it('with nothing running it changes nothing, and logs nothing', () => {
        const after = mcReducer(initialState, resetWithTimer('morning'));

        expect(mission(after, 'morning').active).toBe(false);
        expect(after.missions).toBe(initialState.missions);
        expect(createLogEntry(resetWithTimer('morning'), initialState)).toBeNull();
    });

    it('while the other mission runs it leaves both alone, and logs nothing', () => {
        const after = mcReducer(eveningRunning, resetWithTimer('morning'));

        expect(mission(after, 'morning').active).toBe(false);
        expect(after.missions).toBe(eveningRunning.missions);
        expect(createLogEntry(resetWithTimer('morning'), eveningRunning)).toBeNull();
    });

    it('for the running mission it still restarts the timer, and logs it', () => {
        const later = { ...resetWithTimer('evening'), timestamp: '2026-09-28T19:20:00.000Z' };
        const after = mcReducer(eveningRunning, later);

        expect(mission(after, 'evening').active).toBe(true);
        expect(mission(after, 'evening').startedAt).toBe('2026-09-28T19:20:00.000Z');
        expect(createLogEntry(later, eveningRunning)).toMatchObject({ message: 'Mission fully reset (tasks + timer)' });
    });

    // The phone's own Reset is plain RESET_MISSION (mc-remote MissionsSection.tsx);
    // it is not part of this refusal and keeps its semantics.
    it('does not cover the plain RESET_MISSION', () => {
        const plain: MCAction = { type: 'RESET_MISSION', missionPhase: 'morning', timestamp: T };
        expect(isStaleMissionAction(initialState, plain)).toBe(false);
    });
});

describe('structural: one predicate, called by the reducer and by the log', () => {
    // A copy of the check in one file drifts from the other; a refusal that the
    // log does not mirror writes a line about a stop that never happened.
    const store = resolve(dirname(fileURLToPath(import.meta.url)), '..');
    it.each(['mcReducer.ts', 'activityLog.ts'])('store/%s calls isStaleMissionAction(state, action)', (file) => {
        expect(readFileSync(resolve(store, file), 'utf-8')).toMatch(/\bisStaleMissionAction\(state, action\)/);
    });
});
