import { describe, it, expect, vi, afterEach } from 'vitest';
import { mcReducer, initialState } from '../mcReducer';
import { MISSED_LOCK_THRESHOLD, isEconomyLocked } from '../missionStreak';
import { createLogEntry } from '../activityLog';
import type { MCAction, MCState } from '../../types';

const NOON = '2026-09-02T12:00:00';
/** Past the default 19:00 evening start — the game window is shut. */
const EVENING = '2026-09-02T19:30:00';
const TODAY = '2026-09-02';

/** Shield broken, tokens in hand, one goal active — the state that must freeze. */
function locked(patch: Partial<MCState> = {}): MCState {
    return {
        ...initialState,
        missedMissionStreak: MISSED_LOCK_THRESHOLD,
        bankCount: 10,
        lastCompletedOrFailedMorningDate: TODAY,
        gameTokens: 3,
        // Case 0 is COMPLETE, because that is the only state in which the UI
        // offers "Use!" — a fixture with an unreached goal made the CONSUME_CASE
        // case pass for the wrong reason and pinned a missing completion guard
        // as correct behaviour. Case 1 is partly filled so deposits/moves have
        // somewhere legal to go.
        cases: initialState.cases.map(c =>
            c.id === 0 ? { ...c, status: 'active' as const, reward: 'movie-popcorn' as const, targetCount: 5, tokenCount: 5 }
            : c.id === 1 ? { ...c, status: 'active' as const, reward: 'campfire' as const, targetCount: 4, tokenCount: 1 }
            : c,
        ),
        ...patch,
    };
}

function open(patch: Partial<MCState> = {}): MCState {
    return locked({ missedMissionStreak: 0, ...patch });
}

/** Shield intact, case 0 holding a COMPLETE quick-game goal — the only state in
 *  which the pedestal offers "Use!". A goal short of its target would make the
 *  refusal tests pass for the wrong reason. */
function withQuickGameGoal(patch: Partial<MCState> = {}): MCState {
    return open({
        cases: initialState.cases.map(c =>
            c.id === 0
                ? { ...c, status: 'active' as const, reward: 'quick-game' as const, targetCount: 1, tokenCount: 1 }
                : c,
        ),
        ...patch,
    });
}

const stamp = (a: MCAction): MCAction => ({ ...a, timestamp: NOON });

// The CHILD's economy — everything they can spend or earn on their own.
// A broken shield freezes all of it.
const FROZEN_ACTIONS: MCAction[] = [
    { type: 'SELECT_CASE', caseId: 2, reward: 'campfire' },
    { type: 'DEPOSIT_TO_CASE', caseId: 1, amount: 2 },
    { type: 'MOVE_TOKEN', from: 'bank', to: 1 },
    { type: 'VACUUM_TO_CASE', caseId: 1 },
    { type: 'CONSUME_CASE', caseId: 0 },
    { type: 'START_GAME' },
    // The earning loop: tapping an activity, and claiming a finished chore.
    { type: 'ADD_RESPONSIBILITY_POINT', taskId: initialState.responsibilities[0].id },
    { type: 'RESET_RESPONSIBILITY', taskId: initialState.responsibilities[0].id, claimTokens: 3 },
];

// The PARENT's tools and the exit. Blocking any of these would either make the
// lock inescapable or take away the adult's override.
const PARENT_ACTIONS: MCAction[] = [
    { type: 'ADD_TOKEN' },
    { type: 'ADD_TOKENS', amount: 3, source: 'manual' },
    { type: 'GRANT_GAME_TOKEN' },
    { type: 'ADJUST_SHIELD', delta: 1 },
];

describe('shield lock — what freezes', () => {
    it.each(FROZEN_ACTIONS.map(a => [a.type, a] as const))(
        'refuses %s outright — nothing moves, earned or spent',
        (_label, action) => {
            const before = locked();
            const after = mcReducer(before, stamp(action));
            expect(after.bankCount).toBe(before.bankCount);
            expect(after.cases).toEqual(before.cases);
            expect(after.gameTokens).toBe(before.gameTokens);
            expect(after.snakeGameActive).toBe(false);
            expect(after.responsibilities).toEqual(before.responsibilities);
        },
    );

    it.each(FROZEN_ACTIONS.map(a => [a.type, a] as const))(
        'writes no activity-log line for the refused %s',
        (_label, action) => {
            // A log entry for a movement that did not happen is worse than no
            // entry — it makes the parent's audit trail lie.
            expect(createLogEntry(stamp(action), locked())).toBeNull();
        },
    );

    it.each(FROZEN_ACTIONS.map(a => [a.type, a] as const))(
        'still allows %s while the shield is intact',
        (_label, action) => {
            const before = open();
            const after = mcReducer(before, stamp(action));
            const moved = after.bankCount !== before.bankCount
                || JSON.stringify(after.cases) !== JSON.stringify(before.cases)
                || after.gameTokens !== before.gameTokens
                || after.snakeGameActive !== before.snakeGameActive
                || JSON.stringify(after.responsibilities) !== JSON.stringify(before.responsibilities);
            expect(moved).toBe(true);
        },
    );
});

