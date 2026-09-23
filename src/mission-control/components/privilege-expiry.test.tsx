// ============================================================
// Mission Control — an expired privilege suspension must lift by itself
// ------------------------------------------------------------
// QA 2026-09-22, in the built app: Phone Games `status: 'suspended'` with
// `suspendedUntil` an hour in the past. The card stayed red with hazard
// stripes, 🎮 Game was missing from "Pick a Goal", and it survived three
// relaunches — a 1-day suspension became indefinite until the parent pressed
// Reinstate. Every reader trusted the stored `status` and nothing ever flipped
// it back; only the countdown badge read the clock, so the badge vanished
// while the card stayed red.
//
// Each test seeds the persisted blob and mounts the real store, which is the
// relaunch path: `loadPersistedState` → real reducer → real component.
// ============================================================

import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { MCStoreProvider } from '../store/MCStoreProvider';
import { STORAGE_KEY } from '../store/useMCStore';
import { initialState } from '../store/mcReducer';
import { GoalPedestal } from './GoalPedestal';
import { DragLayer } from './DragLayer';
import { PrivilegeCardButton } from './PrivilegeCardButton';
import { PrivilegesPanel } from './PrivilegesPanel';
import type { DisplayCase, PrivilegeCard } from '../types';

vi.mock('framer-motion', async () => {
    const actual = await vi.importActual<typeof import('framer-motion')>('framer-motion');
    return {
        ...actual,
        AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
        motion: new Proxy({} as Record<string, unknown>, {
            get: (_target, prop: string) => {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                return React.forwardRef(({ children: c, ...props }: any, ref: any) =>
                    React.createElement(prop, { ...props, ref }, c)
                );
            },
        }),
    };
});

const HOUR = 60 * 60 * 1000;
const inMs = (ms: number) => new Date(Date.now() + ms).toISOString();

/** Seeds the persisted blob with one privilege overridden, like a relaunch. */
function seedPrivilege(id: string, status: PrivilegeCard['status'], suspendedUntil: string | null) {
    const privileges = initialState.privileges.map(p =>
        p.id === id ? { ...p, status, suspendedUntil } : p,
    );
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ privileges }));
}

const emptyCase: DisplayCase = { id: 0, status: 'empty', reward: null, tokenCount: 0, targetCount: 5 };
const completedGame: DisplayCase = { id: 2, status: 'active', reward: 'game', tokenCount: 5, targetCount: 5 };

function renderPedestal(case_: DisplayCase) {
    return render(
        <MCStoreProvider>
            <DragLayer>
                <GoalPedestal case_={case_} cases={[case_]} bankCount={3} layoutRects={{ bank: null, cases: {} }} />
            </DragLayer>
        </MCStoreProvider>,
    );
}

async function openPicker() {
    await act(async () => {
        fireEvent.click(screen.getByLabelText('Add a new goal'));
    });
}

const hazardCount = (container: HTMLElement) => container.querySelectorAll('.mc-hazard').length;

afterEach(() => {
    vi.useRealTimers();
    localStorage.clear();
});

describe('an expired suspension lifts — Goal picker', () => {
    it('offers 🎮 Game again once the Phone Games suspension has run out', async () => {
        seedPrivilege('phone-games', 'suspended', inMs(-HOUR));
        renderPedestal(emptyCase);
        await openPicker();
        expect(screen.getByText('Game')).toBeInTheDocument();
    });

    it('still hides 🎮 Game while the suspension is running (negative)', async () => {
        seedPrivilege('phone-games', 'suspended', inMs(HOUR));
        renderPedestal(emptyCase);
        await openPicker();
        expect(screen.queryByText('Game')).not.toBeInTheDocument();
    });
});

