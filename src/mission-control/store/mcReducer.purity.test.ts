// ============================================================
// Reducer purity — CLAUDE.md → Conventions → "mcReducer.ts is a pure reducer,
// no side effects"
// ------------------------------------------------------------
// Another declared-but-unenforced rule. Purity matters here for a concrete
// reason, not an aesthetic one: the whole idle-CPU invariant depends on the
// reducer returning the SAME state reference when nothing changed, and on
// `createLogEntry` being able to run the reducer speculatively to derive
// balance snapshots. A reducer that mutates its input, or that writes to
// storage as it goes, breaks both silently.
// ============================================================

import { describe, it, expect, vi } from 'vitest';
import { mcReducer, initialState } from './mcReducer';
import type { MCState, MCAction } from '../types';

/** Recursively freezes so any in-place write throws in strict mode. */
function deepFreeze<T>(value: T, seen = new WeakSet<object>()): T {
    if (value === null || typeof value !== 'object') return value;
    if (seen.has(value as object)) return value;
    seen.add(value as object);

    for (const key of Object.getOwnPropertyNames(value)) {
        deepFreeze((value as Record<string, unknown>)[key], seen);
    }
    return Object.freeze(value);
}

const TIMESTAMP = '2026-08-19T12:00:00.000Z';

/**
 * One representative action per type. When a new action is added to MCAction,
 * add it here too — the coverage test below fails otherwise.
 */
const SAMPLE_ACTIONS: MCAction[] = [
    { type: 'ADD_TOKEN' },
    { type: 'ADD_TOKENS', amount: 2, source: 'mission', label: 'Morning' },
    { type: 'REMOVE_TOKEN' },
    { type: 'SELECT_CASE', caseId: 0, reward: 'game', targetCount: 5 },
    { type: 'DEPOSIT_TO_CASE', caseId: 0, amount: 1 },
    { type: 'MOVE_TOKEN', from: 'bank', to: 0 },
    { type: 'VACUUM_TO_CASE', caseId: 0 },
    { type: 'REFUND_CASE', caseId: 0 },
    { type: 'SET_PRIVILEGE_STATUS', cardId: 'knife', status: 'suspended', suspendedUntil: TIMESTAMP },
    { type: 'COMPLETE_TASK', missionPhase: 'morning', taskId: 'tshirt' },
    { type: 'LOCK_TASK', missionPhase: 'morning', taskId: 'tshirt' },
    { type: 'SET_ACTIVE_MISSION', phase: 'morning' },
    { type: 'RESET_MISSION', missionPhase: 'morning' },
    { type: 'RESET_MISSION_WITH_TIMER', missionPhase: 'morning' },
    { type: 'CANCEL_MISSION', missionPhase: 'morning' },
    { type: 'COMPLETE_MISSION_ROUTINE', missionPhase: 'morning', bonusTokens: 2 },
    { type: 'MARK_MISSION_TIMEOUT', missionPhase: 'morning' },
    { type: 'ADJUST_MISSION_END', missionPhase: 'morning', deltaMinutes: 5 },
    { type: 'TOGGLE_WHINING', missionPhase: 'morning' },
    { type: 'CONSUME_CASE', caseId: 0 },
    { type: 'SET_SETTINGS', settings: { morningStartsAt: '07:00' } },
    { type: 'ADD_RESPONSIBILITY_POINT', taskId: 'recycling' },
    { type: 'RESET_RESPONSIBILITY', taskId: 'recycling', claimTokens: 3 },
    {
        type: 'ADD_LOG',
        log: { id: 'x', timestamp: TIMESTAMP, icon: '🪙', message: 'm', type: 'manual' },
    },
    { type: 'CLEAR_LOGS' },
    { type: 'CHEAT_ATTEMPT' },
    { type: 'CLEAR_CHEAT_FLAG' },
    { type: 'GRANT_GAME_TOKEN' },
    { type: 'CONSUME_GAME_TOKEN' },
    { type: 'RESET_GAME_TOKENS' },
    { type: 'TRIGGER_ANIMATION', animation: 'confetti' },
    { type: 'START_GAME' },
    { type: 'END_GAME' },
    { type: 'RECORD_QUIZ_ANSWER', skill: 'read-pic-word', level: 1, atLevel: true, firstTry: false, wordId: 'dog', gameId: 'snake' },
    { type: 'ADJUST_BEHAVIOR_PROGRESS', amount: 10, reason: 'test' },
    { type: 'BEHAVIOR_TICK' },
    { type: 'SET_MOOD_WIND', level: 1 },
    { type: 'SYNC_BEHAVIOR' },
    { type: 'ADJUST_SHIELD', delta: 1 },
];

