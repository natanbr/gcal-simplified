import { renderHook, act } from '@testing-library/react';
import { useCalendarData } from './useCalendarData';
import { vi, describe, it, expect, beforeEach, afterEach, onTestFinished } from 'vitest';

// Mock ipcRenderer
const mockIpc = {
    invoke: vi.fn(),
    on: vi.fn(() => () => {}),
} satisfies NonNullable<Window['ipcRenderer']>;

describe('useCalendarData hook', () => {
    beforeEach(() => {
        vi.resetAllMocks();
        window.ipcRenderer = mockIpc;
    });

    afterEach(() => {
        delete window.ipcRenderer;
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
        vi.mocked(mockIpc.invoke).mockResolvedValue(mockEvents);

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
        expect(mockIpc.invoke).toHaveBeenCalledWith(
            'data:events',
            expect.any(String),
            expect.any(String)
        );
    });

    it('should serve from cache and fetch in background on subsequent calls for same month', async () => {
        const mockEventsFirst = [{ id: '1', title: 'V1', start: '2026-02-01T10:00:00.000Z', end: '2026-02-01T11:00:00.000Z' }];
        const mockEventsSecond = [{ id: '1', title: 'V2', start: '2026-02-01T10:00:00.000Z', end: '2026-02-01T11:00:00.000Z' }];

        const invokeMock = vi.mocked(mockIpc.invoke);
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

    // A period not in the cache used to empty the list, and an empty list put
    // the Dashboard behind the full-screen spinner (Dashboard.loading.test.tsx).
    describe('a period that is not cached yet', () => {
        const feb = new Date(2026, 1, 15);
        const mar = new Date(2026, 2, 15);
        const answer = (id: string) => [{ id, title: id, start: '2026-02-20T10:00:00.000Z', end: '2026-02-20T11:00:00.000Z' }];
        const deferred = () => {
            let resolve: (value: unknown) => void = () => undefined;
            const promise = new Promise<unknown>(r => { resolve = r; });
            return { promise, resolve };
        };

        it('keeps the events already on screen while it loads', async () => {
            vi.mocked(mockIpc.invoke).mockResolvedValueOnce(answer('feb'));
            const { result } = renderHook(() => useCalendarData());
            await act(async () => { await result.current.fetchEventsForMonth(feb, 'sunday'); });

            const march = deferred();
            vi.mocked(mockIpc.invoke).mockReturnValueOnce(march.promise);
            act(() => { void result.current.fetchEventsForMonth(mar, 'sunday'); });

            expect(result.current.isEventsLoading).toBe(true);
            expect(result.current.events.map(e => e.id)).toEqual(['feb']);
            await act(async () => { march.resolve(answer('mar')); await march.promise; });
            expect(result.current.events.map(e => e.id)).toEqual(['mar']);
            expect(result.current.isEventsLoading).toBe(false);
        });

        it('a late answer for a period the user has left does not replace the one on screen', async () => {
            const { result } = renderHook(() => useCalendarData());
            const february = deferred();
            const march = deferred();
            vi.mocked(mockIpc.invoke).mockReturnValueOnce(february.promise).mockReturnValueOnce(march.promise);
            act(() => {
                void result.current.fetchEventsForMonth(feb, 'sunday');
                void result.current.fetchEventsForMonth(mar, 'sunday');
            });

            await act(async () => { march.resolve(answer('mar')); await march.promise; });
            await act(async () => { february.resolve(answer('feb')); await february.promise; });

            expect(result.current.events.map(e => e.id)).toEqual(['mar']);
            expect(result.current.isEventsLoading).toBe(false);
            // The late answer is still cached: going back shows it at once.
            vi.mocked(mockIpc.invoke).mockReturnValueOnce(new Promise(() => undefined));
            act(() => { void result.current.fetchEventsForMonth(feb, 'sunday'); });
            expect(result.current.events.map(e => e.id)).toEqual(['feb']);
        });

        it('hasLoaded turns true once the first answer, or the first failure, is in', async () => {
            vi.mocked(mockIpc.invoke).mockRejectedValueOnce(new Error('offline'));
            const quiet = vi.spyOn(console, 'error').mockImplementation(() => undefined);
            onTestFinished(() => quiet.mockRestore());
            const { result } = renderHook(() => useCalendarData());
            expect(result.current.hasLoaded).toBe(false);

            await act(async () => { await result.current.fetchEventsForMonth(feb, 'sunday'); });
            expect(result.current.hasLoaded).toBe(true);
            expect(result.current.error).not.toBeNull();
        });
    });
});