describe('an expired suspension lifts — completed Game goal', () => {
    it('unlocks "Use!" once the Phone Games suspension has run out', () => {
        seedPrivilege('phone-games', 'suspended', inMs(-HOUR));
        renderPedestal(completedGame);
        expect(screen.getByText('🎁 Use!')).toBeInTheDocument();
        expect(screen.queryByText('🔒 Locked')).not.toBeInTheDocument();
    });

    it('keeps "Use!" locked while the suspension is running (negative)', () => {
        seedPrivilege('phone-games', 'suspended', inMs(HOUR));
        renderPedestal(completedGame);
        expect(screen.getByText('🔒 Locked')).toBeInTheDocument();
    });
});

describe('an expired suspension lifts — privilege card', () => {
    const expiredKnife: PrivilegeCard = {
        id: 'knife', label: 'Knife', icon: 'Utensils', status: 'suspended', suspendedUntil: inMs(-HOUR),
    };

    it('drops the hazard stripes once the suspension has run out', () => {
        const { container } = render(
            <MCStoreProvider><PrivilegeCardButton p={expiredKnife} /></MCStoreProvider>,
        );
        expect(hazardCount(container)).toBe(0);
    });

    it('offers the parent a fresh suspension, not a Reinstate, for an expired card', async () => {
        render(<MCStoreProvider><PrivilegeCardButton p={expiredKnife} interactive /></MCStoreProvider>);
        await act(async () => {
            fireEvent.click(screen.getByTitle('Knife'));
        });
        expect(screen.getByText(/Suspend for:/i)).toBeInTheDocument();
        expect(screen.queryByText('✅ Reinstate')).not.toBeInTheDocument();
    });

    it('keeps the hazard stripes while the suspension is running (negative)', () => {
        const running: PrivilegeCard = { ...expiredKnife, suspendedUntil: inMs(HOUR) };
        const { container } = render(
            <MCStoreProvider><PrivilegeCardButton p={running} /></MCStoreProvider>,
        );
        expect(hazardCount(container)).toBe(1);
    });
});

describe('an expired suspension lifts — while Mission Control is open (lifecycle)', () => {
    it('the dashboard card turns back to normal at the end time, before the panel\'s 30s refresh', () => {
        vi.useFakeTimers();
        seedPrivilege('knife', 'suspended', inMs(20_000));
        const { container } = render(<MCStoreProvider><PrivilegesPanel /></MCStoreProvider>);
        act(() => {
            vi.advanceTimersByTime(19_999);
        });
        expect(hazardCount(container)).toBe(1);

        act(() => {
            vi.advanceTimersByTime(1);
        });

        expect(hazardCount(container)).toBe(0);
    });

    // The tests below seed a suspension that is still RUNNING at load, so only
    // something that happens at the end time can lift it on screen.

    it('the Goal picker offers 🎮 Game again the next time it is opened', async () => {
        vi.useFakeTimers();
        seedPrivilege('phone-games', 'suspended', inMs(20_000));
        renderPedestal(emptyCase);
        await openPicker();
        expect(screen.queryByText('Game')).not.toBeInTheDocument();

        act(() => {
            vi.advanceTimersByTime(30_000);
        });
        await act(async () => {
            fireEvent.click(screen.getByLabelText('Cancel'));
        });
        await openPicker();

        expect(screen.getByText('Game')).toBeInTheDocument();
    });

    it('a completed Game goal unlocks "Use!" at the end time, with no other change', () => {
        // Nothing else re-renders the pedestal: no rerender, no tap, and the mood
        // heartbeat returns the same state outside the active window. Only the
        // expiry timer in the store can unlock it (useSuspensionExpiry).
        vi.useFakeTimers();
        seedPrivilege('phone-games', 'suspended', inMs(20_000));
        renderPedestal(completedGame);
        // Two steps on purpose: the mount's own timers (confetti, persist, remote
        // sync) re-render when act() flushes, so one 20s jump would read the clock
        // after the end and pass with no expiry timer at all.
        act(() => {
            vi.advanceTimersByTime(19_999);
        });
        expect(screen.getByText('🔒 Locked')).toBeInTheDocument();

        act(() => {
            vi.advanceTimersByTime(1);
        });

        expect(screen.getByText('🎁 Use!')).toBeInTheDocument();
    });
});
