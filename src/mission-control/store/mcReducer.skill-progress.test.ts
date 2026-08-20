// ============================================================
// RECORD_QUIZ_ANSWER — reducer-level integration tests.
// Same-reference assertions use timestamp === behaviorLastUpdated
// so applyBehaviorSync's zero-elapsed path keeps the reference
// stable (a daytime timestamp with elapsed time would allocate
// and false-fail these — see idle-performance.test.tsx).
// ============================================================

import { describe, it, expect } from 'vitest';
import { mcReducer, initialState } from './mcReducer';
import { getLocalDateString } from './behaviorSync';
import { createDefaultSkillProgress } from '../skills/types';
import { createLogEntry } from './activityLog';
import type { MCAction, MCState } from '../types';

const TS = '2026-08-20T18:00:00.000Z';

function baseState(readingLevel = 3): MCState {
    return {
        ...initialState,
        behaviorLastUpdated: TS,
        // Pin the daily mood reset as already-done for TS's local day, or
        // applyBehaviorSync allocates a fresh state and breaks same-ref checks.
        moodLastResetDate: getLocalDateString(new Date(TS)),
        skillProgress: { ...createDefaultSkillProgress(), readingLevel },
    };
}

function record(overrides: Record<string, unknown> = {}): MCAction {
    return {
        type: 'RECORD_QUIZ_ANSWER',
        skill: 'read-pic-word',
        level: 3,
        atLevel: true,
        firstTry: true,
        wordId: 'dog',
        gameId: 'snake',
        timestamp: TS,
        ...overrides,
    } as MCAction;
}

describe('mcReducer RECORD_QUIZ_ANSWER', () => {
    it('returns the same state reference for an unknown skill', () => {
        const state = baseState();
        expect(mcReducer(state, record({ skill: 'read-minds' }))).toBe(state);
    });

    it('updates the day bucket from the action timestamp (local date)', () => {
        const next = mcReducer(baseState(), record());
        const buckets = next.skillProgress.days['read-pic-word'];
        expect(buckets).toHaveLength(1);
        expect(buckets[0].attempts).toBe(1);
    });

    it('does not crash on a raw dispatch without a timestamp', () => {
        const next = mcReducer(baseState(), record({ timestamp: undefined }));
        expect(next.skillProgress.days['read-pic-word'][0].attempts).toBe(1);
    });

    it('writes exactly one neutral log entry per level change', () => {
        let state = baseState(3);
        // 13 hits then 2 misses → 13/15 = 86.7% → promotion on the 15th answer.
        for (let i = 0; i < 15; i++) {
            state = mcReducer(state, record({ firstTry: i < 13, wordId: `w${i}` }));
        }
        expect(state.skillProgress.readingLevel).toBe(4);

        const levelLogs = state.activityLogs.filter(l => l.id.startsWith('auto-reading-level-'));
        expect(levelLogs).toHaveLength(1);
        expect(levelLogs[0].source).toBe('auto');
        expect(levelLogs[0].message).not.toMatch(/\d/); // kid-reachable surface stays neutral

        // Further answers at the new level do NOT re-log the old change.
        state = mcReducer(state, record({ firstTry: true }));
        expect(state.activityLogs.filter(l => l.id.startsWith('auto-reading-level-'))).toHaveLength(1);
    });

    it('never produces an interceptor log entry (createLogEntry short-circuits)', () => {
        expect(createLogEntry(record(), baseState())).toBeNull();
    });
});
