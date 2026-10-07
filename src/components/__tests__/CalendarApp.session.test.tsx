// ============================================================
// CalendarApp and the calendar session (2026-10-06)
// ------------------------------------------------------------
// Back from Mission Control the session holds this sign-in's week, so the
// Calendar shows it at once while auth:check confirms the sign-in (the
// "Loading..." screen came first before). Every sign-out CalendarApp finds
// (auth:check, Google's sign-out, Settings) empties the session; a new sign-in
// remounts the Dashboard on an emptied session; and a sign-in that lands
// after CalendarApp first rendered but before it subscribed (the auto-return
// renders from a timer) still starts it over. A stand-in for App's view switch
// mounts CalendarApp under the real provider, as a return does; the stand-in
// Dashboard says what it started from: the week kept, or a new one.
// ============================================================

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useLayoutEffect, useState } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CalendarApp } from '../CalendarApp';
import { useCalendarSession, type CalendarSession } from '../../features/calendar-session/calendarSession';
import { CalendarSessionProvider } from '../../features/calendar-session/CalendarSessionProvider';

vi.mock('../Dashboard', async () => {
    const { useSessionTicket } = await import('../../features/calendar-session/calendarSession');
    return {
        Dashboard: ({ onLogout }: { onLogout?: () => void }) => {
            const ticket = useSessionTicket();
            return <button data-testid="dashboard" onClick={onLogout}>{ticket?.warm ? 'the kept week' : 'a new week'}</button>;
        },
    };
});
vi.mock('../LoginScreen', () => ({ LoginScreen: () => <div>Sign in with Google</div> }));

let session: CalendarSession | null = null;
let signedIn: () => Promise<unknown>;
let signInDuringCommit = false;
let showCalendar: (shown: boolean) => void = () => undefined;
const listeners = new Map<string, Set<() => void>>();
const sendNow = (channel: string) => listeners.get(channel)?.forEach(l => l());
const send = (channel: string) => act(async () => { sendNow(channel); });
const authChecks = vi.fn();
const warm = () => session?.warm;

function CaptureSession() {
    session = useCalendarSession();
    return null;
}

/** Sends auth:success after the commit that mounts CalendarApp, before its effects run. */
function SignInDuringCommit() {
    useLayoutEffect(() => { if (signInDuringCommit) sendNow('auth:success'); }, []);
    return null;
}

/** App's view switch: the provider stays, CalendarApp comes and goes. */
function ViewSwitch() {
    const [calendar, setCalendar] = useState(false);
    showCalendar = setCalendar;
    return (
        <CalendarSessionProvider>
            <CaptureSession />
            {calendar && <><SignInDuringCommit /><CalendarApp onSwitchToMC={() => undefined} /></>}
        </CalendarSessionProvider>
    );
}

beforeEach(() => {
    listeners.clear();
    authChecks.mockReset();
    signedIn = async () => true;
    signInDuringCommit = false;
    window.ipcRenderer = {
        invoke: vi.fn(async (channel: string) => {
            if (channel !== 'auth:check') return null;
            authChecks();
            return signedIn();
        }),
        on: (channel, listener) => {
            const set = listeners.get(channel) ?? new Set<() => void>();
            listeners.set(channel, set.add(listener as () => void));
            return () => { set.delete(listener as () => void); };
        },
    };
});

afterEach(() => {
    vi.restoreAllMocks();
    delete window.ipcRenderer;
});

/** A week kept by an earlier Calendar of this sign-in, then the return to the Calendar. */
function backToCalendar() {
    render(<ViewSwitch />);
    session?.open().keepCalendar({ months: { '2026-10': { events: [], loadedAt: new Date() } }, shown: { events: [], from: null } });
    act(() => showCalendar(true));
}

describe('CalendarApp with a session kept', () => {
    it('shows the kept week at once, and still asks auth:check once', async () => {
        backToCalendar();

        expect(screen.getByTestId('dashboard').textContent).toBe('the kept week');
        expect(screen.queryByText('Loading...')).toBeNull();
        await act(async () => undefined);
        expect(authChecks).toHaveBeenCalledTimes(1);
    });

    it('signed out by the time it is back (auth:check says so): Sign in, and nothing is kept', async () => {
        signedIn = async () => false;
        backToCalendar();
        await screen.findByText('Sign in with Google');

        await waitFor(() => expect(warm()).toBe(false));   // the forget is an effect of that render
    });

    it('a check that fails counts as signed out: nothing is kept', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
        signedIn = async () => { throw new Error('EBUSY: resource busy or locked'); };
        backToCalendar();
        await screen.findByText('Sign in with Google');

        await waitFor(() => expect(warm()).toBe(false));
    });

    it('a sign-out from Settings: nothing is kept', async () => {
        backToCalendar();
        await act(async () => undefined);

        fireEvent.click(screen.getByTestId('dashboard'));           // the Dashboard's onLogout

        expect(screen.getByText('Sign in with Google')).toBeTruthy();
        expect(warm()).toBe(false);
    });

    it('Google\'s sign-out: Sign in, and nothing is kept', async () => {
        backToCalendar();
        await act(async () => undefined);

        await send('auth:signed-out');

        expect(screen.getByText('Sign in with Google')).toBeTruthy();
        expect(warm()).toBe(false);
    });

    it('a new sign-in: the Dashboard remounts on an emptied session', async () => {
        backToCalendar();
        await act(async () => undefined);

        await send('auth:success');

        expect(screen.getByTestId('dashboard').textContent).toBe('a new week');
    });

    // The provider hears it and empties the session; CalendarApp is not listening yet, and its Dashboard
    // already started from the kept week.
    it('a sign-in landing between the first render and CalendarApp\'s effects still starts it over', async () => {
        signInDuringCommit = true;
        backToCalendar();
        await act(async () => undefined);

        expect(screen.getByTestId('dashboard').textContent).toBe('a new week');
        expect(authChecks).toHaveBeenCalledTimes(1);
    });
});
