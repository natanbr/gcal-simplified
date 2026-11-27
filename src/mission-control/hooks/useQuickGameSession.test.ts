// ============================================================
// useQuickGameSession — attribution guard.
// This hook is the only place in Mission Control that builds
// ActivityLogEntry records BY HAND and dispatches ADD_LOG
// directly, bypassing `createLogEntry`'s automatic `source`
// derivation. CLAUDE.md → Conventions → Attribution: every log
// entry carries `source`. These tests fail if either hand-made
// entry loses it.
// ============================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useQuickGameSession } from './useQuickGameSession';
import { initialState } from '../store/mcReducer';
import type { MCAction, ActivityLogEntry, MCState } from '../types';

const mockDispatch = vi.fn();

/** Between the missions, shield intact — the only state in which a game opens. */
function playableState(patch: Partial<MCState> = {}): MCState {
    return { ...initialState, lastCompletedOrFailedMorningDate: todayStr(), ...patch };
}
function todayStr(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

let mockState: MCState = playableState();

vi.mock('../store/useMCStore', () => ({
    useMCDispatch: () => mockDispatch,
    useMCStore: () => ({ state: mockState, dispatch: mockDispatch }),
}));

/** Every ADD_LOG payload the hook dispatched, in order. */
function loggedEntries(): ActivityLogEntry[] {
    return mockDispatch.mock.calls
        .map(([action]) => action as MCAction)
        .filter((action): action is Extract<MCAction, { type: 'ADD_LOG' }> => action.type === 'ADD_LOG')
        .map(action => action.log);
}

describe('useQuickGameSession attribution', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // Noon, morning routine done, evening not started, shield intact.
        vi.setSystemTime(new Date(new Date().setHours(12, 0, 0, 0)));
        mockState = playableState();
    });

    it('attributes the game-start log entry to the local child', () => {
        const { result } = renderHook(() => useQuickGameSession());

        act(() => {
            result.current.handleQuickGameOpen();
        });

        const entries = loggedEntries();
        expect(entries).toHaveLength(1);
        expect(entries[0].message).toBe('Quick Game started');
        // Exact value, not just presence: a wrong attribution ('system',
        // 'auto') would pass a truthiness check while lying to the parent.
        expect(entries[0].source).toBe('local');
    });

    it('attributes the game-end log entry to the local child', () => {
        const { result } = renderHook(() => useQuickGameSession());

        act(() => {
            result.current.handleQuickGameOpen();
        });
        act(() => {
            result.current.handleQuickGameClose(42);
        });

        const entries = loggedEntries();
        expect(entries).toHaveLength(2);
        expect(entries[1].message).toContain('Quick Game ended — Score: 42');
        expect(entries[1].source).toBe('local');
    });

    it('attributes an end entry even when the session was never opened', () => {
        // Defensive only — no production caller reaches this today, and a
        // remote one cannot: START_GAME is deliberately absent from
        // REMOTE_ALLOWED_ACTIONS because a remote-opened game with no overlay
        // mounted would be unclosable. The entry still needs a source.
        const { result } = renderHook(() => useQuickGameSession());

        act(() => {
            result.current.handleQuickGameClose(0);
        });

        const entries = loggedEntries();
        expect(entries).toHaveLength(1);
        expect(entries[0].source).toBe('local');
    });

    // ---- Regression: the phantom entry ----
    // START_GAME is refusable (shield lock, closed window) AND is in
    // UNLOGGED_ACTIONS, so createLogEntry's refusal mirror never sees it. The
    // hand-built entry below used to fire regardless, writing "Quick Game
    // started" into the append-only audit trail for a game that never ran.
    it('writes NO start entry when the shield is broken', () => {
        mockState = playableState({ missedMissionStreak: 6 });
        const { result } = renderHook(() => useQuickGameSession());

        act(() => { result.current.handleQuickGameOpen(); });

        expect(mockDispatch).not.toHaveBeenCalled();
        expect(loggedEntries()).toHaveLength(0);
    });

    it('writes NO start entry outside the quick-game window', () => {
        mockState = playableState({ lastCompletedOrFailedMorningDate: null });
        const { result } = renderHook(() => useQuickGameSession());

        act(() => { result.current.handleQuickGameOpen(); });

        expect(loggedEntries()).toHaveLength(0);
    });

    // ---- Regression: the boundary second ----
    // Redeeming a quick-game goal is TWO dispatches against a time-based
    // window (CONSUME_CASE, then START_GAME). Every clock read on the path
    // must be the SAME instant, or a tap at 18:59:59.999 spends the goal and
    // is then refused the game at 19:00:00.001 — consumed but refused.
    it('judges the game against the instant it is handed, not a fresh clock read', () => {
        // Wall clock is already past the evening start...
        vi.setSystemTime(new Date(new Date().setHours(19, 0, 1, 0)));
        const beforeBoundary = new Date(new Date().setHours(18, 59, 59, 900)).toISOString();
        const { result } = renderHook(() => useQuickGameSession());

        act(() => { result.current.handleQuickGameOpen(beforeBoundary); });

        // ...but the tap happened inside the window, so the game opens and is
        // stamped with that same instant — matching the CONSUME_CASE beside it.
        const started = mockDispatch.mock.calls
            .map(([a]) => a as MCAction)
            .find(a => a.type === 'START_GAME');
        expect(started, 'the game must open for a tap that was inside the window').toBeDefined();
        expect(started?.timestamp).toBe(beforeBoundary);
        expect(loggedEntries()[0].timestamp).toBe(beforeBoundary);
    });

    it('still refuses when the instant it is handed is outside the window', () => {
        const afterBoundary = new Date(new Date().setHours(19, 0, 1, 0)).toISOString();
        const { result } = renderHook(() => useQuickGameSession());

        act(() => { result.current.handleQuickGameOpen(afterBoundary); });

        expect(mockDispatch).not.toHaveBeenCalled();
    });
});
// ---- Regression: a game must not outlive the start of a mission ----
// Every game overlay is z-[1000]; the mission banner is z-100. The window was
// judged only when a game OPENED, so a child already playing when the
// scheduler (or the phone) started a mission kept playing under a running
// timer and could let it time out: a streak miss. The hook now ends the
// session itself, and says it was a mission that did it.
describe('useQuickGameSession when a mission starts under an open game', () => {
    const endGames = () =>
        mockDispatch.mock.calls.map(([a]) => a as MCAction).filter(a => a.type === 'END_GAME');

    beforeEach(() => {
        vi.clearAllMocks();
        vi.setSystemTime(new Date(new Date().setHours(19, 0, 5, 0)));
        mockState = playableState({ snakeGameActive: true, activeMission: 'evening' });
    });

    it('ends the game once and writes one system-attributed line that names the mission', () => {
        const { result } = renderHook(() => useQuickGameSession());

        expect(endGames()).toHaveLength(1);
        const entries = loggedEntries();
        expect(entries).toHaveLength(1);
        expect(entries[0].message).toContain('mission');
        expect(entries[0].message).not.toContain('Score');
        // The child did not end it; the app did.
        expect(entries[0].source).toBe('system');
        expect(result.current.missionEndedGame).toBe(true);
    });

    it('hides the game in the same render, before the effect runs', () => {
        const { result } = renderHook(() => useQuickGameSession());
        expect(result.current.gameShowing).toBe(false);
    });

    it('is idempotent: a re-render with the same state ends nothing twice', () => {
        const { rerender } = renderHook(() => useQuickGameSession());
        rerender();
        rerender();
        expect(endGames()).toHaveLength(1);
        expect(loggedEntries()).toHaveLength(1);
    });

    it('closes the game selector too, when no game was picked yet', () => {
        // snakeGameActive with activeGameType null is the selector.
        const { result } = renderHook(() => useQuickGameSession());
        expect(result.current.activeGameType).toBeNull();
        expect(endGames()).toHaveLength(1);
    });

    it('does nothing when a mission runs and no game is open', () => {
        mockState = playableState({ snakeGameActive: false, activeMission: 'evening' });
        const { result } = renderHook(() => useQuickGameSession());
        expect(mockDispatch).not.toHaveBeenCalled();
        expect(result.current.missionEndedGame).toBe(false);
    });

    it('leaves a game alone while no mission runs, and shows it', () => {
        mockState = playableState({ snakeGameActive: true, activeMission: 'none' });
        const { result } = renderHook(() => useQuickGameSession());
        expect(mockDispatch).not.toHaveBeenCalled();
        expect(result.current.gameShowing).toBe(true);
    });

    it('a normal close still writes exactly one line, and no mission card', () => {
        mockState = playableState({ snakeGameActive: true, activeMission: 'none' });
        const { result } = renderHook(() => useQuickGameSession());
        act(() => { result.current.handleQuickGameClose(7); });
        expect(loggedEntries()).toHaveLength(1);
        expect(result.current.missionEndedGame).toBe(false);
    });

    it('the card can be dismissed, and a later game can open again', () => {
        const { result, rerender } = renderHook(() => useQuickGameSession());
        expect(result.current.missionEndedGame).toBe(true);
        act(() => { result.current.dismissMissionEndedGame(); });
        expect(result.current.missionEndedGame).toBe(false);

        // Mission over, the game window is open again.
        vi.setSystemTime(new Date(new Date().setHours(12, 0, 0, 0)));
        mockState = playableState({ snakeGameActive: false, activeMission: 'none' });
        rerender();
        mockDispatch.mockClear();
        act(() => { result.current.handleQuickGameOpen(); });
        expect(mockDispatch.mock.calls.map(([a]) => (a as MCAction).type)).toContain('START_GAME');
    });
});
