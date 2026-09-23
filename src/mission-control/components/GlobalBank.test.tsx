// ============================================================
// Mission Control — GlobalBank component tests
// Covers: initial render (count, empty state), admin popup
//         open/close, +1 / +2 / −1 buttons, disabled state,
//         close button inside popup, and dropping a coin on a
//         goal with the shield broken vs holding.
// ============================================================

import React from 'react';
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { animate } from 'framer-motion';
import { MCStoreProvider } from '../store/MCStoreProvider';
import { useMCDispatch, useMCState, STORAGE_KEY } from '../store/useMCStore.tsx';
import { MISSED_LOCK_THRESHOLD } from '../store/missionStreak';
import { GlobalBank } from './GlobalBank';
import { DragLayer } from './DragLayer';


// ── Framer Motion mock ───────────────────────────────────────────────────────
vi.mock('framer-motion', async () => {
    const actual = await vi.importActual<typeof import('framer-motion')>('framer-motion');
    return {
        ...actual,
        // Token's spring-back is animate(x, 0) + animate(y, 0) — the observable
        // proof that a drop was refused rather than consumed.
        animate: vi.fn(),
        AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
        motion: new Proxy({} as Record<string, unknown>, {
            get: (_target, prop: string) => {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                return React.forwardRef(({ children: c, onDragEnd, ...props }: any, ref: any) =>
                    React.createElement(prop as string, {
                        ...props,
                        ref,
                        // Framer calls onDragEnd(event, info); a DOM dragend carries only the
                        // event, so rebuild info.point from it (see releaseCoin). PAGE
                        // coordinates, because that is what Framer's extractEventInfo reports.
                        onDragEnd: onDragEnd && ((e: React.MouseEvent) =>
                            onDragEnd(e, { point: { x: e.pageX, y: e.pageY } })),
                        // The animation target, readable by a test. GlobalBank keeps a
                        // deposited coin MOUNTED and only animates it to scale 0, so
                        // counting coins cannot see one being animated away.
                        'data-animate': JSON.stringify(props.animate),
                    }, c)
                );
            },
        }),
    };
});

// ── Helpers ───────────────────────────────────────────────────────────────────

const EMPTY_CASES = [] as const;
const EMPTY_LAYOUT: { bank: DOMRect | null; cases: Record<number, DOMRect | null> } = { bank: null, cases: {} };

async function openAdminPopup() {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const btn = screen.getByRole('button', { name: /Bank admin/i });
    await act(async () => { fireEvent.pointerDown(btn); });
    await act(async () => { vi.advanceTimersByTime(650); });
    await act(async () => { fireEvent.pointerUp(btn); });
    vi.useRealTimers();
}

/** Render GlobalBank with default (empty) case props */
function renderBank() {
    return render(
        <DragLayer>
            <MCStoreProvider>
                <GlobalBank cases={[...EMPTY_CASES]} layoutRects={EMPTY_LAYOUT} />
            </MCStoreProvider>
        </DragLayer>,
    );
}

beforeEach(() => { vi.clearAllMocks(); localStorage.clear(); });
afterEach(() => { cleanup(); localStorage.clear(); });

// ── Initial render ────────────────────────────────────────────────────────────

describe('GlobalBank — initial render', () => {
    it('renders the bank header with "The Bank" label', () => {
        renderBank();
        expect(screen.getByText('The Bank')).toBeInTheDocument();
    });

    it('shows the default bank count (3)', () => {
        renderBank();
        // Count badge renders state.bankCount
        expect(screen.getByText('3')).toBeInTheDocument();
    });

    it('shows "Empty" message when bankCount is 0', async () => {
        // Drain the bank to 0 before rendering
        function DrainedBank() {
            const dispatch = useMCDispatch();
            React.useEffect(() => {
                dispatch({ type: 'REMOVE_TOKEN' });
                dispatch({ type: 'REMOVE_TOKEN' });
                dispatch({ type: 'REMOVE_TOKEN' });
            }, [dispatch]);
            return <GlobalBank cases={[...EMPTY_CASES]} layoutRects={EMPTY_LAYOUT} />;
        }
        render(
            <DragLayer>
                <MCStoreProvider>
                    <DrainedBank />
                </MCStoreProvider>
            </DragLayer>,
        );
        await act(async () => {});
        // wait a tick for the render effect
        await act(async () => {});
        expect(screen.getByText(/Empty/i)).toBeInTheDocument();
    });
});

