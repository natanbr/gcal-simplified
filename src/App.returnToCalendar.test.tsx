// ============================================================
// Calendar — back from Mission Control, the week it left is still there (2026-10-06)
// ------------------------------------------------------------
// App swaps the two views, so every switch to Mission Control unmounted the
// Calendar and threw away everything it had read. Back on the Calendar (by
// hand, or by the 5-minute auto-return, many times a day on the family
// screen) the full-screen "Syncing with Google..." showed until the first
// answer, and offline the week came back empty under "Couldn't load the
// calendar". What the Calendar read now stays in a session above the view
// switch (features/calendar-session) for as long as the sign-in does: a
// sign-in or a sign-out, on either view, empties it, and a relaunch starts
// without it. Mission Control's own UI is a stand-in here: the subject is the
// view switch and what the Calendar shows across it.
// ============================================================

import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach, onTestFinished } from 'vitest';
import { addDays } from 'date-fns';
import App from './App';
import { calendarEvent, installCalendarIpc, settle, someWeather, type CalendarIpc } from './components/calendarTestKit';
import type { AppTask } from './types';

vi.mock('./mission-control/MissionControl', () => ({
    MissionControl: ({ onBackToCalendar }: { onBackToCalendar?: () => void }) => (
        <button data-testid="mc-back-to-calendar-btn" onClick={onBackToCalendar}>Back to Calendar</button>
    ),
}));

const STANDUP = calendarEvent('standup', new Date(2026, 9, 28, 10)); // Wed Oct 28
const SWIM = calendarEvent('swim', new Date(2026, 9, 29, 16));       // added in Google while away
const DENTIST = calendarEvent('dentist', new Date(2026, 10, 2, 10));  // Mon Nov 2: inside October's read (to Nov 15)
const NOVEMBER = [addDays(new Date(2026, 10, 1), -7).toISOString(), addDays(new Date(2026, 11, 1), 15).toISOString()];

let ipc: CalendarIpc;
const tasks = (n: number): AppTask[] => Array.from({ length: n }, (_, i) => ({ id: `t${i}`, title: `task ${i}`, status: 'needsAction' }));
const notice = () => screen.queryByTestId('calendar-read-notice');
/** The Calendar's own events reads; Mission Control's school-day read passes `{ strict: true }` as a third argument. */
const calendarReads = () => ipc.requests('data:events').filter(args => args.length === 2);

type Shown = 'checking' | 'spinner' | 'week' | 'sign-in' | 'mission-control' | 'other';

/** Every screen shown from now on, in order, with repeats collapsed. */
function recordScreens(): Shown[] {
    const seen: Shown[] = [];
    const note = () => {
        const now: Shown = screen.queryByTestId('mc-back-to-calendar-btn') ? 'mission-control'
            : screen.queryByText('Syncing with Google...') ? 'spinner'
            : screen.queryByTestId('calendar-grid') ? 'week'
            : screen.queryByTestId('login-button') ? 'sign-in'
            : screen.queryByText('Loading...') ? 'checking' : 'other';
        if (seen[seen.length - 1] !== now) seen.push(now);
    };
    const observer = new MutationObserver(note);
    observer.observe(document.body, { subtree: true, childList: true, characterData: true });
    onTestFinished(() => observer.disconnect());
    return seen;
}

async function launch(): Promise<Shown[]> {
    const seen = recordScreens();
    render(<App />);
    await screen.findByTestId('calendar-grid');
    await settle();
    return seen;
}

async function toMissionControl() {
    fireEvent.click(screen.getByTestId('switch-to-mc-btn'));
    await settle();
}

/** The click renders at once: what a test reads right after it is the first screen back. */
const backToCalendar = () => fireEvent.click(screen.getByTestId('mc-back-to-calendar-btn'));

const send = (channel: string) => act(async () => { ipc.listeners[channel]?.(); });

beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 28, 12, 0)); // Wednesday
    ipc = installCalendarIpc();
    ipc.settings = { calendarIds: [], taskListIds: [], weekStartDay: 'monday' };
    ipc.events = [STANDUP];
    ipc.tasks = tasks(3);
    ipc.weather = someWeather;                    // the tasks count shows on the weather pill
    const quietErrors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const quietWarnings = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    onTestFinished(() => { quietErrors.mockRestore(); quietWarnings.mockRestore(); });
});

afterEach(() => {
    delete window.ipcRenderer;
    vi.useRealTimers();
    localStorage.clear();
});

