// ============================================================
// Mission Control — reading school days from the family calendar
// ------------------------------------------------------------
// The hook asks the main process whether a calendar is connected
// (`auth:check`) and, if so, for the next 16 days of events (`data:events`),
// then stores which days have no school. It uses no timer: it refreshes on
// mount, when a mission ends (so the next one decides on fresh data), when the
// machine wakes, and when the calendar is connected — and never on the
// ordinary state churn of an always-mounted tree.
// ============================================================

import React from 'react';
import { render, renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MCContext, useMCDispatch, useMCState } from './useMCStore';
import { MCStoreProvider } from './MCStoreProvider';
import { initialState } from './mcReducer';
import { useSchoolCalendarSync } from './useSchoolCalendarSync';
import type { MCAction, MCState } from '../types';

const local = (y: number, m: number, d: number, h = 0, min = 0) => new Date(y, m - 1, d, h, min);
const PRO_D_TUESDAY = { id: 'p', title: 'Pro-D Day', allDay: true, start: local(2026, 9, 29), end: local(2026, 9, 30) };
const EXPECTED = { from: '2026-09-27', to: '2026-10-12', noSchool: [{ date: '2026-09-29', reason: 'Pro-D day' }] };

interface Deferred { resolve: (v: unknown) => void; reject: (e: unknown) => void }

/** A fake preload bridge. `answer` decides each invoke; `emit` fires a main-process event. */
function installIpc(answer: (channel: string) => unknown = ch => (ch === 'auth:check' ? true : [PRO_D_TUESDAY])) {
    const listeners = new Map<string, () => void>();
    const invoke = vi.fn((channel: string) => {
        const value = answer(channel);
        return value instanceof Promise ? value : Promise.resolve(value);
    });
    const on = vi.fn((channel: string, listener: () => void) => {
        listeners.set(channel, listener);
        return vi.fn(() => listeners.delete(channel));
    });
    window.ipcRenderer = { invoke, on };
    const emit = (channel: string) => act(() => { listeners.get(channel)?.(); });
    return { invoke, on, emit };
}

/** Mounts the hook against a controllable state with a spy dispatch (no reducer). */
function mount(initial: MCState = initialState) {
    let current = initial;
    const dispatch = vi.fn<(action: MCAction) => void>();
    const wrapper = ({ children }: { children: React.ReactNode }) =>
        <MCContext.Provider value={{ state: current, dispatch }}>{children}</MCContext.Provider>;
    const hook = renderHook(() => useSchoolCalendarSync(), { wrapper });
    const setState = (next: MCState) => { current = next; hook.rerender(); };
    const calendars = () => dispatch.mock.calls
        .map(([a]) => a)
        .filter((a): a is Extract<MCAction, { type: 'SET_SCHOOL_CALENDAR' }> => a.type === 'SET_SCHOOL_CALENDAR');
    return { dispatch, setState, calendars, unmount: hook.unmount };
}

/** Lets the hook's awaited invokes settle. */
const settle = () => act(async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); });

const eventFetches = (invoke: { mock: { calls: unknown[][] } }) => invoke.mock.calls.filter(([ch]) => ch === 'data:events').length;

beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(local(2026, 9, 27, 14, 30)); // Sunday afternoon
});

afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    delete window.ipcRenderer;
    localStorage.clear();
});

describe('useSchoolCalendarSync — wired into the store', () => {
    function Probe({ onState }: { onState: (s: MCState) => void }) {
        onState(useMCState());
        return null;
    }

    it('MCStoreProvider mounts it: the Pro-D day reaches the store, and the log stays empty', async () => {
        installIpc();
        let latest: MCState = initialState;
        const view = render(<MCStoreProvider><Probe onState={s => { latest = s; }} /></MCStoreProvider>);
        await settle();
        expect(latest.schoolCalendar).toEqual(EXPECTED);
        expect(latest.activityLogs).toEqual([]);
        view.unmount();
    });

    it('ordinary dispatches through the real store do not fetch again (one data:events for the launch)', async () => {
        const { invoke } = installIpc();
        let send: ((action: MCAction) => void) | undefined;
        function Dispatcher() {
            send = useMCDispatch();
            return null;
        }
        const view = render(<MCStoreProvider><Dispatcher /></MCStoreProvider>);
        await settle();
        act(() => { send!({ type: 'ADD_TOKEN' }); });
        act(() => { send!({ type: 'SET_MOOD_WIND', level: 1 }); });
        await settle();
        expect(eventFetches(invoke)).toBe(1);
        view.unmount();
    });
});

describe('useSchoolCalendarSync — happy path', () => {
    it('on mount asks auth, then events for today 00:00 to the midnight after today + 15, and stores the no-school days', async () => {
        const { invoke } = installIpc();
        const { calendars } = mount();
        await settle();

        expect(invoke.mock.calls).toEqual([
            ['auth:check'],
            ['data:events', local(2026, 9, 27).toISOString(), local(2026, 10, 13).toISOString(), { strict: true }],
        ]);
        expect(calendars()).toHaveLength(1);
        expect(calendars()[0]).toMatchObject({ type: 'SET_SCHOOL_CALENDAR', calendar: EXPECTED, origin: 'system' });
    });

    it('listens only on the two whitelisted events it needs', () => {
        const { on } = installIpc();
        mount();
        expect(on.mock.calls.map(([ch]) => ch).sort()).toEqual(['auth:success', 'system:resume']);
    });
});

