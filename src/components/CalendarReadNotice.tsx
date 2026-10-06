import React from 'react';
import { format, isSameDay } from 'date-fns';
import { CloudOff } from 'lucide-react';
import type { CalendarReadFailure } from '../hooks/useCalendarData';

const WHY = 'The last refresh could not reach Google (offline, or Google busy or down).';
const RETRY = 'The calendar tries again every 5 minutes.';

/**
 * The header's word on a failed events read. The events from an earlier read stay on screen, so it
 * says since when they have not been updated instead of an error over a calendar showing real events;
 * a month that never loaded says so. Static: no timer, no animation.
 */
export const CalendarReadNotice: React.FC<{ failure: CalendarReadFailure | null; today: Date }> = ({ failure, today }) => {
    if (!failure) return null;
    const stale = failure.kind === 'stale';
    const text = stale
        ? `Not updated since ${format(failure.loadedAt, isSameDay(failure.loadedAt, today) ? 'HH:mm' : 'MMM d, HH:mm')}`
        : "Couldn't load events";
    const title = stale ? `${WHY} The events shown may be out of date. ${RETRY}` : `${WHY} ${RETRY}`;
    return (
        <span
            role="status"
            title={title}
            data-testid="calendar-read-notice"
            className={`flex items-center gap-1.5 text-xs font-bold ${stale ? 'text-amber-600 dark:text-amber-400' : 'text-red-500'}`}
        >
            <CloudOff size={14} aria-hidden="true" />
            {text}
        </span>
    );
};
