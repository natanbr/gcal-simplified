import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useMinuteClock } from './useMinuteClock';

describe('useMinuteClock', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        // Set predictable time: 10:00:15
        vi.setSystemTime(new Date(2025, 0, 1, 10, 0, 15).getTime());
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    it('returns the live clock and updates exactly on minute boundaries to avoid excess re-renders', () => {
        const { result } = renderHook(() => useMinuteClock());
        const initialTime = result.current.getTime();

        // 45 seconds until next minute
        act(() => { vi.advanceTimersByTime(44999); });
        expect(result.current.getTime()).toBe(initialTime); // Has not updated yet

        act(() => { vi.advanceTimersByTime(1); });
        expect(result.current.getTime() - initialTime).toBe(45000); // 10:01:00

        act(() => { vi.advanceTimersByTime(60000); });
        expect(result.current.getTime() - initialTime).toBe(105000); // 10:02:00
    });

    it('clears timeout on unmount to prevent memory leaks', () => {
        const clearTimeoutSpy = vi.spyOn(global, 'clearTimeout');
        const { unmount } = renderHook(() => useMinuteClock());

        unmount();
        expect(clearTimeoutSpy).toHaveBeenCalledTimes(1);
    });
});
