// ============================================================
// Mission Control — GoalPedestal component tests
// ============================================================

import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { animate } from 'framer-motion';
import { MCStoreProvider } from '../store/MCStoreProvider';
import { useMCState, useMCDispatch, STORAGE_KEY } from '../store/useMCStore';
import { MISSED_LOCK_THRESHOLD } from '../store/missionStreak';
import { GoalPedestal } from './GoalPedestal';
import { DragLayer } from './DragLayer';
import type { DisplayCase } from '../types';

// Mock framer-motion so animations don't block
vi.mock('framer-motion', async () => {
    const actual = await vi.importActual<typeof import('framer-motion')>('framer-motion');
    return {
        ...actual,
        // Token's spring-back is animate(x, 0) + animate(y, 0) — the observable
        // proof that a drop was refused rather than consumed.
        animate: vi.fn(),
        AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
        motion: new Proxy({}, {
            get: (_target, prop: string) => {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                return React.forwardRef(({ children: c, onDragEnd, ...props }: any, ref: any) =>
                    React.createElement(prop, {
                        ...props,
                        ref,
                        // Framer calls onDragEnd(event, info); a DOM dragend carries only the
                        // event, so rebuild info.point from it (see releaseCoin). PAGE
                        // coordinates, because that is what Framer's extractEventInfo reports.
                        onDragEnd: onDragEnd && ((e: React.MouseEvent) =>
                            onDragEnd(e, { point: { x: e.pageX, y: e.pageY } })),
                    }, c)
                );
            },
        }),
    };
});

const emptyCase: DisplayCase = {
    id: 0,
    status: 'empty',
    reward: null,
    tokenCount: 0,
    targetCount: 5,
};

const activeCase: DisplayCase = {
    id: 1,
    status: 'active',
    reward: 'movie-popcorn',
    tokenCount: 2,
    targetCount: 5,
};

const completedCase: DisplayCase = {
    id: 2,
    status: 'active',
    reward: 'game',
    tokenCount: 5,
    targetCount: 5,
};

function renderPedestal(case_: DisplayCase, bankCount = 3) {
    return render(
        <MCStoreProvider>
            <DragLayer>
                <GoalPedestal case_={case_} cases={[case_]} bankCount={bankCount} layoutRects={{ bank: null, cases: {} }} />
            </DragLayer>
        </MCStoreProvider>
    );
}

