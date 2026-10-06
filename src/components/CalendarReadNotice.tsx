import React from 'react';
import { format, isSameDay } from 'date-fns';
import { CloudOff } from 'lucide-react';
import type { CalendarReadFailure } from '../hooks/useCalendarData';

const WHY = 'The last refresh could not reach Google (offline, or Google busy or down).';
const RETRY = 'The calendar tries again every 5 minutes.';

/** 12 px bold text on the header's white / zinc-950: at least 4.5:1 in both themes. */
const TONE = { stale: 'text-amber-700 dark:text-amber-400', unloaded: 'text-red-600 dark:text-red-400' } as const;

function text(failure: CalendarReadFailure, today: Date): string {
    if (failure.kind === 'unloaded') return "Couldn't load the calendar";
    return `Calendar not updated since ${format(failure.loadedAt, isSameDay(failure.loadedAt, today) ? 'HH:mm' : 'MMM d, HH:mm')}`;
}

/**
 * The header's word on a failed events read, on the status line under the date. Events from an
 * earlier read stay on screen, so it says since when they have not been updated instead of an error
 * over a calendar showing real events; with nothing read for the days on screen it says so.
 *
 * The `role="status"` element is always mounted, so a screen reader announces the text when it
 * appears. It is absolutely positioned, centred under the date and never wrapped: it adds no width
 * or height to the header (in the right-hand group it wrapped the whole header at 1280x720, the
 * owner's 1920x1080 at 150 %). Its parent must be `relative`. Static: no timer, no animation.
 */
export const CalendarReadNotice: React.FC<{ failure: CalendarReadFailure | null; today: Date }> = ({ failure, today }) => (
    <span role="status" className="absolute top-9 left-1/2 -translate-x-1/2 whitespace-nowrap">
        {failure && (
            <span
                data-testid="calendar-read-notice"
                title={failure.kind === 'stale' ? `${WHY} The events shown may be out of date. ${RETRY}` : `${WHY} ${RETRY}`}
                className={`flex items-center gap-1 text-xs font-bold ${TONE[failure.kind]}`}
            >
                <CloudOff size={12} aria-hidden="true" />
                {text(failure, today)}
            </span>
        )}
    </span>
);
