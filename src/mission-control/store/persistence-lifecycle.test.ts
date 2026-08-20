// ============================================================
// Mission Control — persistence LIFECYCLE (save → quit → relaunch)
// ------------------------------------------------------------
// The suite tested plenty of individual reducer transitions but almost nothing
// about what survives a restart. That is exactly where two bugs lived:
//
//   * `snakeGameActive` was restored verbatim, so a crash mid-game stranded it
//     at true forever and the phone kept offering a ghost game.
//   * the old midnight scheduler minted a token on every mount, so relaunching
//     the app was a way to farm tokens.
//
// These tests round-trip real state through localStorage the way a real restart
// does, and assert the invariants rather than individual fields.
// ============================================================

import { describe, it, expect, beforeEach } from 'vitest';
import { mcReducer, initialState, MAX_GAME_TOKENS } from './mcReducer';
import { loadPersistedState, STORAGE_KEY } from './useMCStore';
import type { MCState, ActivityLogEntry } from '../types';

/** Writes state the way MCStoreProvider's persist effect does, then reloads it. */
function restart(state: MCState): MCState {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    return loadPersistedState();
}

function logEntry(overrides: Partial<ActivityLogEntry> = {}): ActivityLogEntry {
    return {
        id: `log-${Math.random()}`,
        timestamp: new Date().toISOString(),
        icon: '🪙',
        message: 'something happened',
        type: 'manual',
        ...overrides,
    };
}

describe('restart lifecycle', () => {
    beforeEach(() => {
        localStorage.removeItem(STORAGE_KEY);
    });

    describe('live-session state must not survive', () => {
        it('never restores an in-progress game', () => {
            // A game only exists while its overlay is mounted. If this survives,
            // the remote shows a game that cannot be closed.
            const crashed = { ...initialState, snakeGameActive: true };
            expect(restart(crashed).snakeGameActive).toBe(false);
        });

        it('clears the game flag even when everything else is preserved', () => {
            const state: MCState = {
                ...initialState,
                snakeGameActive: true,
                bankCount: 17,
                gameTokens: 3,
            };
            const reloaded = restart(state);

            expect(reloaded.snakeGameActive).toBe(false);
            // ...without collateral damage to real user data.
            expect(reloaded.bankCount).toBe(17);
            expect(reloaded.gameTokens).toBe(3);
        });
    });

    describe('the economy must not gain value from a restart', () => {
        it('does not refund spent game tokens', () => {
            const spentDown = { ...initialState, gameTokens: 1 };
            expect(restart(spentDown).gameTokens).toBe(1);
        });

        it('grants nothing on load, however many times the app is relaunched', () => {
            let state: MCState = { ...initialState, gameTokens: 2, bankCount: 5 };

            for (let launch = 0; launch < 10; launch++) {
                state = restart(state);
            }

            expect(state.gameTokens).toBe(2);
            expect(state.bankCount).toBe(5);
        });

        it('clamps a corrupted token count into range instead of trusting it', () => {
            expect(restart({ ...initialState, gameTokens: 999 }).gameTokens).toBe(MAX_GAME_TOKENS);
            expect(restart({ ...initialState, gameTokens: -5 }).gameTokens).toBe(0);
        });

        it('preserves bank and deposited tokens exactly', () => {
            const state: MCState = {
                ...initialState,
                bankCount: 9,
                cases: initialState.cases.map((c, i) => (i === 0 ? { ...c, tokenCount: 4 } : c)),
            };
            const reloaded = restart(state);

            expect(reloaded.bankCount).toBe(9);
            expect(reloaded.cases[0].tokenCount).toBe(4);
        });
    });

    describe('the audit history must survive', () => {
        it('keeps activity-log entries across a restart', () => {
            const logs = [logEntry({ message: 'first' }), logEntry({ message: 'second' })];
            const reloaded = restart({ ...initialState, activityLogs: logs, _migrationVersion: 1 });

            expect(reloaded.activityLogs).toHaveLength(2);
            expect(reloaded.activityLogs[0].message).toBe('first');
        });

        it('keeps source attribution across a restart', () => {
            const logs = [logEntry({ source: 'auto', message: 'mood token earned' })];
            const reloaded = restart({ ...initialState, activityLogs: logs, _migrationVersion: 1 });

            expect(reloaded.activityLogs[0].source).toBe('auto');
        });
    });

    describe('corruption resilience', () => {
        it('falls back to initial state on unparseable storage rather than crashing', () => {
            localStorage.setItem(STORAGE_KEY, '{ not json at all');
            expect(() => loadPersistedState()).not.toThrow();
            expect(loadPersistedState().bankCount).toBe(initialState.bankCount);
        });

        it('fills in fields missing from an older persisted shape', () => {
            localStorage.setItem(STORAGE_KEY, JSON.stringify({ bankCount: 4, _migrationVersion: 1 }));
            const reloaded = loadPersistedState();

            expect(reloaded.bankCount).toBe(4);
            expect(reloaded.settings).toBeDefined();
            expect(reloaded.missions.length).toBeGreaterThan(0);
            expect(reloaded.snakeGameActive).toBe(false);
        });
    });

    describe('mood accrual does not back-fill time the app was closed', () => {
        it('adds nothing for a multi-day gap between sessions', () => {
            const threeDaysAgo = new Date();
            threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

            const state: MCState = {
                ...initialState,
                moodWind: 2,
                behaviorProgress: 40,
                gameTokens: 0,
                behaviorLastUpdated: threeDaysAgo.toISOString(),
            };

            // First heartbeat after a relaunch, mid-day so we are inside the window.
            const noon = new Date();
            noon.setHours(12, 0, 0, 0);
            const next = mcReducer(restart(state), { type: 'SYNC_BEHAVIOR', timestamp: noon.toISOString() });

            expect(next.gameTokens).toBe(0);
            expect(next.behaviorProgress).toBe(40);
        });
    });
});

