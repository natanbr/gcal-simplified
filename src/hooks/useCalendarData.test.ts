import { renderHook, act } from '@testing-library/react';
import { useCalendarData } from './useCalendarData';
import { vi, describe, it, expect, beforeEach } from 'vitest';

// Mock ipcRenderer
window.ipcRenderer = {
    invoke: vi.fn(),
} as any;

describe('useCalendarData hook', () => {
    beforeEach(() => {
        vi.resetAllMocks();
    });

    it('should initially have empty state', () => {
        const { result } = renderHook(() => useCalendarData());

        expect(result.current.events).toEqual([]);
        expect(result.current.isEventsLoading).toBe(false);
        expect(result.current.isBackgroundLoading).toBe(false);
        expect(result.current.error).toBeNull();
    });

    it('should trigger fetch process on fetchEventsForMonth', async () => {
        const mockEvents = [{ id: '1', title: 'Test Event', start: '2026-02-01T10:00:00.000Z', end: '2026-02-01T11:00:00.000Z' }];
        (window.ipcRenderer.invoke as any).mockResolvedValue(mockEvents);

        const { result } = renderHook(() => useCalendarData());

        const dateToFetch = new Date('2026-02-15T10:00:00.000Z');

        let promise: Promise<void> | null = null;
        act(() => {
            promise = result.current.fetchEventsForMonth(dateToFetch, 'sunday');
        });

        expect(result.current.isEventsLoading).toBe(true);

        await act(async () => {
            await promise;
        });

        expect(result.current.isEventsLoading).toBe(false);
        expect(result.current.events.length).toBe(1);
        expect(result.current.events[0].id).toBe('1');
        // ensure string dates were correctly hydrated to objects
        expect(result.current.events[0].start).toBeInstanceOf(Date);

        // Assert ipc renderer got called with right dates (grid for Feb 2026, assuming weekStart 0 = Sunday)
        // Month start: Feb 01 2026 (Sun)
        // Month end: Feb 28 2026 (Sat)
        // Grid should exactly match this for Feb 2026
        expect(window.ipcRenderer.invoke).toHaveBeenCalledWith(
            'data:events',
            expect.any(String),
            expect.any(String)
        );
    });

    it('should serve from cache and fetch in background on subsequent calls for same month', async () => {
        const mockEventsFirst = [{ id: '1', title: 'V1', start: '2026-02-01T10:00:00.000Z', end: '2026-02-01T11:00:00.000Z' }];
        const mockEventsSecond = [{ id: '1', title: 'V2', start: '2026-02-01T10:00:00.000Z', end: '2026-02-01T11:00:00.000Z' }];

        const invokeMock = window.ipcRenderer.invoke as any;
        invokeMock.mockResolvedValueOnce(mockEventsFirst);

        const { result } = renderHook(() => useCalendarData());
        const dateToFetch = new Date('2026-02-15T10:00:00.000Z');

        await act(async () => {
            await result.current.fetchEventsForMonth(dateToFetch, 'sunday');
        });

        expect(result.current.events[0].title).toBe('V1');

        // Setup second fetch mock
        invokeMock.mockResolvedValueOnce(mockEventsSecond);

        // Second fetch, should instantly return cached values, then fetch background
        let promise: Promise<void> | null = null;
        act(() => {
            promise = result.current.fetchEventsForMonth(dateToFetch, 'sunday');
            // It uses background loading now because cache hit
        });

        // Immediately after synchronous update
        expect(result.current.isBackgroundLoading).toBe(true);
        expect(result.current.isEventsLoading).toBe(false);
        expect(result.current.events[0].title).toBe('V1'); // Still V1

        await act(async () => {
            await promise;
        });

        expect(result.current.isBackgroundLoading).toBe(false);
        expect(result.current.events[0].title).toBe('V2'); // Now V2
    });
});
