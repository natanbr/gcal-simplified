// ============================================================
// MissionOverlay — the last task finished after the timeout was logged
// ------------------------------------------------------------
// The overlay's timer logs the miss the second the run ends with a task left,
// and the run stays on screen until the scheduler's next 15 s tick ends it. A
// task finished in that gap made every task done, and the overlay's auto-collect
// paid the run as completed too: bank +2 and the shield segment given back
// (PR 197 review). Refused now (owner, 2026-10-07), and the overlay must not
// show "Mission Complete!" or a Collect button for a payout the reducer refuses
// (CLAUDE.md → Refusals must be silent in the log and visible on screen).
// The scheduler is not mounted here, so the gap lasts as long as the test needs.
// ============================================================

import React from 'react';
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MCStoreProvider } from '../store/MCStoreProvider';
import { STORAGE_KEY, useMCDispatch, useMCState } from '../store/useMCStore.tsx';
import { initialState } from '../store/mcReducer';
import { _resetLiveClockForTesting } from '../hooks/useLiveClock';
import { MissionOverlay } from './MissionOverlay';
import type { MCAction, MCState } from '../types';

// Stable component types, as in MissionOverlay.settle-launch.test.tsx: the usual
// mock remounts the overlay on every render and re-runs its mount effects.
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

const live: { state: MCState; dispatch?: (a: MCAction) => void } = { state: initialState };
function Probe() {
    live.state = useMCState();
    live.dispatch = useMCDispatch();
    return null;
}

const NOW = new Date('2026-10-07T08:00:00.000Z');
const morning = () => live.state.missions.find(m => m.phase === 'morning');
const completedLines = () => live.state.activityLogs.filter(l => l.message === 'Morning mission completed');

/** A saved morning that started 30 min ago for 30 min: over now. */
function seedMorning(over: { tasksDone: boolean; loggedTimeoutAt?: string; startedMinsAgo?: number }) {
    const startedAt = new Date(NOW.getTime() - (over.startedMinsAgo ?? 30) * 60_000).toISOString();
    const missions = initialState.missions.map(m => m.phase === 'morning'
        ? { ...m, active: true, startedAt, durationMins: 30, loggedTimeoutAt: over.loggedTimeoutAt, tasks: m.tasks.map(t => ({ ...t, completed: over.tasksDone })) }
        : m);
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
        _migrationVersion: 1, bankCount: 0, missedMissionStreak: 2, missions, activeMission: 'morning', activityLogs: [],
    }));
}

async function launch() {
    render(<MCStoreProvider><Probe /><MissionOverlay /></MCStoreProvider>);
    await act(async () => { await vi.advanceTimersByTimeAsync(10); });
}

type Sender = Pick<MCAction, 'isRemote' | 'origin'>;

/** Ticks every open task: a tap on its card, or what useRemoteControl dispatches for the phone's checklist. */
async function tickOpenTasks(phone?: Sender) {
    for (const t of morning()?.tasks.filter(x => !x.completed) ?? []) {
        await act(async () => {
            if (phone) live.dispatch?.({ type: 'COMPLETE_TASK', missionPhase: 'morning', taskId: t.id, ...phone });
            else fireEvent.click(screen.getByTestId(`mc-task-card-${t.id}`));
        });
    }
    await act(async () => { await vi.advanceTimersByTimeAsync(1_100); }); // the timer's next second
}

beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    _resetLiveClockForTesting();
    localStorage.clear();
});

afterEach(() => {
    cleanup();
    _resetLiveClockForTesting();
    vi.useRealTimers();
    localStorage.clear();
});

describe('MissionOverlay — finished in time', () => {
    it('every task done before the end: auto-collected at the end, paid and one shield back', async () => {
        seedMorning({ tasksDone: false, startedMinsAgo: 29 });
        await launch();
        await tickOpenTasks();
        expect(screen.getByTestId('mc-all-done')).toBeInTheDocument();

        await act(async () => { await vi.advanceTimersByTimeAsync(61_000); });

        expect(live.state.bankCount).toBe(2);
        expect(live.state.missedMissionStreak).toBe(1);
        expect(completedLines()).toHaveLength(1);
    });
});

describe('MissionOverlay — finished after the timeout was logged', () => {
    it.each<[string, Sender | undefined]>([
        ['on their cards', undefined],
        ['from the phone', { isRemote: true, origin: 'remote' }],
    ])('the last tasks ticked %s: no payout, no shield back, no line, no celebration', async (_where, sender) => {
        seedMorning({ tasksDone: false });
        await launch();
        expect(morning()?.loggedTimeoutAt, 'precondition: the overlay logged the miss').toBeTruthy();
        expect(live.state.missedMissionStreak).toBe(3);

        await tickOpenTasks(sender);

        expect(live.state.bankCount).toBe(0);
        expect(live.state.missedMissionStreak).toBe(3);
        expect(completedLines()).toHaveLength(0);
        expect(screen.queryByTestId('mc-all-done')).not.toBeInTheDocument();
        expect(screen.queryByTestId('mc-bonus-coin-btn')).not.toBeInTheDocument();
        expect(morning()?.tasks.every(t => t.completed), 'the ticks themselves land').toBe(true);
        expect(live.state.activeMission, 'left for the scheduler to end as expired').toBe('morning');
    });

    it('a relaunch on such a saved run pays nothing either', async () => {
        seedMorning({ tasksDone: true, loggedTimeoutAt: new Date(NOW.getTime() - 60_000).toISOString() });
        await launch();
        await act(async () => { await vi.advanceTimersByTimeAsync(2_000); });

        expect(live.state.bankCount).toBe(0);
        expect(live.state.missedMissionStreak).toBe(2);
        expect(completedLines()).toHaveLength(0);
        expect(screen.queryByTestId('mc-all-done')).not.toBeInTheDocument();
    });
});