describe('GoalPedestal', () => {
    it('shows "Add goal" text when the case is empty', () => {
        renderPedestal(emptyCase);
        expect(screen.getByText('Add goal')).toBeInTheDocument();
    });

    it('shows the reward picker when the + button is clicked', async () => {
        renderPedestal(emptyCase);
        await act(async () => {
            fireEvent.click(screen.getByLabelText('Add a new goal'));
        });
        expect(screen.getByText(/Pick a Goal/i)).toBeInTheDocument();
    });

    it('cancels reward selection when Cancel is clicked', async () => {
        renderPedestal(emptyCase);
        await act(async () => {
            fireEvent.click(screen.getByLabelText('Add a new goal'));
        });
        await act(async () => {
            fireEvent.click(screen.getByLabelText('Cancel'));
        });
        expect(screen.queryByText(/Pick a Goal/i)).not.toBeInTheDocument();
        expect(screen.getByText('Add goal')).toBeInTheDocument();
    });

    it('shows token count text for an active case', () => {
        renderPedestal(activeCase);
        expect(screen.getByText('2 / 5')).toBeInTheDocument();
    });

    it('shows the "All" (vacuum) button for an active incomplete case', () => {
        renderPedestal(activeCase);
        expect(screen.getByLabelText('Move needed coins to this goal')).toBeInTheDocument();
    });

    it('visually disables the "All" button when bank is empty (cursor: not-allowed, reduced opacity)', () => {
        renderPedestal(activeCase, 0);
        const allBtn = screen.getByLabelText('Move needed coins to this goal');
        // Button3D applies visual-disabled state via CSS (cursor + opacity) rather than
        // the native `disabled` attribute. Assert the visual indicators are present.
        const style = (allBtn as HTMLElement).style;
        expect(style.cursor).toBe('not-allowed');
        expect(parseFloat(style.opacity)).toBeLessThan(1);
    });

    it('shows "Use!" button and not "All" when goal is complete', () => {
        renderPedestal(completedCase);
        expect(screen.getByLabelText('Use this reward')).toBeInTheDocument();
        expect(screen.queryByLabelText('Move needed coins to this goal')).not.toBeInTheDocument();
    });

    it('shows "Done!" label when goal is complete', () => {
        renderPedestal(completedCase);
        expect(screen.getByText(/Done!/i)).toBeInTheDocument();
    });

    it('hides the "Game" reward from picker if "phone-games" privilege is suspended', async () => {
        const suspendedState = {
            privileges: [
                { id: 'knife', label: 'Knife', icon: 'Utensils', status: 'active', suspendedUntil: null },
                { id: 'scissors', label: 'Scissors', icon: 'Scissors', status: 'active', suspendedUntil: null },
                { id: 'fire', label: 'Fire Tongs', icon: 'Flame', status: 'active', suspendedUntil: null },
                { id: 'garden', label: 'Garden', icon: 'Sprout', status: 'active', suspendedUntil: null },
                { id: 'phone-games', label: 'Phone Games', icon: 'Smartphone', status: 'suspended', suspendedUntil: new Date(Date.now() + 3600000).toISOString() },
            ]
        };
        localStorage.setItem('mc-state-v5', JSON.stringify(suspendedState));

        renderPedestal(emptyCase);
        await act(async () => {
            fireEvent.click(screen.getByLabelText('Add a new goal'));
        });
        
        expect(screen.queryByText('Game')).not.toBeInTheDocument();
        expect(screen.getByText('Short Show')).toBeInTheDocument();
        
        localStorage.clear();
    });

    it('disables and locks the "Use!" button on completed Game goal if "phone-games" privilege is suspended', () => {
        const suspendedState = {
            privileges: [
                { id: 'knife', label: 'Knife', icon: 'Utensils', status: 'active', suspendedUntil: null },
                { id: 'scissors', label: 'Scissors', icon: 'Scissors', status: 'active', suspendedUntil: null },
                { id: 'fire', label: 'Fire Tongs', icon: 'Flame', status: 'active', suspendedUntil: null },
                { id: 'garden', label: 'Garden', icon: 'Sprout', status: 'active', suspendedUntil: null },
                { id: 'phone-games', label: 'Phone Games', icon: 'Smartphone', status: 'suspended', suspendedUntil: new Date(Date.now() + 3600000).toISOString() },
            ]
        };
        localStorage.setItem('mc-state-v5', JSON.stringify(suspendedState));

        renderPedestal(completedCase);
        
        const lockBtn = screen.getByText('🔒 Locked');
        expect(lockBtn).toBeInTheDocument();
        expect(screen.queryByText('🎁 Use!')).not.toBeInTheDocument();

        localStorage.clear();
    });
});

// ── Dragging a coin out of a goal ─────────────────────────────────────────────
// CLAUDE.md → "Refusals must be silent in the log and visible on screen". The
// reducer refuses MOVE_TOKEN while the shield is broken, so the store count
// alone cannot catch a handler that animates the coin away first — the slots
// can: the coin disappears the moment the handler marks it exiting.

const COIN = 'Gold coin — drag to a goal';
/** GoalPedestal's exit animation runs this long before it dispatches. */
const MOVE_DELAY_MS = 280;
const GOAL_ID = 1;
const OTHER_GOAL_ID = 2;
const LAYOUT = {
    bank: new DOMRect(0, 0, 240, 400),
    cases: {
        [GOAL_ID]: new DOMRect(260, 0, 200, 400),
        [OTHER_GOAL_ID]: new DOMRect(480, 0, 200, 400),
    },
};

/** Seeds through the store's own front door, as ShieldPanel.test.tsx does. */
function seedStore(missedMissionStreak: number) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
        missedMissionStreak,
        cases: [
            { id: GOAL_ID, status: 'active', reward: 'movie-popcorn', tokenCount: 2, targetCount: 5 },
            { id: OTHER_GOAL_ID, status: 'active', reward: 'movie-popcorn', tokenCount: 1, targetCount: 5 },
        ],
    }));
}

