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
import React, { useMemo, useReducer } from 'react';
import { useMissionScheduler } from './useMissionScheduler';
import { useRemoteControl } from './useRemoteControl';
import { MCContext, useMCDispatch } from '../store/useMCStore';
import { initialState, mcReducer } from '../store/mcReducer';
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
 * are mounted. `emit` plays what the main process would send.
 */
function installFakeIpc(): Emit {
    const listeners = new Map<string, Listener[]>();
    window.ipcRenderer = {
        invoke: vi.fn(),
        on: (channel: string, listener: Listener) => {
            listeners.set(channel, [...(listeners.get(channel) ?? []), listener]);
            return () => { listeners.set(channel, (listeners.get(channel) ?? []).filter(l => l !== listener)); };
        },
    };
    return (channel, payload) => act(() => { (listeners.get(channel) ?? []).forEach(l => l(payload)); });
}

export function renderLiveScheduler(initial: MCState, { ipc = false } = {}) {
    const emit: Emit = ipc ? installFakeIpc() : () => { throw new Error('render with { ipc: true } to emit'); };
    const live: { state: MCState } = { state: initial };
    function Store({ children }: { children: React.ReactNode }) {
        const [state, dispatch] = useReducer(mcReducer, initial);
        live.state = state;
        const value = useMemo(() => ({ state, dispatch }), [state]);
        return React.createElement(MCContext.Provider, { value }, children);
    }
    const hook = renderHook(() => { useMissionScheduler(); useRemoteControl(); return useMCDispatch(); }, { wrapper: Store });
    const dispatch = (action: MCAction) => act(() => { hook.result.current(action); });
    const unmount = () => { hook.unmount(); if (ipc) delete window.ipcRenderer; };
    return { live, dispatch, emit, unmount };
}

/** Advance fake time the way the app experiences it: a render between timer callbacks. */
export function step(ms: number) {
    for (let t = 0; t < ms; t += 100) act(() => { vi.advanceTimersByTime(Math.min(100, ms - t)); });
}

/** One jump, for a stretch where nothing is armed that could fire mid-way. */
export function jumpTo(when: Date) {
    act(() => { vi.advanceTimersByTime(when.getTime() - Date.now()); });
}

export function startLogs(state: MCState, phase: Phase): number {
    return state.activityLogs.filter(l => l.message === `${phase} mission started`).length;
}

/** Launches inside `phase`'s window and lets the scheduler start it. */
export function launchInsideWindow(phase: Phase, state: MCState = { ...initialState }, options: { ipc?: boolean } = {}) {
    vi.setSystemTime(at(...INSIDE_WINDOW[phase]));
    const harness = renderLiveScheduler(state, options);
    step(100);
    expect(harness.live.state.activeMission, 'precondition: the scheduler starts the open window').toBe(phase);
    return harness;
}
