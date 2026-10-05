// ============================================================
// The calendar screen follows the Google sign-in (2026-10-04)
// ------------------------------------------------------------
// Google refused the refresh token mid-session: the main process now signs out
// and sends `auth:signed-out`; without listening for it the screen kept the
// Dashboard, an empty week, until a relaunch.
// A token file held for a moment is read again by the main process before
// auth:check answers (electron/held-file.ts, main_auth.test.ts), so the screen
// asks once and shows Sign in for any failure that is still left.
// ============================================================

import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { CalendarApp } from './CalendarApp';

vi.mock('./Dashboard', () => ({ Dashboard: () => <div>the week</div> }));
vi.mock('./LoginScreen', () => ({ LoginScreen: () => <div>Sign in with Google</div> }));

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
    return { send, authChecks, listening: (channel: string) => listeners.get(channel)?.size ?? 0 };
}

const renderCalendar = () => render(<CalendarApp onSwitchToMC={() => undefined} />);

describe('CalendarApp and the Google sign-in', () => {
    afterEach(() => {
        vi.restoreAllMocks();
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

    it('a check that still fails after the main process retried shows Sign in, asked once', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const bridge = fakeBridge(async () => { throw Object.assign(new Error('EBUSY: resource busy or locked'), { code: 'EBUSY' }); });
        renderCalendar();

        expect(await screen.findByText('Sign in with Google')).toBeInTheDocument();
        expect(bridge.authChecks()).toBe(1);
    });

    it('leaving the calendar stops listening', async () => {
        const bridge = fakeBridge(async () => true);
        const { unmount } = renderCalendar();
        expect(await screen.findByText('the week')).toBeInTheDocument();

        unmount();

        expect(bridge.listening('auth:success')).toBe(0);
        expect(bridge.listening('auth:signed-out')).toBe(0);
    });
});