/** The pedestal as MissionControl mounts it: its case, and every case, from the store. */
function PedestalWithStoreProbe() {
    const state = useMCState();
    const dispatch = useMCDispatch();
    const count = (id: number) => state.cases.find(c => c.id === id)?.tokenCount;
    const goal = state.cases.find(c => c.id === GOAL_ID);
    if (!goal) throw new Error(`seeded case ${GOAL_ID} is missing`);
    return (
        <>
            <GoalPedestal case_={goal} cases={state.cases} bankCount={state.bankCount} layoutRects={LAYOUT} />
            <output data-testid="store">
                {`bank=${state.bankCount} goal=${count(GOAL_ID)} other=${count(OTHER_GOAL_ID)}`}
            </output>
            {/* Moves the shield while the screen stays mounted — a mission timing out,
                or the parent handing a shield back, both without a remount. */}
            <button data-testid="lose-shield" onClick={() => dispatch({ type: 'ADJUST_SHIELD', delta: -1 })} />
            <button data-testid="gain-shield" onClick={() => dispatch({ type: 'ADJUST_SHIELD', delta: 1 })} />
        </>
    );
}

/** Presses one of the probe's shield buttons. */
function adjustShield(which: 'lose-shield' | 'gain-shield') {
    act(() => { fireEvent.click(screen.getByTestId(which)); });
}

/** Ends a drag at a screen point, the way Framer reports it to Token. */
function releaseCoin(coin: HTMLElement, point: { x: number; y: number }) {
    act(() => {
        fireEvent(coin, new MouseEvent('dragend', { bubbles: true, clientX: point.x, clientY: point.y }));
    });
}

/** Runs the exit animation a CONSUMED drop starts before it dispatches. */
function settleExit() {
    act(() => { vi.advanceTimersByTime(MOVE_DELAY_MS + 20); });
}

const coins = () => screen.getAllByLabelText(COIN);
/** Token springs a refused coin home on BOTH axes — animate(x, 0) and animate(y, 0). */
const sprangBack = () => vi.mocked(animate).mock.calls.filter(([, target]) => target === 0).length >= 2;

describe.each([
    { target: 'the bank', point: { x: 120, y: 200 }, afterMove: 'bank=4 goal=1 other=1' },
    { target: 'another goal', point: { x: 580, y: 200 }, afterMove: 'bank=3 goal=1 other=2' },
])('GoalPedestal — dropping a coin on $target', ({ point, afterMove }) => {
    beforeEach(() => {
        vi.mocked(animate).mockClear();
        vi.useFakeTimers();
    });
    afterEach(() => {
        vi.useRealTimers();
        localStorage.clear();
    });

    function renderGoal(missedMissionStreak: number) {
        seedStore(missedMissionStreak);
        render(
            <MCStoreProvider>
                <DragLayer><PedestalWithStoreProbe /></DragLayer>
            </MCStoreProvider>
        );
        expect(coins()).toHaveLength(2);
    }

    it('refuses the drop while the shield is broken: the coin springs back and never leaves its slot', () => {
        renderGoal(MISSED_LOCK_THRESHOLD);

        releaseCoin(coins()[0], point);

        // The slot empties the instant the handler marks the coin exiting, so this
        // release-frame assertion is the one that catches an optimistic commit.
        expect(coins()).toHaveLength(2);
        settleExit();
        expect(coins()).toHaveLength(2);
        expect(sprangBack()).toBe(true);
        expect(screen.getByTestId('store')).toHaveTextContent('bank=3 goal=2 other=1');
    });

    it('moves the same drop while the shield holds', () => {
        renderGoal(0);

        releaseCoin(coins()[0], point);
        settleExit();

        expect(coins()).toHaveLength(1);
        expect(sprangBack()).toBe(false);
        expect(screen.getByTestId('store')).toHaveTextContent(afterMove);
    });

    // The lock is not a fact about mount time: the mission that breaks the shield
    // expires while the child is standing at the screen. A handler that reads the
    // lock once and keeps it passes both tests above.
    it('refuses the drop when the last shield is lost while the screen stays open', () => {
        renderGoal(MISSED_LOCK_THRESHOLD - 1);

        adjustShield('lose-shield');
        releaseCoin(coins()[0], point);

        expect(coins()).toHaveLength(2);
        settleExit();
        expect(coins()).toHaveLength(2);
        expect(sprangBack()).toBe(true);
        expect(screen.getByTestId('store')).toHaveTextContent('bank=3 goal=2 other=1');
    });

    it('moves the drop when a shield is handed back while the screen stays open', () => {
        renderGoal(MISSED_LOCK_THRESHOLD);

        adjustShield('gain-shield');
        releaseCoin(coins()[0], point);
        settleExit();

        expect(coins()).toHaveLength(1);
        expect(sprangBack()).toBe(false);
        expect(screen.getByTestId('store')).toHaveTextContent(afterMove);
    });
});