// Each case renders the whole App, Calendar and Mission Control's store and bridges, several times.
describe('Back from Mission Control', { timeout: 15_000 }, () => {
    it('shows the week it left at once, with its tasks, and reads it again once, in the background', async () => {
        const seen = await launch();
        await toMissionControl();
        const whileAway = ipc.order().length;
        await settle();
        expect(ipc.order().slice(whileAway)).toEqual([]);  // nothing read for the Calendar while away

        ipc.events = [STANDUP, SWIM];
        ipc.holding = new Set(['settings:get', 'data:events', 'data:tasks', 'weather:get']);
        const before = calendarReads().length;
        backToCalendar();

        expect(screen.getByTestId('event-card-standup')).toBeTruthy();
        expect(screen.getByTestId('tasks-button').textContent).toContain('3');
        await settle();
        expect(screen.getByTitle('Background Refreshing...')).toBeTruthy();   // the settings, read again
        await ipc.release('settings:get');
        expect(screen.getByTitle('Background Refreshing...')).toBeTruthy();   // then the month, tasks and weather
        expect(calendarReads().length - before).toBe(1);
        await ipc.release('data:tasks');
        await ipc.release('weather:get');
        expect(screen.getByTitle('Background Refreshing...')).toBeTruthy();   // the month still out

        await ipc.release('data:events');
        expect(screen.getByTestId('event-card-swim')).toBeTruthy();
        expect(screen.queryByTitle('Background Refreshing...')).toBeNull();
        expect(seen).toEqual(['checking', 'spinner', 'week', 'mission-control', 'week']);
    });

    // December's read (Nov 24 - Jan 15) does not cover this week: what comes back is October's, at once.
    it('lands on the current week, with its own month\'s events, whatever was on screen when it left', async () => {
        await launch();
        fireEvent.click(screen.getByTestId('monthly-view-toggle'));
        fireEvent.click(screen.getByTestId('next-week-button'));      // Next Month: November
        await settle();
        fireEvent.click(screen.getByTestId('next-week-button'));      // December
        await settle();
        expect(screen.getByTestId('today-button').textContent).toBe('Back To Today');
        await toMissionControl();

        backToCalendar();

        expect(screen.getByTestId('calendar-grid')).toBeTruthy();       // the week view
        expect(screen.getByTestId('today-button').textContent).toBe('Current Week');
        expect(screen.getByTestId('event-card-standup')).toBeTruthy();
    });

    it('offline: the events stay, saying since when, and so do the tasks', async () => {
        await launch();                                                // read at 12:00
        await toMissionControl();
        vi.setSystemTime(new Date(2026, 9, 28, 12, 20));
        ipc.failing = new Set(['data:events', 'data:tasks', 'weather:get']);

        backToCalendar();
        await settle();

        expect(screen.queryByText('Syncing with Google...')).toBeNull();
        expect(screen.getByTestId('event-card-standup')).toBeTruthy();
        expect(notice()?.textContent).toBe('Calendar not updated since 12:00');
        expect(screen.getByTestId('tasks-button').textContent).toContain('3');
    });

    it('midnight into a new month while away: November is asked for; offline, October\'s read keeps the days it covers', async () => {
        vi.setSystemTime(new Date(2026, 9, 31, 23, 58));               // Saturday Oct 31; a "today" week
        ipc.settings = { ...ipc.settings, weekStartDay: 'today' };
        ipc.events = [DENTIST];
        await launch();
        await toMissionControl();
        vi.setSystemTime(new Date(2026, 10, 1, 0, 10));                // Sunday Nov 1: never read
        ipc.failing.add('data:events');

        backToCalendar();
        await settle();

        expect(screen.getAllByTestId('day-header-number')[0].textContent).toBe('1');
        expect(calendarReads().at(-1)).toEqual(NOVEMBER);
        expect(screen.getByTestId('event-card-dentist')).toBeTruthy();
        expect(notice()?.textContent).toBe('Calendar not updated since Oct 31, 23:58');
    });

    it('a relaunch starts without it: the spinner until the first answer', async () => {
        const { unmount } = render(<App />);
        await screen.findByTestId('calendar-grid');
        await settle();
        await toMissionControl();
        backToCalendar();
        await settle();
        unmount();

        ipc.holding.add('data:events');
        render(<App />);
        await settle();

        expect(screen.getByText('Syncing with Google...')).toBeTruthy();
        await ipc.release('data:events');
        expect(screen.getByTestId('event-card-standup')).toBeTruthy();
    });
});

describe('Back from Mission Control after the sign-in changed', { timeout: 15_000 }, () => {
    it('a sign-in while Mission Control is on screen: nothing of the account before it, the spinner while the new one loads', async () => {
        await launch();                                                // account A
        await toMissionControl();
        ipc.failing.add('data:events');
        await send('auth:success');                                    // Reconnect finished, maybe as account B

        const seen = recordScreens();
        backToCalendar();
        expect(screen.queryByTestId('event-card-standup')).toBeNull();
        await screen.findByTestId('calendar-grid');
        await settle();

        expect(screen.queryByTestId('event-card-standup')).toBeNull();
        expect(notice()?.textContent).toBe("Couldn't load the calendar");
        expect(seen).toContain('spinner');
    });

    it('a sign-out while Mission Control is on screen: Sign in, never the week before it', async () => {
        await launch();
        await toMissionControl();
        ipc.failing.add('auth:check');                                 // Google refused the saved sign-in
        await send('auth:signed-out');

        const seen = recordScreens();
        backToCalendar();
        await settle();

        expect(screen.getByTestId('login-button')).toBeTruthy();
        expect(seen).not.toContain('week');
    });

    it('an answer for the account before a sign-in, still in flight then, is not what comes back', async () => {
        ipc.holding.add('data:events');
        render(<App />);                                               // account A's read, held
        await settle();
        ipc.events = [];                                               // account B has no events
        await send('auth:success');
        await settle();
        ipc.holding.delete('data:events');
        await ipc.release('data:events');                              // A's answer lands after B's request
        expect(screen.queryByTestId('event-card-standup')).toBeNull();

        await toMissionControl();
        backToCalendar();
        await settle();

        expect(screen.getByTestId('calendar-grid')).toBeTruthy();
        expect(screen.queryByTestId('event-card-standup')).toBeNull();
    });
});
