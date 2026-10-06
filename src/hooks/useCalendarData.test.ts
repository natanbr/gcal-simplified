import { renderHook, act } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, afterEach, onTestFinished } from 'vitest';
import { useCalendarData, fetchRangeOf, monthKeyOf } from './useCalendarData';

const mockIpc = {
    invoke: vi.fn(),
    on: vi.fn(() => () => {}),
} satisfies NonNullable<Window['ipcRenderer']>;

const answer = (id: string) => [{ id, title: id, start: '2026-02-20T10:00:00.000Z', end: '2026-02-20T11:00:00.000Z' }];
const deferred = () => {
    let resolve: (value: unknown) => void = () => undefined;
    const promise = new Promise<unknown>(r => { resolve = r; });
    return { promise, resolve };
};
const ids = (events: { id: string }[]) => events.map(e => e.id);
const settle = () => act(async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); });
const requests = () => mockIpc.invoke.mock.calls.length;

interface Shown { month: string | null; generation: number; onScreen?: Date[] }

/** `onScreen`, the days drawn, matters only for a month that never loaded (none drawn: nothing to cover). */
function renderMonth(month: string | null, generation = 1, onScreen: Date[] = []) {
    return renderHook(({ month: m, generation: g, onScreen: days = [] }: Shown) => useCalendarData(m, g, days),
        { initialProps: { month, generation, onScreen } as Shown });
}

/** `count` days from `first`, as the grid draws them. */
const daysFrom = (first: Date, count: number) => Array.from({ length: count }, (_, i) => new Date(first.getFullYear(), first.getMonth(), first.getDate() + i));

