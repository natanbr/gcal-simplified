// ============================================================
// Mission Control — a responsibility point press, in the state and in the log
// ------------------------------------------------------------
// The phone's Responsibilities card sends ADD_RESPONSIBILITY_POINT with
// amount 1 (➕) or -1 (➖); the desktop card's +1 sends no amount. The log
// ignored `amount`: a ➖ wrote "Point earned for Recycling" while the count
// went down, and a press that changed nothing (➖ at 0, ➕ on a completed
// one) still wrote a line (QA 2026-10-01). A parent reads this log to see who
// moved what (CLAUDE.md → Attribution), so a wrong or phantom line is a defect.
//
// The reducer and createLogEntry both ask responsibilityPointChange
// (store/responsibilityPoint.ts), so the line is the change that happened.
// ============================================================

import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { initialState, mcReducer } from '../mcReducer';
import { createLogEntry } from '../activityLog';
import { MISSED_LOCK_THRESHOLD } from '../missionStreak';
import { at, renderLiveScheduler } from '../../hooks/schedulerTestKit';
import type { ActivityLogEntry, MCAction, MCState } from '../../types';

const T = '2026-10-06T12:00:00.000Z';
type TaskId = 'recycling' | 'activity';

function task(s: MCState, id: TaskId) {
    const r = s.responsibilities.find(x => x.id === id);
    if (!r) throw new Error(`no ${id}`);
    return r;
}

/** `base` with `points` on the task, complete when they meet its goal (3). */
function withPoints(id: TaskId, points: number, base: MCState = initialState): MCState {
    return {
        ...base,
        responsibilities: base.responsibilities.map(r => (r.id === id
            ? { ...r, pointsEarned: points, completedAt: points >= r.pointsRequired ? T : null }
            : r)),
    };
}

/** The phone's ➕ / ➖, as useRemoteControl dispatches it. */
const phone = (taskId: TaskId, amount: 1 | -1): MCAction =>
    ({ type: 'ADD_RESPONSIBILITY_POINT', taskId, amount, origin: 'remote', isRemote: true, timestamp: T });
/** The desktop card's +1: no amount. */
const desk = (taskId: TaskId): MCAction => ({ type: 'ADD_RESPONSIBILITY_POINT', taskId, timestamp: T });

/** Each action through the log and then the reducer, the way the dispatch interceptor does. */
function press(state: MCState, ...actions: MCAction[]): { state: MCState; lines: ActivityLogEntry[] } {
    const lines: ActivityLogEntry[] = [];
    for (const a of actions) {
        const entry = createLogEntry(a, state);
        if (entry) lines.push(entry);
        state = mcReducer(state, a);
    }
    return { state, lines };
}
const messages = (lines: ActivityLogEntry[]) => lines.map(l => l.message);

describe('the line says what the press really did', () => {
    it('a phone ➕ logs +1 with the new count', () => {
        const { state, lines } = press(withPoints('recycling', 1), phone('recycling', 1));
        expect(task(state, 'recycling').pointsEarned).toBe(2);
        expect(messages(lines)).toEqual(['+1 point for Recycling (2/3)']);
        expect(lines[0]).toMatchObject({ icon: '♻️', type: 'responsibility', colorKey: 'recycling', source: 'remote', isRemote: true });
    });

    it('a phone ➖ logs -1 with the new count (it said "Point earned")', () => {
        const { state, lines } = press(withPoints('recycling', 2), phone('recycling', -1));
        expect(task(state, 'recycling').pointsEarned).toBe(1);
        expect(messages(lines)).toEqual(['-1 point for Recycling (1/3)']);
        expect(lines[0]).toMatchObject({ icon: '♻️', colorKey: 'recycling', source: 'remote' });
    });

    it('the desktop card’s +1 (no amount) logs +1, attributed to this machine', () => {
        const { state, lines } = press(initialState, desk('activity'));
        expect(task(state, 'activity').pointsEarned).toBe(1);
        expect(messages(lines)).toEqual(['+1 point for Activity (1/3)']);
        expect(lines[0]).toMatchObject({ icon: '🛼', type: 'responsibility', colorKey: 'activity', source: 'local' });
    });

    it('the point that meets the goal completes the task, and its line shows the full count', () => {
        const { state, lines } = press(withPoints('activity', 2), desk('activity'));
        expect(task(state, 'activity').completedAt).toBe(T);
        expect(messages(lines)).toEqual(['+1 point for Activity (3/3)']);
    });

    it('a point line moves no token, so it carries no token delta (the balances still ride along)', () => {
        const { lines } = press(withPoints('activity', 1), phone('activity', 1), phone('activity', -1));
        expect(lines.map(l => l.delta)).toEqual([undefined, undefined]);
        expect(lines.every(l => l.bankTokens === initialState.bankCount)).toBe(true);
    });
});

