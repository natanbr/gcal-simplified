// ============================================================
// Attribution — CLAUDE.md → Conventions → "every log entry carries a source.
// A token movement with no attribution is a bug."
// ------------------------------------------------------------
// This is the rule the whole visibility feature rests on. The original problem
// was not that events went unlogged in general — it was that the *automatic*
// ones did, so tokens appeared to move on their own. A single unattributed
// entry re-creates that exact confusion, which is why this is enforced across
// every action type rather than spot-checked.
// ============================================================

import { describe, it, expect } from 'vitest';
import { createLogEntry } from './activityLog';
import { initialState } from './mcReducer';
import type { MCState, MCAction, ActivityLogEntry } from '../types';

const TIMESTAMP = '2026-08-19T12:00:00.000Z';

const VALID_SOURCES: Array<NonNullable<ActivityLogEntry['source']>> =
    ['local', 'remote', 'scheduler', 'auto', 'system'];

/** State rich enough that most actions produce a real entry rather than null. */
function richState(): MCState {
    return {
        ...initialState,
        bankCount: 8,
        gameTokens: 2,
        activeMission: 'morning',
        cases: initialState.cases.map((c, i) =>
            i === 0 ? { ...c, reward: 'game' as const, status: 'active' as const, tokenCount: 2 } : c
        ),
        missions: initialState.missions.map(m =>
            m.phase === 'morning' ? { ...m, active: true, startedAt: TIMESTAMP, durationMins: 30 } : m
        ),
    };
}

/** Actions that meaningfully move tokens or change mission/mood state. */
const LOGGABLE_ACTIONS: MCAction[] = [
    { type: 'ADD_TOKEN' },
    { type: 'ADD_TOKENS', amount: 2, source: 'mission', label: 'Morning mission' },
    { type: 'ADD_TOKENS', amount: 3, source: 'responsibility', label: 'Recycling' },
    { type: 'ADD_TOKENS', amount: 1, source: 'manual' },
    { type: 'REMOVE_TOKEN' },
    { type: 'SELECT_CASE', caseId: 1, reward: 'game', targetCount: 5 },
    { type: 'DEPOSIT_TO_CASE', caseId: 0, amount: 1 },
    { type: 'MOVE_TOKEN', from: 'bank', to: 0 },
    { type: 'MOVE_TOKEN', from: 0, to: 'bank' },
    { type: 'VACUUM_TO_CASE', caseId: 0 },
    { type: 'REFUND_CASE', caseId: 0 },
    { type: 'CONSUME_CASE', caseId: 0 },
    { type: 'SET_ACTIVE_MISSION', phase: 'morning' },
    { type: 'SET_ACTIVE_MISSION', phase: 'none' },
    { type: 'CANCEL_MISSION', missionPhase: 'morning' },
    { type: 'COMPLETE_MISSION_ROUTINE', missionPhase: 'morning', bonusTokens: 2 },
    { type: 'RESET_MISSION_WITH_TIMER', missionPhase: 'morning' },
    { type: 'ADJUST_MISSION_END', missionPhase: 'morning', deltaMinutes: 5 },
    { type: 'LOCK_TASK', missionPhase: 'morning', taskId: 'tshirt' },
    { type: 'ADD_RESPONSIBILITY_POINT', taskId: 'recycling' },
    { type: 'RESET_RESPONSIBILITY', taskId: 'recycling', claimTokens: 3 },
    { type: 'CHEAT_ATTEMPT' },
    { type: 'GRANT_GAME_TOKEN' },
    { type: 'CONSUME_GAME_TOKEN' },
    { type: 'RESET_GAME_TOKENS' },
    { type: 'SET_MOOD_WIND', level: 2 },
    { type: 'ADJUST_BEHAVIOR_PROGRESS', amount: 10, reason: 'good listening' },
    { type: 'END_GAME' },
];