/** A populated state, so actions have something real to act on. */
function richState(): MCState {
    return {
        ...initialState,
        bankCount: 8,
        gameTokens: 2,
        behaviorProgress: 55,
        moodWind: 1,
        activeMission: 'morning',
        // One short of the lock so MARK_MISSION_TIMEOUT / COMPLETE_MISSION_ROUTINE
        // actually cross the threshold and mint a shield log — the branch that
        // shipped a randomUUID past this very guard because nothing reached it.
        missedMissionStreak: 5,
        moodLastResetDate: '2026-08-19',
        behaviorLastUpdated: TIMESTAMP,
        cases: initialState.cases.map((c, i) =>
            i === 0 ? { ...c, reward: 'game' as const, status: 'active' as const, tokenCount: 2 } : c
        ),
        missions: initialState.missions.map(m =>
            m.phase === 'morning' ? { ...m, active: true, startedAt: TIMESTAMP, durationMins: 30 } : m
        ),
    };
}

describe('mcReducer purity', () => {
    it('never mutates the state it is given', () => {
        for (const action of SAMPLE_ACTIONS) {
            const frozen = deepFreeze(richState());
            expect(
                () => mcReducer(frozen, { ...action, timestamp: TIMESTAMP }),
                `${action.type} mutated its input state in place`
            ).not.toThrow();
        }
    });

    it('never mutates the action it is given', () => {
        for (const action of SAMPLE_ACTIONS) {
            const frozenAction = deepFreeze({ ...action, timestamp: TIMESTAMP }) as MCAction;
            expect(
                () => mcReducer(richState(), frozenAction),
                `${action.type} mutated the action object`
            ).not.toThrow();
        }
    });

    it('is deterministic — same input, same output', () => {
        for (const action of SAMPLE_ACTIONS) {
            const withTs = { ...action, timestamp: TIMESTAMP };
            const a = mcReducer(richState(), withTs);
            const b = mcReducer(richState(), withTs);
            expect(a, `${action.type} produced different output for identical input`).toEqual(b);
        }
    });

    it('writes nothing to storage while reducing', () => {
        // Persistence belongs to MCStoreProvider's effect, never the reducer —
        // createLogEntry runs the reducer speculatively to derive snapshots, and
        // a reducer that persisted would write phantom state on every dispatch.
        const setItem = vi.spyOn(Storage.prototype, 'setItem');
        const removeItem = vi.spyOn(Storage.prototype, 'removeItem');

        for (const action of SAMPLE_ACTIONS) {
            mcReducer(richState(), { ...action, timestamp: TIMESTAMP });
        }

        expect(setItem).not.toHaveBeenCalled();
        expect(removeItem).not.toHaveBeenCalled();
        setItem.mockRestore();
        removeItem.mockRestore();
    });

    it('returns the SAME reference when an action changes nothing', () => {
        // This is what lets React and the persist effect bail out, and it is the
        // load-bearing half of the idle-CPU invariant.
        const state = richState();
        const idleTick = mcReducer(state, { type: 'SYNC_BEHAVIOR', timestamp: state.behaviorLastUpdated });
        expect(idleTick).toBe(state);

        const cappedGrant = mcReducer({ ...state, gameTokens: 5 }, { type: 'GRANT_GAME_TOKEN' });
        expect(cappedGrant.gameTokens).toBe(5);
    });

    it('ignores an unknown action instead of throwing', () => {
        const state = richState();
        expect(mcReducer(state, { type: 'NOT_A_REAL_ACTION' } as unknown as MCAction)).toBe(state);
    });

    describe('sample coverage', () => {
        it('exercises every action type in the union', async () => {
            // Reads the type union from source so a newly added action cannot
            // quietly escape the purity check.
            const { readFileSync } = await import('node:fs');
            const { join, dirname } = await import('node:path');
            const { fileURLToPath } = await import('node:url');

            const typesPath = join(dirname(fileURLToPath(import.meta.url)), '..', 'types.ts');
            const source = readFileSync(typesPath, 'utf-8');
            const unionStart = source.indexOf('export type MCAction');
            const union = source.slice(unionStart, source.indexOf('};', unionStart));

            const declared = new Set([...union.matchAll(/\{\s*type:\s*'([A-Z_]+)'/g)].map(m => m[1]));
            const sampled = new Set(SAMPLE_ACTIONS.map(a => a.type));
            const missing = [...declared].filter(t => !sampled.has(t as MCAction['type']));

            expect(
                missing,
                `Action type(s) added to MCAction but not to SAMPLE_ACTIONS — they are escaping the\n` +
                `purity check. Add a representative action for each:\n  ${missing.join('\n  ')}`
            ).toEqual([]);
        });
    });
});
