// ============================================================
// A suspension ends at its end time with nobody pressing anything
// ------------------------------------------------------------
// Every reader derives "in force" from the clock, but a surface only re-reads
// it when it re-renders and the phone only when something broadcasts. A
// completed Game goal's "Use!" stayed locked, and the phone kept showing the
// suspension, until some unrelated change (architect + QA review, 2026-09-23).
// One timer to the next end dispatches EXPIRE_SUSPENSIONS, which also gives
// the lift its own log line, attributed `auto`.
// ============================================================

import React from 'react';
import { render, renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MCStoreProvider } from './MCStoreProvider';
import { MCContext, STORAGE_KEY, useMCState } from './useMCStore';
import { initialState } from './mcReducer';
import { useSuspensionExpiry } from './useSuspensionExpiry';
import type { MCState, PrivilegeCard } from '../types';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const inMs = (ms: number) => new Date(Date.now() + ms).toISOString();

function withKnife(status: PrivilegeCard['status'], suspendedUntil: string | null): MCState {
    return {
        ...initialState,
        privileges: initialState.privileges.map(p => (p.id === 'knife' ? { ...p, status, suspendedUntil } : p)),
    };
}

/** Mounts the hook against a fixed state with a spy dispatch (no reducer). */
function mountHook(state: MCState) {
    const dispatch = vi.fn();
    const wrapper = ({ children }: { children: React.ReactNode }) =>
        <MCContext.Provider value={{ state, dispatch }}>{children}</MCContext.Provider>;
    renderHook(() => useSuspensionExpiry(), { wrapper });
    const expiries = () => dispatch.mock.calls.filter(([a]) => a.type === 'EXPIRE_SUSPENSIONS');
    return { dispatch, expiries };
}

beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-22T10:00:00.000Z'));
});

afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    delete window.ipcRenderer;
    localStorage.clear();
});

describe('useSuspensionExpiry — the timer', () => {
    it('fires once, at the end time exactly, attributed to the automatic timer', () => {
        const { expiries } = mountHook(withKnife('suspended', inMs(HOUR)));
        act(() => { vi.advanceTimersByTime(HOUR - 1); });
        expect(expiries()).toHaveLength(0);
        act(() => { vi.advanceTimersByTime(1); });
        expect(expiries()).toHaveLength(1);
        expect(expiries()[0][0]).toMatchObject({ type: 'EXPIRE_SUSPENSIONS', origin: 'auto' });
    });

    it('arms nothing when no suspension is stored (idle Calendar costs nothing)', () => {
        mountHook(withKnife('active', null));
        expect(vi.getTimerCount()).toBe(0);
    });

    it('never asks setTimeout for more than it can hold (~24.8 days), and still ends on time', () => {
        // A real delay above 2^31-1 ms overflows and fires at once; fake timers
        // do not reproduce that, so the delay itself is what is checked.
        const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');
        const { expiries } = mountHook(withKnife('suspended', inMs(30 * DAY)));
        const delays = setTimeoutSpy.mock.calls.map(([, ms]) => ms ?? 0);
        expect(Math.max(...delays)).toBeLessThanOrEqual(2 ** 31 - 1);
        act(() => { vi.advanceTimersByTime(25 * DAY); });
        expect(expiries()).toHaveLength(0);
        act(() => { vi.advanceTimersByTime(5 * DAY); });
        expect(expiries()).toHaveLength(1);
    });

    it('re-aims on wake, because a timer armed before sleep fires late (lifecycle)', () => {
        let resume: (() => void) | undefined;
        window.ipcRenderer = {
            invoke: vi.fn(),
            on: vi.fn((channel: string, listener: () => void) => {
                if (channel === 'system:resume') resume = listener;
                return vi.fn();
            }),
        };
        const end = Date.now() + HOUR;
        const { expiries } = mountHook(withKnife('suspended', new Date(end).toISOString()));
        // The machine slept through the end: the wall clock jumped, the timer did not run.
        vi.setSystemTime(end + 10 * 60_000);
        expect(expiries()).toHaveLength(0);
        act(() => { resume!(); });
        act(() => { vi.advanceTimersByTime(0); });
        expect(expiries()).toHaveLength(1);
    });
});

describe('useSuspensionExpiry — through the real store', () => {
    function Probe({ onState }: { onState: (s: MCState) => void }) {
        onState(useMCState());
        return null;
    }

    function mountStore(seed: MCState) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ privileges: seed.privileges, activityLogs: [] }));
        let latest: MCState = initialState;
        render(<MCStoreProvider><Probe onState={s => { latest = s; }} /></MCStoreProvider>);
        const knife = () => latest.privileges.find(p => p.id === 'knife')!;
        const endedLines = () => latest.activityLogs.filter(l => l.message.includes('suspension ended'));
        return { knife, endedLines };
    }

    it('lifts the stored suspension at its end and logs it once', () => {
        const { knife, endedLines } = mountStore(withKnife('suspended', inMs(20_000)));
        expect(knife().status).toBe('suspended');
        act(() => { vi.advanceTimersByTime(20_000); });
        expect(knife()).toMatchObject({ status: 'active', suspendedUntil: null });
        expect(endedLines()).toHaveLength(1);
        expect(endedLines()[0].source).toBe('auto');
    });

    it('lifts, and logs, a suspension that ended while the app was closed (lifecycle)', () => {
        const { knife, endedLines } = mountStore(withKnife('suspended', inMs(-HOUR)));
        act(() => { vi.advanceTimersByTime(0); });
        expect(knife().status).toBe('active');
        expect(endedLines()).toHaveLength(1);
    });

    it('leaves a running suspension alone (negative)', () => {
        const { knife, endedLines } = mountStore(withKnife('suspended', inMs(HOUR)));
        act(() => { vi.advanceTimersByTime(HOUR - 1_000); });
        expect(knife().status).toBe('suspended');
        expect(endedLines()).toHaveLength(0);
    });
});
