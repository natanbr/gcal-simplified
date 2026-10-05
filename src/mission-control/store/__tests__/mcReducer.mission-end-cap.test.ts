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
// The cap: a run may last at most its own length (the window, as Settings set
// it) + MAX_MISSION_EXTENSION_MINS. An adjustment past it is refused, not
// clamped, so the line in the log always names what really moved. A move that
// changes nothing (−5 at the 1-minute floor) is refused too. The reducer and
// createLogEntry both ask adjustedMissionDuration, so a refusal writes no line.
// ============================================================

import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { initialState, mcReducer } from '../mcReducer';
import { createLogEntry } from '../activityLog';
import { MAX_MISSION_EXTENSION_MINS } from '../missionEndAdjust';
import { STORAGE_KEY, loadPersistedState } from '../useMCStore';
import { launchInsideWindow } from '../../hooks/schedulerTestKit';
import type { MCAction, MCState } from '../../types';

const T = '2026-10-01T19:05:00';

function evening(s: MCState) {
    const m = s.missions.find(x => x.phase === 'evening');
    if (!m) throw new Error('no evening');
    return m;
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
    const store = resolve(dirname(fileURLToPath(import.meta.url)), '..');
    it.each(['mcReducer.ts', 'activityLog.ts'])('store/%s calls adjustedMissionDuration(state, action)', (file) => {
        expect(readFileSync(resolve(store, file), 'utf-8')).toMatch(/\badjustedMissionDuration\(state, action\)/);
    });
});
