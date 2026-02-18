import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { useCurrentDate } from '../useCurrentDate';
import { startOfDay, addDays } from 'date-fns';

describe('useCurrentDate', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('should return the current date initially', () => {
        const initialDate = new Date(2023, 0, 1, 10, 0, 0); // Jan 1, 2023 10:00:00
        vi.setSystemTime(initialDate);

        const { result } = renderHook(() => useCurrentDate());

        expect(result.current).toEqual(startOfDay(initialDate));
    });

    it('should update the date when the day changes', () => {
        const initialDate = new Date(2023, 0, 1, 23, 59, 0); // Jan 1, 2023 23:59:00
        vi.setSystemTime(initialDate);

        const { result } = renderHook(() => useCurrentDate());

        expect(result.current).toEqual(startOfDay(initialDate));

        // Advance time by 2 minutes to cross midnight
        act(() => {
            vi.advanceTimersByTime(2 * 60 * 1000);
        });

        const expectedDate = startOfDay(addDays(initialDate, 1)); // Jan 2, 2023 00:00:00
        expect(result.current).toEqual(expectedDate);
    });

    it('should not update if the day has not changed', () => {
        const initialDate = new Date(2023, 0, 1, 10, 0, 0); // Jan 1, 2023 10:00:00
        vi.setSystemTime(initialDate);

        const { result } = renderHook(() => useCurrentDate());

        const firstRenderDate = result.current;

        // Advance time by 1 hour (still same day)
        act(() => {
            vi.advanceTimersByTime(60 * 60 * 1000);
        });

        // Should still be the same object reference
        expect(result.current).toBe(firstRenderDate);
    });
});