// ── Admin popup ───────────────────────────────────────────────────────────────

describe('GlobalBank — admin popup', () => {
    it('popup is NOT visible initially', () => {
        renderBank();
        expect(screen.queryByText('Bank Admin')).not.toBeInTheDocument();
    });

    it('clicking the bank header opens the admin popup', async () => {
        renderBank();
        await openAdminPopup();
        expect(screen.getByText(/Bank Admin/i)).toBeInTheDocument();
    });

    it('clicking "close ✕" inside popup hides it', async () => {
        renderBank();
        await openAdminPopup();
        expect(screen.getByText(/Bank Admin/i)).toBeInTheDocument();
        await act(async () => { fireEvent.click(screen.getByText(/close/i)); });
        expect(screen.queryByText(/Bank Admin/i)).not.toBeInTheDocument();
    });

    it('popup shows +1, +2, −1 control buttons', async () => {
        renderBank();
        await openAdminPopup();
        expect(screen.getByText('+1')).toBeInTheDocument();
        expect(screen.getByText('+2')).toBeInTheDocument();
        expect(screen.getByText('−1')).toBeInTheDocument();
    });
});

// ── +1 coin button ────────────────────────────────────────────────────────────

describe('GlobalBank — +1 button', () => {
    it('clicking +1 increments bank count by 1', async () => {
        renderBank();
        // Open popup
        await openAdminPopup();
        // The count starts at 3
        expect(screen.getByText('3')).toBeInTheDocument();
        await act(async () => { fireEvent.click(screen.getByText('+1')); });
        expect(screen.getByText('4')).toBeInTheDocument();
    });

    it('clicking +1 twice increments by 2', async () => {
        renderBank();
        await openAdminPopup();
        await act(async () => { fireEvent.click(screen.getByText('+1')); });
        await act(async () => { fireEvent.click(screen.getByText('+1')); });
        expect(screen.getByText('5')).toBeInTheDocument();
    });
});

// ── +2 coin button ────────────────────────────────────────────────────────────

describe('GlobalBank — +2 button', () => {
    it('clicking +2 increments bank count by 2', async () => {
        renderBank();
        await openAdminPopup();
        expect(screen.getByText('3')).toBeInTheDocument();
        await act(async () => { fireEvent.click(screen.getByText('+2')); });
        expect(screen.getByText('5')).toBeInTheDocument();
    });
});

// ── −1 coin button ────────────────────────────────────────────────────────────

describe('GlobalBank — −1 button', () => {
    it('clicking −1 decrements bank count by 1', async () => {
        renderBank();
        await openAdminPopup();
        expect(screen.getByText('3')).toBeInTheDocument();
        await act(async () => { fireEvent.click(screen.getByText('−1')); });
        expect(screen.getByText('2')).toBeInTheDocument();
    });

    it('−1 button is disabled when bankCount is 0', async () => {
        // Start with 0 tokens
        function ZeroBankWrapper() {
            const dispatch = useMCDispatch();
            const [ready, setReady] = React.useState(false);
            React.useEffect(() => {
                dispatch({ type: 'REMOVE_TOKEN' });
                dispatch({ type: 'REMOVE_TOKEN' });
                dispatch({ type: 'REMOVE_TOKEN' });
                setReady(true);
            }, [dispatch]);
            if (!ready) return null;
            return <GlobalBank cases={[...EMPTY_CASES]} layoutRects={EMPTY_LAYOUT} />;
        }
        render(
            <DragLayer>
                <MCStoreProvider><ZeroBankWrapper /></MCStoreProvider>
            </DragLayer>,
        );
        await act(async () => {});
        await act(async () => {});

        await openAdminPopup();
        const minusBtn = screen.getByText('−1').closest('button');
        expect(minusBtn).toBeDisabled();
    });
});

// ── Dropping a coin on a goal ─────────────────────────────────────────────────
// CLAUDE.md → "Refusals must be silent in the log and visible on screen". The
// reducer refuses MOVE_TOKEN while the shield is broken, so the store count
// alone cannot catch a handler that animates the coin away first — the pile
// can. That is the bug that shipped: the coin vanished, the badge kept its 3.

