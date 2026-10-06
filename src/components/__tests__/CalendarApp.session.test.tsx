// ============================================================
// CalendarApp and the calendar session (2026-10-06)
// ------------------------------------------------------------
// Back from Mission Control the session holds this sign-in's week, so the
// Calendar shows it at once while auth:check confirms the sign-in (the
// "Loading..." screen came first before). Every sign-out CalendarApp finds
// (auth:check, Google's sign-out, Settings) empties the session, and a new
// sign-in empties it before the Dashboard remounts, whichever of the two
// auth:success listeners runs first. The stand-in Dashboard says which it
// started from: the week kept, or a new one.
// ============================================================

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CalendarApp } from '../CalendarApp';
import { CalendarSession, CalendarSessionContext } from '../../features/calendar-session/calendarSession';

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

let session: CalendarSession;
let signedIn: () => Promise<unknown>;
const listeners = new Map<string, Set<() => void>>();
const send = (channel: string) => act(async () => { listeners.get(channel)?.forEach(l => l()); });
const authChecks = vi.fn();

beforeEach(() => {
    listeners.clear();
    authChecks.mockReset();
    signedIn = async () => true;
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
    session = new CalendarSession();
    session.open().keep('calendar', { months: { '2026-10': { events: [], loadedAt: new Date() } }, shown: { events: [], from: null } });
});

afterEach(() => {
    vi.restoreAllMocks();
    delete window.ipcRenderer;
});

const renderCalendar = () => render(
    <CalendarSessionContext.Provider value={session}>
        <CalendarApp onSwitchToMC={() => undefined} />
    </CalendarSessionContext.Provider>,
);

describe('CalendarApp with a session kept', () => {
    it('shows the kept week at once, and still asks auth:check once', async () => {
        renderCalendar();

        expect(screen.getByTestId('dashboard').textContent).toBe('the kept week');
        expect(screen.queryByText('Loading...')).toBeNull();
        await act(async () => undefined);
        expect(authChecks).toHaveBeenCalledTimes(1);
    });

    it('signed out by the time it is back (auth:check says so): Sign in, and nothing is kept', async () => {
        signedIn = async () => false;
        renderCalendar();
        await screen.findByText('Sign in with Google');

        await waitFor(() => expect(session.warm).toBe(false));   // the forget is an effect of that render
    });

    it('a check that fails counts as signed out: nothing is kept', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
        signedIn = async () => { throw new Error('EBUSY: resource busy or locked'); };
        renderCalendar();
        await screen.findByText('Sign in with Google');

        await waitFor(() => expect(session.warm).toBe(false));   // the forget is an effect of that render
    });

    it('a sign-out from Settings: nothing is kept', async () => {
        renderCalendar();
        await act(async () => undefined);

        fireEvent.click(screen.getByTestId('dashboard'));           // the Dashboard's onLogout

        expect(screen.getByText('Sign in with Google')).toBeTruthy();
        expect(session.warm).toBe(false);
    });

    it('Google\'s sign-out: nothing is kept', async () => {
        renderCalendar();
        await act(async () => undefined);

        await send('auth:signed-out');

        expect(screen.getByText('Sign in with Google')).toBeTruthy();
        expect(session.warm).toBe(false);
    });

    it('a new sign-in empties it before the Dashboard remounts: the new Dashboard starts from nothing', async () => {
        renderCalendar();
        await act(async () => undefined);

        await send('auth:success');                                 // only CalendarApp's listener: no provider here

        expect(screen.getByTestId('dashboard').textContent).toBe('a new week');
    });
});
