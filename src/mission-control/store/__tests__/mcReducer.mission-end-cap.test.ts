// ============================================================
// Mission Control — how far a running mission's end may move
// ------------------------------------------------------------
// ADJUST_MISSION_END (the phone's +1 / +5 / +10 and −1 / −5 / −10, the overlay's
// ±5 bar hold) had a floor of 1 minute and no ceiling. One stale or tampered
// payload ({ deltaMinutes: 1e9 } is finite, so the validator lets it through)
// gave the mission a duration it would never reach: no other mission could
// start, games stayed shut, and the 15 s expiry check ran on the idle Calendar
// for good, all saved across a restart.
//
// The cap: a run may last at most its length when it started (or was fully
// reset; a later Settings save does not move it) + MAX_MISSION_EXTENSION_MINS,
// compared in whole seconds. An adjustment past it is refused, not clamped. A
// move that changes nothing (−5 at the 1-minute floor) and a minus press that
// would LENGTHEN a sub-minute test run are refused too. The log names the move
// that really happened (−10 on a 5-min run is −4). The reducer and
// createLogEntry both ask adjustedMissionEnd, so a refusal writes no line.
// ============================================================

import { describe, it, expect, vi, afterEach } from 'vitest';
import { initialState, mcReducer } from '../mcReducer';
import { createLogEntry } from '../activityLog';
import { MAX_MISSION_EXTENSION_MINS } from '../missionEndAdjust';
import { STORAGE_KEY, loadPersistedState } from '../useMCStore';
import { launchInsideWindow } from '../../hooks/schedulerTestKit';
import { storeFileCalls } from './decisionCalls';
import type { MCAction, MCState } from '../../types';

const T = '2026-10-01T19:05:00';

function evening(s: MCState) {
    const m = s.missions.find(x => x.phase === 'evening');
    if (!m) throw new Error('no evening');
    return m;
}

/** The evening with these settings, started at `startsAt` on 2026-10-01. */
function startedEvening(settings: Partial<MCState['settings']>, startsAt = '19:00'): MCState {
    const configured = mcReducer(initialState, { type: 'SET_SETTINGS', settings: { eveningStartsAt: startsAt, ...settings } });
    return mcReducer(configured, { type: 'SET_ACTIVE_MISSION', phase: 'evening', timestamp: `2026-10-01T${startsAt}:00` });
}

/** The default evening (19:00, 60 min) started at 19:00. */
const running = mcReducer(initialState, { type: 'SET_ACTIVE_MISSION', phase: 'evening', timestamp: '2026-10-01T19:00:00' });
const adjust = (deltaMinutes: number): MCAction =>
    ({ type: 'ADJUST_MISSION_END', missionPhase: 'evening', deltaMinutes, origin: 'remote', isRemote: true, timestamp: T });

/** Applies each adjustment through the reducer and the log, the way the interceptor does. */
function press(state: MCState, ...deltas: number[]): { state: MCState; lines: string[] } {
    const lines: string[] = [];
    for (const d of deltas) {
        const entry = createLogEntry(adjust(d), state);
        if (entry) lines.push(entry.message);
        state = mcReducer(state, adjust(d));
    }
    return { state, lines };
}

describe('the cap is the mission’s own length + 60 min', () => {
    it('is what the constant says', () => {
        expect(MAX_MISSION_EXTENSION_MINS).toBe(60);
        expect(evening(running).durationMins, 'fixture: the 60-min evening').toBe(60);
    });

    it('a +10 inside the cap moves the end, and logs it', () => {
        const { state, lines } = press(running, 10);
        expect(evening(state).durationMins).toBe(70);
        expect(lines).toEqual(['Mission time adjusted (+10m)']);
    });

    it('six +10s reach the cap exactly, all accepted', () => {
        const { state, lines } = press(running, 10, 10, 10, 10, 10, 10);
        expect(evening(state).durationMins).toBe(120);
        expect(lines).toHaveLength(6);
    });
});

describe('what the cap refuses', () => {
    const atCap = press(running, 10, 10, 10, 10, 10, 10).state;

    it('a +1 at the cap changes nothing, and logs nothing', () => {
        const { state, lines } = press(atCap, 1);
        expect(state.missions).toBe(atCap.missions);
        expect(lines).toEqual([]);
    });

    it('a +10 that would pass the cap is refused whole, not clamped', () => {
        const near = press(running, 10, 10, 10, 10, 10, 5).state; // 115
        const { state, lines } = press(near, 10);
        expect(evening(state).durationMins).toBe(115);
        expect(lines).toEqual([]);
    });

    it('a tampered +1e9 is refused', () => {
        const { state, lines } = press(running, 1e9);
        expect(state.missions).toBe(running.missions);
        expect(lines).toEqual([]);
    });

    it('a −5 at the 1-minute floor changes nothing, and logs nothing', () => {
        const floor = press(running, -999).state;
        expect(evening(floor).durationMins, 'precondition: at the floor').toBe(1);
        const { state, lines } = press(floor, -5);
        expect(state.missions).toBe(floor.missions);
        expect(lines).toEqual([]);
    });

    it('a run saved over the cap (before it existed) may still be shortened, never lengthened', () => {
        const over: MCState = { ...running, missions: running.missions.map(m => (m.phase === 'evening' ? { ...m, durationMins: 500 } : m)) };
        expect(evening(press(over, -10).state).durationMins).toBe(490);
        expect(press(over, 1).state.missions).toBe(over.missions);
    });

    it('the 10-second test duration gets the same 60 min on top', () => {
        const tiny = mcReducer(mcReducer(initialState, { type: 'SET_SETTINGS', settings: { eveningDurationMins: 1 / 6 } }),
            { type: 'SET_ACTIVE_MISSION', phase: 'evening', timestamp: '2026-10-01T19:00:00' });
        const { state } = press(tiny, 10, 10, 10, 10, 10, 10);
        expect(evening(state).durationMins).toBeCloseTo(60 + 1 / 6);
        expect(press(state, 1).state.missions).toBe(state.missions);
    });

    // The cap is compared in whole seconds: the 10 s window's end carries a float
    // tail, and at these start times the sum landed 1 ulp over length + 60.
    it.each([
        ['00:00', [5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5]],
        ['00:05', [10, 10, 10, 10, 10, 10]],
    ])('a 10 s evening at %s reaches length + 60 exactly', (startsAt, deltas) => {
        const { state, lines } = press(startedEvening({ eveningDurationMins: 1 / 6 }, startsAt), ...deltas);
        expect(lines).toHaveLength(deltas.length);
        expect(press(state, 1).lines, 'and not a second further').toEqual([]);
    });

    it('a minus press that would LENGTHEN a sub-minute run is refused', () => {
        const tiny = startedEvening({ eveningDurationMins: 1 / 6 });
        const { state, lines } = press(tiny, -1);
        expect(state.missions).toBe(tiny.missions);
        expect(lines).toEqual([]);
    });
});

