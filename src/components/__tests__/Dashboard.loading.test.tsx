// ============================================================
// Calendar — when the Dashboard may show the full-screen spinner, and which
// days its events request covers
// ------------------------------------------------------------
// "Syncing with Google..." replaces the whole Dashboard, so it is allowed only
// before the first week has been shown (requirements → Enhanced Loading
// Indicator: "should not block the entire UI, unless it's the initial load").
// It used to come back at launch, because the first events request was made
// before the saved week start had been read, and on the first Next Week into a
// month not loaded yet, because a cache miss emptied the week. Bug S1
// (release-qa-plan) had the same cause: settings were read last.
// The events request covers a whole month, from a week before it to two weeks
// after, whatever the week start: a display setting no longer shapes the data.
// ============================================================

import { render, screen, fireEvent, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach, onTestFinished } from 'vitest';
import { addDays } from 'date-fns';
import { Dashboard } from '../Dashboard';
import { calendarEvent, installCalendarIpc, settle, type CalendarIpc } from '../calendarTestKit';

const at = (month: number, date: number, hour = 10) => new Date(2026, month, date, hour);
const monthRange = (year: number, month: number) =>
    [addDays(new Date(year, month, 1), -7).toISOString(), addDays(new Date(year, month + 1, 1), 15).toISOString()];
const OCTOBER = monthRange(2026, 9);
const NOVEMBER = monthRange(2026, 10);

const STANDUP = calendarEvent('standup', at(9, 28));   // Wed Oct 28, this week
const DENTIST = calendarEvent('dentist', at(10, 2));   // Mon Nov 2, next week
const SWIM = calendarEvent('swim', at(10, 4, 16));     // Wed Nov 4, added later

let ipc: CalendarIpc;
const firstDayShown = () => screen.getAllByTestId('day-header-name')[0].textContent;
const quietErrors = () => {
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    onTestFinished(() => quiet.mockRestore());
};

/** Every screen the Dashboard showed, in order, with repeats collapsed. */
function recordScreens(): string[] {
    const seen: string[] = [];
    const note = () => {
        const now = screen.queryByText('Syncing with Google...') ? 'spinner'
            : screen.queryByTestId('calendar-grid') ? 'week' : 'other';
        if (seen[seen.length - 1] !== now) seen.push(now);
    };
    const observer = new MutationObserver(note);
    observer.observe(document.body, { subtree: true, childList: true, characterData: true });
    onTestFinished(() => observer.disconnect());
    return seen;
}

async function launch(): Promise<string[]> {
    const seen = recordScreens();
    render(<Dashboard />);
    await screen.findByTestId('calendar-grid');
    await settle();
    return seen;
}

beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 28, 12, 0)); // Wednesday
    ipc = installCalendarIpc();
    ipc.settings = { calendarIds: [], taskListIds: [], weekStartDay: 'monday' };
    ipc.events = [STANDUP, DENTIST];
});

afterEach(() => {
    delete window.ipcRenderer;
    vi.useRealTimers();
});

