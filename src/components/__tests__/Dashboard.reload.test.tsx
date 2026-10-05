// ============================================================
// Calendar — Save, reconnect and overlapping loads
// ------------------------------------------------------------
// Saving Settings and a reconnect must really refetch: a request already in
// flight was built with the old calendar selection, so it must not stand in for
// the new one, nor land last and win. Save applies the config it just wrote
// instead of reading config.json again at the moment antivirus is most likely
// to hold it. And a load that fails in an unexpected way must still end, or the
// header's loading loops run on the idle Calendar.
// ============================================================

import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach, onTestFinished } from 'vitest';
import { Dashboard } from '../Dashboard';
import { calendarEvent, installCalendarIpc, settle, someWeather, type CalendarIpc } from '../calendarTestKit';
import type { AppTask } from '../../types';

const STANDUP = calendarEvent('standup', new Date(2026, 9, 28, 10));
const ADDED = calendarEvent('added-calendar', new Date(2026, 9, 29, 10)); // on a calendar selected later
const tasks = (n: number): AppTask[] => Array.from({ length: n }, (_, i) => ({ id: `t${i}`, title: `task ${i}`, status: 'needsAction' }));

let ipc: CalendarIpc;
const busy = () => screen.queryByTitle('Loading...') ?? screen.queryByTitle('Background Refreshing...');
const firstDayShown = () => screen.getAllByTestId('day-header-name')[0].textContent;

async function launch() {
    render(<Dashboard />);
    await screen.findByTestId('calendar-grid');
    await settle();
}

/** Opens Settings and saves, after picking a week start when one is given. */
async function saveSettings(weekStart?: 'monday' | 'sunday') {
    fireEvent.click(screen.getByTestId('settings-button'));
    fireEvent.click(await screen.findByText('General', { exact: true }));
    const pick = await screen.findByTestId(`week-start-${weekStart ?? 'today'}-button`);
    if (weekStart) fireEvent.click(pick);
    fireEvent.click(screen.getByTestId('save-settings-button'));
    await settle();
}

const reconnect = () => act(async () => { ipc.listeners['auth:success'](); });

beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 28, 12, 0)); // Wednesday
    ipc = installCalendarIpc();
    ipc.settings = { calendarIds: [], taskListIds: [], weekStartDay: 'sunday' };
    ipc.events = [STANDUP];
});

afterEach(() => {
    delete window.ipcRenderer;
    vi.useRealTimers();
});

describe('Save', () => {
    it('a week start changed in Settings moves the grid, without the spinner and without reading config.json again', async () => {
        await launch();
        expect(firstDayShown()).toBe('Sunday');
        const readsBefore = ipc.requests('settings:get').length;

        await saveSettings('monday');

        expect(firstDayShown()).toBe('Monday');
        expect(screen.queryByText('Syncing with Google...')).toBeNull();
        expect(screen.getByTestId('event-card-standup')).toBeTruthy();
        // The dialog read the settings once when it opened; nothing reads them after the save.
        const order = ipc.order();
        expect(order.slice(order.lastIndexOf('settings:save'))).not.toContain('settings:get');
        expect(ipc.requests('settings:get').length).toBe(readsBefore + 1);
    });

    it('refetches even while a request for the month is in flight, and that older answer cannot win', async () => {
        await launch();
        ipc.holding.add('data:events');
        await reconnect();                       // a request built with the old selection, now in flight
        const before = ipc.requests('data:events').length;
        ipc.events = [STANDUP, ADDED];           // the saved selection adds a calendar

        await saveSettings();                    // same month, same week start: only the selection differs
        expect(ipc.requests('data:events').length).toBe(before + 1);

        await ipc.release('data:events', 'newest');
        await ipc.release('data:events', 'oldest'); // the old answer lands last
        expect(screen.getByTestId('event-card-added-calendar')).toBeTruthy();
    });
});

describe('Reconnect', () => {
    it('reads the settings again and refetches the visible month even when nothing changed', async () => {
        await launch();
        const before = ipc.requests('data:events').length;

        await reconnect();
        await settle();

        expect(ipc.requests('data:events').length).toBe(before + 1);
        expect(ipc.requests('settings:get').length).toBe(2);
    });

    it('refetches while a request for the month is in flight', async () => {
        await launch();
        ipc.holding.add('data:events');
        await reconnect();
        const before = ipc.requests('data:events').length;
        ipc.events = [STANDUP, ADDED];

        await reconnect();
        await settle();
        expect(ipc.requests('data:events').length).toBe(before + 1);

        await ipc.release('data:events', 'newest');
        await ipc.release('data:events', 'oldest');
        expect(screen.getByTestId('event-card-added-calendar')).toBeTruthy();
    });
});

describe('Loads that overlap or fail unexpectedly', () => {
    it('the first load ending does not hide the indicator while a newer load still runs', async () => {
        ipc.weather = someWeather;              // the tasks count shows on the weather pill
        ipc.tasks = tasks(3);
        ipc.holding.add('data:tasks');
        await launch();                          // the week shows; the launch's tasks answer is held

        ipc.tasks = tasks(1);
        await reconnect();
        await settle();
        await ipc.release('data:tasks', 'oldest'); // the launch's answer lands first
        expect(busy()).toBeTruthy();              // the reconnect's load is still running

        await ipc.release('data:tasks', 'newest');
        expect(busy()).toBeNull();
        expect(screen.getByTestId('tasks-button').textContent).toContain('1');
    });

    it('an older tasks answer landing after the newer one is dropped', async () => {
        ipc.weather = someWeather;
        ipc.tasks = tasks(3);
        ipc.holding.add('data:tasks');
        await launch();

        ipc.tasks = tasks(1);
        await reconnect();
        await settle();
        await ipc.release('data:tasks', 'newest');
        await ipc.release('data:tasks', 'oldest');

        expect(screen.getByTestId('tasks-button').textContent).toContain('1');
        expect(screen.getByTestId('tasks-button').textContent).not.toContain('3');
    });

    it('a tasks read that throws before it returns a promise still ends the load', async () => {
        ipc.throwing.add('data:tasks');
        const quiet = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        onTestFinished(() => quiet.mockRestore());
        await launch();

        expect(busy()).toBeNull();
        expect(ipc.order()).toContain('weather:get');
    });

    it('a settings read that throws before it returns a promise still shows the week', async () => {
        ipc.throwing.add('settings:get');
        const quiet = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        onTestFinished(() => quiet.mockRestore());
        await launch();

        expect(screen.getByTestId('calendar-grid')).toBeTruthy();
        expect(busy()).toBeNull();
    });
});
