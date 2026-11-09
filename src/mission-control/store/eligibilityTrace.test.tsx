// ============================================================
// The quick-game eligibility trace (renderer side): what is sent, and when.
//
// The trace is a record of every input the picker gate used, at the moment it
// used it, written by the main process into the diagnostics folder
// (electron/diagnostics.ts). Event-driven only: a session start, each mission
// end, and each "+" tap (GoalPedestal.trace.test.tsx). Never a timer, never a
// store write, and a failure never reaches the app.
// ============================================================

import { StrictMode } from 'react';
import { render, renderHook } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { initialState } from './mcReducer';
import { MCStoreProvider } from './MCStoreProvider';
import { traceEligibility, useEligibilityTrace } from './eligibilityTrace';
import type { MCState } from '../types';

const invoke = vi.fn<(channel: string, ...args: unknown[]) => Promise<unknown>>();

const traces = () => invoke.mock.calls.filter(([channel]) => channel === 'diagnostics:trace').map(([, payload]) => payload);

beforeEach(() => {
    invoke.mockReset();
    invoke.mockResolvedValue(null);
    window.ipcRenderer = { invoke, on: vi.fn(() => () => undefined) };
});

afterEach(() => {
    delete window.ipcRenderer;
    localStorage.clear();
});

const TODAY = '2026-09-02';
const base: MCState = { ...initialState, gameTokens: 1, activeMission: 'none', lastCompletedOrFailedMorningDate: null };

describe('traceEligibility', () => {
    it('sends the eligibility object with the event on diagnostics:trace', () => {
        traceEligibility(base, { event: 'plus-tap', caseId: 2, pickerOpened: true }, '2026-09-02T12:00:00');

        expect(traces()).toEqual([expect.objectContaining({
            event: 'plus-tap', caseId: 2, pickerOpened: true,
            nowIso: '2026-09-02T12:00:00', gameTokens: 1, activeMission: 'none', windowOpen: false, pickerVisible: false,
        })]);
    });

    it('never throws: no bridge, a bridge that throws, or a rejected call', async () => {
        delete window.ipcRenderer;
        expect(() => traceEligibility(base, { event: 'session-start' })).not.toThrow();

        window.ipcRenderer = { invoke: () => { throw new Error('Unauthorized channel'); }, on: vi.fn(() => () => undefined) };
        expect(() => traceEligibility(base, { event: 'session-start' })).not.toThrow();

        const rejected = Promise.reject(new Error('main is gone'));
        window.ipcRenderer = { invoke: () => rejected, on: vi.fn(() => () => undefined) };
        expect(() => traceEligibility(base, { event: 'session-start' })).not.toThrow();
        await expect(rejected).rejects.toThrow(); // handled: no unhandled rejection fails the run
    });
});

describe('useEligibilityTrace', () => {
    it('sends one session-start trace at mount, also under StrictMode', () => {
        renderHook(() => useEligibilityTrace(base), { wrapper: StrictMode });
        expect(traces()).toEqual([expect.objectContaining({ event: 'session-start' })]);
    });

    it('sends a mission-end trace when a running mission ends, with the state after it', () => {
        const running: MCState = { ...base, activeMission: 'morning' };
        const { rerender } = renderHook(({ state }) => useEligibilityTrace(state), { initialProps: { state: running } });
        invoke.mockClear();

        rerender({ state: { ...running, activeMission: 'none', lastCompletedOrFailedMorningDate: TODAY } });

        expect(traces()).toEqual([expect.objectContaining({
            event: 'mission-end', endedMission: 'morning', activeMission: 'none', lastCompletedOrFailedMorningDate: TODAY,
        })]);
    });

    it('sends a mission-end trace when an outcome is recorded while the run is still on screen (a timeout)', () => {
        const running: MCState = { ...base, activeMission: 'morning' };
        const { rerender } = renderHook(({ state }) => useEligibilityTrace(state), { initialProps: { state: running } });
        invoke.mockClear();

        rerender({ state: { ...running, lastCompletedOrFailedMorningDate: TODAY } });

        expect(traces()).toEqual([expect.objectContaining({ event: 'mission-end', endedMission: 'morning', activeMission: 'morning' })]);
    });

    it('sends nothing for a mission start or any other change', () => {
        const { rerender } = renderHook(({ state }) => useEligibilityTrace(state), { initialProps: { state: base } });
        invoke.mockClear();

        rerender({ state: { ...base, bankCount: 9, moodWind: -1, gameTokens: 4 } });
        rerender({ state: { ...base, bankCount: 9, moodWind: -1, gameTokens: 4, activeMission: 'evening' } });

        expect(traces()).toEqual([]);
    });

    it('is mounted by MCStoreProvider: one session-start trace per launch', () => {
        render(<MCStoreProvider><div /></MCStoreProvider>);
        expect(traces()).toEqual([expect.objectContaining({ event: 'session-start', activeMission: 'none' })]);
    });
});
