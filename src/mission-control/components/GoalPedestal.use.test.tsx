// ============================================================
// GoalPedestal — a Quick-Game goal's "🎁 Use!" button.
//
// It works only while quickGameEligibility says useEnabled: mood at least
// neutral, the window between the missions open, the shield intact. Each
// refusal names its own reason (one label for all told a child with perfect mood
// that the mood was too low, every evening), and a refused button spends nothing.
// ============================================================

import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MCStoreProvider } from '../store/MCStoreProvider';
import { STORAGE_KEY, useMCState } from '../store/useMCStore';
import { MISSED_LOCK_THRESHOLD } from '../store/missionStreak';
import { GoalPedestal } from './GoalPedestal';
import { DragLayer } from './DragLayer';
import type { DisplayCase, MCState } from '../types';

vi.mock('framer-motion', async () => {
    const actual = await vi.importActual<typeof import('framer-motion')>('framer-motion');
    return {
        ...actual,
        AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
        motion: new Proxy({} as Record<string, unknown>, {
            get: (_target, prop: string) => {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                return React.forwardRef(({ children: c, ...props }: any, ref: any) => React.createElement(prop, { ...props, ref }, c));
            },
        }),
    };
});

const TODAY = '2026-09-02';
const GOAL: DisplayCase = { id: 1, status: 'active', reward: 'quick-game', tokenCount: 1, targetCount: 1 };

beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 8, 2, 12, 0)); // local noon, between the missions
});

afterEach(() => {
    vi.useRealTimers();
    localStorage.clear();
});

/** Reads the goal back out of the store: the pedestal's own `case_` is a prop. */
function GoalStatus() {
    const goal = useMCState().cases.find(c => c.id === GOAL.id);
    return <span data-testid="goal-status">{goal?.status ?? 'gone'}</span>;
}

function renderQuickGameGoal(patch: Partial<MCState> = {}) {
    const onQuickGameOpen = vi.fn();
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
        gameTokens: 0, moodWind: 0, moodLastResetDate: TODAY, activeMission: 'none',
        lastCompletedOrFailedMorningDate: TODAY, missedMissionStreak: 0, cases: [GOAL], ...patch,
    }));
    render(
        <MCStoreProvider>
            <DragLayer>
                <GoalPedestal case_={GOAL} cases={[GOAL]} bankCount={0} layoutRects={{ bank: null, cases: {} }} onQuickGameOpen={onQuickGameOpen} />
                <GoalStatus />
            </DragLayer>
        </MCStoreProvider>,
    );
    return { onQuickGameOpen, use: () => screen.getByLabelText('Play snake game') };
}

describe('GoalPedestal — "🎁 Use!" on a Quick-Game goal', () => {
    it('plays: it consumes the goal and opens the game at the instant it checked', () => {
        const { onQuickGameOpen, use } = renderQuickGameGoal();
        expect(use()).toHaveTextContent('🎁 Use!');
        expect(use().style.cursor).toBe('pointer');

        act(() => { fireEvent.click(use()); });

        expect(screen.getByTestId('goal-status')).toHaveTextContent('empty'); // CONSUME_CASE ran
        expect(onQuickGameOpen).toHaveBeenCalledWith(new Date(2026, 8, 2, 12, 0).toISOString());
    });

    it.each([
        { reason: 'the shield is broken', patch: { missedMissionStreak: MISSED_LOCK_THRESHOLD }, label: '🔒 Bank locked' },
        { reason: 'the window is shut (this morning not concluded)', patch: { lastCompletedOrFailedMorningDate: '2026-09-01' }, label: '⏰ Not right now' },
        { reason: 'the mood is below neutral, the window open', patch: { moodWind: -1 }, label: '😡 Mood too low' },
        { reason: 'the shield is broken and the window shut: the lock is named', patch: { missedMissionStreak: MISSED_LOCK_THRESHOLD, lastCompletedOrFailedMorningDate: null }, label: '🔒 Bank locked' },
    ])('is refused when $reason, says so, and spends nothing', ({ patch, label }) => {
        const { onQuickGameOpen, use } = renderQuickGameGoal(patch);

        expect(use()).toHaveTextContent(label);
        expect(use().style.cursor).toBe('not-allowed'); // Button3D's disabled: dimmed, and no click handler
        expect(use().style.opacity).toBe('0.45');
        act(() => { fireEvent.click(use()); });

        expect(screen.getByTestId('goal-status')).toHaveTextContent('active');
        expect(onQuickGameOpen).not.toHaveBeenCalled();
    });
});
