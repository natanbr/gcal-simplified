// ============================================================
// Mission Control — what a stop is, and what it is not
// ------------------------------------------------------------
// A stop (CANCEL_MISSION: the overlay's 2 s hold, or the phone's Stop) ends a
// mission without an outcome. It is not a miss, so the shield does not move,
// and it is not a conclusion, so a stopped morning does not open the
// quick-game window. What it must still leave behind is the fact that today's
// occurrence already ran — `lastActiveAt`, stamped when a run starts and ends —
// or the scheduler starts it again (see useMissionScheduler.stop.test.tsx).
// ============================================================

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mcReducer, initialState } from '../mcReducer';
import { isQuickGameWindowOpen } from '../gameWindow';
import { loadPersistedState, STORAGE_KEY } from '../useMCStore';
import type { MCAction, MCState, Mission } from '../../types';

function isoAt(h: number, m: number): string {
    const d = new Date();
    d.setHours(h, m, 0, 0);
    return d.toISOString();
}

function run(state: MCState, ...actions: MCAction[]): MCState {
    return actions.reduce(mcReducer, state);
}

function mission(state: MCState, phase: 'morning' | 'evening'): Mission {
    const m = state.missions.find(x => x.phase === phase);
    if (!m) throw new Error(`no ${phase} mission`);
    return m;
}

const START_0604: MCAction = { type: 'SET_ACTIVE_MISSION', phase: 'morning', origin: 'scheduler', timestamp: isoAt(6, 4) };
const STOP_0605: MCAction = { type: 'CANCEL_MISSION', missionPhase: 'morning', timestamp: isoAt(6, 5) };

describe('SET_ACTIVE_MISSION stamps the occurrence it starts', () => {
    it.each(['scheduler', 'local', 'remote'] as const)('stamps lastActiveAt from the action, origin %s', (origin) => {
        const state = run(initialState, { type: 'SET_ACTIVE_MISSION', phase: 'evening', origin, timestamp: isoAt(19, 4) });
        // From the action's timestamp, never the clock, so the reducer stays pure.
        expect(mission(state, 'evening').lastActiveAt).toBe(isoAt(19, 4));
        expect(mission(state, 'morning').lastActiveAt).toBeUndefined();
    });

    it('a refused trigger (another mission is running) stamps nothing', () => {
        const morningRunning = run(initialState, START_0604);
        const refused = run(morningRunning, { type: 'SET_ACTIVE_MISSION', phase: 'evening', timestamp: isoAt(6, 10) });
        // Not a reference check: a timestamped action still runs the mood sync.
        expect(refused.activeMission).toBe('morning');
        expect(mission(refused, 'evening').lastActiveAt).toBeUndefined();
        expect(mission(refused, 'morning').lastActiveAt).toBe(isoAt(6, 4));
    });
});

describe('every way a mission ends moves the stamp to the end', () => {
    // So a run started before its window and ended inside it covers that
    // occurrence (useMissionScheduler.early-start.test.tsx).
    it.each<[string, MCAction, string]>([
        ['a stop', STOP_0605, isoAt(6, 5)],
        ['a stop from the phone', { ...STOP_0605, origin: 'remote', isRemote: true }, isoAt(6, 5)],
        ['a completion', { type: 'COMPLETE_MISSION_ROUTINE', missionPhase: 'morning', bonusTokens: 2, timestamp: isoAt(6, 20) }, isoAt(6, 20)],
        ['an expiry', { type: 'SET_ACTIVE_MISSION', phase: 'none', origin: 'scheduler', timestamp: isoAt(6, 30) }, isoAt(6, 30)],
        ['a reschedule of the running phase', { type: 'SET_SETTINGS', settings: { morningStartsAt: '06:45' }, timestamp: isoAt(6, 10) }, isoAt(6, 10)],
    ])('%s', (_label, ending, endedAt) => {
        const ended = run(initialState, START_0604, ending);
        expect(ended.activeMission).toBe('none');
        expect(mission(ended, 'morning').lastActiveAt).toBe(endedAt);
        expect(mission(ended, 'evening').lastActiveAt, 'the other mission did not run').toBeUndefined();
    });

    it('a timeout records the miss but leaves the stamp to the expiry that ends the run', () => {
        const timedOut = run(initialState, START_0604, { type: 'MARK_MISSION_TIMEOUT', missionPhase: 'morning', timestamp: isoAt(6, 30) });
        expect(timedOut.activeMission).toBe('morning');
        expect(mission(timedOut, 'morning').lastActiveAt).toBe(isoAt(6, 4));
    });

    it('an action that neither starts nor ends a mission leaves missions untouched', () => {
        const running = run(initialState, START_0604);
        const after = run(running, { type: 'ADD_TOKEN', origin: 'local', timestamp: isoAt(6, 10) });
        expect(after.missions).toBe(running.missions);
    });
});