describe('Dashboard launch', () => {
    it('reads the saved week start first, asks for the month once, and never brings the spinner back', async () => {
        const seen = await launch();

        expect(ipc.order().indexOf('settings:get')).toBeLessThan(ipc.order().indexOf('data:events'));
        expect(ipc.requests('data:events')).toEqual([OCTOBER]);
        expect(firstDayShown()).toBe('Monday');
        expect(screen.getByTestId('event-card-standup')).toBeTruthy();
        expect(seen).toEqual(['spinner', 'week']);
    });

    it('with an empty calendar shows the grid with its day headers, and Next Week keeps it', async () => {
        ipc.events = [];
        const seen = await launch();
        expect(screen.getAllByTestId('day-header-name')).toHaveLength(7);
        expect(screen.queryByTestId('calendar-read-notice')).toBeNull();

        fireEvent.click(screen.getByTestId('next-week-button'));
        await settle();

        expect(ipc.requests('data:events')).toEqual([OCTOBER, NOVEMBER]);
        expect(seen).toEqual(['spinner', 'week']);
    });

    it('offline: the week shows with the saved week start, saying its events could not load', async () => {
        // Google unreachable fails the events read (electron/google-unreachable.ts); it used to answer [].
        ipc.failing = new Set(['data:events', 'data:tasks', 'weather:get']);
        quietErrors();
        const seen = await launch();

        expect(firstDayShown()).toBe('Monday');
        expect(screen.getByTestId('calendar-read-notice').textContent).toBe("Couldn't load the calendar");
        expect(seen).toEqual(['spinner', 'week']);
    });

    // S1 in docs/release-qa-plan.md.
    it('a weather failure still loads the saved settings and shows no calendar error', async () => {
        ipc.failing = new Set(['weather:get']);
        quietErrors();
        await launch();

        expect(firstDayShown()).toBe('Monday');
        expect(screen.getByTestId('event-card-standup')).toBeTruthy();
        expect(screen.queryByTestId('calendar-read-notice')).toBeNull();
    });

    it('a settings file busy at launch: the week shown and the days fetched agree (week start "today")', async () => {
        vi.setSystemTime(new Date(2026, 7, 24, 12, 0)); // Monday Aug 24
        ipc.failing = new Set(['settings:get']);
        ipc.events = [calendarEvent('saturday', at(8, 5)), calendarEvent('sunday', at(8, 6))];
        await launch();

        fireEvent.click(screen.getByTestId('next-week-button')); // Mon Aug 31 - Sun Sep 6
        await settle();

        expect(screen.getByTestId('event-card-saturday')).toBeTruthy();
        expect(screen.getByTestId('event-card-sunday')).toBeTruthy();
    });
});

describe('Dashboard: every day on screen is inside the request', () => {
    it('the 7th day of a "today" week on the 30th (the request used to end the day before it)', async () => {
        vi.setSystemTime(new Date(2026, 9, 30, 12, 0)); // Friday Oct 30: Oct 30 - Thu Nov 5
        ipc.settings = { ...ipc.settings, weekStartDay: 'today' };
        ipc.events = [calendarEvent('thursday', at(10, 5))];
        await launch();

        expect(screen.getByTestId('event-card-thursday')).toBeTruthy();
    });

    it('"today" month view, Next Month: the grid and the request agree on the days', async () => {
        vi.setSystemTime(new Date(2026, 9, 4, 12, 0)); // Sunday Oct 4
        ipc.settings = { ...ipc.settings, weekStartDay: 'today' };
        ipc.events = [calendarEvent('december-tenth', at(11, 10))];
        await launch();

        fireEvent.click(screen.getByTestId('monthly-view-toggle'));
        fireEvent.click(screen.getByTestId('next-week-button')); // Next Month: Nov 1 - Dec 12
        await settle();

        expect(within(screen.getByTestId('month-day-2026-12-10')).getByText('december-tenth')).toBeTruthy();
    });
});

describe('Dashboard week navigation', () => {
    it('Next Week into a month not loaded yet keeps the Dashboard, with the small indicator', async () => {
        const seen = await launch();
        ipc.events = [STANDUP, DENTIST, SWIM];
        ipc.holding.add('data:events');

        fireEvent.click(screen.getByTestId('next-week-button'));
        await settle();

        expect(screen.queryByText('Syncing with Google...')).toBeNull();
        expect(screen.getByTestId('event-card-dentist')).toBeTruthy();  // already known: it stays on screen
        expect(screen.getByText('Fetching Events...')).toBeTruthy();
        expect(screen.getByTitle('Loading...')).toBeTruthy();
        expect(screen.queryByTestId('event-card-swim')).toBeNull();
        expect(ipc.requests('data:events').at(-1)).toEqual(NOVEMBER);

        await ipc.release('data:events');
        expect(screen.getByTestId('event-card-swim')).toBeTruthy();
        expect(screen.queryByTitle('Loading...')).toBeNull();
        expect(seen).toEqual(['spinner', 'week']);
    });

    it('Previous Week back into a loaded month shows it from the cache, refreshing in the background', async () => {
        const seen = await launch();
        fireEvent.click(screen.getByTestId('next-week-button'));
        await settle();
        ipc.holding.add('data:events');

        fireEvent.click(screen.getByTestId('prev-week-button'));
        await settle();

        expect(screen.getByTestId('event-card-standup')).toBeTruthy();
        expect(screen.getByTitle('Background Refreshing...')).toBeTruthy();
        await ipc.release('data:events');
        expect(screen.queryByTitle('Background Refreshing...')).toBeNull();
        expect(seen).toEqual(['spinner', 'week']);
    });
});
