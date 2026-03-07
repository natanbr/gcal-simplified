// ============================================================
// Mission Control — MissionOverlay component tests
// Uses MCStoreProvider to supply store context.
// ============================================================

import React from 'react';
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MCStoreProvider, useMCDispatch } from '../store/useMCStore.tsx';
import { MissionOverlay } from './MissionOverlay';


// ── Framer Motion is mocked so animations don't hang tests ───────────────────
vi.mock('framer-motion', async () => {
    const actual = await vi.importActual<typeof import('framer-motion')>('framer-motion');
    return {
        ...actual,
        AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
        motion: new Proxy({}, {
            get: (_target, prop: string) => {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const tag = (React as any).forwardRef(
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    ({ children: c, ...props }: any, ref: any) =>
                        React.createElement(prop, { ...props, ref }, c)
                );
                return tag;
            },
        }),
    };
});

// ── Helper: wrapper that also allows dispatching actions into the store ────────
function Wrapper({ children }: { children: React.ReactNode }) {
    return <MCStoreProvider>{children}</MCStoreProvider>;
}

// ── Dispatcher helper component — triggers a mission before overlay is tested ─
function TriggerMission({ phase }: { phase: 'morning' | 'evening' }) {
    const dispatch = useMCDispatch();
    return (
        <button
            data-testid="trigger-btn"
            onClick={() => dispatch({ type: 'SET_ACTIVE_MISSION', phase })}
        >
            Trigger
        </button>
    );
}

function renderOverlay(extra?: React.ReactNode) {
    return render(
        <Wrapper>
            {extra}
            <MissionOverlay />
        </Wrapper>
    );
}

describe('MissionOverlay', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        localStorage.clear();
    });
    afterEach(() => {
        cleanup();
        localStorage.clear();
    });

    it('does not render the overlay when no mission is active', () => {
        renderOverlay();
        expect(screen.queryByTestId('mc-mission-overlay')).not.toBeInTheDocument();
        expect(screen.queryByTestId('mc-mission-pill')).not.toBeInTheDocument();
    });

    it('renders the overlay when a mission is activated', async () => {
        renderOverlay(<TriggerMission phase="morning" />);
        await act(async () => {
            fireEvent.click(screen.getByTestId('trigger-btn'));
        });
        expect(screen.getByTestId('mc-mission-overlay')).toBeInTheDocument();
    });

    it('shows the morning mission title', async () => {
        renderOverlay(<TriggerMission phase="morning" />);
        await act(async () => {
            fireEvent.click(screen.getByTestId('trigger-btn'));
        });
        expect(screen.getByTestId('mc-mission-title')).toHaveTextContent('Morning Mission');
    });

    it('shows the evening mission title', async () => {
        renderOverlay(<TriggerMission phase="evening" />);
        await act(async () => {
            fireEvent.click(screen.getByTestId('trigger-btn'));
        });
        expect(screen.getByTestId('mc-mission-title')).toHaveTextContent('Evening Mission');
    });

    it('clicking Hide shows the mission pill and hides the overlay', async () => {
        renderOverlay(<TriggerMission phase="morning" />);
        await act(async () => {
            fireEvent.click(screen.getByTestId('trigger-btn'));
        });
        await act(async () => {
            fireEvent.click(screen.getByTestId('mc-minimize-btn'));
        });
        expect(screen.queryByTestId('mc-mission-overlay')).not.toBeInTheDocument();
        expect(screen.getByTestId('mc-mission-pill')).toBeInTheDocument();
    });

    it('clicking the pill restores the overlay', async () => {
        renderOverlay(<TriggerMission phase="morning" />);
        await act(async () => {
            fireEvent.click(screen.getByTestId('trigger-btn'));
        });
        await act(async () => {
            fireEvent.click(screen.getByTestId('mc-minimize-btn'));
        });
        await act(async () => {
            fireEvent.click(screen.getByTestId('mc-mission-pill'));
        });
        expect(screen.getByTestId('mc-mission-overlay')).toBeInTheDocument();
    });

    it('clicking Stop (Cancel) closes the overlay and removes the pill', async () => {
        renderOverlay(<TriggerMission phase="morning" />);
        await act(async () => {
            fireEvent.click(screen.getByTestId('trigger-btn'));
        });
        await act(async () => {
            fireEvent.click(screen.getByTestId('mc-cancel-btn'));
        });
        expect(screen.queryByTestId('mc-mission-overlay')).not.toBeInTheDocument();
        expect(screen.queryByTestId('mc-mission-pill')).not.toBeInTheDocument();
    });

    it('completing all tasks reveals the Mission Complete section', async () => {
        renderOverlay(<TriggerMission phase="morning" />);
        await act(async () => {
            fireEvent.click(screen.getByTestId('trigger-btn'));
        });
        // Complete every morning task by clicking each active (non-disabled) task button.
        // Morning mission currently has 4 tasks: tshirt, toothbrush, feed-dog, vitamin.
        // Re-query before each click to get fresh references after re-renders.
        const taskIds = ['tshirt', 'toothbrush', 'feed-dog', 'vitamin'];
        for (const id of taskIds) {
            const btn = screen.queryByTestId(`mc-task-card-${id}`);
            if (btn && !(btn as HTMLButtonElement).disabled) {
                await act(async () => { fireEvent.click(btn); });
            }
        }
        expect(screen.getByTestId('mc-all-done')).toBeInTheDocument();
    });

    it('Collect Bonus button closes the overlay', async () => {
        renderOverlay(<TriggerMission phase="morning" />);
        await act(async () => {
            fireEvent.click(screen.getByTestId('trigger-btn'));
        });
        const taskIds = ['tshirt', 'toothbrush', 'feed-dog', 'vitamin'];
        for (const id of taskIds) {
            const btn = screen.queryByTestId(`mc-task-card-${id}`);
            if (btn && !(btn as HTMLButtonElement).disabled) {
                await act(async () => { fireEvent.click(btn); });
            }
        }
        await act(async () => {
            fireEvent.click(screen.getByTestId('mc-bonus-coin-btn'));
        });
        expect(screen.queryByTestId('mc-mission-overlay')).not.toBeInTheDocument();
    });
});

