import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useLiveClock } from './useLiveClock';

describe('useLiveClock', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    it('returns the current date and updates every second', () => {
        const { result } = renderHook(() => useLiveClock());
        const initialTime = result.current.getTime();

        act(() => { vi.advanceTimersByTime(1000); });
        expect(result.current.getTime() - initialTime).toBe(1000);

        act(() => { vi.advanceTimersByTime(2500); });
        // The interval fires at 1000, 2000, and 3000ms.
        // At 3500ms, the latest state update was at 3000ms.
        expect(result.current.getTime() - initialTime).toBe(3000);
    });

    it('clears interval on unmount to prevent memory leaks', () => {
        const clearIntervalSpy = vi.spyOn(global, 'clearInterval');
        const { unmount } = renderHook(() => useLiveClock());

        unmount();
        expect(clearIntervalSpy).toHaveBeenCalledTimes(1);
    });
});
