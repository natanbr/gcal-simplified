import { useState, useCallback, useRef } from 'react';
import { startOfMonth, startOfWeek, addDays } from 'date-fns';
import { AppEvent, SerializedAppEvent, UserConfig } from '../types';

interface CacheEntry {
    events: AppEvent[];
    lastFetched: number;
}

export function useCalendarData() {
    // Key format: YYYY-MM
    const eventCacheRef = useRef<Record<string, CacheEntry>>({});
    const [events, setEvents] = useState<AppEvent[]>([]);

    // UI state
    const [isEventsLoading, setIsEventsLoading] = useState(false);
    const [isBackgroundLoading, setIsBackgroundLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    // True once the first answer (events or a failure) is in: until then there is no week to show.
    const [hasLoaded, setHasLoaded] = useState(false);

    // Prevents duplicate concurrent fetches for the same month
    const fetchingMonthsRef = useRef<Set<string>>(new Set());
    // The period on screen. Only its answer may change what is shown; any other answer is just cached.
    const visibleKeyRef = useRef<string | null>(null);

    const fetchEventsForMonth = useCallback(async (date: Date, weekStartDayStr: UserConfig['weekStartDay']) => {
        // Find the visible grid for this month
        const weekStartDay = weekStartDayStr === 'monday' ? 1
            : weekStartDayStr === 'today' ? date.getDay()
                : 0;

        const monthStart = startOfMonth(date);
        const gridStart = startOfWeek(monthStart, { weekStartsOn: weekStartDay as 0 | 1 | 2 | 3 | 4 | 5 | 6 });
        // The MonthlyView grid is always 42 days (6 weeks) long.
        // We must fetch this exact range so that trailing days in the 6th week show events.
        const gridEnd = addDays(gridStart, 41);

        const cacheKey = `${date.getFullYear()}-${date.getMonth()}-${weekStartDay}`;
        visibleKeyRef.current = cacheKey;

        setError(null);

        const hasCache = !!eventCacheRef.current[cacheKey];

        if (hasCache) {
            // Serve from cache immediately
            setEvents(eventCacheRef.current[cacheKey].events);
            setIsEventsLoading(false);
            setIsBackgroundLoading(true);
        } else {
            // The events already on screen stay until this answer replaces them
            // (requirements → Enhanced Loading Indicator: the user sees the previous state).
            setIsEventsLoading(true);
        }

        // Avoid concurrent fetches for the same key
        if (fetchingMonthsRef.current.has(cacheKey)) {
            return;
        }
        fetchingMonthsRef.current.add(cacheKey);

        try {
            if (!window.ipcRenderer) throw new Error('ipcRenderer not available');
            const fetchedEvents = await window.ipcRenderer.invoke(
                'data:events',
                gridStart.toISOString(),
                gridEnd.toISOString()
            ) as SerializedAppEvent[];

            const hydratedEvents: AppEvent[] = fetchedEvents.map((e: SerializedAppEvent) => ({
                ...e,
                start: new Date(e.start),
                end: new Date(e.end)
            }));

            // Update cache and ref
            const newCacheEntry = {
                events: hydratedEvents,
                lastFetched: Date.now()
            };

            eventCacheRef.current[cacheKey] = newCacheEntry;

            if (visibleKeyRef.current === cacheKey) setEvents(hydratedEvents);
        } catch (err) {
            console.error("Failed to fetch events", err);
            if (visibleKeyRef.current === cacheKey) setError("Failed to load calendar events.");
        } finally {
            fetchingMonthsRef.current.delete(cacheKey);
            if (visibleKeyRef.current === cacheKey) {
                setIsEventsLoading(false);
                setIsBackgroundLoading(false);
                setHasLoaded(true);
            }
        }
    }, []);

    // Force a full background refresh of the current visible data
    const refreshEvents = useCallback((date: Date, weekStartDayStr: UserConfig['weekStartDay']) => {
        // Since our logic currently always fetches, just calling fetchEventsForMonth does the job.
        return fetchEventsForMonth(date, weekStartDayStr);
    }, [fetchEventsForMonth]);

    return {
        events,
        isEventsLoading,
        isBackgroundLoading,
        error,
        hasLoaded,
        fetchEventsForMonth,
        refreshEvents
    };
}
