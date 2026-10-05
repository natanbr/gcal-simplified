// ============================================================
// The calendar screen follows the Google sign-in (2026-10-04)
// ------------------------------------------------------------
// Two ways the screen and the main process disagreed:
//   - Google refused the refresh token mid-session. The main process now signs
//     out and sends `auth:signed-out`; without listening for it the screen kept
//     the Dashboard, an empty week, until a relaunch.
//   - auth:check rejected (the token file held by antivirus or a backup). The
//     screen showed "Sign in with Google" and never asked again, although the
//     next check in the main process would have answered.
// ============================================================

import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { CalendarApp } from './CalendarApp';

vi.mock('./Dashboard', () => ({ Dashboard: () => <div>the week</div> }));
vi.mock('./LoginScreen', () => ({ LoginScreen: () => <div>Sign in with Google</div> }));

const HELD = () => Object.assign(new Error('EBUSY: resource busy or locked'), { code: 'EBUSY' });

/** A fake preload bridge whose auth:check answers come from `check`, and whose events the test sends. */
function fakeBridge(check: () => Promise<unknown>) {
    const listeners = new Map<string, Set<() => void>>();
    const invoke = vi.fn(async (channel: string) => (channel === 'auth:check' ? check() : null));
    window.ipcRenderer = {
        invoke,
        on: (channel, listener) => {
            const set = listeners.get(channel) ?? new Set();
            set.add(listener);
            listeners.set(channel, set);
            return () => { set.delete(listener); };
        },
    };
    const send = (channel: string) => act(() => { listeners.get(channel)?.forEach(listener => listener()); });
    const authChecks = () => invoke.mock.calls.filter(([channel]) => channel === 'auth:check').length;
    return { send, authChecks };
}

const renderCalendar = () => render(<CalendarApp onSwitchToMC={() => undefined} />);

describe('CalendarApp and the Google sign-in', () => {
    afterEach(() => {
        vi.useRealTimers();
        delete window.ipcRenderer;
    });

    it('signed in: the week', async () => {
        fakeBridge(async () => true);
        renderCalendar();

        expect(await screen.findByText('the week')).toBeInTheDocument();
    });

    it('signed out: Sign in, and a sign-in brings the week', async () => {
        const bridge = fakeBridge(async () => false);
        renderCalendar();
        expect(await screen.findByText('Sign in with Google')).toBeInTheDocument();

        await bridge.send('auth:success');

        expect(screen.getByText('the week')).toBeInTheDocument();
    });

    it('a sign-out Google forced mid-session brings Sign in back, without a relaunch', async () => {
        const bridge = fakeBridge(async () => true);
        renderCalendar();
        expect(await screen.findByText('the week')).toBeInTheDocument();

        await bridge.send('auth:signed-out');

        expect(screen.getByText('Sign in with Google')).toBeInTheDocument();
    });

    it('a check that fails (the token file held) is asked again before falling back to Sign in', async () => {
        vi.useFakeTimers();
        let answers = 0;
        const bridge = fakeBridge(async () => { answers += 1; if (answers === 1) throw HELD(); return true; });
        renderCalendar();

        await act(() => vi.runAllTimersAsync());

        expect(screen.getByText('the week')).toBeInTheDocument();
        expect(bridge.authChecks()).toBe(2);
    });

    it('a check that keeps failing ends on Sign in, and stops asking', async () => {
        vi.useFakeTimers();
        const bridge = fakeBridge(async () => { throw HELD(); });
        renderCalendar();

        await act(() => vi.runAllTimersAsync());
        const asked = bridge.authChecks();
        await act(() => vi.advanceTimersByTimeAsync(60 * 60 * 1000));

        expect(screen.getByText('Sign in with Google')).toBeInTheDocument();
        expect(asked).toBe(4);
        expect(bridge.authChecks()).toBe(asked);
    });

    it('leaving the calendar while a check waits to be asked again cancels it', async () => {
        vi.useFakeTimers();
        const bridge = fakeBridge(async () => { throw HELD(); });
        const { unmount } = renderCalendar();
        await act(() => vi.advanceTimersByTimeAsync(0));
        const asked = bridge.authChecks();

        unmount();
        await vi.advanceTimersByTimeAsync(60 * 60 * 1000);

        expect(bridge.authChecks()).toBe(asked);
    });
});