describe('activity log attribution', () => {
    it('stamps a source on every entry it produces', () => {
        const unattributed: string[] = [];

        for (const action of LOGGABLE_ACTIONS) {
            const entry = createLogEntry({ ...action, timestamp: TIMESTAMP }, richState());
            if (!entry) continue; // deliberately unlogged actions are fine
            if (!entry.source) unattributed.push(`${action.type} — "${entry.message}"`);
        }

        expect(
            unattributed,
            `Log entr(ies) with no source. An event a parent cannot attribute is the original\n` +
            `bug this feature exists to fix:\n  ${unattributed.join('\n  ')}`
        ).toEqual([]);
    });

    it('only ever uses a known source value', () => {
        for (const action of LOGGABLE_ACTIONS) {
            const entry = createLogEntry({ ...action, timestamp: TIMESTAMP }, richState());
            if (!entry?.source) continue;
            expect(VALID_SOURCES, `${action.type} used an unknown source "${entry.source}"`)
                .toContain(entry.source);
        }
    });

    it('records the balances after the event, so the log reconciles', () => {
        const missingBalances: string[] = [];

        for (const action of LOGGABLE_ACTIONS) {
            const entry = createLogEntry({ ...action, timestamp: TIMESTAMP }, richState());
            if (!entry) continue;
            if (entry.bankTokens === undefined || entry.totalTokens === undefined || entry.gameTokens === undefined) {
                missingBalances.push(`${action.type} — "${entry.message}"`);
            }
        }

        expect(
            missingBalances,
            `Entr(ies) missing a balance snapshot. Without them the log cannot be reconciled\n` +
            `against the real token count:\n  ${missingBalances.join('\n  ')}`
        ).toEqual([]);
    });

    describe('origin propagation', () => {
        it('defaults to local when nothing says otherwise', () => {
            const entry = createLogEntry({ type: 'ADD_TOKEN', timestamp: TIMESTAMP }, richState());
            expect(entry?.source).toBe('local');
        });

        it('honours an explicit origin', () => {
            for (const origin of VALID_SOURCES) {
                const entry = createLogEntry(
                    { type: 'ADD_TOKEN', timestamp: TIMESTAMP, origin },
                    richState()
                );
                expect(entry?.source).toBe(origin);
            }
        });

        it('maps the legacy isRemote flag to a remote source', () => {
            const entry = createLogEntry(
                { type: 'ADD_TOKEN', timestamp: TIMESTAMP, isRemote: true },
                richState()
            );
            expect(entry?.source).toBe('remote');
            expect(entry?.isRemote).toBe(true);
        });

        it('lets an explicit origin win over the legacy flag', () => {
            const entry = createLogEntry(
                { type: 'ADD_TOKEN', timestamp: TIMESTAMP, isRemote: true, origin: 'scheduler' },
                richState()
            );
            expect(entry?.source).toBe('scheduler');
        });
    });

    describe('automatic token grants', () => {
        it('attributes the mood-gauge grant to auto, from inside the reducer', async () => {
            // The one token movement no user action triggers — and therefore the
            // one that must never be silent.
            const { mcReducer } = await import('./mcReducer');
            const noon = new Date();
            noon.setHours(12, 0, 0, 0);
            const aMinuteLater = new Date(noon.getTime() + 60_000);
            const today = `${noon.getFullYear()}-${String(noon.getMonth() + 1).padStart(2, '0')}-${String(noon.getDate()).padStart(2, '0')}`;

            const next = mcReducer(
                {
                    ...initialState,
                    moodWind: 2,
                    behaviorProgress: 99.9,
                    gameTokens: 0,
                    activityLogs: [],
                    moodLastResetDate: today,
                    behaviorLastUpdated: noon.toISOString(),
                },
                { type: 'SYNC_BEHAVIOR', timestamp: aMinuteLater.toISOString() }
            );

            expect(next.activityLogs).toHaveLength(1);
            expect(next.activityLogs[0].source).toBe('auto');
            expect(next.activityLogs[0].gameTokens).toBe(1);
        });
    });
});
