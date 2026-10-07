// ============================================================
// The calendar session belongs to one sign-in (2026-10-06)
// ------------------------------------------------------------
// It keeps what the Calendar read while Mission Control is on screen
// (App.returnToCalendar.test.tsx). A sign-in or a sign-out empties it, and a
// Dashboard that mounted before one can no longer write to it: an answer for
// the account before still lands in that Dashboard's state, and the state must
// not reach the next Dashboard.
// ============================================================

import { act, render } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { CalendarSession, useCalendarSession, type Kept } from './calendarSession';
import { CalendarSessionProvider } from './CalendarSessionProvider';

const READ: Required<Kept> = {
    calendar: { months: { '2026-10': { events: [], loadedAt: new Date(2026, 9, 28, 12) } }, shown: { events: [], from: null } },
    dashboard: { config: { calendarIds: ['family'], taskListIds: [] }, tasks: [], weather: null },
};

describe('CalendarSession', () => {
    it('a new session keeps nothing and is not warm', () => {
        const ticket = new CalendarSession().open();

        expect(ticket.kept).toEqual({});
        expect(ticket.warm).toBe(false);
    });

    it('what one Dashboard keeps is what the next one starts from; warm once a month was read', () => {
        const session = new CalendarSession();
        const first = session.open();
        first.keepDashboard(READ.dashboard);
        expect(session.warm).toBe(false);                    // the settings alone: the spinner was still up

        first.keepCalendar(READ.calendar);

        const next = session.open();
        expect(next.kept).toEqual(READ);
        expect(next.warm).toBe(true);
        expect(first.kept).toEqual({});                     // a ticket sees the session as it was when it opened
    });

    it('a sign-in or a sign-out: nothing kept survives, and a Dashboard from before it cannot keep', () => {
        const session = new CalendarSession();
        const before = session.open();
        before.keepCalendar(READ.calendar);

        session.forget();
        before.keepCalendar(READ.calendar);                  // an answer for the account before, landing late
        before.keepDashboard(READ.dashboard);

        expect(session.warm).toBe(false);
        expect(session.open().kept).toEqual({});
        expect(session.epoch).toBe(1);
    });

    // settings:get answers with the phone pairing too (electron/settings-dialog.ts); the session lives as long as the sign-in.
    it('keeps only the settings the Calendar draws with: never the phone pairing', () => {
        const session = new CalendarSession();
        const answer = { ...READ.dashboard.config, weekStartDay: 'monday' as const, activeHoursStart: 8, themeMode: 'manual' as const, sleepStart: 22, remoteRoomId: 'room-0001', remoteKey: 'pairing-key-0001', remotePairingVersion: 2 };
        session.open().keepDashboard({ ...READ.dashboard, config: answer });

        const kept = session.open().kept.dashboard;
        expect(kept?.config).toEqual({ calendarIds: ['family'], taskListIds: [], weekStartDay: 'monday', activeHoursStart: 8, themeMode: 'manual' });
        expect(JSON.stringify(kept)).not.toMatch(/room-0001|pairing-key-0001|remote/);
    });
});

describe('CalendarSessionProvider', () => {
    afterEach(() => { delete window.ipcRenderer; });

    function renderProvider() {
        const listeners = new Map<string, Set<() => void>>();
        window.ipcRenderer = {
            invoke: vi.fn(async () => null),
            on: (channel, listener) => {
                const set = listeners.get(channel) ?? new Set<() => void>();
                listeners.set(channel, set.add(listener as () => void));
                return () => { set.delete(listener as () => void); };
            },
        };
        let session: CalendarSession | null = null;
        function Probe() { session = useCalendarSession(); return null; }
        const view = render(<CalendarSessionProvider><Probe /></CalendarSessionProvider>);
        const fill = () => session?.open().keepCalendar(READ.calendar);
        const send = (channel: string) => act(() => { listeners.get(channel)?.forEach(l => l()); });
        return { view, send, fill, warm: () => session?.warm, listening: (channel: string) => listeners.get(channel)?.size ?? 0 };
    }

    // With Mission Control on screen no Calendar is mounted: the provider is the one that hears these.
    it.each(['auth:success', 'auth:signed-out'])('%s empties the session with no Calendar mounted', async channel => {
        const provider = renderProvider();
        provider.fill();
        expect(provider.warm()).toBe(true);

        await provider.send(channel);

        expect(provider.warm()).toBe(false);
    });

    it('stops listening when it unmounts', () => {
        const provider = renderProvider();
        provider.view.unmount();

        expect(provider.listening('auth:success')).toBe(0);
        expect(provider.listening('auth:signed-out')).toBe(0);
    });
});
