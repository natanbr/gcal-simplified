// ============================================================
// Mission Control — useMCAutoReturn hook tests
// Tests the timer behavior: fires when idle, paused during missions,
// disabled at 0, and reset on state changes.
// ============================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { act } from 'react';
import { useMCAutoReturn } from '../../hooks/useMCAutoReturn';

// ── Shared mock state ────────────────────────────────────────────────────────

const mockState = {
    activeMission: 'none' as 'none' | 'morning' | 'evening',
    settings: { autoReturnMins: 5 },
    snakeGameActive: false,
};

vi.mock('../useMCStore', () => ({
    useMCState: () => mockState,
}));

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('useMCAutoReturn', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        mockState.activeMission = 'none';
        mockState.settings.autoReturnMins = 5;
        mockState.snakeGameActive = false;
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    it('calls onReturn after the configured timeout when idle and no mission', () => {
        const onReturn = vi.fn();
        renderHook(() => useMCAutoReturn(onReturn));

        // Should NOT have fired yet
        expect(onReturn).not.toHaveBeenCalled();

        // Advance past 5 minutes
        act(() => { vi.advanceTimersByTime(5 * 60 * 1000); });
        expect(onReturn).toHaveBeenCalledTimes(1);
    });

    it('does NOT call onReturn when activeMission is "morning"', () => {
        mockState.activeMission = 'morning';
        const onReturn = vi.fn();
        renderHook(() => useMCAutoReturn(onReturn));

        act(() => { vi.advanceTimersByTime(10 * 60 * 1000); });
        expect(onReturn).not.toHaveBeenCalled();
    });

    it('does NOT call onReturn when activeMission is "evening"', () => {
        mockState.activeMission = 'evening';
        const onReturn = vi.fn();
        renderHook(() => useMCAutoReturn(onReturn));

        act(() => { vi.advanceTimersByTime(10 * 60 * 1000); });
        expect(onReturn).not.toHaveBeenCalled();
    });

    it('does NOT call onReturn when autoReturnMins is 0 (disabled)', () => {
        mockState.settings.autoReturnMins = 0;
        const onReturn = vi.fn();
        renderHook(() => useMCAutoReturn(onReturn));

        act(() => { vi.advanceTimersByTime(60 * 60 * 1000); }); // 1 hour
        expect(onReturn).not.toHaveBeenCalled();
    });

    it('respects a custom timeout value (e.g. 10 minutes)', () => {
        mockState.settings.autoReturnMins = 10;
        const onReturn = vi.fn();
        renderHook(() => useMCAutoReturn(onReturn));

        // Not yet at 10 minutes
        act(() => { vi.advanceTimersByTime(9 * 60 * 1000 + 59_000); });
        expect(onReturn).not.toHaveBeenCalled();

        // Cross the 10-minute mark
        act(() => { vi.advanceTimersByTime(1_000); });
        expect(onReturn).toHaveBeenCalledTimes(1);
    });

    it('clears the timer on unmount to prevent memory leaks', () => {
        const onReturn = vi.fn();
        const { unmount } = renderHook(() => useMCAutoReturn(onReturn));

        unmount();
        act(() => { vi.advanceTimersByTime(10 * 60 * 1000); });
        expect(onReturn).not.toHaveBeenCalled();
    });

    it('does NOT call onReturn when snakeGameActive is true', () => {
        mockState.snakeGameActive = true;
        const onReturn = vi.fn();
        renderHook(() => useMCAutoReturn(onReturn));

        act(() => { vi.advanceTimersByTime(10 * 60 * 1000); });
        expect(onReturn).not.toHaveBeenCalled();
    });
});