// ── Whining toggle ────────────────────────────────────────────────────────────

describe('MissionOverlay — whining toggle', () => {
    beforeEach(() => { vi.clearAllMocks(); localStorage.clear(); });
    afterEach(() => { cleanup(); localStorage.clear(); });

    async function triggerMorning() {
        renderOverlay(<TriggerMission phase="morning" />);
        await act(async () => { fireEvent.click(screen.getByTestId('trigger-btn')); });
    }

    it('whining button is visible when mission is active', async () => {
        await triggerMorning();
        expect(screen.getByTestId('mc-whining-btn')).toBeInTheDocument();
    });

    it('whining button shows "Whining?" text by default (not activated)', async () => {
        await triggerMorning();
        expect(screen.getByTestId('mc-whining-btn')).toHaveTextContent('Whining?');
    });

    it('clicking whining button toggles to "Whining!" state', async () => {
        await triggerMorning();
        await act(async () => { fireEvent.click(screen.getByTestId('mc-whining-btn')); });
        expect(screen.getByTestId('mc-whining-btn')).toHaveTextContent('Whining!');
    });

    it('clicking whining button again toggles back to "Whining?" state', async () => {
        await triggerMorning();
        await act(async () => { fireEvent.click(screen.getByTestId('mc-whining-btn')); });
        await act(async () => { fireEvent.click(screen.getByTestId('mc-whining-btn')); });
        expect(screen.getByTestId('mc-whining-btn')).toHaveTextContent('Whining?');
    });

    it('−1 badge is visible when whining is toggled on', async () => {
        await triggerMorning();
        await act(async () => { fireEvent.click(screen.getByTestId('mc-whining-btn')); });
        // The badge shows the text "−1"
        expect(screen.getByTestId('mc-whining-btn').textContent).toContain('−1');
    });

    it('−1 badge is NOT visible when whining is toggled off', async () => {
        await triggerMorning();
        // Default state — badge should not appear
        expect(screen.getByTestId('mc-whining-btn').textContent).not.toContain('−1');
    });

    it('whining state resets when the mission is cancelled and re-triggered', async () => {
        function Controls() {
            const dispatch = useMCDispatch();
            return (
                <>
                    <button data-testid="trigger-btn2" onClick={() => dispatch({ type: 'SET_ACTIVE_MISSION', phase: 'morning' })}>Trigger</button>
                    <button data-testid="cancel-btn2"  onClick={() => dispatch({ type: 'CANCEL_MISSION', missionPhase: 'morning' })}>Cancel</button>
                </>
            );
        }
        render(<MCStoreProvider><Controls /><MissionOverlay /></MCStoreProvider>);

        // Start mission and toggle whining on
        await act(async () => { fireEvent.click(screen.getByTestId('trigger-btn2')); });
        await act(async () => { fireEvent.click(screen.getByTestId('mc-whining-btn')); });
        expect(screen.getByTestId('mc-whining-btn')).toHaveTextContent('Whining!');

        // Cancel mission (phase → 'none'), then re-trigger (phase → 'morning')
        await act(async () => { fireEvent.click(screen.getByTestId('cancel-btn2')); });
        await act(async () => { fireEvent.click(screen.getByTestId('trigger-btn2')); });

        // Whining state should reset to off
        expect(screen.getByTestId('mc-whining-btn')).toHaveTextContent('Whining?');
    });
});

// ── Reset tasks button ─────────────────────────────────────────────────────────

describe('MissionOverlay — reset tasks button', () => {
    beforeEach(() => { vi.clearAllMocks(); localStorage.clear(); });
    afterEach(() => { cleanup(); localStorage.clear(); });

    it('reset button is visible when mission is active', async () => {
        renderOverlay(<TriggerMission phase="morning" />);
        await act(async () => { fireEvent.click(screen.getByTestId('trigger-btn')); });
        expect(screen.getByTestId('mc-reset-btn')).toBeInTheDocument();
    });

    it('clicking reset tasks clears completed task markers', async () => {
        renderOverlay(<TriggerMission phase="morning" />);
        await act(async () => { fireEvent.click(screen.getByTestId('trigger-btn')); });

        // Complete the first morning task
        const firstTask = screen.queryByTestId('mc-task-card-tshirt');
        if (firstTask && !(firstTask as HTMLButtonElement).disabled) {
            await act(async () => { fireEvent.click(firstTask); });
        }

        // Reset tasks
        await act(async () => { fireEvent.click(screen.getByTestId('mc-reset-btn')); });

        // The task card should no longer be disabled (completed tasks are disabled)
        const resetTask = screen.queryByTestId('mc-task-card-tshirt');
        if (resetTask) {
            expect((resetTask as HTMLButtonElement).disabled).toBe(false);
        }
    });

    it('resetting tasks does NOT close the overlay', async () => {
        renderOverlay(<TriggerMission phase="morning" />);
        await act(async () => { fireEvent.click(screen.getByTestId('trigger-btn')); });
        await act(async () => { fireEvent.click(screen.getByTestId('mc-reset-btn')); });
        // Overlay must still be present
        expect(screen.getByTestId('mc-mission-overlay')).toBeInTheDocument();
    });
});

