// ============================================================
// Calendar — what it keeps across Mission Control belongs to one sign-in (2026-10-06)
// ------------------------------------------------------------
// The week the Calendar keeps while Mission Control is on screen
// (App.returnToCalendar.test.tsx) outlives the remount that used to clear it
// on a sign-in, so it has its own boundary: a sign-in or a sign-out heard on
// either view empties it, and so does Settings → Reconnect, whose auth:logout
// sends no event. Nothing read for one account may come back under the next.
// ============================================================

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import App from './App';
import { settle, type CalendarIpc } from './components/calendarTestKit';
import { backToCalendar, installFamilyCalendar, launch, recordScreens, send, toMissionControl } from './viewSwitchTestKit';

vi.mock('./mission-control/MissionControl', () => ({
    MissionControl: ({ onBackToCalendar }: { onBackToCalendar?: () => void }) => (
        <button data-testid="mc-back-to-calendar-btn" onClick={onBackToCalendar}>Back to Calendar</button>
    ),
}));

let ipc: CalendarIpc;
const notice = () => screen.queryByTestId('calendar-read-notice');

beforeEach(() => { ipc = installFamilyCalendar(); });

describe('Back from Mission Control after the sign-in changed', { timeout: 15_000 }, () => {
    it('a sign-in while Mission Control is on screen: nothing of the account before it, the spinner while the new one loads', async () => {
        await launch();                                                // account A
        await toMissionControl();
        ipc.failing.add('data:events');
        await send(ipc, 'auth:success');                               // Reconnect finished, maybe as account B

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
        await send(ipc, 'auth:signed-out');

        const seen = recordScreens();
        backToCalendar();
        await settle();

        expect(screen.getByTestId('login-button')).toBeTruthy();
        expect(seen).not.toContain('week');
    });

    // Reconnect = auth:logout (no event), then the browser sign-in; the Settings modal goes with the Calendar.
    it('Reconnect, then Mission Control, and the browser sign-in fails: Sign in, never the week before it', async () => {
        await launch();
        fireEvent.click(screen.getByTestId('settings-button'));
        ipc.holding.add('auth:login');
        ipc.failing.add('auth:login');
        fireEvent.click(await screen.findByTestId('reconnect-google-button'));
        await settle();
        await toMissionControl();
        ipc.failing.add('auth:check');                                 // signed out by auth:logout
        await ipc.release('auth:login');                               // the sign-in failed

        const seen = recordScreens();
        backToCalendar();
        expect(screen.queryByTestId('event-card-standup')).toBeNull();
        await settle();

        expect(screen.getByTestId('login-button')).toBeTruthy();
        expect(seen).not.toContain('week');
    });

    it('an answer for the account before a sign-in, still in flight then, is not what comes back', async () => {
        ipc.holding.add('data:events');
        render(<App />);                                               // account A's read, held
        await settle();
        ipc.events = [];                                               // account B has no events
        await send(ipc, 'auth:success');
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
