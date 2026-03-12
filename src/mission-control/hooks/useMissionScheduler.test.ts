// ============================================================
// Mission Control — useMissionScheduler logic tests
// Tests the pure scheduling logic without needing React DOM.
// Exercises the reducer directly to simulate scheduler behavior.
// ============================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mcReducer, initialState } from '../store/mcReducer';
import type { MCState } from '../types';

// ── Helper: set the clock to a specific time today ────────────────────────────
function setTime(hh: number, mm: number) {
    const now = new Date();
    now.setHours(hh, mm, 0, 0);
    vi.setSystemTime(now);
}

// ── Helper: the same "isToday" check used by the scheduler ───────────────────
function isToday(isoString: string | undefined): boolean {
    if (!isoString) return false;
    const d = new Date(isoString);
    const now = new Date();
    return (
        d.getFullYear() === now.getFullYear() &&
        d.getMonth() === now.getMonth() &&
        d.getDate() === now.getDate()
    );
}

// ── Simulate the scheduler's tick logic pure-ly ───────────────────────────────
function simulateTickOnce(state: MCState): MCState {
    const now = new Date();

    function timeToDate(hhmm: string): Date {
        const [h, m] = hhmm.split(':').map(Number);
        const d = new Date();
        d.setHours(h, m, 0, 0);
        return d;
    }

    let next = state;

    // Activate window check
    for (const m of next.missions) {
        if (m.phase === 'none') continue;
        const start = timeToDate(m.startsAt);
        const end = timeToDate(m.endsAt);
        const withinWindow = now >= start && now < end;
        const alreadyStartedToday = m.startedAt && isToday(m.startedAt);

        if (withinWindow && !alreadyStartedToday && next.activeMission !== m.phase) {
            next = mcReducer(next, { type: 'SET_ACTIVE_MISSION', phase: m.phase as 'morning' | 'evening' });
            break;
        }
    }

    // Deactivation by timer expiry
    if (next.activeMission !== 'none') {
        const activeMission = next.missions.find(m => m.phase === next.activeMission);
        if (activeMission?.startedAt && activeMission.durationMins != null) {
            const elapsedMins = (now.getTime() - new Date(activeMission.startedAt).getTime()) / 60000;
            if (elapsedMins >= activeMission.durationMins) {
                next = mcReducer(next, { type: 'SET_ACTIVE_MISSION', phase: 'none' });
            }
        }
    }

    return next;
}

describe('Scheduler logic — activation', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('activates the morning mission within its time window', () => {
        // Morning default: 06:00-06:30
        setTime(6, 15);
        const state = simulateTickOnce(initialState);
        expect(state.activeMission).toBe('morning');
    });

    it('activates the evening mission within its time window', () => {
        // Evening default: 19:00-20:00
        setTime(19, 30);
        const state = simulateTickOnce(initialState);
        expect(state.activeMission).toBe('evening');
    });

    it('does not activate before the morning window', () => {
        setTime(5, 59);
        const state = simulateTickOnce(initialState);
        expect(state.activeMission).toBe('none');
    });

    it('does not activate after the morning window closes', () => {
        setTime(6, 31);
        const state = simulateTickOnce(initialState);
        expect(state.activeMission).toBe('none');
    });
});

describe('Scheduler logic — no re-trigger guard', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('does not re-trigger after timer expiry', () => {
        setTime(6, 15);
        let state = mcReducer(initialState, { type: 'SET_ACTIVE_MISSION', phase: 'morning' });
        // Simulate timer expiry
        state = mcReducer(state, { type: 'SET_ACTIVE_MISSION', phase: 'none' });

        const afterTick = simulateTickOnce(state);
        expect(afterTick.activeMission).toBe('none');
    });
});

describe('Scheduler logic — timer deactivation', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('deactivates mission when durationMins has elapsed since startedAt', () => {
        setTime(6, 0);
        let state = mcReducer(initialState, { type: 'SET_ACTIVE_MISSION', phase: 'morning' });

        // Advance time past durationMins (30 min default)
        setTime(6, 31);
        state = simulateTickOnce(state);
        expect(state.activeMission).toBe('none');
    });

    it('keeps mission active if duration has not elapsed', () => {
        setTime(6, 0);
        let state = mcReducer(initialState, { type: 'SET_ACTIVE_MISSION', phase: 'morning' });

        // 15 minutes in — still within 30m window
        setTime(6, 15);
        state = simulateTickOnce(state);
        expect(state.activeMission).toBe('morning');
    });
});

