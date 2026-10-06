// ============================================================
// Calendar — a refresh that cannot reach Google keeps the week (2026-10-06)
// ------------------------------------------------------------
// The Calendar re-reads the visible month every 5 minutes. Offline, or with
// Google answering 5xx or a rate limit, the main process used to answer an
// empty list: the week went blank, with no error, until a later refresh
// worked. Now such a read fails (electron/google-unreachable.ts) and the
// Dashboard keeps what it shows, saying since when it has not been updated;
// a month it never loaded says so. The header notice is quiet: the events on
// screen are real, only possibly out of date. Tasks stay the same way.
// ============================================================

import { render, screen, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach, onTestFinished } from 'vitest';
import { Dashboard } from '../Dashboard';
import { calendarEvent, installCalendarIpc, settle, someWeather, type CalendarIpc } from '../calendarTestKit';
import type { AppTask } from '../../types';

const STANDUP = calendarEvent('standup', new Date(2026, 9, 28, 10)); // Wed Oct 28
const SWIM = calendarEvent('swim', new Date(2026, 9, 29, 16));       // added in Google while offline

let ipc: CalendarIpc;
const notice = () => screen.queryByTestId('calendar-read-notice');
const tasks = (n: number): AppTask[] => Array.from({ length: n }, (_, i) => ({ id: `t${i}`, title: `task ${i}`, status: 'needsAction' }));

async function launch() {
    render(<Dashboard />);
    await screen.findByTestId('calendar-grid');
    await settle();
}

/** The Dashboard's 5-minute refresh. */
async function nextRefresh() {
    act(() => { vi.advanceTimersByTime(5 * 60 * 1000); });
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

describe('Dashboard: a refresh that cannot reach Google', () => {
    it('keeps the events on screen and says since when; the next refresh that answers replaces them and clears it', async () => {
        await launch();
        expect(screen.getByTestId('event-card-standup')).toBeTruthy();
        expect(notice()).toBeNull();

        ipc.failing.add('data:events');
        ipc.events = [STANDUP, SWIM];
        await nextRefresh();                                    // 12:05, offline

        expect(screen.getByTestId('event-card-standup')).toBeTruthy();
        expect(notice()?.textContent).toBe('Not updated since 12:00');

        await nextRefresh();                                    // 12:10, still offline
        expect(notice()?.textContent).toBe('Not updated since 12:00');

        ipc.failing.delete('data:events');
        await nextRefresh();                                    // 12:15, online again

        expect(screen.getByTestId('event-card-swim')).toBeTruthy();
        expect(notice()).toBeNull();
    });

    it('a month first opened offline says it could not load, without the full-screen spinner, then loads', async () => {
        ipc.failing.add('data:events');
        await launch();

        expect(screen.queryByText('Syncing with Google...')).toBeNull();
        expect(notice()?.textContent).toBe("Couldn't load events");
        expect(screen.queryByTestId('event-card-standup')).toBeNull();

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

        expect(notice()?.textContent).toBe('Not updated since Oct 28, 12:00');
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
