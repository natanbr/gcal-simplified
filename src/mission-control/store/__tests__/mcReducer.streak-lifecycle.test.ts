// ============================================================
// Mission streak — real day-over-day occurrences.
//
// Every other streak test injects `missedMissionStreak` (and clears
// `loggedTimeoutAt`) by hand — states the reducer could not actually reach.
// A 975-green suite sat over a counter that capped at 2, because nothing ever
// replayed real occurrences through `mcReducer`.
//
// Rule for this file: build state ONLY by dispatching real actions.
// ============================================================

import { describe, it, expect } from 'vitest';
import { mcReducer, initialState } from '../mcReducer';
import { isEconomyLocked } from '../missionStreak';
import { isQuickGameWindowOpen } from '../gameWindow';
import type { MCState, MissionPhase } from '../../types';

const day = (n: number) => `2026-09-${String(n).padStart(2, '0')}`;

/** One whole occurrence, driven the way the scheduler drives it. */
function runAndMiss(state: MCState, phase: Exclude<MissionPhase, 'none'>, dayNum: number): MCState {
    const start = `${day(dayNum)}T${phase === 'morning' ? '06:00' : '19:00'}:00`;
    const end = `${day(dayNum)}T${phase === 'morning' ? '06:30' : '20:00'}:00`;
    let s = mcReducer(state, { type: 'SET_ACTIVE_MISSION', phase, timestamp: start, origin: 'scheduler' });
    s = mcReducer(s, { type: 'MARK_MISSION_TIMEOUT', missionPhase: phase, timestamp: end, origin: 'scheduler' });
    return mcReducer(s, { type: 'SET_ACTIVE_MISSION', phase: 'none', timestamp: end, origin: 'scheduler' });
}

function runAndComplete(state: MCState, phase: Exclude<MissionPhase, 'none'>, dayNum: number): MCState {
    const start = `${day(dayNum)}T${phase === 'morning' ? '06:00' : '19:00'}:00`;
    const end = `${day(dayNum)}T${phase === 'morning' ? '06:20' : '19:40'}:00`;
    const s = mcReducer(state, { type: 'SET_ACTIVE_MISSION', phase, timestamp: start, origin: 'scheduler' });
    return mcReducer(s, { type: 'COMPLETE_MISSION_ROUTINE', missionPhase: phase, bonusTokens: 2, timestamp: end });
}