describe('shield lock — what keeps working', () => {
    it.each(PARENT_ACTIONS.map(a => [a.type, a] as const))(
        'lets the PARENT %s through while locked — their override must survive',
        (_label, action) => {
            const before = locked();
            const after = mcReducer(before, stamp(action));
            const moved = after.bankCount !== before.bankCount
                || after.gameTokens !== before.gameTokens
                || after.missedMissionStreak !== before.missedMissionStreak;
            expect(moved).toBe(true);
        },
    );

    it('lets the parent remove a token and refund a goal while locked', () => {
        const before = locked();
        expect(mcReducer(before, stamp({ type: 'REMOVE_TOKEN' })).bankCount).toBe(9);
        expect(mcReducer(before, stamp({ type: 'REFUND_CASE', caseId: 0 })).bankCount).toBe(15);
    });

    it('does not confiscate tokens already sitting in a goal', () => {
        expect(locked().cases[0].tokenCount).toBe(5);
        const after = mcReducer(locked(), stamp({ type: 'ADD_TOKEN' }));
        expect(after.cases[0].tokenCount).toBe(5);
    });
});

describe('shield lock — engaging and releasing', () => {
    /** A mission mid-flight for `phase`, with the streak one short of the lock. */
    function aboutToBreak(streak: number): MCState {
        return {
            ...open({ missedMissionStreak: streak }),
            activeMission: 'morning',
            missions: initialState.missions.map(m =>
                m.phase === 'morning' ? { ...m, active: true, startedAt: NOON, durationMins: 30 } : m,
            ),
        };
    }

    it('locks on the sixth consecutive miss and logs why', () => {
        const after = mcReducer(aboutToBreak(5), stamp({ type: 'MARK_MISSION_TIMEOUT', missionPhase: 'morning' }));
        expect(isEconomyLocked(after)).toBe(true);
        expect(after.activityLogs[0].message).toMatch(/Shield broken/);
        expect(after.activityLogs[0].source).toBe('auto');
    });

    it('does not re-log the lock on a seventh miss', () => {
        const brokenAlready = {
            ...aboutToBreak(MISSED_LOCK_THRESHOLD),
            missions: initialState.missions.map(m =>
                m.phase === 'evening' ? { ...m, active: true, startedAt: NOON, durationMins: 30 } : m,
            ),
        };
        const after = mcReducer(brokenAlready, stamp({ type: 'MARK_MISSION_TIMEOUT', missionPhase: 'evening' }));
        expect(after.activityLogs.filter(l => /Shield broken/.test(l.message))).toHaveLength(0);
    });

    it('unlocks on one completed mission and logs the release', () => {
        const after = mcReducer(
            aboutToBreak(MISSED_LOCK_THRESHOLD),
            stamp({ type: 'COMPLETE_MISSION_ROUTINE', missionPhase: 'morning', bonusTokens: 2 }),
        );
        expect(isEconomyLocked(after)).toBe(false);
        expect(after.missedMissionStreak).toBe(0);
        expect(after.activityLogs[0].message).toMatch(/Shield restored/);
    });

    it('does not log a release when the shield was never broken', () => {
        const after = mcReducer(
            aboutToBreak(2),
            stamp({ type: 'COMPLETE_MISSION_ROUTINE', missionPhase: 'morning', bonusTokens: 2 }),
        );
        expect(after.activityLogs.filter(l => /Shield restored/.test(l.message))).toHaveLength(0);
    });

    it('leaves the streak alone when the parent cancels a mission', () => {
        const after = mcReducer(aboutToBreak(4), stamp({ type: 'CANCEL_MISSION', missionPhase: 'morning' }));
        expect(after.missedMissionStreak).toBe(4);
    });
});