describe('skillProgress hydration round-trip', () => {
    beforeEach(() => {
        localStorage.removeItem(STORAGE_KEY);
    });

    it('repairs a partial slice on load, and the next answer does not crash', () => {
        // A hand-edited / version-skewed / interrupted-write blob: readingLevel
        // present, every sub-structure missing. Without the sanitize wiring the
        // bare spread restores this wholesale and the first RECORD_QUIZ_ANSWER
        // throws on progress.days[skill].
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
            skillProgress: { readingLevel: 3 },
        }));
        const reloaded = loadPersistedState();

        expect(reloaded.skillProgress.readingLevel).toBe(3);
        expect(reloaded.skillProgress.days['read-pic-word']).toEqual([]);
        expect(reloaded.skillProgress.window).toEqual([]);

        const next = mcReducer(reloaded, {
            type: 'RECORD_QUIZ_ANSWER',
            skill: 'read-pic-word',
            level: 3,
            atLevel: true,
            firstTry: true,
            wordId: 'dog',
            gameId: 'snake',
            timestamp: new Date().toISOString(),
        });
        expect(next.skillProgress.days['read-pic-word']).toHaveLength(1);
        expect(next.skillProgress.days['read-pic-word'][0].attempts).toBe(1);
    });

    it('clamps a hostile readingLevel and a smuggled-Infinity miss count', () => {
        // Raw JSON on purpose: JSON.parse('1e999') yields Infinity (stringify
        // would null it), which a bare typeof check waves through — and an
        // Infinity count is never "coldest", so it could never be evicted.
        localStorage.setItem(
            STORAGE_KEY,
            '{"skillProgress":{"readingLevel":99,"missedWords":{"ship":1e999}}}',
        );
        const reloaded = loadPersistedState();
        expect(reloaded.skillProgress.readingLevel).toBe(6);
        expect(Number.isFinite(reloaded.skillProgress.missedWords['ship'])).toBe(true);
    });
});
