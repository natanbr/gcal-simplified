// ============================================================
// Calendar — a new sign-in starts the Calendar over (2026-10-06)
// ------------------------------------------------------------
// Settings → Reconnect Account may sign in as a different Google account. A
// failed read keeps what the Dashboard shows (google-unreachable.ts), so a
// reconnect while Google cannot be reached kept the previous account's events
// and tasks on screen under "not updated since"; before that, the empty answer
// had cleared them. A new sign-in now remounts the Dashboard: nothing read for
// the account before it, and no answer still in flight for it, can reach the
// screen.
// ============================================================

import { act, render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach, onTestFinished } from 'vitest';
import { CalendarApp } from '../CalendarApp';
import { calendarEvent, installCalendarIpc, settle, someWeather, type CalendarIpc } from '../calendarTestKit';
import type { AppTask } from '../../types';

const ACCOUNT_A = calendarEvent('account-a-dentist', new Date(2026, 9, 28, 10));
const tasks = (n: number): AppTask[] => Array.from({ length: n }, (_, i) => ({ id: `t${i}`, title: `task ${i}`, status: 'needsAction' }));

let ipc: CalendarIpc;

beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 28, 12, 0));
    ipc = installCalendarIpc();
    ipc.events = [ACCOUNT_A];
    ipc.tasks = tasks(3);
    ipc.weather = someWeather;                       // the task count shows on the weather pill
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    onTestFinished(() => quiet.mockRestore());
});

afterEach(() => {
    delete window.ipcRenderer;
    vi.useRealTimers();
});

describe('CalendarApp: Reconnect as another account', () => {
    it('while Google cannot be reached, nothing of the account before it stays on screen', async () => {
        render(<CalendarApp onSwitchToMC={() => undefined} />);
        await screen.findByTestId('event-card-account-a-dentist');
        await settle();
        expect(screen.getByTestId('tasks-button').textContent).toContain('3');

        ipc.failing = new Set(['data:events', 'data:tasks']);
        await act(async () => { ipc.listeners['auth:success'](); });   // signed in again, as account B
        await screen.findByTestId('calendar-grid');
        await settle();

        expect(screen.queryByTestId('event-card-account-a-dentist')).toBeNull();
        expect(screen.getByTestId('tasks-button').textContent).toBe('Tasks');
        expect(screen.getByTestId('calendar-read-notice').textContent).toBe("Couldn't load the calendar");
    });

    it('reads the settings, the month, the tasks and the weather once each: the remount is the only reload', async () => {
        render(<CalendarApp onSwitchToMC={() => undefined} />);
        await screen.findByTestId('event-card-account-a-dentist');
        await settle();
        const before = ['settings:get', 'data:events', 'data:tasks', 'weather:get'].map(c => ipc.requests(c).length);

        await act(async () => { ipc.listeners['auth:success'](); });
        await screen.findByTestId('event-card-account-a-dentist');   // the new account happens to have it too
        await settle();

        expect(['settings:get', 'data:events', 'data:tasks', 'weather:get'].map((c, i) => ipc.requests(c).length - before[i])).toEqual([1, 1, 1, 1]);
    });

    it('an answer for the account before it, still in flight at the sign-in, cannot land', async () => {
        ipc.holding.add('data:events');
        render(<CalendarApp onSwitchToMC={() => undefined} />);    // account A's read, held
        await settle();

        ipc.events = [];                                             // account B has no events
        await act(async () => { ipc.listeners['auth:success'](); });
        await settle();
        await ipc.release('data:events');                           // A's answer lands after B's request

        expect(screen.getByTestId('calendar-grid')).toBeTruthy();
        expect(screen.queryByTestId('event-card-account-a-dentist')).toBeNull();
    });
});