describe('mission streak — replayed through real occurrences', () => {
    it('counts every consecutive miss and locks on the sixth', () => {
        let s: MCState = { ...initialState };
        const trace: number[] = [];
        for (let d = 1; d <= 3; d++) {
            s = runAndMiss(s, 'morning', d); trace.push(s.missedMissionStreak);
            s = runAndMiss(s, 'evening', d); trace.push(s.missedMissionStreak);
        }
        // Was [1,2,2,2,2,2] before the SET_ACTIVE_MISSION fix — the shield
        // could never break, which is the whole feature.
        expect(trace).toEqual([1, 2, 3, 4, 5, 6]);
        expect(isEconomyLocked(s)).toBe(true);
    });

    it('advances the outcome date on every miss, not just the first', () => {
        let s: MCState = { ...initialState };
        s = runAndMiss(s, 'morning', 1);
        s = runAndMiss(s, 'morning', 2);
        expect(s.lastCompletedOrFailedMorningDate).toBe('2026-09-02');
    });

    it('keeps the quick-game window open on later days, not only day one', () => {
        let s: MCState = { ...initialState };
        s = runAndMiss(s, 'morning', 1);
        expect(isQuickGameWindowOpen(s, `${day(1)}T10:00:00`)).toBe(true);
        s = runAndMiss(s, 'morning', 2);
        // Regression: the stale stamp froze this date, so games went dark forever.
        expect(isQuickGameWindowOpen(s, `${day(2)}T10:00:00`)).toBe(true);
    });

    it('charges the behaviour penalty on every miss', () => {
        let s: MCState = { ...initialState, behaviorProgress: 100 };
        s = runAndMiss(s, 'morning', 1);
        s = runAndMiss(s, 'morning', 2);
        expect(s.behaviorProgress).toBe(60); // 100 - 20 - 20
    });

    it('one completed mission clears a full streak and unlocks the bank', () => {
        let s: MCState = { ...initialState };
        for (let d = 1; d <= 3; d++) {
            s = runAndMiss(s, 'morning', d);
            s = runAndMiss(s, 'evening', d);
        }
        expect(isEconomyLocked(s)).toBe(true);
        s = runAndComplete(s, 'morning', 4);
        expect(s.missedMissionStreak).toBe(0);
        expect(isEconomyLocked(s)).toBe(false);
    });

    it('is a CONSECUTIVE streak — a completion in the middle resets it', () => {
        let s: MCState = { ...initialState };
        s = runAndMiss(s, 'morning', 1);
        s = runAndMiss(s, 'evening', 1);
        expect(s.missedMissionStreak).toBe(2);
        s = runAndComplete(s, 'morning', 2);
        expect(s.missedMissionStreak).toBe(0);
        s = runAndMiss(s, 'evening', 2);
        expect(s.missedMissionStreak).toBe(1);
    });

    it('never counts the same occurrence twice however many times the timeout fires', () => {
        let s: MCState = { ...initialState };
        s = mcReducer(s, { type: 'SET_ACTIVE_MISSION', phase: 'morning', timestamp: `${day(1)}T06:00:00` });
        for (let i = 0; i < 5; i++) {
            s = mcReducer(s, { type: 'MARK_MISSION_TIMEOUT', missionPhase: 'morning', timestamp: `${day(1)}T06:30:00` });
        }
        expect(s.missedMissionStreak).toBe(1);
    });

    // ---- Decided behaviour, not a bug ----
    // Reset clears `loggedTimeoutAt`, so a reset mission can be missed again the
    // same day: one calendar mission producing two misses is the intended rule,
    // because that is what Reset MEANS — do it again.
    it('lets a parent-reset mission be missed again the same day', () => {
        let s: MCState = { ...initialState };
        s = mcReducer(s, { type: 'SET_ACTIVE_MISSION', phase: 'morning', timestamp: `${day(1)}T06:00:00` });
        s = mcReducer(s, { type: 'MARK_MISSION_TIMEOUT', missionPhase: 'morning', timestamp: `${day(1)}T06:30:00` });
        expect(s.missedMissionStreak).toBe(1);

        s = mcReducer(s, { type: 'RESET_MISSION_WITH_TIMER', missionPhase: 'morning', timestamp: `${day(1)}T06:35:00` });
        s = mcReducer(s, { type: 'MARK_MISSION_TIMEOUT', missionPhase: 'morning', timestamp: `${day(1)}T07:10:00` });
        expect(s.missedMissionStreak).toBe(2);
    });
});

