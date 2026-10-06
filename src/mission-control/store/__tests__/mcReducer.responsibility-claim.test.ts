// ============================================================
// Mission Control — the parent's Claim on a responsibility
// ------------------------------------------------------------
// The Claim button dispatches RESET_RESPONSIBILITY. The reducer paid the
// action's claimTokens whatever the count and the task, and the button keeps
// its click handler during its exit animation, so a double tap paid twice
// (bank 3 → 6 → 9, two "Activity completed +3" lines; PR 195 review, on main
// before it). A Claim naming an unknown task paid too, with no line.
//
// Now one decision, responsibilityClaim (store/responsibilityClaim.ts), asked
// by the reducer and the log alike: only a completed task can be claimed, and
// it pays the task's own reward (tokenReward), never a number on the action.
// The double tap through the real panel and framer-motion is in
// components/ResponsibilityPanel.claim.test.tsx.
// ============================================================

import { describe, it, expect } from 'vitest';
import { initialState, mcReducer } from '../mcReducer';
import { createLogEntry } from '../activityLog';
import { MISSED_LOCK_THRESHOLD } from '../missionStreak';
import { storeFileCalls } from './decisionCalls';
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

/** What the Claim button dispatches. */
const claim = (taskId: string): MCAction => ({ type: 'RESET_RESPONSIBILITY', taskId, timestamp: T });
const minus = (taskId: TaskId): MCAction =>
    ({ type: 'ADD_RESPONSIBILITY_POINT', taskId, amount: -1, origin: 'remote', isRemote: true, timestamp: T });
const plus = (taskId: TaskId): MCAction => ({ type: 'ADD_RESPONSIBILITY_POINT', taskId, timestamp: T });

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

describe('a Claim on a completed task', () => {
    it('Activity pays its own reward, 3, and starts over', () => {
        const { state, lines } = press(withPoints('activity', 3), claim('activity'));
        expect(state.bankCount).toBe(initialState.bankCount + 3);
        expect(task(state, 'activity')).toMatchObject({ pointsEarned: 0, completedAt: null });
        expect(messages(lines)).toEqual(['Activity completed']);
        expect(lines[0]).toMatchObject({ icon: '🛼', delta: 3, type: 'responsibility', colorKey: 'activity', source: 'local', bankTokens: initialState.bankCount + 3 });
    });

    it('Recycling has no reward in the app (the bottle-depot money): it starts over and pays nothing', () => {
        const { state, lines } = press(withPoints('recycling', 3), claim('recycling'));
        expect(state.bankCount).toBe(initialState.bankCount);
        expect(task(state, 'recycling')).toMatchObject({ pointsEarned: 0, completedAt: null });
        expect(messages(lines)).toEqual(['Recycling completed']);
        expect(lines[0].delta).toBeUndefined();
    });

    it('pays the task’s reward, not a number a stale build still puts on the action', () => {
        const stale = { type: 'RESET_RESPONSIBILITY', taskId: 'activity', claimTokens: 99, timestamp: T } as MCAction;
        const { state, lines } = press(withPoints('activity', 3), stale);
        expect(state.bankCount).toBe(initialState.bankCount + 3);
        expect(lines[0].delta).toBe(3);
    });
});

describe('a Claim that is refused changes nothing and writes no line', () => {
    it('a second Claim right after the first (the double tap) pays once', () => {
        const { state, lines } = press(withPoints('activity', 3), claim('activity'), claim('activity'));
        expect(state.bankCount).toBe(initialState.bankCount + 3);
        expect(messages(lines)).toEqual(['Activity completed']);
    });

    it('a task below its goal', () => {
        const start = withPoints('activity', 2);
        const { state, lines } = press(start, claim('activity'));
        expect(lines).toEqual([]);
        expect(state.responsibilities).toBe(start.responsibilities);
        expect(state.bankCount).toBe(start.bankCount);
    });

    it('a task that does not exist (it used to add the tokens with no line)', () => {
        const { state, lines } = press(initialState, claim('nonexistent'));
        expect(lines).toEqual([]);
        expect(state.responsibilities).toBe(initialState.responsibilities);
        expect(state.bankCount).toBe(initialState.bankCount);
    });

    it('returns the very same state object for a refusal with no timestamp', () => {
        const start = withPoints('activity', 2);
        expect(mcReducer(start, { type: 'RESET_RESPONSIBILITY', taskId: 'activity' })).toBe(start);
    });

    it('a completed task while the shield is broken (unchanged)', () => {
        const locked = withPoints('activity', 3, { ...initialState, missedMissionStreak: MISSED_LOCK_THRESHOLD });
        const { state, lines } = press(locked, claim('activity'));
        expect(lines).toEqual([]);
        expect(state.bankCount).toBe(locked.bankCount);
        expect(state.responsibilities).toBe(locked.responsibilities);
    });
});

describe('a Claim across the task’s life', () => {
    it('a ➖ that takes a completed task below its goal takes the Claim with it (it used to still pay)', () => {
        const { state, lines } = press(withPoints('activity', 3), minus('activity'), claim('activity'));
        expect(messages(lines)).toEqual(['-1 point for Activity (2/3) — no longer complete']);
        expect(state.bankCount).toBe(initialState.bankCount);
        expect(task(state, 'activity').pointsEarned).toBe(2);
    });

    it('after a Claim the count is 0, so a ➖ changes nothing and the paid tokens stay', () => {
        const { state, lines } = press(withPoints('activity', 3), claim('activity'), minus('activity'));
        expect(messages(lines)).toEqual(['Activity completed']);
        expect(state.bankCount).toBe(initialState.bankCount + 3);
        expect(task(state, 'activity').pointsEarned).toBe(0);
    });

    it('earned again, claimed again: each completion pays once', () => {
        const { state, lines } = press(withPoints('activity', 3),
            claim('activity'), plus('activity'), plus('activity'), plus('activity'), claim('activity'), claim('activity'));
        expect(state.bankCount).toBe(initialState.bankCount + 6);
        expect(messages(lines).filter(m => m === 'Activity completed')).toHaveLength(2);
    });
});

describe('structural: one decision, asked by the reducer and by the log', () => {
    it.each(['mcReducer.ts', 'activityLog.ts'])('store/%s calls responsibilityClaim(state, action) in code', (file) => {
        expect(storeFileCalls(file, 'responsibilityClaim')).toBe(true);
    });
});
