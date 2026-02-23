import { useState, useCallback, useRef } from 'react';
import { startOfMonth, startOfWeek, addDays } from 'date-fns';
import { AppEvent } from '../types';

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

    // Prevents duplicate concurrent fetches for the same month
    const fetchingMonthsRef = useRef<Set<string>>(new Set());

    const fetchEventsForMonth = useCallback(async (date: Date, weekStartDayStr: string = 'sunday') => {
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

        setError(null);

        const hasCache = !!eventCacheRef.current[cacheKey];

        if (hasCache) {
            // Serve from cache immediately
            setEvents(eventCacheRef.current[cacheKey].events);
            setIsBackgroundLoading(true);
        } else {
            setIsEventsLoading(true);
            setEvents([]); // Clear while loading new initial data
        }

        // Avoid concurrent fetches for the same key
        if (fetchingMonthsRef.current.has(cacheKey)) {
            return;
        }
        fetchingMonthsRef.current.add(cacheKey);

        try {
            const fetchedEvents = await window.ipcRenderer.invoke(
                'data:events',
                gridStart.toISOString(),
                gridEnd.toISOString()
            );

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const hydratedEvents: AppEvent[] = (fetchedEvents as any[]).map((e: any) => ({
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

            setEvents(hydratedEvents);
        } catch (err) {
            console.error("Failed to fetch events", err);
            setError("Failed to load calendar events.");
        } finally {
            setIsEventsLoading(false);
            setIsBackgroundLoading(false);
            fetchingMonthsRef.current.delete(cacheKey);
        }
    }, []);

    // Force a full background refresh of the current visible data
    const refreshEvents = useCallback((date: Date, weekStartDayStr: string = 'sunday') => {
        // Since our logic currently always fetches, just calling fetchEventsForMonth does the job.
        return fetchEventsForMonth(date, weekStartDayStr);
    }, [fetchEventsForMonth]);

    return {
        events,
        isEventsLoading,
        isBackgroundLoading,
        error,
        fetchEventsForMonth,
        refreshEvents
    };
}
