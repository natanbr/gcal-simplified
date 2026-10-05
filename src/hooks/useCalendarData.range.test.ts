// ============================================================
// Every day the Calendar shows lies inside the events request it shows them from
// ------------------------------------------------------------
// The request used to follow the week start and end at the start of the grid's
// last day (Google's timeMax is exclusive), so the 7th column of a 'today' week
// on the 30th and 31st, and the month view's last cell, never showed events;
// and in 'today' mode from Next Month on, the request was aligned on another
// weekday than the drawn grid. This sweeps both views, every week start, the
// offsets a user reaches, over three years of "today"s, through the same
// functions the Dashboard calls.
// ============================================================

import { describe, it, expect } from 'vitest';
import { addDays, format, startOfDay } from 'date-fns';
import { fetchRangeOf, monthKeyOf } from './useCalendarData';
import { getWeekStartDate } from '../utils/weekNavigation';
import { getMonthViewDates, periodAnchor } from '../utils/monthUtils';
import type { WeekStartDay } from '../types';

const WEEK_STARTS: WeekStartDay[] = ['today', 'sunday', 'monday'];
const day = (d: Date) => format(d, 'yyyy-MM-dd');

function uncoveredDays(view: 'week' | 'month', today: Date, offset: number, weekStartDay: WeekStartDay): string[] {
    const shown = view === 'week'
        ? Array.from({ length: 7 }, (_, i) => addDays(getWeekStartDate(today, offset, weekStartDay), i))
        : getMonthViewDates(today, offset, weekStartDay);
    const anchor = periodAnchor(view, today, view === 'week' ? offset : 0, view === 'month' ? offset : 0, weekStartDay);
    const { timeMin, timeMax } = fetchRangeOf(monthKeyOf(anchor));
    return shown
        .filter(d => startOfDay(d) < timeMin || addDays(startOfDay(d), 1) > timeMax)
        .map(d => `${view} ${weekStartDay} today=${day(today)} offset=${offset}: ${day(d)} outside ${day(timeMin)}..${day(timeMax)}`);
}

describe('the events request covers every day on screen', () => {
    it('both views, every week start, 2026-01-01 to 2028-12-31, week offsets 0-5, month offsets 0-2', () => {
        const misses: string[] = [];
        for (let today = new Date(2026, 0, 1, 12); today.getFullYear() < 2029; today = addDays(today, 1)) {
            for (const weekStartDay of WEEK_STARTS) {
                for (let offset = 0; offset <= 5; offset++) misses.push(...uncoveredDays('week', today, offset, weekStartDay));
                for (let offset = 0; offset <= 2; offset++) misses.push(...uncoveredDays('month', today, offset, weekStartDay));
            }
        }
        expect(misses.slice(0, 5), `${misses.length} days on screen outside their request`).toEqual([]);
    });

    it('the range does not depend on the week start: one month, one request', () => {
        const { timeMin, timeMax } = fetchRangeOf('2026-10');
        expect([timeMin, timeMax]).toEqual([new Date(2026, 8, 24), new Date(2026, 10, 16)]);
    });
});
