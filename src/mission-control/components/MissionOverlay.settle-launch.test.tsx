// ============================================================
// The launch that settles the game-token cap must not add a completion line
// ------------------------------------------------------------
// On the one launch where SETTLE_GAME_TOKEN_CAP runs (a v0.0.42 save: 5 game
// tokens beside a Quick-Game goal), the settle's synchronous re-render gave
// MissionOverlay's inline `onTimerExpiredWithAllDone` a new identity, so
// MissionTimerDisplay's expiry effect fired again while the mission was still
// active: a THIRD "Morning mission completed +2" line reached the log and the
// append-only audit file, two of them with the pre-settle balance (review of
// 985592f, 2026-09-28). The bank was paid once; only the record was wrong.
//
// Two lines is the PRE-EXISTING double (777c53b writes two as well: the overlay's
// own expiry effect and MissionTimerDisplay's both fire before either commits).
// It is pinned here so a fix for it shows up as a deliberate edit. Its own file
// because it needs its own framer mock (see below): the usual one remounts the
// overlay on every render, which writes the third line with or without the fix.
// ============================================================

import React from 'react';
import { render, act, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MCStoreProvider } from '../store/MCStoreProvider';
import { STORAGE_KEY, useMCState } from '../store/useMCStore.tsx';
import { initialState } from '../store/mcReducer';
import { MAX_GAME_TOKENS } from '../store/moodGauge';
import { MissionOverlay } from './MissionOverlay';
import type { MCState } from '../types';

// One component per tag, cached. The mock in MissionOverlay.test.tsx mints a new
// component type on every `motion.div` read, so every re-render REMOUNTS the
// overlay's subtree and re-runs each mount effect; that hides (and fakes) exactly
// the effect re-fires this file is about. Real framer-motion types are stable.
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

let live: MCState = initialState;
function Probe() {
    live = useMCState();
    return null;
}

/** A save from before the settle: an all-done morning that ran out while the app was closed. */
function seedExpiredAllDoneMorning(gameTokens: number) {
    const cases = initialState.cases.map(c =>
        c.id === 0 ? { ...c, status: 'active' as const, reward: 'quick-game' as const, tokenCount: 0 } : c);
    const missions = initialState.missions.map(m => m.phase === 'morning'
        ? { ...m, active: true, startedAt: '2026-09-24T06:00:00.000Z', durationMins: 30, tasks: m.tasks.map(t => ({ ...t, completed: true })) }
        : m);
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
        _migrationVersion: 1, gameTokens, bankCount: 0, cases, missions, activeMission: 'morning', activityLogs: [],
    }));
}

const completions = () => live.activityLogs.filter(l => l.message === 'Morning mission completed');

beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-24T08:00:00.000Z'));
});

afterEach(() => {
    cleanup();
    vi.useRealTimers();
    localStorage.clear();
});

describe('MissionOverlay — relaunch with an expired, all-done mission', () => {
    it('the settling launch writes no more completion lines than a launch within the cap', async () => {
        seedExpiredAllDoneMorning(MAX_GAME_TOKENS); // one over: the goal holds a token too
        render(<MCStoreProvider><Probe /><MissionOverlay /></MCStoreProvider>);
        await act(async () => { await vi.advanceTimersByTimeAsync(10); });

        expect(live.gameTokens, 'the settle ran').toBe(MAX_GAME_TOKENS - 1);
        expect(live.bankCount, 'the bonus is paid once').toBe(2);
        expect(completions(), 'the pre-existing double, and no third line').toHaveLength(2);
        // Not asserted, and still wrong: both lines carry the pre-settle 🎮 5. They
        // are dispatched from the first commit's passive effects, and the logging
        // interceptor reads the state of the last RENDER, which the queued settle
        // has not reached yet. A follow-up, not this fix.
    });

    it('control: the same launch within the cap writes the same two lines', async () => {
        seedExpiredAllDoneMorning(MAX_GAME_TOKENS - 1);
        render(<MCStoreProvider><Probe /><MissionOverlay /></MCStoreProvider>);
        await act(async () => { await vi.advanceTimersByTimeAsync(10); });

        expect(live.bankCount).toBe(2);
        expect(completions()).toHaveLength(2);
    });
});
