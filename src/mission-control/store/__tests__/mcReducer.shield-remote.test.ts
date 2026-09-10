// ============================================================
// Parent-adjustable shields (ADJUST_SHIELD), driven the way the phone
// drives them. Delta is in SEGMENTS: +1 hands a shield back.
// ============================================================

import { describe, it, expect } from 'vitest';
import { mcReducer, initialState } from '../mcReducer';
import { MISSED_LOCK_THRESHOLD, isEconomyLocked, shieldSegmentsLeft } from '../missionStreak';
import { REMOTE_ALLOWED_ACTIONS } from '../../hooks/useRemoteControl';
import { createLogEntry } from '../activityLog';
import type { MCAction, MCState } from '../../types';

const AT = '2026-09-02T12:00:00';
const at = (a: MCAction): MCAction => ({ ...a, timestamp: AT, origin: 'remote', isRemote: true });

const withStreak = (missedMissionStreak: number): MCState => ({ ...initialState, missedMissionStreak });

describe('ADJUST_SHIELD — the parent hands a shield back or takes one', () => {
    it('gives a shield back, which lowers the miss streak', () => {
        const after = mcReducer(withStreak(4), at({ type: 'ADJUST_SHIELD', delta: 1 }));
        expect(after.missedMissionStreak).toBe(3);
        expect(shieldSegmentsLeft(after.missedMissionStreak)).toBe(3);
    });

    it('takes a shield away, which raises the streak', () => {
        const after = mcReducer(withStreak(1), at({ type: 'ADJUST_SHIELD', delta: -1 }));
        expect(after.missedMissionStreak).toBe(2);
    });

    it('unlocks the bank when the parent hands back the last shield', () => {
        const locked = withStreak(MISSED_LOCK_THRESHOLD);
        expect(isEconomyLocked(locked)).toBe(true);
        const after = mcReducer(locked, at({ type: 'ADJUST_SHIELD', delta: 1 }));
        expect(isEconomyLocked(after)).toBe(false);
        // The line must say the PARENT did it, and be attributed to them.
        // It previously read "Shield restored" with source 'auto' — the app
        // taking credit for a person's action, which the attribution rule exists
        // to prevent.
        expect(after.activityLogs[0].message).toMatch(/Shield given back/);
        expect(after.activityLogs[0].source).toBe('remote');
    });

    it('locks the bank when the parent removes the last shield', () => {
        const after = mcReducer(withStreak(MISSED_LOCK_THRESHOLD - 1), at({ type: 'ADJUST_SHIELD', delta: -1 }));
        expect(isEconomyLocked(after)).toBe(true);
        // Must NOT claim missions were missed — nobody missed anything.
        expect(after.activityLogs[0].message).toMatch(/Last shield taken away/);
        expect(after.activityLogs[0].message).not.toMatch(/missions missed/);
        expect(after.activityLogs[0].source).toBe('remote');
    });

    it('clamps at both ends and no-ops rather than churning state', () => {
        const full = withStreak(0);
        expect(mcReducer(full, at({ type: 'ADJUST_SHIELD', delta: 3 })).missedMissionStreak).toBe(0);
        const empty = withStreak(MISSED_LOCK_THRESHOLD);
        expect(mcReducer(empty, at({ type: 'ADJUST_SHIELD', delta: -3 })).missedMissionStreak).toBe(MISSED_LOCK_THRESHOLD);
        // A no-op must return the SAME reference so React and the persist
        // effect bail out instead of writing the blob again.
        expect(mcReducer(full, { type: 'ADJUST_SHIELD', delta: 3 })).toBe(full);
    });

    it('works while the shield is broken — it is a parent action, not a spend', () => {
        const locked = withStreak(MISSED_LOCK_THRESHOLD);
        expect(mcReducer(locked, at({ type: 'ADJUST_SHIELD', delta: 1 })).missedMissionStreak).toBe(5);
    });

    it('is reachable from the phone', () => {
        expect(REMOTE_ALLOWED_ACTIONS.has('ADJUST_SHIELD')).toBe(true);
    });

    it('logs every sub-threshold move, not only the lock transition', () => {
        // applyStreakChange only writes on a CROSSING, so without a
        // createLogEntry case a parent could walk the shield 0 -> 5 from the
        // phone leaving no trace at all.
        const entry = createLogEntry(at({ type: 'ADJUST_SHIELD', delta: -1 }), withStreak(0));
        expect(entry).not.toBeNull();
        expect(entry?.message).toMatch(/Shield taken away/);
        expect(entry?.source).toBe('remote');

        const given = createLogEntry(at({ type: 'ADJUST_SHIELD', delta: 1 }), withStreak(3));
        expect(given?.message).toMatch(/Shield given back/);
    });

    it('writes no line when the delta is clamped away to nothing', () => {
        expect(createLogEntry(at({ type: 'ADJUST_SHIELD', delta: 2 }), withStreak(0))).toBeNull();
        expect(createLogEntry(at({ type: 'ADJUST_SHIELD', delta: -2 }), withStreak(MISSED_LOCK_THRESHOLD))).toBeNull();
    });
});