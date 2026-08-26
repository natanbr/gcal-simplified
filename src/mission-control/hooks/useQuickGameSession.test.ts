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
import type { MCAction, ActivityLogEntry } from '../types';

const mockDispatch = vi.fn();

vi.mock('../store/useMCStore', () => ({
    useMCDispatch: () => mockDispatch,
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
        // Defensive only — no production caller reaches this today. The
        // rationale it originally cited (a remote START_GAME opening the
        // overlay) is impossible by design: START_GAME is deliberately absent
        // from REMOTE_ALLOWED_ACTIONS because a remote-opened game with no
        // overlay mounted would be unclosable. The entry still needs a source.
        const { result } = renderHook(() => useQuickGameSession());

        act(() => {
            result.current.handleQuickGameClose(0);
        });

        const entries = loggedEntries();
        expect(entries).toHaveLength(1);
        expect(entries[0].source).toBe('local');
    });
});
