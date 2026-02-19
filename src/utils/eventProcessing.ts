import { startOfDay, endOfDay, isBefore, isSameDay, addDays } from 'date-fns';
import { AppEvent } from '../types';

/**
 * Splits events that span across midnight into multiple single-day event segments.
 * This is crucial for correctly displaying multi-day events on each day they occur.
 */
export const splitMultiDayEvents = (events: AppEvent[]): AppEvent[] => {
    const processedEvents: AppEvent[] = [];

    events.forEach(event => {
        const start = new Date(event.start);
        const end = new Date(event.end);

        if (isSameDay(start, end)) {
            processedEvents.push(event);
            return;
        }

        // Event spans multiple days
        let currentStart = start;
        let segmentIndex = 0;

        while (isBefore(currentStart, end)) {
            const nextDayStart = startOfDay(addDays(currentStart, 1));
            // Actual end for this segment is either the event end or the start of the next day
            // If the event ends before the start of the next day (which shouldn't happen inside the loop unless it's the last segment)
            // we use the event end.
            const segmentEnd = isBefore(end, nextDayStart) ? end : nextDayStart;

            // Create a new event segment
            // We use a composite ID to ensure React keys are unique but traceable
            processedEvents.push({
                ...event,
                id: `${event.id}_seg_${segmentIndex}`,
                start: currentStart,
                end: segmentEnd,
                // Ensure allDay flag is consistent or maybe inferred?
                // If the original was allDay, segments are allDay. 
                // If it wasn't, segments are timed.
                allDay: event.allDay // Preserve allDay flag
            });

            // Move to next day
            currentStart = nextDayStart;
            segmentIndex++;
        }
    });

    return processedEvents;
};

/**
 * Filters events for a specific day, handling the logic of including split segments.
 * Note: This assumes the input `events` list has already been processed by `splitMultiDayEvents` 
 * if you want split segments. However, for efficiency, we might want to split on the fly or pre-process.
 */
export const getEventsForDay = (events: AppEvent[], day: Date): AppEvent[] => {
    const dayStart = startOfDay(day);
    const dayEnd = endOfDay(day);

    const dayEvents: AppEvent[] = [];

    events.forEach(event => {
        const eventStart = new Date(event.start);
        const eventEnd = new Date(event.end);

        // Check for overlap
        // Using getTime() for numeric comparison
        if (eventEnd.getTime() <= dayStart.getTime() || eventStart.getTime() >= dayEnd.getTime()) {
            return;
        }

        // If it overlaps, we need to return the portion that falls on this day.
        // If it is contained within the day, return as is.
        if (eventStart.getTime() >= dayStart.getTime() && eventEnd.getTime() <= dayEnd.getTime()) {
            dayEvents.push(event);
            return;
        }

        // Overlap: Clip to day boundaries for display (or return the segment)
        const clipppedStart = Math.max(eventStart.getTime(), dayStart.getTime());
        const clippedEnd = Math.min(eventEnd.getTime(), dayEnd.getTime());

        dayEvents.push({
            ...event,
            id: `${event.id}_${day.getTime()}`, // Unique ID for this day's segment
            start: new Date(clipppedStart),
            end: new Date(clippedEnd)
        });
    });

    return dayEvents;
};
