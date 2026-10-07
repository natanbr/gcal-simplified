// ============================================================
// Calendar — back from Mission Control, the week it left is still there (2026-10-06)
// ------------------------------------------------------------
// App swaps the two views, so every switch to Mission Control unmounted the
// Calendar and threw away everything it had read. Back on the Calendar (by
// hand, or by the auto-return, many times a day on the family screen) the
// full-screen "Syncing with Google..." showed until the first answer, and
// offline the week came back empty under "Couldn't load the calendar". What
// the Calendar read now stays in a session above the view switch
// (features/calendar-session) for as long as the sign-in does; a relaunch
// starts without it. The sign-in boundary: App.returnToCalendar.signIn.test.tsx.
// Mission Control's own UI is a stand-in here: the subject is the view switch
// and what the Calendar shows across it.
// ============================================================

import { fireEvent, render, screen } from '@testing-library/react';
import { StrictMode } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { addDays } from 'date-fns';
import App from './App';
import { calendarEvent, settle, type CalendarIpc } from './components/calendarTestKit';
import { STANDUP, backToCalendar, calendarReads, installFamilyCalendar, launch, toMissionControl } from './viewSwitchTestKit';

vi.mock('./mission-control/MissionControl', () => ({
    MissionControl: ({ onBackToCalendar }: { onBackToCalendar?: () => void }) => (
        <button data-testid="mc-back-to-calendar-btn" onClick={onBackToCalendar}>Back to Calendar</button>
    ),
}));

const SWIM = calendarEvent('swim', new Date(2026, 9, 29, 16));       // added in Google while away
const DENTIST = calendarEvent('dentist', new Date(2026, 10, 2, 10));  // Mon Nov 2: inside October's read (to Nov 15)
const NOVEMBER = [addDays(new Date(2026, 10, 1), -7).toISOString(), addDays(new Date(2026, 11, 1), 15).toISOString()];

let ipc: CalendarIpc;
const notice = () => screen.queryByTestId('calendar-read-notice');
const firstDay = () => `${screen.getAllByTestId('day-header-name')[0].textContent} ${screen.getAllByTestId('day-header-number')[0].textContent}`;

beforeEach(() => { ipc = installFamilyCalendar(); });

// Each case renders the whole App, Calendar and Mission Control's store and bridges, several times.
describe('Back from Mission Control', { timeout: 15_000 }, () => {
    it('shows the week it left at once, with its settings and tasks, and reads it again once, in the background', async () => {
        const seen = await launch();
        await toMissionControl();
        const whileAway = ipc.order().length;
        await settle();
        expect(ipc.order().slice(whileAway)).toEqual([]);  // nothing read for the Calendar while away

        ipc.events = [STANDUP, SWIM];
        ipc.holding = new Set(['settings:get', 'data:events', 'data:tasks', 'weather:get']);
        const before = calendarReads(ipc).length;
        backToCalendar();

        expect(firstDay()).toBe('Monday 26');                         // the saved week start, not the default "today"
        expect(screen.getByTestId('event-card-standup')).toBeTruthy();
        expect(screen.getByTestId('tasks-button').textContent).toContain('3');
        await settle();
        expect(screen.getByTitle('Background Refreshing...')).toBeTruthy();   // the settings, read again
        // Out of the header's flow, under the date: the header keeps its height while it shows.
        expect(screen.getByTestId('sync-status').textContent).toBe('Refreshing...');
        expect(screen.getByTestId('sync-status')).toHaveClass('absolute');
        expect(screen.getByTestId('sync-status').parentElement).toHaveClass('relative');
        await ipc.release('settings:get');
        expect(screen.getByTitle('Background Refreshing...')).toBeTruthy();   // then the month, tasks and weather
        expect(calendarReads(ipc).length - before).toBe(1);
        await ipc.release('data:tasks');
        await ipc.release('weather:get');
        expect(screen.getByTitle('Background Refreshing...')).toBeTruthy();   // the month still out

        await ipc.release('data:events');
        expect(screen.getByTestId('event-card-swim')).toBeTruthy();
        expect(screen.queryByTitle('Background Refreshing...')).toBeNull();
        expect(seen).toEqual(['checking', 'spinner', 'week', 'mission-control', 'week']);
    });

    it('a week start saved in Settings, then Mission Control: the return draws with it from the first frame', async () => {
        await launch();
        fireEvent.click(screen.getByTestId('settings-button'));
        fireEvent.click(await screen.findByText('General', { exact: true }));
        fireEvent.click(await screen.findByTestId('week-start-sunday-button'));
        fireEvent.click(screen.getByTestId('save-settings-button'));
        await settle();
        expect(firstDay()).toBe('Sunday 25');
        await toMissionControl();

        ipc.holding.add('settings:get');
        backToCalendar();

        expect(firstDay()).toBe('Sunday 25');
        await ipc.release('settings:get');
        expect(firstDay()).toBe('Sunday 25');
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
        expect(calendarReads(ipc).at(-1)).toEqual(NOVEMBER);
        expect(screen.getByTestId('event-card-dentist')).toBeTruthy();
        expect(notice()?.textContent).toBe('Calendar not updated since Oct 31, 23:58');
    });

    // main.tsx renders App in StrictMode: in development every mount runs twice.
    it('in StrictMode the return still shows the kept week at once and reads the month once', async () => {
        render(<StrictMode><App /></StrictMode>);
        await screen.findByTestId('calendar-grid');
        await settle();
        await toMissionControl();
        const before = calendarReads(ipc).length;

        backToCalendar();
        expect(screen.getByTestId('event-card-standup')).toBeTruthy();
        await settle();

        expect(screen.getByTestId('event-card-standup')).toBeTruthy();
        expect(calendarReads(ipc).length - before).toBe(1);
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