describe('a press that changes nothing writes no line and keeps the same state', () => {
    it('a ➖ at 0 points', () => {
        const { state, lines } = press(initialState, phone('recycling', -1));
        expect(lines).toEqual([]);
        expect(state.responsibilities).toBe(initialState.responsibilities);
    });

    it('a ➕ on a completed responsibility, from the phone or the desktop', () => {
        const done = withPoints('recycling', 3);
        const { state, lines } = press(done, phone('recycling', 1), desk('recycling'));
        expect(lines).toEqual([]);
        expect(state.responsibilities).toBe(done.responsibilities);
    });

    it('a task id that does not exist', () => {
        const { state, lines } = press(initialState, { type: 'ADD_RESPONSIBILITY_POINT', taskId: 'nonexistent', amount: 1, timestamp: T });
        expect(lines).toEqual([]);
        expect(state.responsibilities).toBe(initialState.responsibilities);
    });

    it('returns the very same state object, so nothing re-renders, saves or broadcasts', () => {
        // No timestamp: the mood sync that runs first on a timestamped action is not part of this.
        const done = withPoints('recycling', 3);
        expect(mcReducer(initialState, { type: 'ADD_RESPONSIBILITY_POINT', taskId: 'recycling', amount: -1 })).toBe(initialState);
        expect(mcReducer(done, { type: 'ADD_RESPONSIBILITY_POINT', taskId: 'recycling', amount: 1 })).toBe(done);
    });

    // A path that skips the remote validator must not complete a task in one press either.
    it.each([1e9, -1e9, 2, -2, 0.5, 0, NaN, Infinity])('an amount the phone never sends (%s) is refused by the reducer and the log', amount => {
        const start = withPoints('recycling', 1);
        const tampered = { type: 'ADD_RESPONSIBILITY_POINT', taskId: 'recycling', amount, timestamp: T } as MCAction;
        const { state, lines } = press(start, tampered);
        expect(lines).toEqual([]);
        expect(state.responsibilities).toBe(start.responsibilities);
    });

    it('nothing moves while the shield is broken, from the phone or the desktop (unchanged)', () => {
        const locked = withPoints('recycling', 1, { ...initialState, missedMissionStreak: MISSED_LOCK_THRESHOLD });
        const { state, lines } = press(locked, phone('recycling', 1), phone('recycling', -1), desk('recycling'));
        expect(lines).toEqual([]);
        expect(state.responsibilities).toBe(locked.responsibilities);
    });
});

