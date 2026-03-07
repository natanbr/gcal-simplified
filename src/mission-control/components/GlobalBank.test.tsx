// ============================================================
// Mission Control — GlobalBank component tests
// Covers: initial render (count, empty state), admin popup
//         open/close, +1 / +2 / −1 buttons, disabled state,
//         and close button inside popup.
// ============================================================

import React from 'react';
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MCStoreProvider, useMCDispatch } from '../store/useMCStore.tsx';
import { GlobalBank } from './GlobalBank';
import { DragLayer } from './DragLayer';


// ── Framer Motion mock ───────────────────────────────────────────────────────
vi.mock('framer-motion', async () => {
    const actual = await vi.importActual<typeof import('framer-motion')>('framer-motion');
    return {
        ...actual,
        AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
        motion: new Proxy({} as Record<string, unknown>, {
            get: (_target, prop: string) => {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                return React.forwardRef(({ children: c, ...props }: any, ref: any) =>
                    React.createElement(prop as string, { ...props, ref }, c)
                );
            },
        }),
    };
});

// ── Helpers ───────────────────────────────────────────────────────────────────

const EMPTY_CASES = [] as const;
const EMPTY_RECTS = {} as Record<number, DOMRect | null>;

/** Render GlobalBank with default (empty) case props */
function renderBank() {
    return render(
        <DragLayer>
            <MCStoreProvider>
                <GlobalBank cases={[...EMPTY_CASES]} caseRects={EMPTY_RECTS} />
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
            return <GlobalBank cases={[...EMPTY_CASES]} caseRects={EMPTY_RECTS} />;
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
        await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Bank admin/i })); });
        expect(screen.getByText(/Bank Admin/i)).toBeInTheDocument();
    });

    it('clicking "close ✕" inside popup hides it', async () => {
        renderBank();
        await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Bank admin/i })); });
        expect(screen.getByText(/Bank Admin/i)).toBeInTheDocument();
        await act(async () => { fireEvent.click(screen.getByText(/close/i)); });
        expect(screen.queryByText(/Bank Admin/i)).not.toBeInTheDocument();
    });

    it('popup shows +1, +2, −1 control buttons', async () => {
        renderBank();
        await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Bank admin/i })); });
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
        await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Bank admin/i })); });
        // The count starts at 3
        expect(screen.getByText('3')).toBeInTheDocument();
        await act(async () => { fireEvent.click(screen.getByText('+1')); });
        expect(screen.getByText('4')).toBeInTheDocument();
    });

    it('clicking +1 twice increments by 2', async () => {
        renderBank();
        await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Bank admin/i })); });
        await act(async () => { fireEvent.click(screen.getByText('+1')); });
        await act(async () => { fireEvent.click(screen.getByText('+1')); });
        expect(screen.getByText('5')).toBeInTheDocument();
    });
});

// ── +2 coin button ────────────────────────────────────────────────────────────

describe('GlobalBank — +2 button', () => {
    it('clicking +2 increments bank count by 2', async () => {
        renderBank();
        await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Bank admin/i })); });
        expect(screen.getByText('3')).toBeInTheDocument();
        await act(async () => { fireEvent.click(screen.getByText('+2')); });
        expect(screen.getByText('5')).toBeInTheDocument();
    });
});

// ── −1 coin button ────────────────────────────────────────────────────────────

describe('GlobalBank — −1 button', () => {
    it('clicking −1 decrements bank count by 1', async () => {
        renderBank();
        await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Bank admin/i })); });
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
            return <GlobalBank cases={[...EMPTY_CASES]} caseRects={EMPTY_RECTS} />;
        }
        render(
            <DragLayer>
                <MCStoreProvider><ZeroBankWrapper /></MCStoreProvider>
            </DragLayer>,
        );
        await act(async () => {});
        await act(async () => {});

        await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Bank admin/i })); });
        const minusBtn = screen.getByText('−1').closest('button');
        expect(minusBtn).toBeDisabled();
    });
});
