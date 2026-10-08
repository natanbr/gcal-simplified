// ============================================================
// MissionOverlay — Reset is phone-only (owner, 2026-10-07)
// ------------------------------------------------------------
// The overlay had "↺ Reset": a tap reset the tasks, a 2 s hold reset the tasks
// AND the timer (RESET_MISSION_WITH_TIMER, a fresh attempt). freshAttempt clears
// loggedTimeoutAt while the charged miss stays, so after a miss the child held
// Reset, finished the fresh attempt and was paid +2 with the shield step given
// back: the miss was erased. Before the end the same hold restarted the timer,
// so the timer never bound. Like Stop, a Reset now comes only from the phone
// (useRemoteControl.reset.test.tsx); the structural half is
// src/__tests__/action-literal-boundary.test.ts. This covers the overlay only:
// MC Settings' "▶ Start" still gives a fresh, paid attempt once a missed run has
// ended (open owner decision).
// ============================================================

import React from 'react';
import { render, screen, fireEvent, act, cleanup, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MCStoreProvider } from '../store/MCStoreProvider';
import { STORAGE_KEY, useMCState } from '../store/useMCStore.tsx';
import { initialState } from '../store/mcReducer';
import { _resetLiveClockForTesting } from '../hooks/useLiveClock';
import { MissionOverlay } from './MissionOverlay';
import type { MCState } from '../types';

// Stable component types, as in MissionOverlay.late-finish.test.tsx: the usual
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

const live: { state: MCState } = { state: initialState };
function Probe() {
    live.state = useMCState();
    return null;
}

const NOW = new Date('2026-10-07T08:00:00.000Z');
const morning = () => live.state.missions.find(m => m.phase === 'morning');
const fullResetLines = () => live.state.activityLogs.filter(l => /fully reset/.test(l.message));
const completedLines = () => live.state.activityLogs.filter(l => l.message === 'Morning mission completed');

/** A saved running morning of 30 min, started `startedMinsAgo` ago, missed shield at 2. */
function seedMorning(startedMinsAgo: number) {
    const startedAt = new Date(NOW.getTime() - startedMinsAgo * 60_000).toISOString();
    const missions = initialState.missions.map(m => m.phase === 'morning'
        ? { ...m, active: true, startedAt, durationMins: 30, tasks: m.tasks.map(t => ({ ...t, completed: false })) }
        : m);
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
        _migrationVersion: 1, bankCount: 0, missedMissionStreak: 2, missions, activeMission: 'morning', activityLogs: [],
    }));
}

async function launch() {
    render(<MCStoreProvider><Probe /><MissionOverlay /></MCStoreProvider>);
    await act(async () => { await vi.advanceTimersByTimeAsync(10); });
}

const overlay = () => screen.getByTestId('mc-mission-overlay');
const isTaskCard = (el: Element) => /^mc-task-card-/.test(el.getAttribute('data-testid') ?? '');

/** Every pressable thing in the overlay but the task cards: its buttons and the time bar. */
function controls(): Element[] {
    const buttons = within(overlay()).queryAllByRole('button').filter(b => !isTaskCard(b));
    return [...buttons, ...within(overlay()).queryAllByTestId('mc-timer-bar')];
}

/**
 * Presses and holds each control for 2.5 s (past the old 2 s Reset hold), then
 * releases it. A release on Minimize minimizes; the pill brings the overlay back.
 */
async function holdEveryControl() {
    const count = controls().length;
    expect(count, 'the overlay has controls to press').toBeGreaterThan(0);
    for (let i = 0; i < count; i++) {
        const el = controls()[i];
        await act(async () => { fireEvent.pointerDown(el); });
        await act(async () => { await vi.advanceTimersByTimeAsync(2_500); });
        await act(async () => { fireEvent.pointerUp(el); });
        const pill = screen.queryByTestId('mc-mission-pill');
        if (pill) await act(async () => { fireEvent.click(pill); });
    }
}

async function tickEveryTaskOnItsCard() {
    for (const t of morning()?.tasks.filter(x => !x.completed) ?? []) {
        await act(async () => { fireEvent.click(screen.getByTestId(`mc-task-card-${t.id}`)); });
    }
    await act(async () => { await vi.advanceTimersByTimeAsync(1_100); });
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

describe('MissionOverlay — no desktop Reset', () => {
    it('offers no Reset control', async () => {
        seedMorning(5);
        await launch();
        expect(screen.queryByTestId('mc-reset-btn')).not.toBeInTheDocument();
        expect(within(overlay()).queryAllByRole('button').filter(b => /reset/i.test(b.textContent ?? ''))).toEqual([]);
    });

    it('a 2 s hold on any control of a running mission resets neither the tasks nor the timer', async () => {
        seedMorning(5);
        await launch();
        const startedAt = morning()?.startedAt;
        await act(async () => { fireEvent.click(screen.getByTestId('mc-task-card-tshirt')); });
        expect(morning()?.tasks.find(t => t.id === 'tshirt')?.completed, 'precondition: the tick landed').toBe(true);

        await holdEveryControl();

        expect(live.state.activeMission).toBe('morning');
        expect(morning()?.tasks.find(t => t.id === 'tshirt')?.completed).toBe(true);
        expect(morning()?.startedAt).toBe(startedAt);
        expect(fullResetLines()).toEqual([]);
    });
});

describe('MissionOverlay — after a miss, no overlay control gives a fresh paid attempt', () => {
    it('holding every control and then finishing every task pays nothing and keeps the miss', async () => {
        seedMorning(30); // over now, nothing done: the overlay logs the miss at once
        await launch();
        const missed = morning();
        expect(missed?.loggedTimeoutAt, 'precondition: the overlay logged the miss').toBeTruthy();
        expect(live.state.missedMissionStreak).toBe(3);

        await holdEveryControl();
        await tickEveryTaskOnItsCard();
        const collect = screen.queryByTestId('mc-bonus-coin-btn');
        if (collect) await act(async () => { fireEvent.click(collect); });
        await act(async () => { await vi.advanceTimersByTimeAsync(61_000); });

        expect(live.state.bankCount).toBe(0);
        expect(live.state.missedMissionStreak, 'the miss stays charged').toBe(3);
        expect(completedLines()).toEqual([]);
        expect(fullResetLines()).toEqual([]);
        expect(morning()?.startedAt, 'no fresh attempt').toBe(missed?.startedAt);
        expect(morning()?.loggedTimeoutAt).toBe(missed?.loggedTimeoutAt);
    });
});
