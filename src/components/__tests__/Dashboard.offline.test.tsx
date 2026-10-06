// ============================================================
// Calendar — a refresh that cannot reach Google keeps the week (2026-10-06)
// ------------------------------------------------------------
// The Calendar re-reads the visible month every 5 minutes. Offline, or with
// Google answering 5xx or a rate limit, the main process used to answer an
// empty list: the week went blank, with no error, until a later refresh
// worked. Now such a read fails (electron/google-unreachable.ts) and the
// Dashboard keeps what it shows, saying since when it has not been updated.
// A month it never loaded borrows the events on screen only for the days
// their read covered; past them the grid is empty and says it could not
// load, never days the data does not cover drawn as if they were empty.
// The notice sits under the date, out of the header's flow (PR 194 review:
// in the right-hand group it wrapped the header at 1280x720). Tasks stay.
// ============================================================

import { render, screen, act, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach, onTestFinished } from 'vitest';
import { Dashboard } from '../Dashboard';
import { calendarEvent, installCalendarIpc, settle, someWeather, type CalendarIpc } from '../calendarTestKit';
import type { AppTask } from '../../types';

const STANDUP = calendarEvent('standup', new Date(2026, 9, 28, 10)); // Wed Oct 28
const DENTIST = calendarEvent('dentist', new Date(2026, 10, 2, 10));  // Mon Nov 2: inside October's read (to Nov 15)
const SWIM = calendarEvent('swim', new Date(2026, 9, 29, 16));       // added in Google while offline

let ipc: CalendarIpc;
const notice = () => screen.queryByTestId('calendar-read-notice');
const tasks = (n: number): AppTask[] => Array.from({ length: n }, (_, i) => ({ id: `t${i}`, title: `task ${i}`, status: 'needsAction' }));

async function launch() {
    render(<Dashboard />);
    await screen.findByTestId('calendar-grid');
    await settle();
}

/** Lets `ms` pass: the 5-minute refresh, and the minute check that rolls the day over at midnight. */
async function wait(ms: number) {
    act(() => { vi.advanceTimersByTime(ms); });
    await settle();
}
const nextRefresh = () => wait(5 * 60 * 1000);

async function click(testId: string) {
    fireEvent.click(screen.getByTestId(testId));
    await settle();
}

beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
    vi.setSystemTime(new Date(2026, 9, 28, 12, 0)); // Wednesday
    ipc = installCalendarIpc();
    ipc.settings = { calendarIds: [], taskListIds: [], weekStartDay: 'monday' };
    ipc.events = [STANDUP];
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    onTestFinished(() => quiet.mockRestore());
});

afterEach(() => {
    delete window.ipcRenderer;
    vi.useRealTimers();
});

// Each case renders the whole Dashboard several times: under a loaded full suite one took 5.16 s.
describe('Dashboard: a refresh that cannot reach Google', { timeout: 15_000 }, () => {
    it('keeps the events on screen and says since when, under the date, through every failed refresh', async () => {
        await launch();
        expect(notice()).toBeNull();

        ipc.failing.add('data:events');
        await nextRefresh();                                    // 12:05, offline
        expect(screen.getByTestId('event-card-standup')).toBeTruthy();
        expect(notice()?.textContent).toBe('Calendar not updated since 12:00');
        expect(screen.getByTestId('month-label').parentElement).toContainElement(notice());
        expect(notice()?.parentElement).toHaveAttribute('role', 'status');

        await nextRefresh();                                    // 12:10, still offline
        expect(notice()?.textContent).toBe('Calendar not updated since 12:00');
    });

    it('the next refresh that answers replaces the events and clears the notice', async () => {
        await launch();
        ipc.failing.add('data:events');
        await nextRefresh();
        expect(notice()).not.toBeNull();

        ipc.failing.delete('data:events');
        ipc.events = [STANDUP, SWIM];
        await nextRefresh();

        expect(screen.getByTestId('event-card-swim')).toBeTruthy();
        expect(notice()).toBeNull();
    });

    it('the status line is announced: its role="status" element is there before any failure', async () => {
        await launch();

        const announcer = screen.getByTestId('month-label').parentElement?.querySelector('[role="status"]');
        expect(announcer).not.toBeNull();
        expect(announcer?.textContent).toBe('');
    });

    it('a month first opened offline says it could not load, without the full-screen spinner, then loads', async () => {
        ipc.failing.add('data:events');
        await launch();

        expect(screen.queryByText('Syncing with Google...')).toBeNull();
        expect(notice()?.textContent).toBe("Couldn't load the calendar");

        ipc.failing.delete('data:events');
        await nextRefresh();

        expect(screen.getByTestId('event-card-standup')).toBeTruthy();
        expect(notice()).toBeNull();
    });

    it('offline overnight: the notice names the day of the last update', async () => {
        await launch();
        ipc.failing.add('data:events');
        vi.setSystemTime(new Date(2026, 9, 29, 7, 55));        // Thursday morning, still offline
        await nextRefresh();

        expect(notice()?.textContent).toBe('Calendar not updated since Oct 28, 12:00');
    });

    it('the tasks on screen stay through a refresh that fails', async () => {
        ipc.weather = someWeather;                              // the tasks count shows on the weather pill
        ipc.tasks = tasks(3);
        await launch();
        expect(screen.getByTestId('tasks-button').textContent).toContain('3');

        ipc.failing.add('data:tasks');
        await nextRefresh();

        expect(screen.getByTestId('tasks-button').textContent).toContain('3');
    });
});

describe('Dashboard: a month never loaded while Google cannot be reached', { timeout: 15_000 }, () => {
    it('midnight rolls a "today" week into it: the events of the read that covers it stay, with its time', async () => {
        vi.setSystemTime(new Date(2026, 9, 31, 23, 58));       // Saturday Oct 31; the week runs to Nov 6
        ipc.settings = { ...ipc.settings, weekStartDay: 'today' };
        ipc.events = [DENTIST];
        await launch();
        expect(screen.getByTestId('event-card-dentist')).toBeTruthy();

        ipc.failing.add('data:events');
        await wait(150_000);                                    // 00:00:30 Sunday Nov 1: November, never loaded

        expect(screen.getAllByTestId('day-header-number')[0].textContent).toBe('1');
        expect(screen.getByTestId('event-card-dentist')).toBeTruthy();
        expect(notice()?.textContent).toBe('Calendar not updated since Oct 31, 23:58');
    });

    it('Next Week into it: days October\'s read covered keep their events, with its time', async () => {
        ipc.events = [STANDUP, DENTIST];
        await launch();
        ipc.failing.add('data:events');

        await click('next-week-button');                        // Nov 2-8: November, never loaded

        expect(screen.getByTestId('event-card-dentist')).toBeTruthy();
        expect(notice()?.textContent).toBe('Calendar not updated since 12:00');
    });

    it('Next Month into it: a grid past what October\'s read covered is empty and says so', async () => {
        ipc.events = [STANDUP, DENTIST];
        await launch();
        ipc.failing.add('data:events');
        await click('monthly-view-toggle');
        expect(screen.getByText('dentist')).toBeTruthy();

        await click('next-week-button');                        // Next Month: Oct 26 - Dec 6, October read only to Nov 15

        expect(screen.queryByText('standup')).toBeNull();
        expect(screen.queryByText('dentist')).toBeNull();
        expect(notice()?.textContent).toBe("Couldn't load the calendar");
    });
});
