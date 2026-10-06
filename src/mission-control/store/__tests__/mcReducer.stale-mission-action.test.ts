// ============================================================
// Mission Control — an action for a mission that is not running is refused
// ------------------------------------------------------------
// CANCEL_MISSION sets `activeMission: 'none'` but resets only the mission it
// names. A phone Stop for morning arriving while evening runs (a second tap in
// the sync delay) hid evening's overlay and left it `active` with its timer:
// the expiry check is gated on `activeMission`, so it never expired and no miss
// was counted, while the log said "Mission stopped" (review of 985592f).
//
// The same holds for both Resets and for +/- (ADJUST_MISSION_END): each acts on
// the mission it names, and the phone names it from a card that may be stale.
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

// The phone picks the Stop's phase from each mission's broadcast `active` flag
// (mc-remote MissionsSection.tsx), not from `activeMission`. A desynced save
// (`activeMission: 'none'` with a mission still `active`) shows that mission as
// running on the phone, and its Stop is the only way to clear it.
describe('a Stop for a mission stuck active with nothing running', () => {
    const stuck: MCState = {
        ...initialState,
        activeMission: 'none',
        missions: initialState.missions.map(m =>
            m.phase === 'evening' ? { ...m, active: true, startedAt: '2026-09-28T19:00:00.000Z', durationMins: 60 } : m),
    };

    it('the Stop for the stuck mission clears it, and logs one line', () => {
        const after = mcReducer(stuck, stop('evening'));

        expect(mission(after, 'evening').active).toBe(false);
        expect(mission(after, 'evening').startedAt).toBeUndefined();
        expect(createLogEntry(stop('evening'), stuck)).toMatchObject({ message: 'Mission stopped', colorKey: 'evening' });
    });

    it('a Stop for the other, inactive mission changes nothing, and logs nothing', () => {
        const after = mcReducer(stuck, stop('morning'));

        expect(after.missions).toBe(stuck.missions);
        expect(createLogEntry(stop('morning'), stuck)).toBeNull();
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

});

// The phone's own Reset is plain RESET_MISSION (mc-remote MissionsSection.tsx). It
// was left out of the refusal above on the reasoning that the phone sends it only
// for the running mission, but the phone picks the phase from each mission's
// broadcast `active` flag, which can be stale: a second tap in the sync delay, or
// a tap just after the mission expired. The reducer then set the ended mission
// `active: true` with nothing running, the same hidden mission the hold made.
describe('a plain Reset (tasks only) for a mission that is not running', () => {
    const reset = (missionPhase: 'morning' | 'evening'): MCAction =>
        ({ type: 'RESET_MISSION', missionPhase, origin: 'remote', isRemote: true, timestamp: T });

    it('with nothing running it changes nothing', () => {
        const after = mcReducer(initialState, reset('morning'));

        expect(mission(after, 'morning').active).toBe(false);
        expect(after.missions).toBe(initialState.missions);
    });

    it('while the other mission runs it leaves both alone', () => {
        const after = mcReducer(eveningRunning, reset('morning'));

        expect(mission(after, 'morning').active).toBe(false);
        expect(after.missions).toBe(eveningRunning.missions);
    });

    it('for a mission stuck active with nothing running it changes nothing: the Stop is the way out', () => {
        const stuck: MCState = { ...eveningRunning, activeMission: 'none' };
        expect(mcReducer(stuck, reset('evening')).missions).toBe(stuck.missions);
    });

    it('for the running mission it still clears the checklist and keeps the timer', () => {
        const ticked = mcReducer(eveningRunning, { type: 'COMPLETE_TASK', missionPhase: 'evening', taskId: 'shower', timestamp: T });
        const after = mcReducer(ticked, reset('evening'));

        expect(mission(after, 'evening').tasks.every(t => !t.completed)).toBe(true);
        expect(mission(after, 'evening').startedAt).toBe(mission(ticked, 'evening').startedAt);
    });

    it('writes no log line either way (unchanged: a plain Reset has never been logged)', () => {
        expect(createLogEntry(reset('morning'), initialState)).toBeNull();
        expect(createLogEntry(reset('evening'), eveningRunning)).toBeNull();
    });
});

// The phone's +1 / +5 / +10 and −1 / −5 / −10 are ADJUST_MISSION_END for the
// card's phase, picked the same way. The reducer ignored one for a mission that
// was not running, but the log still wrote "⏱️ Mission time adjusted (+5m)" for
// it; and with nothing running it adjusted a mission stuck active.
describe('a time adjustment for a mission that is not running', () => {
    const adjust = (missionPhase: 'morning' | 'evening', deltaMinutes = 5): MCAction =>
        ({ type: 'ADJUST_MISSION_END', missionPhase, deltaMinutes, origin: 'remote', isRemote: true, timestamp: T });

    it('with nothing running it changes nothing, and logs nothing', () => {
        expect(mcReducer(initialState, adjust('morning')).missions).toBe(initialState.missions);
        expect(createLogEntry(adjust('morning'), initialState)).toBeNull();
    });

    it('naming the other mission while one runs, it changes nothing, and logs nothing', () => {
        expect(mcReducer(eveningRunning, adjust('morning')).missions).toBe(eveningRunning.missions);
        expect(createLogEntry(adjust('morning'), eveningRunning)).toBeNull();
    });

    it('for a mission stuck active with nothing running, it changes nothing, and logs nothing', () => {
        const stuck: MCState = { ...eveningRunning, activeMission: 'none' };
        expect(mcReducer(stuck, adjust('evening')).missions).toBe(stuck.missions);
        expect(createLogEntry(adjust('evening'), stuck)).toBeNull();
    });

    it('for the running mission it still moves the end, and logs it', () => {
        const after = mcReducer(eveningRunning, adjust('evening', 10));

        expect(mission(after, 'evening').durationMins).toBe(70);
        expect(createLogEntry(adjust('evening', 10), eveningRunning)).toMatchObject({ message: 'Mission time adjusted (+10m)', source: 'remote' });
    });
});

// What it covers: the Stop, both Resets and +/-. NOT covered, a known gap (a
// product call, review of PR 193): the same stale card's whining toggle and task
// taps (TOGGLE_WHINING, COMPLETE_TASK), which still change an ended mission.
describe('the predicate covers the Stop, both Resets and +/- from a stale phone card', () => {
    it.each(['CANCEL_MISSION', 'RESET_MISSION', 'RESET_MISSION_WITH_TIMER', 'ADJUST_MISSION_END'] as const)(
        '%s naming the other mission while one runs is stale', (type) => {
            const action = (type === 'ADJUST_MISSION_END'
                ? { type, missionPhase: 'morning', deltaMinutes: 5, timestamp: T }
                : { type, missionPhase: 'morning', timestamp: T }) satisfies MCAction;
            expect(isStaleMissionAction(eveningRunning, action)).toBe(true);
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
