// ============================================================
// The calendar session through the real hooks (2026-10-06, PR 196 review)
// ------------------------------------------------------------
// The class refuses a write from a ticket taken before a sign-in or a sign-out
// (calendarSession.test.tsx), but that holds only if each hook writes through
// the one ticket it took when it mounted. A hook that opened a fresh ticket to
// write, or took a new one at every render, would let an answer for the
// account before land in the emptied session, and the second also made every
// launch load twice (its `warm` flips once the first month is in).
// ============================================================

import { act, render, renderHook, screen } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { describe, it, expect, vi, afterEach, onTestFinished } from 'vitest';
import { CalendarSession, CalendarSessionContext } from './calendarSession';
import { useCalendarData } from '../../hooks/useCalendarData';
import { useDashboardLoad } from '../../hooks/useDashboardLoad';
import { Dashboard } from '../../components/Dashboard';
import { calendarEvent, installCalendarIpc, settle } from '../../components/calendarTestKit';

afterEach(() => {
    delete window.ipcRenderer;
    vi.useRealTimers();
});

const within = (session: CalendarSession) => ({ children }: { children: ReactNode }) =>
    createElement(CalendarSessionContext.Provider, { value: session }, children);

describe('the hooks write only through the ticket they took when they mounted', () => {
    it('useCalendarData: an answer landing after a sign-in or sign-out is not kept', async () => {
        const ipc = installCalendarIpc();
        ipc.events = [calendarEvent('account-a', new Date(2026, 9, 28, 10))];
        ipc.holding.add('data:events');
        const session = new CalendarSession();
        const days = [new Date(2026, 9, 26)];
        renderHook(() => useCalendarData('2026-10', 1, days), { wrapper: within(session) });
        await settle();

        act(() => session.forget());
        await ipc.release('data:events');

        expect(session.warm).toBe(false);
        expect(session.open().kept).toEqual({});
    });

    it('useDashboardLoad: tasks landing after a sign-in or sign-out are not kept', async () => {
        const ipc = installCalendarIpc();
        ipc.tasks = [{ id: 't', title: 'account A task', status: 'needsAction' }];
        ipc.holding.add('data:tasks');
        const session = new CalendarSession();
        renderHook(() => useDashboardLoad(), { wrapper: within(session) });
        await settle();

        act(() => session.forget());
        await ipc.release('data:tasks');

        expect(session.open().kept).toEqual({});
    });
});

describe('a launch in a session', () => {
    // The tasks and weather answer after the month, so the Dashboard renders again once the session is warm.
    it('loads once: the settings, the month, the tasks and the weather one request each', async () => {
        vi.useFakeTimers({ toFake: ['Date'] });
        vi.setSystemTime(new Date(2026, 9, 28, 12, 0));
        const quiet = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        onTestFinished(() => quiet.mockRestore());
        const ipc = installCalendarIpc();
        ipc.events = [calendarEvent('standup', new Date(2026, 9, 28, 10))];
        ipc.tasks = [{ id: 't', title: 'a task', status: 'needsAction' }];
        ipc.holding = new Set(['data:tasks', 'weather:get']);
        const session = new CalendarSession();

        render(createElement(CalendarSessionContext.Provider, { value: session }, createElement(Dashboard)));
        await screen.findByTestId('event-card-standup');
        await settle();
        ipc.holding.clear();
        await ipc.release('data:tasks');
        await ipc.release('weather:get');

        expect(['settings:get', 'data:events', 'data:tasks', 'weather:get'].map(c => ipc.requests(c).length)).toEqual([1, 1, 1, 1]);
        expect(session.warm).toBe(true);
    });
});
