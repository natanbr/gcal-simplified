// ============================================================
// App's view switch — helpers for the suites that drive the real App from the
// Calendar to Mission Control and back (App.returnToCalendar*.test.tsx).
//
// The suites stub Mission Control's screen with a button carrying
// `mc-back-to-calendar-btn` (vi.mock must sit in each test file). Not a test
// file, so the ratchets scan it like production code. Import it from tests
// only — enforced by src/__tests__/test-kit-boundary.test.ts.
// ============================================================

import { act, fireEvent, render, screen } from '@testing-library/react';
import { createElement } from 'react';
import { onTestFinished, vi } from 'vitest';
import App from './App';
import { calendarEvent, installCalendarIpc, settle, someWeather, type CalendarIpc } from './components/calendarTestKit';
import type { AppTask } from './types';

export const STANDUP = calendarEvent('standup', new Date(2026, 9, 28, 10)); // Wed Oct 28

/** The family calendar at Wednesday Oct 28, 12:00: weeks start on Monday, one event, three tasks, weather (the tasks count shows on its pill). */
export function installFamilyCalendar(): CalendarIpc {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 28, 12, 0));
    const ipc = installCalendarIpc();
    ipc.settings = { calendarIds: [], taskListIds: [], weekStartDay: 'monday' };
    ipc.events = [STANDUP];
    ipc.tasks = Array.from({ length: 3 }, (_, i): AppTask => ({ id: `t${i}`, title: `task ${i}`, status: 'needsAction' }));
    ipc.weather = someWeather;
    const quietErrors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const quietWarnings = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    onTestFinished(() => {
        quietErrors.mockRestore();
        quietWarnings.mockRestore();
        delete window.ipcRenderer;
        vi.useRealTimers();
        localStorage.clear();
    });
    return ipc;
}

export type Shown = 'checking' | 'spinner' | 'week' | 'sign-in' | 'mission-control' | 'other';

/** Every screen shown from now on, in order, with repeats collapsed. */
export function recordScreens(): Shown[] {
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

export async function launch(): Promise<Shown[]> {
    const seen = recordScreens();
    render(createElement(App));
    await screen.findByTestId('calendar-grid');
    await settle();
    return seen;
}

export async function toMissionControl(): Promise<void> {
    fireEvent.click(screen.getByTestId('switch-to-mc-btn'));
    await settle();
}

/** The click renders at once: what a test reads right after it is the first screen back. */
export const backToCalendar = (): void => { fireEvent.click(screen.getByTestId('mc-back-to-calendar-btn')); };

/** The Calendar's own events reads; Mission Control's school-day read passes `{ strict: true }` as a third argument. */
export const calendarReads = (ipc: CalendarIpc): unknown[][] => ipc.requests('data:events').filter(args => args.length === 2);

/** A main-process event: every listener subscribed to it now. */
export const send = (ipc: CalendarIpc, channel: string) => act(async () => { ipc.listeners[channel]?.(); });