describe('a stop is not a miss and not a conclusion', () => {
    it('leaves the shield exactly where it was', () => {
        const withTwoMisses: MCState = { ...initialState, missedMissionStreak: 2 };
        const stopped = run(withTwoMisses, START_0604, STOP_0605);
        expect(stopped.missedMissionStreak).toBe(2);
    });

    it('records no outcome date for either phase', () => {
        const stopped = run(initialState, START_0604, STOP_0605);
        expect(stopped.lastCompletedOrFailedMorningDate).toBeNull();
        expect(stopped.lastCompletedOrFailedEveningDate).toBeNull();
    });

    it('a stopped morning keeps the quick-game window shut, and START_GAME is refused', () => {
        const stopped = run(initialState, START_0604, STOP_0605);
        expect(isQuickGameWindowOpen(stopped, isoAt(10, 0))).toBe(false);

        const afterStart = run(stopped, { type: 'START_GAME', timestamp: isoAt(10, 0) });
        expect(afterStart.snakeGameActive).toBe(false);
    });

    it('a completed morning still opens it — the window reads outcomes, not triggers', () => {
        const done = run(initialState, START_0604, { type: 'COMPLETE_MISSION_ROUTINE', missionPhase: 'morning', bonusTokens: 2, timestamp: isoAt(6, 20) });
        expect(isQuickGameWindowOpen(done, isoAt(10, 0))).toBe(true);
    });
});

describe('the stamp across a restart', () => {
    // Relaunched at 19:10: hydration drops a stamp in the future.
    beforeEach(() => { localStorage.clear(); vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date(isoAt(19, 10))); });
    afterEach(() => { localStorage.clear(); vi.useRealTimers(); });

    function restartWithEvening(patch: Record<string, unknown>): Mission {
        const blob = {
            ...initialState,
            missions: initialState.missions.map(m => (m.phase === 'evening' ? { ...m, ...patch } : m)),
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(blob));
        return mission(loadPersistedState(), 'evening');
    }

    it('is kept, so a relaunch inside the window knows the occurrence already ran', () => {
        expect(restartWithEvening({ lastActiveAt: isoAt(19, 4) }).lastActiveAt).toBe(isoAt(19, 4));
    });

    it.each<[string, unknown]>([
        ['a number', 1234],
        ['an unparseable string', 'yesterday-ish'],
        ['null', null],
    ])('drops %s instead of restoring it', (_label, garbage) => {
        expect(restartWithEvening({ lastActiveAt: garbage }).lastActiveAt).toBeUndefined();
    });

    it('drops a stamp later than now (written under a clock set ahead)', () => {
        expect(restartWithEvening({ lastActiveAt: isoAt(19, 11) }).lastActiveAt).toBeUndefined();
    });

    it('is absent, not invented, on a blob written before the field existed', () => {
        expect(restartWithEvening({}).lastActiveAt).toBeUndefined();
    });
});
