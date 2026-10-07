// ============================================================
// Test kit — the mission scheduler driven by the REAL reducer through the
// real dispatch interceptor (so every action is timestamped and logged the way
// the app does it). Shared by the useMissionScheduler.*.test.tsx suites.
//
// Timers advance in 100 ms steps, each in its own act(): inside one act React
// does not re-render between timer callbacks, so the scheduler would read a
// stale state and "start" the mission once a second, which the app never does.
// ============================================================

import { renderHook, act } from '@testing-library/react';
import { expect, vi } from 'vitest';
import React, { useMemo, useReducer, useRef } from 'react';
import { useMissionScheduler } from './useMissionScheduler';
import { useRemoteControl } from './useRemoteControl';
import { MCContext, STORAGE_KEY, loadPersistedState, useMCDispatch } from '../store/useMCStore';
import { initialState, mcReducer } from '../store/mcReducer';
import { getLocalDateString } from '../store/behaviorSync';
import { pendingFrom } from '../store/pendingState';
import type { MCAction, MCState } from '../types';

export type Phase = 'morning' | 'evening';

/** Four minutes into each default window (06:00–06:30, 19:00–20:00). */
export const INSIDE_WINDOW: Record<Phase, [number, number]> = { morning: [6, 4], evening: [19, 4] };

export function at(h: number, m: number, dayOffset = 0, s = 0): Date {
    const d = new Date();
    d.setDate(d.getDate() + dayOffset);
    d.setHours(h, m, s, 0);
    return d;
}

type Listener = (...args: unknown[]) => void;
type Emit = (channel: string, payload?: unknown) => void;

/**
 * A fake preload bridge, so the scheduler's `system:resume` listener and the
 * REAL remote path (useRemoteControl: allowlist, validators, timestamp scrub)
 * are mounted. `emit` plays what the main process would send, in its own act();
 * `send` does the same without one, for a burst inside the caller's act().
 */
function installFakeIpc(): { emit: Emit; send: Emit } {
    const listeners = new Map<string, Listener[]>();
    window.ipcRenderer = {
        invoke: vi.fn(),
        on: (channel: string, listener: Listener) => {
            listeners.set(channel, [...(listeners.get(channel) ?? []), listener]);
            return () => { listeners.set(channel, (listeners.get(channel) ?? []).filter(l => l !== listener)); };
        },
    };
    const send: Emit = (channel, payload) => { (listeners.get(channel) ?? []).forEach(l => l(payload)); };
    return { send, emit: (channel, payload) => act(() => { send(channel, payload); }) };
}

export function renderLiveScheduler(initial: MCState, { ipc = false } = {}) {
    const noIpc: Emit = () => { throw new Error('render with { ipc: true } to emit'); };
    const { emit, send } = ipc ? installFakeIpc() : { emit: noIpc, send: noIpc };
    const live: { state: MCState } = { state: initial };
    function Store({ children }: { children: React.ReactNode }) {
        const [state, dispatch] = useReducer(mcReducer, initial);
        live.state = state;
        // Shared by every useMCDispatch, as MCStoreProvider does, so a burst from two
        // sources before a render logs from the state each action really applies to.
        const pending = useRef(pendingFrom(state));
        pending.current = pendingFrom(state);
        const value = useMemo(() => ({ state, dispatch, pending }), [state]);
        return React.createElement(MCContext.Provider, { value }, children);
    }
    const hook = renderHook(() => { useMissionScheduler(); useRemoteControl(); return useMCDispatch(); }, { wrapper: Store });
    const dispatch = (action: MCAction) => act(() => { hook.result.current(action); });
    const unmount = () => { hook.unmount(); if (ipc) delete window.ipcRenderer; };
    return { live, dispatch, emit, send, unmount };
}

/** The app is closed: what it saved is what the next launch loads. */
export function saveAndClose(harness: { live: { state: MCState }; unmount: () => void }) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(harness.live.state));
    harness.unmount();
}

/** Moves past `when` with a render between timer callbacks, so the 15 s expiry tick sees the run. */
export function crossing(when: Date) {
    jumpTo(new Date(when.getTime() - 60_000));
    step(90_000);
}

/** Advance fake time the way the app experiences it: a render between timer callbacks. */
export function step(ms: number) {
    for (let t = 0; t < ms; t += 100) act(() => { vi.advanceTimersByTime(Math.min(100, ms - t)); });
}

/** One jump, for a stretch where nothing is armed that could fire mid-way. */
export function jumpTo(when: Date) {
    act(() => { vi.advanceTimersByTime(when.getTime() - Date.now()); });
}

/** A prefix match: the start line goes on to say whether the school bag is on the list. */
export function startLogs(state: MCState, phase: Phase): number {
    return state.activityLogs.filter(l => l.message.startsWith(`${phase} mission started`)).length;
}

/** Every "skipped" line for `phase`, whatever window it names. */
export function skippedLines(state: MCState, phase: Phase): number {
    const name = phase === 'morning' ? 'Morning' : 'Evening';
    return state.activityLogs.filter(l => l.message.startsWith(`${name} mission skipped`)).length;
}

/** Only the evening, at `startsAt` for `durationMins`, derived the way Settings → Save derives it. */
export function eveningOnlyAt(startsAt: string, durationMins: number): MCState {
    const s = mcReducer(initialState, { type: 'SET_SETTINGS', settings: { eveningStartsAt: startsAt, eveningDurationMins: durationMins } });
    return { ...s, missions: s.missions.filter(m => m.phase === 'evening') };
}

/** What the last launch saved, without the morning hydration puts back (a 06:00 morning would run mid-test). */
export function loadEveningOnly(): MCState {
    const loaded = loadPersistedState();
    return { ...loaded, missions: loaded.missions.filter(m => m.phase === 'evening') };
}

/**
 * `state` after the scheduler started `phase` at `ranAt` and it was finished 20 min
 * later, through the real reducer: the history a real profile has. A profile on
 * which a mission never ran has no evidence the app existed at an earlier window,
 * so it gets no "skipped" line at launch.
 */
export function ranOnce(state: MCState, phase: Phase, ranAt: Date): MCState {
    const started = mcReducer(state, {
        type: 'SET_ACTIVE_MISSION', phase, origin: 'scheduler', occurrenceDate: getLocalDateString(ranAt), timestamp: ranAt.toISOString(),
    });
    const finishedAt = new Date(ranAt.getTime() + 20 * 60_000).toISOString();
    return mcReducer(started, { type: 'COMPLETE_MISSION_ROUTINE', missionPhase: phase, bonusTokens: 0, timestamp: finishedAt });
}

/** Launches inside `phase`'s window and lets the scheduler start it. */
export function launchInsideWindow(phase: Phase, state: MCState = { ...initialState }, options: { ipc?: boolean } = {}) {
    vi.setSystemTime(at(...INSIDE_WINDOW[phase]));
    const harness = renderLiveScheduler(state, options);
    step(100);
    expect(harness.live.state.activeMission, 'precondition: the scheduler starts the open window').toBe(phase);
    return harness;
}
