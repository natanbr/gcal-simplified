// ============================================================
// MissionOverlay + the scheduler's expiry tick — who notices the end first
// ------------------------------------------------------------
// A run finished in time has two dispatchers of its completion: the overlay's
// auto-collect (a setTimeout due at the end) and the scheduler's 15 s tick.
// After a sleep both are overdue, and either may run first; when the tick won,
// the run ended unpaid (2026-11-14). Whichever runs second must be refused by
// completableRun and write no line, so the run is paid exactly once.
// The overlay is minimized, as on the bug's path: its timer display (and the
// live clock with it) is gone, so these two timers are all that is left.
// "Render between" lets React commit after the first one, as a timer task in
// the app usually does; "one batch" runs both before any render, so the second
// reads the state of the last render (the tick's stateRef, the overlay's closure).
// ============================================================

import React from 'react';
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MCStoreProvider } from '../store/MCStoreProvider';
import { STORAGE_KEY, useMCState } from '../store/useMCStore.tsx';
import { initialState } from '../store/mcReducer';
import { getLocalDateString } from '../store/behaviorSync';
import { _resetLiveClockForTesting } from '../hooks/useLiveClock';
import { useMissionScheduler } from '../hooks/useMissionScheduler';
import { at, jumpTo, step } from '../hooks/schedulerTestKit';
import { MissionOverlay } from './MissionOverlay';
import type { MCState } from '../types';

// Stable component types, as in MissionOverlay.late-finish.test.tsx.
vi.mock('framer-motion', async () => {
    const actual = await vi.importActual<typeof import('framer-motion')>('framer-motion');
    const tags = new Map<string, React.ForwardRefExoticComponent<{ children?: React.ReactNode } & React.RefAttributes<HTMLElement>>>();
    const tag = (name: string) => {
        if (!tags.has(name)) {
            tags.set(name, React.forwardRef<HTMLElement, { children?: React.ReactNode }>(({ children, ...props }, ref) =>
                React.createElement(name, { ...props, ref }, children)));
        }
        return tags.get(name);
    };
    return {
        ...actual,
        AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
        motion: new Proxy({}, { get: (_target, prop: string) => tag(prop) }),
    };
});

const live: { state: MCState } = { state: initialState };
function Probe() {
    live.state = useMCState();
    return null;
}
function Scheduler() {
    useMissionScheduler();
    return null;
}

const BANK = 3;
const completedLines = () => live.state.activityLogs.filter(l => l.message === 'Morning mission completed');

/**
 * A saved morning, every task done, started at 06:00:07 for 30 min (ends
 * 06:30:07), relaunched at 06:29:00: the tick's 15 s phase (from the launch) is
 * 7 s off the end, so each order below has seconds of margin.
 */
async function launchFinishedMorning(whiningDetected = false) {
    vi.setSystemTime(at(6, 29));
    const startedAt = at(6, 0, 0, 7).toISOString();
    const missions = initialState.missions.map(m => m.phase === 'morning'
        ? { ...m, active: true, startedAt, lastActiveAt: startedAt, occurrenceDate: getLocalDateString(at(6, 0)), durationMins: 30, whiningDetected, tasks: m.tasks.map(t => ({ ...t, completed: true })) }
        : m);
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
        _migrationVersion: 1, bankCount: BANK, missedMissionStreak: 2, missions, activeMission: 'morning', activityLogs: [],
    }));
    render(<MCStoreProvider><Probe /><Scheduler /><MissionOverlay /></MCStoreProvider>);
    await act(async () => { await vi.advanceTimersByTimeAsync(10); });
    expect(screen.getByTestId('mc-all-done'), 'precondition: the overlay shows the run as done').toBeInTheDocument();
    await act(async () => {
        fireEvent.pointerDown(screen.getByTestId('mc-minimize-btn'));
        fireEvent.pointerUp(screen.getByTestId('mc-minimize-btn'));
    });
    expect(screen.getByTestId('mc-mission-pill'), 'precondition: minimized').toBeInTheDocument();
}

/** Both timers overdue at the wake; then `run` lets them fire. */
function sleepThenWake(run: () => void) {
    vi.setSystemTime(at(7, 0));
    run();
}

const renderBetween = () => step(70_000);
const oneBatch = () => { act(() => { vi.advanceTimersByTime(70_000); }); };

function expectPaidOnce() {
    expect(completedLines(), 'exactly one completion line').toHaveLength(1);
    expect(live.state.bankCount, 'paid once').toBe(BANK + 2);
    expect(live.state.missedMissionStreak, 'one shield step back').toBe(1);
    expect(live.state.lastCompletedOrFailedMorningDate).toBe(getLocalDateString(at(6, 0)));
    expect(live.state.activeMission).toBe('none');
    expect(live.state.activityLogs.filter(l => l.message === 'Morning mission expired'), 'not reported as expired').toHaveLength(0);
}

beforeEach(() => {
    vi.useFakeTimers();
    _resetLiveClockForTesting();
    localStorage.clear();
});

afterEach(() => {
    cleanup();
    _resetLiveClockForTesting();
    vi.useRealTimers();
    localStorage.clear();
});

describe('a run finished in time is paid once, whoever notices its end first', () => {
    it.each([
        ['render between', renderBetween],
        ['one batch', oneBatch],
    ])('the tick first (%s)', async (_how, run) => {
        await launchFinishedMorning(); // the tick is due in 15 s, the overlay's timer in 67 s
        sleepThenWake(run);
        expectPaidOnce();
    });

    it.each([
        ['render between', renderBetween],
        ['one batch', oneBatch],
    ])('the overlay first (%s)', async (_how, run) => {
        await launchFinishedMorning();
        jumpTo(at(6, 30, 0, 1)); // the overlay's timer is due in 6 s, the tick in 14 s
        expect(live.state.activeMission, 'precondition: still running').toBe('morning');
        sleepThenWake(run);
        expectPaidOnce();
    });

    it('the overlay pays the shared bonus: one token less with whining', async () => {
        await launchFinishedMorning(true);
        jumpTo(at(6, 30, 0, 1));
        sleepThenWake(renderBetween);
        expect(completedLines(), 'exactly one completion line').toHaveLength(1);
        expect(live.state.bankCount, 'whining: 2 - 1').toBe(BANK + 1);
    });
});
