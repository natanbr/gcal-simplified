// ============================================================
// Mission Control — GoalPedestal component tests
// ============================================================

import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { MCStoreProvider } from '../store/MCStoreProvider';
import { GoalPedestal } from './GoalPedestal';
import { DragLayer } from './DragLayer';
import type { DisplayCase } from '../types';

// Mock framer-motion so animations don't block
vi.mock('framer-motion', async () => {
    const actual = await vi.importActual<typeof import('framer-motion')>('framer-motion');
    return {
        ...actual,
        AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
        motion: new Proxy({}, {
            get: (_target, prop: string) => {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                return React.forwardRef(({ children: c, ...props }: any, ref: any) =>
                    React.createElement(prop, { ...props, ref }, c)
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
                <GoalPedestal case_={case_} bankCount={bankCount} />
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