describe('quick-game window — enforced in the reducer, not only the UI', () => {
    const running = (state: MCState) => mcReducer(state, stamp({ type: 'START_GAME' })).snakeGameActive;

    it('opens a game between the missions', () => {
        expect(running(open())).toBe(true);
    });

    it('refuses a game before the morning mission has concluded', () => {
        expect(running(open({ lastCompletedOrFailedMorningDate: null }))).toBe(false);
    });

    it('refuses a game once the evening mission has started', () => {
        const evening = { ...open(), timestamp: undefined };
        expect(
            mcReducer(evening, { type: 'START_GAME', timestamp: '2026-09-02T19:30:00' }).snakeGameActive,
        ).toBe(false);
    });

    it('refuses a game while a mission is on screen', () => {
        expect(running(open({ activeMission: 'evening' }))).toBe(false);
    });

    // ---- Redeeming the goal obeys the SAME window as starting the game ----
    // The two used to disagree: "Use!" emptied the case (no refund) and then
    // START_GAME refused, so the goal was destroyed for a game never played.

    it('refuses to redeem a completed quick-game goal once the evening has started', () => {
        // Catches the deletion of the CONSUME_CASE window gate: without it the
        // case is wiped at 19:30 for a game the reducer then refuses.
        const before = withQuickGameGoal();
        const after = mcReducer(before, { type: 'CONSUME_CASE', caseId: 0, timestamp: EVENING });
        expect(after.cases[0].status).toBe('active');
        expect(after.cases[0].reward).toBe('quick-game');
        expect(after.cases[0].tokenCount).toBe(1);
    });

    it('refuses to redeem a quick-game goal before the morning mission has concluded', () => {
        // The other half of the window, and clock-independent: no hour of today
        // opens it until the morning routine has been finished or failed.
        const before = withQuickGameGoal({ lastCompletedOrFailedMorningDate: null });
        const after = mcReducer(before, stamp({ type: 'CONSUME_CASE', caseId: 0 }));
        expect(after.cases[0].status).toBe('active');
        expect(after.cases[0].tokenCount).toBe(1);
    });

    it('redeems the quick-game goal normally inside the window', () => {
        // Positive control: catches a gate that refuses everything, which would
        // make the two tests above pass while the feature is dead.
        const after = mcReducer(withQuickGameGoal(), stamp({ type: 'CONSUME_CASE', caseId: 0 }));
        expect(after.cases[0].status).toBe('empty');
        expect(after.cases[0].reward).toBeNull();
        expect(after.cases[0].tokenCount).toBe(0);
    });

    it('still redeems a NON quick-game goal with the window shut — the gate is narrow', () => {
        // Catches a gate widened to every reward. Movie night has nothing to do
        // with the game window; refusing it at 19:30 would be a new bug.
        const after = mcReducer(open(), { type: 'CONSUME_CASE', caseId: 0, timestamp: EVENING });
        expect(after.cases[0].status).toBe('empty');
        expect(after.cases[0].reward).toBeNull();
        expect(after.cases[0].tokenCount).toBe(0);
    });
});

describe('quick-game window — a refused redemption writes no log line', () => {
    // `createLogEntry` reads the WALL CLOCK (`new Date()`), not the action's
    // timestamp, so these pin the system clock instead of stamping the action.
    afterEach(() => {
        vi.useRealTimers();
    });

    function clockAt(iso: string) {
        vi.useFakeTimers();
        vi.setSystemTime(new Date(iso));
    }

    const consumeAt = (iso: string): MCAction => ({ type: 'CONSUME_CASE', caseId: 0, timestamp: iso });

    it('writes no "Used" line when the evening has already started', () => {
        // Catches the deletion of the window mirror in activityLog.ts. Without
        // it a refused redemption still writes "Used: 🐍 Quick Game −1" into the
        // append-only trail — a token movement the reducer never performed.
        clockAt(EVENING);
        expect(createLogEntry(consumeAt(EVENING), withQuickGameGoal())).toBeNull();
    });

    it('writes no "Used" line before the morning mission has concluded', () => {
        // Same mirror, clock-independent half.
        clockAt(NOON);
        expect(createLogEntry(consumeAt(NOON), withQuickGameGoal({ lastCompletedOrFailedMorningDate: null }))).toBeNull();
    });

    it('does write the "Used" line for a redemption inside the window', () => {
        // Positive control: the mirror must not silence every redemption.
        clockAt(NOON);
        expect(createLogEntry(consumeAt(NOON), withQuickGameGoal())?.message).toMatch(/Used: .*Quick Game/);
    });

    it('still logs a NON quick-game redemption with the window shut', () => {
        // The mirror is exactly as narrow as the reducer gate it mirrors.
        clockAt(EVENING);
        expect(createLogEntry(consumeAt(EVENING), open())?.message).toMatch(/Used: .*Movie/);
    });
});
