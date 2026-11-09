// ============================================================
// The quick-game eligibility trace (renderer side): what is sent, and when.
//
// The trace records every input the picker gate used, written by the main
// process into the diagnostics folder (electron/diagnostics.ts). Event-driven
// only: a session start, each mission end (labelled with its cause), the picker
// opening and the locked "+" (GoalPedestal.trace.test.tsx). Never a timer, never
// a store write, and a failure never reaches the app.
// ============================================================

import { StrictMode } from 'react';
import { render, renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { initialState } from './mcReducer';
import { MCStoreProvider } from './MCStoreProvider';
import { useMCDispatch } from './useMCStore';
import { quickGameEligibility } from './quickGameEligibility';
import { sendEligibilityTrace, traceEligibility, useEligibilityTrace } from './eligibilityTrace';
import type { MCAction, MCState } from '../types';

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
const NOON = '2026-09-02T12:00:00';

describe('traceEligibility and sendEligibilityTrace', () => {
    it('sends the eligibility object with what happened on diagnostics:trace', () => {
        traceEligibility(base, { event: 'locked-tap', caseId: 2 }, NOON);

        expect(traces()).toEqual([expect.objectContaining({
            event: 'locked-tap', caseId: 2, nowIso: NOON, gameTokens: 1, activeMission: 'none', windowOpen: false, pickerVisible: false,
        })]);
    });

    it('sends an object it is handed as it is, never a fresh read', () => {
        const decided = quickGameEligibility(base, NOON);

        sendEligibilityTrace(decided, { event: 'picker-open', caseId: 0, shownRewards: ['game'] });

        expect(traces()).toEqual([{ ...decided, event: 'picker-open', caseId: 0, shownRewards: ['game'] }]);
    });

    it('never throws: no bridge, or a bridge that refuses the channel', () => {
        delete window.ipcRenderer;
        expect(() => traceEligibility(base, { event: 'session-start' })).not.toThrow();

        window.ipcRenderer = { invoke: () => { throw new Error('Unauthorized channel'); }, on: vi.fn(() => () => undefined) };
        expect(() => traceEligibility(base, { event: 'session-start' })).not.toThrow();
    });

    it('handles a rejected call: no unhandled rejection', async () => {
        const unhandled = vi.fn();
        process.on('unhandledRejection', unhandled);
        try {
            window.ipcRenderer = { invoke: () => Promise.reject(new Error('main is gone')), on: vi.fn(() => () => undefined) };

            traceEligibility(base, { event: 'session-start' });
            await new Promise(resolve => setTimeout(resolve, 20)); // Node reports an unhandled rejection after the microtasks

            expect(unhandled).not.toHaveBeenCalled();
        } finally {
            process.off('unhandledRejection', unhandled);
        }
    });
});

/** `missions` with one phase's run patched. */
const withRun = (state: MCState, phase: 'morning' | 'evening', patch: Partial<MCState['missions'][number]>): MCState['missions'] =>
    state.missions.map(m => (m.phase === phase ? { ...m, ...patch } : m));

describe('useEligibilityTrace', () => {
    it('sends one session-start trace at mount, also under StrictMode', () => {
        renderHook(() => useEligibilityTrace(base), { wrapper: StrictMode });
        expect(traces()).toEqual([expect.objectContaining({ event: 'session-start' })]);
    });

    const running: MCState = { ...base, activeMission: 'morning', missions: withRun(base, 'morning', { active: true }) };

    function fromRunning() {
        const view = renderHook(({ state }) => useEligibilityTrace(state), { initialProps: { state: running } });
        invoke.mockClear();
        return view;
    }

    it('labels a completion: the run ends and its outcome is recorded at once', () => {
        const { rerender } = fromRunning();

        rerender({ state: { ...running, activeMission: 'none', lastCompletedOrFailedMorningDate: TODAY, missions: withRun(running, 'morning', { active: false }) } });

        expect(traces()).toEqual([expect.objectContaining({
            event: 'mission-end', cause: 'completed', endedMission: 'morning', activeMission: 'none', lastCompletedOrFailedMorningDate: TODAY,
        })]);
    });

    it('labels a timeout in its two steps: the miss while the run is on screen, then the run ending', () => {
        const { rerender } = fromRunning();
        const timedOut: MCState = { ...running, lastCompletedOrFailedMorningDate: TODAY, missions: withRun(running, 'morning', { loggedTimeoutAt: `${NOON}.000Z` }) };

        rerender({ state: timedOut });
        rerender({ state: { ...timedOut, activeMission: 'none' } });

        expect(traces()).toEqual([
            expect.objectContaining({ event: 'mission-end', cause: 'missed', endedMission: 'morning', activeMission: 'morning' }),
            expect.objectContaining({ event: 'mission-end', cause: 'ended', endedMission: 'morning', activeMission: 'none' }),
        ]);
    });

    it('labels a run that ends with no outcome as stopped', () => {
        const { rerender } = fromRunning();

        rerender({ state: { ...running, activeMission: 'none', missions: withRun(running, 'morning', { active: false }) } });

        expect(traces()).toEqual([expect.objectContaining({ event: 'mission-end', cause: 'stopped', endedMission: 'morning' })]);
    });

    it('sends nothing for a mission start or any other change', () => {
        const { rerender } = renderHook(({ state }) => useEligibilityTrace(state), { initialProps: { state: base } });
        invoke.mockClear();

        rerender({ state: { ...base, bankCount: 9, moodWind: -1, gameTokens: 4 } });
        rerender({ state: { ...base, bankCount: 9, moodWind: -1, gameTokens: 4, activeMission: 'evening' } });

        expect(traces()).toEqual([]);
    });
});

describe('useEligibilityTrace in MCStoreProvider, with the real reducer', () => {
    let dispatch: (action: MCAction) => void = () => undefined;
    function Probe() {
        dispatch = useMCDispatch();
        return null;
    }
    const send = (...actions: MCAction[]) => { for (const action of actions) act(() => { dispatch(action); }); };

    it('sends one session-start trace per launch', () => {
        render(<MCStoreProvider><Probe /></MCStoreProvider>);
        expect(traces()).toEqual([expect.objectContaining({ event: 'session-start', activeMission: 'none' })]);
    });

    it('labels the phone\'s Stop', () => {
        render(<MCStoreProvider><Probe /></MCStoreProvider>);
        send({ type: 'SET_ACTIVE_MISSION', phase: 'morning' });
        invoke.mockClear();

        send({ type: 'CANCEL_MISSION', missionPhase: 'morning', origin: 'remote' });

        expect(traces()).toEqual([expect.objectContaining({ event: 'mission-end', cause: 'stopped', endedMission: 'morning', activeMission: 'none' })]);
    });

    it('labels a timeout\'s miss, then the run leaving the screen', () => {
        render(<MCStoreProvider><Probe /></MCStoreProvider>);
        send({ type: 'SET_ACTIVE_MISSION', phase: 'morning' });
        invoke.mockClear();

        send({ type: 'MARK_MISSION_TIMEOUT', missionPhase: 'morning', origin: 'scheduler' }, { type: 'SET_ACTIVE_MISSION', phase: 'none', origin: 'scheduler' });

        expect(traces()).toEqual([
            expect.objectContaining({ event: 'mission-end', cause: 'missed', endedMission: 'morning', activeMission: 'morning' }),
            expect.objectContaining({ event: 'mission-end', cause: 'ended', endedMission: 'morning', activeMission: 'none' }),
        ]);
    });
});