describe('useSchoolCalendarSync — negative', () => {
    it('calendar not connected: stores null (weekday fallback) and never asks for events', async () => {
        const { invoke } = installIpc(ch => (ch === 'auth:check' ? false : []));
        const { calendars } = mount();
        await settle();
        expect(calendars()).toEqual([expect.objectContaining({ calendar: null, origin: 'system' })]);
        expect(eventFetches(invoke)).toBe(0);
    });

    it('a strict rejection keeps the stored slice (no dispatch) and warns — offline, an expired login, a calendar or the holiday feed failing', async () => {
        // In strict mode the main process throws on every one of those instead
        // of answering a partial list (electron/api_events_strict.test.ts).
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        installIpc(ch => (ch === 'auth:check' ? true : Promise.reject(new Error('fetch failed'))));
        const { calendars } = mount({ ...initialState, schoolCalendar: EXPECTED });
        await settle();
        expect(calendars()).toEqual([]);
        expect(warn).toHaveBeenCalled();
    });

    it('a bridge that throws synchronously (a channel the preload blocks) keeps the stored data', async () => {
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        installIpc(() => { throw new Error('Unauthorized channel'); });
        const { calendars } = mount();
        await settle();
        expect(calendars()).toEqual([]);
    });

    it('a result that is not a list keeps the stored data', async () => {
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        installIpc(ch => (ch === 'auth:check' ? true : { not: 'a list' }));
        const { calendars } = mount();
        await settle();
        expect(calendars()).toEqual([]);
    });

    it('an EMPTY strict answer is real (every source answered, nothing is closed): it replaces the stored slice', async () => {
        installIpc(ch => (ch === 'auth:check' ? true : []));
        const { calendars } = mount({ ...initialState, schoolCalendar: EXPECTED });
        await settle();
        expect(calendars().map(a => a.calendar)).toEqual([{ ...EXPECTED, noSchool: [] }]);
    });

    it('does nothing, and does not throw, without the Electron bridge', async () => {
        const { calendars } = mount();
        await settle();
        expect(calendars()).toEqual([]);
    });
});

describe('useSchoolCalendarSync — when it refreshes (lifecycle)', () => {
    it('refetches when a mission ends — not when it starts, not on unrelated state changes', async () => {
        const { invoke } = installIpc();
        const { setState } = mount();
        await settle();
        expect(eventFetches(invoke)).toBe(1);

        setState({ ...initialState, bankCount: 42 });
        setState({ ...initialState, bankCount: 43, missions: [...initialState.missions] });
        await settle();
        expect(eventFetches(invoke)).toBe(1);

        setState({ ...initialState, activeMission: 'morning' });
        await settle();
        expect(eventFetches(invoke)).toBe(1);

        setState({ ...initialState, activeMission: 'none' });
        await settle();
        expect(eventFetches(invoke)).toBe(2);
    });

    it('waits while a mission runs (no fresh start can happen then), and fetches when it ends', async () => {
        const { invoke, emit } = installIpc();
        const { setState } = mount({ ...initialState, activeMission: 'evening' });
        emit('system:resume');
        await settle();
        expect(invoke).not.toHaveBeenCalled();

        setState({ ...initialState, activeMission: 'none' });
        await settle();
        expect(eventFetches(invoke)).toBe(1);
    });

    it.each(['system:resume', 'auth:success'])('refetches on %s', async (channel) => {
        const { invoke, emit } = installIpc();
        mount();
        await settle();
        emit(channel);
        await settle();
        expect(eventFetches(invoke)).toBe(2);
    });

    it('stores a read that lands after a mission started (it serves the NEXT mission), without starting a new one', async () => {
        // Launch or wake at 05:59:58, the morning starts at 06:00, the answer
        // lands at 06:00:01. Dropping it left the evening deciding on old data.
        let pending: Deferred | undefined;
        const { invoke, emit } = installIpc(ch => (ch === 'auth:check' ? true : new Promise((resolve, reject) => { pending = { resolve, reject }; })));
        const { calendars, setState } = mount();
        await settle();
        setState({ ...initialState, activeMission: 'morning' });
        emit('system:resume'); // a wake during the mission starts nothing either
        await settle();
        pending!.resolve([PRO_D_TUESDAY]);
        await settle();
        expect(calendars().map(a => a.calendar)).toEqual([EXPECTED]);
        expect(eventFetches(invoke)).toBe(1);
    });

    it('ignores a late result that arrives after unmount', async () => {
        let pending: Deferred | undefined;
        installIpc(ch => (ch === 'auth:check' ? true : new Promise((resolve, reject) => { pending = { resolve, reject }; })));
        const { calendars, unmount } = mount();
        await settle();
        unmount();
        pending!.resolve([PRO_D_TUESDAY]);
        await settle();
        expect(calendars()).toEqual([]);
    });

    it('when refreshes overlap, a stale answer never overwrites a newer one', async () => {
        const pending: Deferred[] = [];
        const { emit } = installIpc(ch => (ch === 'auth:check' ? true : new Promise((resolve, reject) => { pending.push({ resolve, reject }); })));
        const { calendars } = mount();
        await settle();
        emit('system:resume'); // a second refresh while the first is still in flight
        await settle();
        expect(pending).toHaveLength(2);

        const proDWednesday = { ...PRO_D_TUESDAY, start: local(2026, 9, 30), end: local(2026, 10, 1) };
        pending[1].resolve([proDWednesday]); // the newer answer lands first...
        await settle();
        pending[0].resolve([PRO_D_TUESDAY]); // ...and the stale one after it
        await settle();
        expect(calendars().map(a => a.calendar)).toEqual([{ ...EXPECTED, noSchool: [{ date: '2026-09-30', reason: 'Pro-D day' }] }]);
    });
});