describe('complete, take one back, earn it again', () => {
    it('logs every real move and nothing else', () => {
        const { state, lines } = press(initialState,
            desk('recycling'), desk('recycling'), desk('recycling'), // complete
            phone('recycling', -1), // the Claim goes away
            phone('recycling', 1), // complete again
            phone('recycling', 1)); // already complete: nothing
        expect(messages(lines)).toEqual([
            '+1 point for Recycling (1/3)',
            '+1 point for Recycling (2/3)',
            '+1 point for Recycling (3/3)',
            '-1 point for Recycling (2/3)',
            '+1 point for Recycling (3/3)',
        ]);
        expect(task(state, 'recycling')).toMatchObject({ pointsEarned: 3, completedAt: T });
    });

    it('a ➖ on a completed task clears its completion and moves no token', () => {
        const done = withPoints('activity', 3);
        const { state } = press(done, phone('activity', -1));
        expect(task(state, 'activity')).toMatchObject({ pointsEarned: 2, completedAt: null });
        expect(state.bankCount).toBe(done.bankCount);
        expect(state.gameTokens).toBe(done.gameTokens);
    });

    it('after a Claim the count is 0, so a ➖ changes nothing and the paid tokens stay', () => {
        const claim: MCAction = { type: 'RESET_RESPONSIBILITY', taskId: 'activity', claimTokens: 3, timestamp: T };
        const { state, lines } = press(withPoints('activity', 3), claim, phone('activity', -1));
        expect(messages(lines)).toEqual(['Activity completed']);
        expect(state.bankCount).toBe(initialState.bankCount + 3);
        expect(task(state, 'activity').pointsEarned).toBe(0);
    });

    it('FINDING, pinned as it is today: a Claim that lands after a ➖ took the task below its goal still pays', () => {
        // RESET_RESPONSIBILITY pays claimTokens whatever the count: only the desktop
        // card hides Claim below the goal, and the phone cannot send it. So the one way
        // here is a Claim tap racing the phone's ➖. Changing it is an economy decision.
        const claim: MCAction = { type: 'RESET_RESPONSIBILITY', taskId: 'activity', claimTokens: 3, timestamp: T };
        const { state, lines } = press(withPoints('activity', 3), phone('activity', -1), claim);
        expect(messages(lines)).toEqual(['-1 point for Activity (2/3)', 'Activity completed']);
        expect(lines[1].delta).toBe(3);
        expect(state.bankCount).toBe(initialState.bankCount + 3);
    });
});

describe('over the real remote channel (useRemoteControl’s validator)', () => {
    afterEach(() => { vi.useRealTimers(); });

    /** Midday, so the scheduler mounted beside the remote listener starts nothing. */
    function launch() {
        vi.useFakeTimers();
        vi.setSystemTime(at(12, 0));
        return renderLiveScheduler(withPoints('recycling', 1), { ipc: true });
    }
    const pointLines = (s: MCState) => s.activityLogs.filter(l => l.type === 'responsibility').map(l => l.message);

    it.each([
        ['1e9', 1e9], ['-2', -2], ['0.5', 0.5], ['0', 0], ['Infinity', Infinity], ['NaN', NaN], ['the string "1"', '1'], ['null', null],
    ])('a payload with amount %s is dropped before the store: nothing changes, no line', (_label, amount) => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const { live, emit, unmount } = launch();
        const before = live.state.responsibilities;
        emit('remote-control:action', { type: 'ADD_RESPONSIBILITY_POINT', taskId: 'recycling', amount });
        expect(warn).toHaveBeenCalledWith('[Remote] Rejected ADD_RESPONSIBILITY_POINT: malformed payload');
        expect(live.state.responsibilities).toBe(before);
        expect(pointLines(live.state)).toEqual([]);
        unmount();
        warn.mockRestore();
    });

    it('the phone’s ➕ and ➖ go through, each with its own line', () => {
        const { live, emit, unmount } = launch();
        emit('remote-control:action', { type: 'ADD_RESPONSIBILITY_POINT', taskId: 'recycling', amount: 1 });
        emit('remote-control:action', { type: 'ADD_RESPONSIBILITY_POINT', taskId: 'recycling', amount: -1 });
        expect(task(live.state, 'recycling').pointsEarned).toBe(1);
        expect(pointLines(live.state)).toEqual(['-1 point for Recycling (1/3)', '+1 point for Recycling (2/3)']); // newest first
        expect(live.state.activityLogs[0].source).toBe('remote');
        unmount();
    });
});

describe('structural: one decision, asked by the reducer and by the log', () => {
    const store = resolve(dirname(fileURLToPath(import.meta.url)), '..');
    it.each(['mcReducer.ts', 'activityLog.ts'])('store/%s calls responsibilityPointChange(state, action)', (file) => {
        expect(readFileSync(resolve(store, file), 'utf-8')).toMatch(/\bresponsibilityPointChange\(state, action\)/);
    });
});