describe('useCalendarData', () => {
    beforeEach(() => {
        vi.resetAllMocks();
        window.ipcRenderer = mockIpc;
    });

    afterEach(() => {
        delete window.ipcRenderer;
    });

    it('keys months as YYYY-MM', () => {
        expect(monthKeyOf(new Date(2026, 0, 31))).toBe('2026-01');
        expect(monthKeyOf(new Date(2026, 11, 1))).toBe('2026-12');
    });

    it('asks for nothing until it is given a month (the settings are not read yet)', async () => {
        const { result } = renderMonth(null, 0);
        await settle();

        expect(requests()).toBe(0);
        expect(result.current.events).toEqual([]);
        expect(result.current.activity).toBe('idle');
        expect(result.current.hasLoaded).toBe(false);
    });

    it('requests the month from a week before it to two weeks after it, and hydrates the dates', async () => {
        mockIpc.invoke.mockResolvedValueOnce(answer('feb'));
        const { result } = renderMonth('2026-02');
        expect(result.current.activity).toBe('loading');
        await settle();

        const { timeMin, timeMax } = fetchRangeOf('2026-02');
        expect(mockIpc.invoke).toHaveBeenCalledWith('data:events', timeMin.toISOString(), timeMax.toISOString());
        expect(timeMin).toEqual(new Date(2026, 0, 25));
        expect(timeMax).toEqual(new Date(2026, 2, 16));
        expect(ids(result.current.events)).toEqual(['feb']);
        expect(result.current.events[0].start).toBeInstanceOf(Date);
        expect(result.current.activity).toBe('idle');
        expect(result.current.hasLoaded).toBe(true);
    });

    it('a cached month shows at once and is re-read in the background', async () => {
        mockIpc.invoke.mockResolvedValueOnce(answer('feb')).mockResolvedValueOnce(answer('mar'));
        const { result, rerender } = renderMonth('2026-02');
        await settle();
        rerender({ month: '2026-03', generation: 1 });
        await settle();

        const again = deferred();
        mockIpc.invoke.mockReturnValueOnce(again.promise);
        rerender({ month: '2026-02', generation: 1 });
        expect(ids(result.current.events)).toEqual(['feb']);
        expect(result.current.activity).toBe('refreshing');

        await act(async () => { again.resolve(answer('feb-2')); await again.promise; });
        expect(ids(result.current.events)).toEqual(['feb-2']);
        expect(result.current.activity).toBe('idle');
    });

    it('a month not loaded yet keeps the events already on screen while it loads', async () => {
        mockIpc.invoke.mockResolvedValueOnce(answer('feb'));
        const { result, rerender } = renderMonth('2026-02');
        await settle();

        const march = deferred();
        mockIpc.invoke.mockReturnValueOnce(march.promise);
        rerender({ month: '2026-03', generation: 1 });

        expect(result.current.activity).toBe('loading');
        expect(ids(result.current.events)).toEqual(['feb']);
        await act(async () => { march.resolve(answer('mar')); await march.promise; });
        expect(ids(result.current.events)).toEqual(['mar']);
    });

    it('an answer for a month the user has left only fills its cache', async () => {
        const february = deferred();
        const march = deferred();
        mockIpc.invoke.mockReturnValueOnce(february.promise).mockReturnValueOnce(march.promise);
        const { result, rerender } = renderMonth('2026-02');
        rerender({ month: '2026-03', generation: 1 });

        await act(async () => { march.resolve(answer('mar')); await march.promise; });
        await act(async () => { february.resolve(answer('feb')); await february.promise; });
        expect(ids(result.current.events)).toEqual(['mar']);
        expect(result.current.activity).toBe('idle');

        mockIpc.invoke.mockReturnValueOnce(new Promise(() => undefined));
        rerender({ month: '2026-02', generation: 1 });
        expect(ids(result.current.events)).toEqual(['feb']);
    });

    it('a new generation asks again while the month is in flight, and the older answer cannot win', async () => {
        const old = deferred();
        const fresh = deferred();
        mockIpc.invoke.mockReturnValueOnce(old.promise).mockReturnValueOnce(fresh.promise);
        const { result, rerender } = renderMonth('2026-02', 1);
        rerender({ month: '2026-02', generation: 2 });
        expect(requests()).toBe(2);

        await act(async () => { fresh.resolve(answer('new-selection')); await fresh.promise; });
        await act(async () => { old.resolve(answer('old-selection')); await old.promise; });
        expect(ids(result.current.events)).toEqual(['new-selection']);
        expect(result.current.activity).toBe('idle');
    });

    it('refresh in the same generation joins the request in flight instead of sending another', async () => {
        const pending = deferred();
        mockIpc.invoke.mockReturnValueOnce(pending.promise);
        const { result } = renderMonth('2026-02');

        act(() => { result.current.refresh(); });
        expect(requests()).toBe(1);
        await act(async () => { pending.resolve(answer('feb')); await pending.promise; });

        mockIpc.invoke.mockResolvedValueOnce(answer('feb-2'));
        act(() => { result.current.refresh(); });
        await settle();
        expect(requests()).toBe(2);
        expect(ids(result.current.events)).toEqual(['feb-2']);
    });

    it('a month whose only read failed says nothing is loaded and ends the first load; the next answer clears it', async () => {
        quietErrors();
        mockIpc.invoke.mockRejectedValueOnce(new Error('Google request failed (ENOTFOUND)'));
        const { result } = renderMonth('2026-02');
        await settle();

        expect(result.current.hasLoaded).toBe(true);
        expect(result.current.failure).toEqual({ kind: 'unloaded' });
        expect(result.current.activity).toBe('idle');

        mockIpc.invoke.mockResolvedValueOnce(answer('feb'));
        act(() => { result.current.refresh(); });
        await settle();
        expect(result.current.failure).toBeNull();
        expect(ids(result.current.events)).toEqual(['feb']);
    });

    // The main process fails a read Google could not answer (electron/google-unreachable.ts) instead of
    // answering [], so a failed refresh must keep the month: it is what the family sees all day.
    it('a failed refresh keeps the month\'s events and says when they were read; the next answer replaces them', async () => {
        quietErrors();
        vi.useFakeTimers({ toFake: ['Date'] });
        onTestFinished(() => { vi.useRealTimers(); });
        const at = (minute: number) => new Date(2026, 1, 20, 9, minute);
        const refreshAt = async (minute: number, outcome: () => Promise<unknown>) => {
            vi.setSystemTime(at(minute));
            mockIpc.invoke.mockImplementationOnce(outcome);
            act(() => { result.current.refresh(); });
            await settle();
        };
        vi.setSystemTime(at(0));
        mockIpc.invoke.mockResolvedValueOnce(answer('feb'));
        const { result } = renderMonth('2026-02');
        await settle();
        expect(result.current.failure).toBeNull();

        await refreshAt(5, () => Promise.reject(new Error('Google request failed (ENOTFOUND)')));
        expect(ids(result.current.events)).toEqual(['feb']);
        expect(result.current.failure).toEqual({ kind: 'stale', loadedAt: at(0) });

        await refreshAt(10, () => Promise.reject(new Error('Google request failed (status 503)')));
        expect(result.current.failure).toEqual({ kind: 'stale', loadedAt: at(0) }); // the last read that worked

        await refreshAt(15, () => Promise.resolve(answer('feb-2')));
        expect(ids(result.current.events)).toEqual(['feb-2']);
        expect(result.current.failure).toBeNull();
    });

    describe('offline, with the clock at 9:00 for the reads that worked', () => {
        const at = (minute: number) => new Date(2026, 1, 20, 9, minute);
        const offline = () => Promise.reject(new Error('Google request failed (ENOTFOUND)'));
        let quiet: ReturnType<typeof vi.spyOn>;
        beforeEach(() => {
            quiet = vi.spyOn(console, 'error').mockImplementation(() => undefined);
            vi.useFakeTimers({ toFake: ['Date'] });
            vi.setSystemTime(at(0));
        });
        afterEach(() => {
            vi.useRealTimers();
            quiet.mockRestore();
        });

        it('a new generation (a Save or a reconnect) that fails keeps the events, with the time of the read that worked', async () => {
            mockIpc.invoke.mockResolvedValueOnce(answer('feb'));
            const { result, rerender } = renderMonth('2026-02', 1);
            await settle();

            vi.setSystemTime(at(5));
            mockIpc.invoke.mockImplementationOnce(offline);
            rerender({ month: '2026-02', generation: 2 });
            await settle();

            expect(ids(result.current.events)).toEqual(['feb']);
            expect(result.current.failure).toEqual({ kind: 'stale', loadedAt: at(0) });
        });

        it('back to a month already read: its own events, with its own time', async () => {
            mockIpc.invoke.mockResolvedValueOnce(answer('feb'));
            const { result, rerender } = renderMonth('2026-02');
            await settle();
            vi.setSystemTime(at(1));
            mockIpc.invoke.mockResolvedValueOnce(answer('mar'));
            rerender({ month: '2026-03', generation: 1 });
            await settle();

            vi.setSystemTime(at(5));
            mockIpc.invoke.mockImplementationOnce(offline);
            rerender({ month: '2026-02', generation: 1 });
            await settle();

            expect(ids(result.current.events)).toEqual(['feb']);
            expect(result.current.failure).toEqual({ kind: 'stale', loadedAt: at(0) });
        });

        // February's read runs from Jan 25 to Mar 15 (fetchRangeOf): it can stand in for March's first two weeks only.
        it('a month never read borrows the events on screen only while their read covers every day drawn', async () => {
            mockIpc.invoke.mockResolvedValueOnce(answer('feb'));
            const { result, rerender } = renderMonth('2026-02', 1, daysFrom(new Date(2026, 1, 16), 7));
            await settle();

            mockIpc.invoke.mockImplementation(offline);
            rerender({ month: '2026-03', generation: 1, onScreen: daysFrom(new Date(2026, 2, 9), 7) });  // Mar 9-15
            await settle();
            expect(ids(result.current.events)).toEqual(['feb']);
            expect(result.current.failure).toEqual({ kind: 'stale', loadedAt: at(0) });

            rerender({ month: '2026-03', generation: 1, onScreen: daysFrom(new Date(2026, 2, 10), 7) }); // Mar 10-16
            expect(result.current.events).toEqual([]);
            expect(result.current.failure).toEqual({ kind: 'unloaded' });
        });
    });
});

function quietErrors() {
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    onTestFinished(() => quiet.mockRestore());
}
