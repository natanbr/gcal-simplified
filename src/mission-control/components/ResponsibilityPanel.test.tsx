// ============================================================
// Mission Control — ResponsibilityPanel component tests
// Covers: progress display, add-point button, activity buttons,
//         "Claim & Start Over" button, and completion state.
// ============================================================

import React from 'react';
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MCStoreProvider, useMCDispatch } from '../store/useMCStore.tsx';
import { ResponsibilityPanel } from './ResponsibilityPanel';
import type { MCAction } from '../types';

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

// ── Isolate localStorage between every test ───────────────────────────────────
// MCStoreProvider reads localStorage on mount, so we must clear it to prevent
// result pollution between tests (e.g. completed state from test N leaking into N+1).
beforeEach(() => {
    localStorage.clear();
});
afterEach(() => {
    cleanup();
    localStorage.clear();
});

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Seed dispatcher to set up specific state before mounting the panel */
function StateSeeder({ actions }: { actions: MCAction[] }) {
    const dispatch = useMCDispatch();
    return (
        <button
            data-testid="seeder"
            onClick={() => actions.forEach(a => dispatch(a))}
        >
            seed
        </button>
    );
}

function renderPanel(preloadActions?: MCAction[]) {
    const result = render(
        <MCStoreProvider>
            {preloadActions && <StateSeeder actions={preloadActions} />}
            <ResponsibilityPanel />
        </MCStoreProvider>,
    );

    // Trigger seed actions synchronously if provided
    if (preloadActions) {
        const btn = result.queryByTestId('seeder');
        if (btn) fireEvent.click(btn);
    }

    return result;
}

/** Click a testId element n times, each in its own act wrapper */
async function clickNTimes(testId: string, n: number) {
    for (let i = 0; i < n; i++) {
        await act(async () => {
            fireEvent.click(screen.getByTestId(testId));
        });
    }
}

// ── Initial render ────────────────────────────────────────────────────────────

describe('ResponsibilityPanel — initial render', () => {
    it('shows the panel header', () => {
        renderPanel();
        expect(screen.getByText(/responsibilities/i)).toBeInTheDocument();
    });

    it('shows all default responsibility tasks', () => {
        renderPanel();
        // Default tasks: Recycling and Activity
        expect(screen.getByText('Recycling')).toBeInTheDocument();
        expect(screen.getByText('Activity')).toBeInTheDocument();
    });

    it('shows progress label for each task', () => {
        renderPanel();
        // Each task starts at 0 / pointsRequired (both require 3)
        expect(screen.getAllByText(/0 \/ 3 completed/)).toHaveLength(2);
    });

    it('does NOT show the Claim button when tasks are incomplete', () => {
        renderPanel();
        expect(screen.queryByTestId('mc-responsibility-claim-recycling')).not.toBeInTheDocument();
        expect(screen.queryByTestId('mc-responsibility-claim-activity')).not.toBeInTheDocument();
    });
});

// ── Generic +1 button (Recycling) ────────────────────────────────────────────

describe('ResponsibilityPanel — +1 point button (recycling)', () => {
    it('renders the +1 Point button for Recycling', () => {
        renderPanel();
        expect(screen.getByTestId('mc-responsibility-add-recycling')).toBeInTheDocument();
    });

    it('clicking +1 once increments the progress label to 1 / 3', async () => {
        renderPanel();
        await clickNTimes('mc-responsibility-add-recycling', 1);
        expect(screen.getByText('1 / 3 completed')).toBeInTheDocument();
    });

    it('clicking +1 three times replaces the +1 button with the Claim button', async () => {
        renderPanel();
        await clickNTimes('mc-responsibility-add-recycling', 3);
        // +1 button gone, Claim button present
        expect(screen.queryByTestId('mc-responsibility-add-recycling')).not.toBeInTheDocument();
        expect(screen.getByTestId('mc-responsibility-claim-recycling')).toBeInTheDocument();
    });
});

// ── Activity-specific buttons ─────────────────────────────────────────────────

describe('ResponsibilityPanel — activity buttons (activity task)', () => {
    it('renders one button per activity (Skating, Swimming, Karate)', () => {
        renderPanel();
        expect(screen.getByTestId('mc-responsibility-activity-activity-skating')).toBeInTheDocument();
        expect(screen.getByTestId('mc-responsibility-activity-activity-swimming')).toBeInTheDocument();
        expect(screen.getByTestId('mc-responsibility-activity-activity-karate')).toBeInTheDocument();
    });

    it('does NOT render the generic +1 button for the activity task', () => {
        renderPanel();
        expect(screen.queryByTestId('mc-responsibility-add-activity')).not.toBeInTheDocument();
    });

    it('clicking a sport button once increments the progress to 1', async () => {
        renderPanel();
        await clickNTimes('mc-responsibility-activity-activity-skating', 1);
        // After 1 point in Activity — should show "1 / 3 completed" (Recycling still 0)
        expect(screen.getByText('1 / 3 completed')).toBeInTheDocument();
    });

    it('completing activity (3 taps) replaces sport buttons with Claim button', async () => {
        renderPanel();
        await clickNTimes('mc-responsibility-activity-activity-skating', 3);
        // Claim button should appear; sport buttons gone
        expect(screen.getByTestId('mc-responsibility-claim-activity')).toBeInTheDocument();
        expect(screen.queryByTestId('mc-responsibility-activity-activity-skating')).not.toBeInTheDocument();
    });
});

// ── Claim & Start Over  ───────────────────────────────────────────────────────

describe('ResponsibilityPanel — Claim & Start Over', () => {
    it('clicking Claim for Recycling restores the +1 button and clears the Claim button', async () => {
        renderPanel();
        await clickNTimes('mc-responsibility-add-recycling', 3);
        // Claim button is now visible
        expect(screen.getByTestId('mc-responsibility-claim-recycling')).toBeInTheDocument();

        // Click Claim
        await act(async () => {
            fireEvent.click(screen.getByTestId('mc-responsibility-claim-recycling'));
        });

        // After claim: +1 button returns, Claim button gone
        expect(screen.queryByTestId('mc-responsibility-claim-recycling')).not.toBeInTheDocument();
        expect(screen.getByTestId('mc-responsibility-add-recycling')).toBeInTheDocument();
    });

    it('clicking Claim for Activity restores the sport buttons and clears the Claim button', async () => {
        renderPanel();
        await clickNTimes('mc-responsibility-activity-activity-swimming', 3);
        expect(screen.getByTestId('mc-responsibility-claim-activity')).toBeInTheDocument();

        await act(async () => {
            fireEvent.click(screen.getByTestId('mc-responsibility-claim-activity'));
        });

        // After claim: activity buttons return, Claim button gone
        expect(screen.queryByTestId('mc-responsibility-claim-activity')).not.toBeInTheDocument();
        expect(screen.getByTestId('mc-responsibility-activity-activity-skating')).toBeInTheDocument();
    });
});