const COIN = 'Gold coin — drag to a goal';
/** GlobalBank's exit animation runs this long before it dispatches. */
const DEPOSIT_DELAY_MS = 280;
const GOAL_ID = 1;
const GOAL_LAYOUT = {
    bank: new DOMRect(0, 0, 240, 400),
    cases: { [GOAL_ID]: new DOMRect(260, 0, 200, 400) },
};
const INSIDE_GOAL = { x: 360, y: 200 };

/** Seeds through the store's own front door, as ShieldPanel.test.tsx does. */
function seedStore(missedMissionStreak: number) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
        missedMissionStreak,
        cases: [{ id: GOAL_ID, status: 'active', reward: 'movie-popcorn', tokenCount: 2, targetCount: 5 }],
    }));
}

/** The bank as MissionControl mounts it: cases straight from the store. */
function BankWithStoreProbe() {
    const state = useMCState();
    const dispatch = useMCDispatch();
    const goal = state.cases.find(c => c.id === GOAL_ID);
    return (
        <>
            <GlobalBank cases={state.cases} layoutRects={GOAL_LAYOUT} />
            <output data-testid="store">{`bank=${state.bankCount} goal=${goal?.tokenCount}`}</output>
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
    act(() => { vi.advanceTimersByTime(DEPOSIT_DELAY_MS + 20); });
}

const coins = () => screen.getAllByLabelText(COIN);
/** Token springs a refused coin home on BOTH axes — animate(x, 0) and animate(y, 0). */
const sprangBack = () => vi.mocked(animate).mock.calls.filter(([, target]) => target === 0).length >= 2;
/** Coins shrinking out of the tray: still in the DOM, already gone to the child. */
const vanishingCoins = () =>
    coins().filter(coin => coin.parentElement?.getAttribute('data-animate')?.includes('"scale":0'));

describe('GlobalBank — dropping a coin on a goal', () => {
    beforeEach(() => { vi.useFakeTimers(); });
    afterEach(() => { vi.useRealTimers(); });

    function renderBankWithGoal(missedMissionStreak: number) {
        seedStore(missedMissionStreak);
        render(
            <DragLayer>
                <MCStoreProvider><BankWithStoreProbe /></MCStoreProvider>
            </DragLayer>,
        );
        expect(coins()).toHaveLength(3);
    }

    it('refuses the drop while the shield is broken: the coin springs back and never leaves the pile', () => {
        renderBankWithGoal(MISSED_LOCK_THRESHOLD);

        releaseCoin(coins()[0], INSIDE_GOAL);

        // Asserted on the release frame too, not only after the exit window: the
        // child's complaint was a coin flying away, so a handler that animates it
        // out and puts it back is still the bug.
        expect(coins()).toHaveLength(3);
        expect(vanishingCoins()).toHaveLength(0);
        settleExit();
        expect(coins()).toHaveLength(3);
        expect(sprangBack()).toBe(true);
        expect(screen.getByTestId('store')).toHaveTextContent('bank=3 goal=2');
    });

    it('deposits the same drop while the shield holds', () => {
        renderBankWithGoal(0);

        releaseCoin(coins()[0], INSIDE_GOAL);
        settleExit();

        expect(coins()).toHaveLength(2);
        expect(sprangBack()).toBe(false);
        expect(screen.getByTestId('store')).toHaveTextContent('bank=2 goal=3');
    });

    // The lock is not a fact about mount time. The mission that breaks the shield
    // expires from the scheduler while the child is standing at the screen, and a
    // parent can hand a shield back the same way. A handler that reads the lock
    // once and keeps it passes every test above.
    it('refuses a drop when the last shield is lost while the screen stays open', () => {
        renderBankWithGoal(MISSED_LOCK_THRESHOLD - 1);

        adjustShield('lose-shield');
        releaseCoin(coins()[0], INSIDE_GOAL);

        expect(coins()).toHaveLength(3);
        expect(vanishingCoins()).toHaveLength(0);
        settleExit();
        expect(coins()).toHaveLength(3);
        expect(sprangBack()).toBe(true);
        expect(screen.getByTestId('store')).toHaveTextContent('bank=3 goal=2');
    });

    it('accepts a drop when a shield is handed back while the screen stays open', () => {
        renderBankWithGoal(MISSED_LOCK_THRESHOLD);

        adjustShield('gain-shield');
        releaseCoin(coins()[0], INSIDE_GOAL);
        settleExit();

        expect(coins()).toHaveLength(2);
        expect(sprangBack()).toBe(false);
        expect(screen.getByTestId('store')).toHaveTextContent('bank=2 goal=3');
    });
});
