// ============================================================
// Mission Control — PrivilegeCardButton component tests
// Covers: initial render, popup open/close, suspend, reinstate.
// ============================================================

import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MCStoreProvider } from '../store/useMCStore.tsx';
import { PrivilegeCardButton } from './PrivilegeCardButton';
import type { PrivilegeCard } from '../types';

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

// ── Test fixtures ─────────────────────────────────────────────────────────────

const activeKnife: PrivilegeCard = {
    id: 'knife',
    label: 'Knife',
    icon: 'Utensils',
    status: 'active',
    suspendedUntil: null,
};

const suspendedKnife: PrivilegeCard = {
    id: 'knife',
    label: 'Knife',
    icon: 'Utensils',
    status: 'suspended',
    suspendedUntil: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 1 day from now
};

function renderPrivCard(card: PrivilegeCard) {
    return render(
        <MCStoreProvider>
            <PrivilegeCardButton p={card} />
        </MCStoreProvider>,
    );
}

// ── Initial render ────────────────────────────────────────────────────────────

describe('PrivilegeCardButton — initial render', () => {
    it('renders the privilege emoji (Knife = 🔪)', () => {
        renderPrivCard(activeKnife);
        expect(screen.getByText('🔪')).toBeInTheDocument();
    });

    it('does not show the popup by default', () => {
        renderPrivCard(activeKnife);
        expect(screen.queryByText(/Suspend for:/i)).not.toBeInTheDocument();
    });

    it('shows the countdown badge for a suspended card', () => {
        renderPrivCard(suspendedKnife);
        // suspendedCountdown with ~24h remaining shows "23h left" or "24h left"
        const badge = screen.getByText(/\d+[hd] left/);
        expect(badge).toBeInTheDocument();
    });

    it('does not show countdown badge for an active card', () => {
        renderPrivCard(activeKnife);
        expect(screen.queryByText(/\d+[hd] left/)).not.toBeInTheDocument();
    });
});

// ── Popup open / close ────────────────────────────────────────────────────────

describe('PrivilegeCardButton — popup open/close', () => {
    it('clicking the card opens the popup with "Suspend for:" label', async () => {
        renderPrivCard(activeKnife);
        await act(async () => {
            fireEvent.click(screen.getByTitle('Knife'));
        });
        expect(screen.getByText(/Suspend for:/i)).toBeInTheDocument();
    });

    it('shows all duration options in the popup', async () => {
        renderPrivCard(activeKnife);
        await act(async () => {
            fireEvent.click(screen.getByTitle('Knife'));
        });
        expect(screen.getByText(/1 Day/i)).toBeInTheDocument();
        expect(screen.getByText(/3 Days/i)).toBeInTheDocument();
        expect(screen.getByText(/1 Week/i)).toBeInTheDocument();
    });

    it('clicking the backdrop closes the popup', async () => {
        renderPrivCard(activeKnife);
        await act(async () => {
            fireEvent.click(screen.getByTitle('Knife'));
        });
        expect(screen.getByText(/Suspend for:/i)).toBeInTheDocument();

        // The backdrop is the fixed overlay div rendered before the popup panel
        // It's the first `div` sibling that covers the screen; clicking it closes the popup
        const backdrop = document.querySelector<HTMLElement>('[style*="position: fixed"][style*="z-index: 9000"]');
        if (backdrop) {
            await act(async () => {
                fireEvent.click(backdrop);
            });
        }
        expect(screen.queryByText(/Suspend for:/i)).not.toBeInTheDocument();
    });
});

// ── Suspend ───────────────────────────────────────────────────────────────────

describe('PrivilegeCardButton — suspend', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it('clicking "1 Day" closes the popup and shows the countdown badge', async () => {
        vi.setSystemTime(new Date('2025-01-01T12:00:00Z'));
        renderPrivCard(activeKnife);

        await act(async () => {
            fireEvent.click(screen.getByTitle('Knife'));
        });
        await act(async () => {
            fireEvent.click(screen.getByText(/🚫 1 Day/i));
        });

        // Popup should be gone
        expect(screen.queryByText(/Suspend for:/i)).not.toBeInTheDocument();
    });
});

// ── Reinstate ─────────────────────────────────────────────────────────────────

describe('PrivilegeCardButton — reinstate', () => {
    it('shows Reinstate button when card is already suspended', async () => {
        renderPrivCard(suspendedKnife);
        await act(async () => {
            fireEvent.click(screen.getByTitle('Knife'));
        });
        expect(screen.getByText(/✅ Reinstate/i)).toBeInTheDocument();
    });

    it('clicking Reinstate closes the popup', async () => {
        renderPrivCard(suspendedKnife);
        await act(async () => {
            fireEvent.click(screen.getByTitle('Knife'));
        });
        await act(async () => {
            fireEvent.click(screen.getByText(/✅ Reinstate/i));
        });
        expect(screen.queryByText(/Suspend for:/i)).not.toBeInTheDocument();
    });

    it('does NOT show Reinstate button for an active card', async () => {
        renderPrivCard(activeKnife);
        await act(async () => {
            fireEvent.click(screen.getByTitle('Knife'));
        });
        expect(screen.queryByText(/✅ Reinstate/i)).not.toBeInTheDocument();
    });
});