describe('the log names the move that really happened', () => {
    it('−10 on a 5-min run moves 4 min, and says −4m', () => {
        const { state, lines } = press(startedEvening({ eveningDurationMins: 5 }), -10);
        expect(evening(state).durationMins).toBe(1);
        expect(lines).toEqual(['Mission time adjusted (-4m)']);
    });

    it('three −10s on a 30-min run: the last moves 9', () => {
        const { lines } = press(startedEvening({ eveningDurationMins: 30 }), -10, -10, -10);
        expect(lines).toEqual(['Mission time adjusted (-10m)', 'Mission time adjusted (-10m)', 'Mission time adjusted (-9m)']);
    });

    it('a move of less than a whole minute is named in seconds', () => {
        // 10 s + 1 min = 70 s; −5 then stops at the 60 s floor: a 10-second move.
        const { lines } = press(startedEvening({ eveningDurationMins: 1 / 6 }), 1, -5);
        expect(lines).toEqual(['Mission time adjusted (+1m)', 'Mission time adjusted (-10s)']);
    });
});

describe('the cap counts from the run’s own length, not from a later Settings save', () => {
    it('saving a 10 s duration mid-run does not shut the 60-min run’s extra hour', () => {
        const saved = mcReducer(running, { type: 'SET_SETTINGS', settings: { eveningDurationMins: 1 / 6 }, timestamp: T });
        expect(evening(saved).durationMins, 'precondition: the run keeps its length').toBe(60);
        expect(press(saved, 10, 10, 10, 10, 10, 10).lines).toHaveLength(6);
    });

    it('saving 120 min mid-run does not give the 60-min run a second extra hour', () => {
        const saved = mcReducer(running, { type: 'SET_SETTINGS', settings: { eveningDurationMins: 120 }, timestamp: T });
        const { state, lines } = press(saved, 10, 10, 10, 10, 10, 10, 10);
        expect(evening(state).durationMins).toBe(120);
        expect(lines).toHaveLength(6);
    });

    it('a run saved before the base length existed counts from its window, as before', () => {
        const older: MCState = { ...running, missions: running.missions.map(m => ({ ...m, baseDurationMins: undefined })) };
        expect(press(older, 10, 10, 10, 10, 10, 10, 10).lines).toHaveLength(6);
    });
});

describe('the cap across the mission’s life', () => {
    afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); localStorage.removeItem(STORAGE_KEY); delete window.ipcRenderer; });

    it('a full Reset restarts at the window’s length, so the 60 min are there again', () => {
        const atCap = press(running, 10, 10, 10, 10, 10, 10).state;
        const reset = mcReducer(atCap, { type: 'RESET_MISSION_WITH_TIMER', missionPhase: 'evening', timestamp: '2026-10-01T20:30:00' });
        expect(evening(reset).durationMins).toBe(60);
        expect(evening(press(reset, 10).state).durationMins).toBe(70);
    });

    it('still at the cap after a relaunch', () => {
        const atCap = press(running, 10, 10, 10, 10, 10, 10).state;
        localStorage.setItem(STORAGE_KEY, JSON.stringify(atCap));
        const reloaded = loadPersistedState();
        expect(evening(reloaded).durationMins, 'precondition: restored as saved').toBe(120);

        const { state, lines } = press(reloaded, 5);
        expect(state.missions).toBe(reloaded.missions);
        expect(lines).toEqual([]);
    });

    it('a +1e9 over the real remote channel changes nothing and writes no line', () => {
        vi.useFakeTimers();
        const { live, emit, unmount } = launchInsideWindow('evening', { ...initialState }, { ipc: true });
        const before = live.state.missions;
        emit('remote-control:action', { type: 'ADJUST_MISSION_END', missionPhase: 'evening', deltaMinutes: 1e9 });

        expect(live.state.missions).toBe(before);
        expect(live.state.activityLogs.some(l => l.message.startsWith('Mission time adjusted'))).toBe(false);
        unmount();
    });
});

describe('structural: one decision, asked by the reducer and by the log', () => {
    // Read by the parser (decisionCalls.ts): the text match was satisfied by a comment.
    it.each(['mcReducer.ts', 'activityLog.ts'])('store/%s calls adjustedMissionEnd(state, action)', (file) => {
        expect(storeFileCalls(file, 'adjustedMissionEnd')).toBe(true);
    });
});