// ── simulateTickOnce ─────────────────────────────────────────────────────────────
// For testing the pure functionality of exactly matching the time.
// ──────────────────────────────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function getMsUntilNextTime(now: Date, hhmm: string): number {
    const [h, m] = hhmm.split(':').map(Number);
    const target = new Date(now.getTime());
    target.setHours(h, m, 0, 0);

    if (target.getTime() <= now.getTime()) {
        target.setDate(target.getDate() + 1);
    }

    return target.getTime() - now.getTime();
}

function simulateExactTrigger(state: MCState, currentSimulatedTime: Date): MCState {
    let next = state;

    // Simulate exact trigger matching
    for (const m of next.missions) {
        if (m.phase === 'none') continue;

        // Did we hit the exact start time?
        const [h, min] = m.startsAt.split(':').map(Number);
        if (currentSimulatedTime.getHours() === h && currentSimulatedTime.getMinutes() === min) {
            if (next.activeMission === 'none') {
                next = mcReducer(next, { type: 'SET_ACTIVE_MISSION', phase: m.phase as 'morning' | 'evening' });
            }
        }
    }

    // Deactivation by timer expiry (still polled)
    if (next.activeMission !== 'none') {
        const activeMission = next.missions.find(m => m.phase === next.activeMission);
        if (activeMission?.startedAt && activeMission.durationMins != null) {
            const elapsedMins = (currentSimulatedTime.getTime() - new Date(activeMission.startedAt).getTime()) / 60000;
            if (elapsedMins >= activeMission.durationMins) {
                next = mcReducer(next, { type: 'SET_ACTIVE_MISSION', phase: 'none' });
            }
        }
    }

    return next;
}

describe('Exact Scheduler logic — activation', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('activates the morning mission at the exact time', () => {
        // Morning default: 06:00
        const d = new Date();
        d.setHours(6, 0, 0, 0);
        setTime(6, 0);
        const state = simulateExactTrigger(initialState, d);
        expect(state.activeMission).toBe('morning');
    });

    it('activates the evening mission at the exact time', () => {
        // Evening default: 19:00
        const d = new Date();
        d.setHours(19, 0, 0, 0);
        setTime(19, 0);
        const state = simulateExactTrigger(initialState, d);
        expect(state.activeMission).toBe('evening');
    });

    it('does not activate a minute before', () => {
        const d = new Date();
        d.setHours(5, 59, 0, 0);
        setTime(5, 59);
        const state = simulateExactTrigger(initialState, d);
        expect(state.activeMission).toBe('none');
    });
});

describe('Scheduler logic — no overlap', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('does not overlap if another mission is active', () => {
        const d = new Date();
        d.setHours(19, 0, 0, 0);
        setTime(19, 0);

        const state = mcReducer(initialState, { type: 'SET_ACTIVE_MISSION', phase: 'morning' });

        const afterTick = simulateExactTrigger(state, d);
        // Should STILL be morning, even though Evening triggered!
        expect(afterTick.activeMission).toBe('morning');
    });
});

describe('Scheduler logic — timer deactivation', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('deactivates mission when durationMins has elapsed since startedAt', () => {
        setTime(6, 0);
        let state = mcReducer(initialState, { type: 'SET_ACTIVE_MISSION', phase: 'morning' });

        // Advance time past durationMins (30 min default)
        const d = new Date();
        d.setHours(6, 31, 0, 0);
        setTime(6, 31);
        state = simulateExactTrigger(state, d);
        expect(state.activeMission).toBe('none');
    });

    it('keeps mission active if duration has not elapsed', () => {
        setTime(6, 0);
        let state = mcReducer(initialState, { type: 'SET_ACTIVE_MISSION', phase: 'morning' });

        // 15 minutes in — still within 30m window
        const d = new Date();
        d.setHours(6, 15, 0, 0);
        setTime(6, 15);
        state = simulateExactTrigger(state, d);
        expect(state.activeMission).toBe('morning');
    });
});
