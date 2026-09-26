// ============================================================
// Mission Control — SET_SETTINGS refuses a mission time it cannot parse
// ------------------------------------------------------------
// Clearing Settings → "Auto-trigger at" and pressing Save stored '' as the
// start time and derived `endsAt: 'NaN:NaN'`, which sent the scheduler into a
// once-a-second "mission skipped" loop. An invalid start time is ignored: the
// old value stays, the mission's window stays, and a running mission is NOT
// treated as rescheduled (it keeps its timer). A valid change still applies.
// ============================================================

import { describe, it, expect } from 'vitest';
import { mcReducer, initialState } from '../mcReducer';
import type { MCState, MissionPhase } from '../../types';

function mission(state: MCState, phase: Exclude<MissionPhase, 'none'>) {
    const m = state.missions.find(x => x.phase === phase);
    if (!m) throw new Error(`no ${phase} mission`);
    return m;
}

// Strict HH:MM, 00–23 : 00–59. '6:00' is out because the planned check is
// /^\d{2}:\d{2}$/ plus a range check; an <input type="time"> never emits it.
const INVALID = ['', '06', 'NaN:NaN', '24:00', '12:60', '6:00'];

describe('SET_SETTINGS — an invalid start time is ignored', () => {
    it.each(INVALID)('morningStartsAt %j keeps 06:00 and the 06:00–06:30 window', (bad) => {
        const next = mcReducer(initialState, { type: 'SET_SETTINGS', settings: { morningStartsAt: bad } });

        expect(next.settings.morningStartsAt).toBe('06:00');
        expect(mission(next, 'morning').startsAt).toBe('06:00');
        expect(mission(next, 'morning').endsAt).toBe('06:30');
    });

    it.each(INVALID)('eveningStartsAt %j keeps 19:00 and the 19:00–20:00 window', (bad) => {
        const next = mcReducer(initialState, { type: 'SET_SETTINGS', settings: { eveningStartsAt: bad } });

        expect(next.settings.eveningStartsAt).toBe('19:00');
        expect(mission(next, 'evening').startsAt).toBe('19:00');
        expect(mission(next, 'evening').endsAt).toBe('20:00');
    });

    it('the whole draft the overlay saves: a valid evening applies, the invalid morning is kept', () => {
        const next = mcReducer(initialState, {
            type: 'SET_SETTINGS',
            settings: { ...initialState.settings, morningStartsAt: '', eveningStartsAt: '19:30' },
        });

        expect(next.settings.eveningStartsAt).toBe('19:30');
        expect(mission(next, 'evening').startsAt).toBe('19:30');
        expect(mission(next, 'evening').endsAt).toBe('20:30');
        expect(next.settings.morningStartsAt).toBe('06:00');
        expect(mission(next, 'morning').startsAt).toBe('06:00');
        expect(mission(next, 'morning').endsAt).toBe('06:30');
    });

    it('an invalid time does not stop the running morning mission or wipe its timer', () => {
        const running = mcReducer(initialState, { type: 'SET_ACTIVE_MISSION', phase: 'morning' });
        const before = mission(running, 'morning');
        expect(before.durationMins, 'precondition').toBe(30);

        const next = mcReducer(running, { type: 'SET_SETTINGS', settings: { morningStartsAt: '' } });

        expect(next.activeMission).toBe('morning');
        expect(mission(next, 'morning').active).toBe(true);
        expect(mission(next, 'morning').startedAt).toBe(before.startedAt);
        expect(mission(next, 'morning').durationMins).toBe(30);
    });
});

describe('SET_SETTINGS — valid start times still apply (guard)', () => {
    it('morningStartsAt 07:15 moves the window to 07:15–07:45', () => {
        const next = mcReducer(initialState, { type: 'SET_SETTINGS', settings: { morningStartsAt: '07:15' } });

        expect(next.settings.morningStartsAt).toBe('07:15');
        expect(mission(next, 'morning').startsAt).toBe('07:15');
        expect(mission(next, 'morning').endsAt).toBe('07:45');
    });

    it('a valid change still reschedules a running mission (it stops, to re-trigger at the new time)', () => {
        const running = mcReducer(initialState, { type: 'SET_ACTIVE_MISSION', phase: 'morning' });

        const next = mcReducer(running, { type: 'SET_SETTINGS', settings: { morningStartsAt: '07:15' } });

        expect(next.activeMission).toBe('none');
        expect(mission(next, 'morning').durationMins).toBeUndefined();
    });
});

// The stepper cannot produce these, but SET_SETTINGS is the gate for anything
// that reaches it: a non-finite duration derived `endsAt: 'NaN:NaN'`.
describe('SET_SETTINGS — a duration that is not a real length is ignored', () => {
    it.each([Number.NaN, Number.POSITIVE_INFINITY, 0, -5, 1440])('morningDurationMins %s keeps 30 and the 06:00–06:30 window', bad => {
        const next = mcReducer(initialState, { type: 'SET_SETTINGS', settings: { morningDurationMins: bad } });

        expect(next.settings.morningDurationMins).toBe(30);
        expect(mission(next, 'morning').endsAt).toBe('06:30');
    });

    it('guard: 45 and the 10-second test duration still apply', () => {
        const next = mcReducer(initialState, { type: 'SET_SETTINGS', settings: { eveningDurationMins: 45 } });
        expect(next.settings.eveningDurationMins).toBe(45);
        expect(mission(next, 'evening').endsAt).toBe('19:45');

        const test = mcReducer(initialState, { type: 'SET_SETTINGS', settings: { morningDurationMins: 10 / 60 } });
        expect(test.settings.morningDurationMins).toBe(10 / 60);
    });
});
