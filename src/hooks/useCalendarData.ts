import { useState, useCallback, useRef, useEffect } from 'react';
import { addDays, addMonths, startOfDay } from 'date-fns';
import { AppEvent, SerializedAppEvent } from '../types';

/** The visible month's events: none yet and being read (`loading`), or shown and being re-read (`refreshing`). */
export type CalendarActivity = 'idle' | 'loading' | 'refreshing';

/** Events are requested and cached per month, keyed `YYYY-MM`. */
export const monthKeyOf = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

/**
 * A month's request: from a week before the month to two weeks after it, end exclusive (Google's
 * timeMax is). Any week starting in the month and any 42-day grid of it fall inside, whatever the
 * week start, so a display setting never changes what is fetched (useCalendarData.range.test.ts).
 */
export function fetchRangeOf(month: string): { timeMin: Date; timeMax: Date } {
    const [year, monthNumber] = month.split('-').map(Number);
    const first = new Date(year, monthNumber - 1, 1);
    return { timeMin: addDays(first, -7), timeMax: addDays(addMonths(first, 1), 15) };
}

/**
 * The visible month's latest read failed: the events shown come from an earlier read, at `loadedAt`
 * (`stale`), or nothing that was read covers the days on screen (`unloaded`, an empty grid).
 * A failed read never replaces a month's events.
 */
export type CalendarReadFailure = { kind: 'stale'; loadedAt: Date } | { kind: 'unloaded' };

type MonthEntry = { events: AppEvent[]; loadedAt: Date; failed?: true } | { events?: undefined; failed: true };

/** The events on screen, and the month whose read they came from. */
interface Shown { events: AppEvent[]; from: { month: string; loadedAt: Date } | null }
const NOTHING_SHOWN: Shown = { events: [], from: null };

/** Whether `month`'s read covers every day in `days` (in order; none drawn, nothing to miss). */
function covers(month: string, days: readonly Date[]): boolean {
    if (days.length === 0) return true;
    const { timeMin, timeMax } = fetchRangeOf(month);
    const first = startOfDay(days[0]);
    const end = addDays(startOfDay(days[days.length - 1]), 1);
    return first.getTime() >= timeMin.getTime() && end.getTime() <= timeMax.getTime();
}

/**
 * What the grid draws for the visible month, and what the header says about it. A month not read
 * yet keeps the events on screen while it loads. Once its read has failed it borrows them only if
 * their read covers every day drawn: past that, a day would look empty when nothing was read for it.
 */
function view(entry: MonthEntry | undefined, shown: Shown, onScreen: readonly Date[]): { events: AppEvent[]; failure: CalendarReadFailure | null } {
    if (entry?.events) return { events: entry.events, failure: entry.failed ? { kind: 'stale', loadedAt: entry.loadedAt } : null };
    if (!entry?.failed) return { events: shown.events, failure: null };
    if (shown.from && covers(shown.from.month, onScreen)) return { events: shown.events, failure: { kind: 'stale', loadedAt: shown.from.loadedAt } };
    return { events: [], failure: { kind: 'unloaded' } };
}

/**
 * The events of `visibleMonth` (a `monthKeyOf` key; null fetches nothing) for the days `onScreen`.
 * A new `generation` refetches the month even while a request for it is in flight, and an answer
 * from an older generation is dropped: a Save or a reconnect may have changed what the main process
 * reads. A new sign-in remounts the Dashboard (CalendarApp), so nothing here outlives an account.
 */
export function useCalendarData(visibleMonth: string | null, generation: number, onScreen: readonly Date[]) {
    const [months, setMonths] = useState<Record<string, MonthEntry>>({});
    const [pending, setPending] = useState<Record<string, number>>({}); // month → generation in flight
    const newest = useRef<Record<string, number>>({});                 // month → newest generation asked for
    const inFlight = useRef(new Set<string>());                        // `${month}@${generation}`

    const request = useCallback(async (month: string, gen: number) => {
        const id = `${month}@${gen}`;
        if (gen < (newest.current[month] ?? gen) || inFlight.current.has(id)) return;
        inFlight.current.add(id);
        newest.current[month] = gen;
        setPending(p => ({ ...p, [month]: gen }));
        let answer: AppEvent[] | null = null;
        try {
            const ipc = window.ipcRenderer;
            if (!ipc) throw new Error('ipcRenderer not available');
            const { timeMin, timeMax } = fetchRangeOf(month);
            const fetched = await ipc.invoke('data:events', timeMin.toISOString(), timeMax.toISOString()) as SerializedAppEvent[];
            answer = fetched.map(e => ({ ...e, start: new Date(e.start), end: new Date(e.end) }));
        } catch (err) {
            console.error('Failed to fetch events', err);
        } finally {
            inFlight.current.delete(id);
        }
        if (gen < newest.current[month]) return; // asked for again since: this answer is stale
        const loadedAt = new Date();
        setMonths(m => ({ ...m, [month]: answer ? { events: answer, loadedAt } : { ...m[month], failed: true } }));
        setPending(p => {
            if (p[month] !== gen) return p;
            const rest = { ...p };
            delete rest[month];
            return rest;
        });
    }, []);

    useEffect(() => {
        if (visibleMonth) void request(visibleMonth, generation);
    }, [visibleMonth, generation, request]);

    /** Re-reads the visible month in the background; a request already in flight for it answers instead. */
    const refresh = useCallback(() => {
        if (visibleMonth) void request(visibleMonth, generation);
    }, [visibleMonth, generation, request]);

    const entry = visibleMonth ? months[visibleMonth] : undefined;
    // A month not loaded yet keeps the events last shown (requirements → Enhanced Loading Indicator).
    const [shown, setShown] = useState<Shown>(NOTHING_SHOWN);
    if (visibleMonth && entry?.events && entry.events !== shown.events) {
        setShown({ events: entry.events, from: { month: visibleMonth, loadedAt: entry.loadedAt } });
    }
    const { events, failure } = view(entry, shown, onScreen);
    const activity: CalendarActivity = visibleMonth && pending[visibleMonth] !== undefined
        ? (entry?.events ? 'refreshing' : 'loading')
        : 'idle';

    return {
        events,
        activity,
        failure,
        /** The first answer, or failure, is in: from then on the week stays on screen. */
        hasLoaded: Object.keys(months).length > 0,
        refresh,
    };
}