// ============================================================
// Closing the loop: six REAL misses -> spending is actually refused.
//
// Every other refusal test starts from an injected `missedMissionStreak`, so
// the suite proved the predicate and the reducer agree with each other but
// never that a child who actually misses six missions cannot spend. Same rule
// as above: state is built ONLY by dispatching real actions.
// ============================================================
describe('mission streak — the lock a real child would actually hit', () => {
    /** Six real misses, ordered so the LAST one is a MORNING mission. That
     *  leaves the quick-game window open on day 4, so a refused game there can
     *  only be the shield lock and never the window gate. */
    function sixRealMisses(state: MCState): MCState {
        let s = runAndMiss(state, 'evening', 1);
        s = runAndMiss(s, 'morning', 2);
        s = runAndMiss(s, 'evening', 2);
        s = runAndMiss(s, 'morning', 3);
        s = runAndMiss(s, 'evening', 3);
        return runAndMiss(s, 'morning', 4);
    }

    it('freezes a real deposit once the sixth real miss lands', () => {
        // The end-to-end claim the feature actually makes. Catches DEPOSIT_TO_CASE
        // dropping out of the locked set, and any future change that lets the
        // real-miss path reach a streak the lock predicate does not recognise.
        let s: MCState = { ...initialState };
        s = mcReducer(s, { type: 'SELECT_CASE', caseId: 0, reward: 'campfire', timestamp: `${day(1)}T18:00:00` });

        // Control: the same deposit works while the shield still holds.
        s = mcReducer(s, { type: 'DEPOSIT_TO_CASE', caseId: 0, amount: 1, timestamp: `${day(1)}T18:05:00` });
        expect(s.bankCount).toBe(2);
        expect(s.cases[0].tokenCount).toBe(1);

        s = sixRealMisses(s);
        expect(s.missedMissionStreak).toBe(6);
        expect(isEconomyLocked(s)).toBe(true);

        const before = s;
        s = mcReducer(s, { type: 'DEPOSIT_TO_CASE', caseId: 0, amount: 2, timestamp: `${day(4)}T10:00:00` });
        expect(s.bankCount).toBe(before.bankCount);
        expect(s.cases[0].tokenCount).toBe(1);
    });

    it('refuses a real game after six real misses, with the window standing open', () => {
        const s = sixRealMisses({ ...initialState });
        const day4Morning = `${day(4)}T10:00:00`;

        // Asserted FIRST: if the window were shut the refusal below would prove
        // nothing about the lock.
        expect(isQuickGameWindowOpen(s, day4Morning)).toBe(true);
        expect(mcReducer(s, { type: 'START_GAME', timestamp: day4Morning }).snakeGameActive).toBe(false);
    });

    it('leaves a game that is already running alone when the shield breaks mid-play', () => {
        // PINS TODAY BEHAVIOUR so a future edit to the locked set cannot strand
        // the overlay: the sixth miss can land while the child is playing, and
        // END_GAME must still close it. Adding END_GAME to the locked set would
        // leave a game on screen that literally cannot be exited.
        let s: MCState = { ...initialState };
        s = runAndMiss(s, 'morning', 1);
        s = runAndMiss(s, 'evening', 1);
        s = runAndMiss(s, 'morning', 2);
        s = runAndMiss(s, 'evening', 2);
        s = runAndMiss(s, 'morning', 3);
        expect(s.missedMissionStreak).toBe(5);

        s = mcReducer(s, { type: 'START_GAME', timestamp: `${day(3)}T10:00:00` });
        expect(s.snakeGameActive).toBe(true);

        // The evening mission is missed while the game is still up.
        s = runAndMiss(s, 'evening', 3);
        expect(isEconomyLocked(s)).toBe(true);
        expect(s.snakeGameActive).toBe(true);

        s = mcReducer(s, { type: 'END_GAME', timestamp: `${day(3)}T20:05:00` });
        expect(s.snakeGameActive).toBe(false);
    });

    // ---- The third earning channel: the mood gauge ----
    it('freezes mood-gauge accrual while the shield is broken', () => {
        const locked: MCState = {
            ...initialState,
            missedMissionStreak: 6,
            moodWind: 2,                       // best mood = fastest accrual
            behaviorProgress: 40,
            behaviorLastUpdated: `${day(3)}T12:00:00`,
            moodLastResetDate: day(3),
        };
        // A minute of active-window time at the best mood would normally accrue.
        const after = mcReducer(locked, { type: 'SYNC_BEHAVIOR', timestamp: `${day(3)}T12:01:00` });
        expect(after.behaviorProgress).toBe(40);
    });

    it('does not dump the locked period as accrued progress when the shield is restored', () => {
        // The trap: freeze accrual by zeroing the delta but keep advancing the
        // anchor and nothing happens; freeze it by SKIPPING the sync and the
        // anchor goes stale, so unlocking could back-fill days at once. It must
        // do neither — the stale anchor is older than one heartbeat, which the
        // existing gap guard re-anchors with no back-fill.
        const locked: MCState = {
            ...initialState,
            missedMissionStreak: 6,
            moodWind: 2,
            behaviorProgress: 40,
            behaviorLastUpdated: `${day(1)}T12:00:00`,   // three days stale
        };
        const unlocked = mcReducer(locked, { type: 'ADJUST_SHIELD', delta: 1, timestamp: `${day(4)}T12:00:00` });
        expect(isEconomyLocked(unlocked)).toBe(false);

        const afterFirstTick = mcReducer(unlocked, { type: 'SYNC_BEHAVIOR', timestamp: `${day(4)}T12:00:30` });
        // Three days at the best mood would be several tokens' worth.
        expect(afterFirstTick.behaviorProgress).toBe(40);
        expect(afterFirstTick.gameTokens).toBe(initialState.gameTokens);
    });

    it('resumes normal accrual once the shield is back', () => {
        const restored: MCState = {
            ...initialState,
            missedMissionStreak: 0,
            moodWind: 2,
            behaviorProgress: 40,
            behaviorLastUpdated: `${day(3)}T12:00:00`,
            // Already reset today, or the daily mood reset re-anchors and this
            // first tick measures the reset instead of the accrual.
            moodLastResetDate: day(3),
        };
        const after = mcReducer(restored, { type: 'SYNC_BEHAVIOR', timestamp: `${day(3)}T12:01:00` });
        expect(after.behaviorProgress).toBeGreaterThan(40);
    });
});