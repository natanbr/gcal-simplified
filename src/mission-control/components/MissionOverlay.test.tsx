// ============================================================
// Mission Control — MissionOverlay component tests
// Uses MCStoreProvider to supply store context.
// ============================================================

import React from 'react';
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MCStoreProvider } from '../store/useMCStore.tsx';
import { MissionOverlay } from './MissionOverlay';
import { useMCDispatch } from '../store/useMCStore.tsx';

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
