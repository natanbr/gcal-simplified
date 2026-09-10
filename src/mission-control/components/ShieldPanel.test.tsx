// ============================================================
// Mission Control — ShieldPanel component tests
// ------------------------------------------------------------
// Covers the four things the card promises:
//   • six segments are ALWAYS drawn (the track is a fixed budget,
//     not a bar that shrinks — you can see what you have left of
//     what);
//   • the filled count tracks the streak at every tier boundary;
//   • the lock line appears ONLY once the shield is broken;
//   • no status caption is rendered at any tier.
//
// That last one is a product decision, not an implementation
// detail: the parent explicitly rejected running commentary
// ("Shield is strong" / "cracking" / "One left") as nagging, so
// it is pinned two ways — a blocklist for the exact rejected
// words, and an exact-textContent allowlist that fails on ANY
// new prose, including wording nobody has thought of yet.
//
// NOTE ON COLOUR: none of this asserts on colour, deliberately.
// jsdom does not substitute var() into style properties (see the
// header of MoodWindNotification.test.tsx for the probe), so a
// colour assertion here would pass vacuously and prove nothing.
// The tier→colour mapping is pinned by shieldTier's own unit
// tests in store/missionStreak.test.ts; the contrast maths for
// the lock line lives in the mc.css comment.
// ============================================================

import React from 'react';
import { render, screen, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MCStoreProvider } from '../store/MCStoreProvider';
import { STORAGE_KEY } from '../store/useMCStore';
import { SHIELD_SEGMENTS } from '../store/missionStreak';
import { ShieldPanel } from './ShieldPanel';

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

const LOCK_LINE = '🔒 Bank locked — finish your next mission';
const SHIELD_EMOJI = '\u{1F6E1}\u{FE0F}';
const BROKEN_EMOJI = '\u{1F494}';

beforeEach(() => {
    localStorage.clear();
});
afterEach(() => {
    cleanup();
    localStorage.clear();
});

/**
 * Seeds the streak through the persistence layer rather than through actions.
 *
 * Reaching streak 5 by dispatching would mean timing out five real missions;
 * `loadPersistedState` sanitizes `missedMissionStreak` off the stored blob, so
 * writing it is exact and stays inside the store's own front door.
 */
function renderAtStreak(missedMissionStreak: number) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ missedMissionStreak }));
    return render(
        <MCStoreProvider>
            <ShieldPanel />
        </MCStoreProvider>
    );
}

/** The six-segment track. Filled count is published as the meter's value. */
function track() {
    return screen.getByRole('meter', { name: 'Shield' });
}

describe('ShieldPanel', () => {
    describe('the segment track', () => {
        it.each([0, 3, 5, 6])('always draws all six segments (streak %i)', (streak) => {
            renderAtStreak(streak);
            expect(track().children).toHaveLength(SHIELD_SEGMENTS);
        });

        it.each([
            [0, 6],
            [3, 3],
            [5, 1],
            [6, 0],
        ])('fills %i missed → %i segments left', (streak, expectedLeft) => {
            renderAtStreak(streak);
            expect(track()).toHaveAttribute('aria-valuenow', String(expectedLeft));
            expect(screen.getByText(`${expectedLeft} / ${SHIELD_SEGMENTS}`)).toBeInTheDocument();
        });
    });

    describe('the lock line', () => {
        it.each([0, 3, 5])('is absent while the shield holds (streak %i)', (streak) => {
            renderAtStreak(streak);
            expect(screen.queryByText(LOCK_LINE)).not.toBeInTheDocument();
        });

        it('appears once six missions have been missed', () => {
            renderAtStreak(6);
            expect(screen.getByText(LOCK_LINE)).toBeInTheDocument();
        });

        it('swaps the shield for a broken heart when broken', () => {
            const { container } = renderAtStreak(6);
            expect(container.textContent).toContain(BROKEN_EMOJI);
            expect(container.textContent).not.toContain(SHIELD_EMOJI);
        });
    });

    // ── The rejected-captions guard ──────────────────────────────────────────
    describe('renders no status caption at any tier', () => {
        it.each([0, 1, 2, 3, 4, 5, 6])('has none of the rejected words (streak %i)', (streak) => {
            const { container } = renderAtStreak(streak);
            expect(container.textContent).not.toMatch(/strong/i);
            expect(container.textContent).not.toMatch(/cracking/i);
            expect(container.textContent).not.toMatch(/one left/i);
        });

        // The blocklist above only pins the three phrasings already rejected.
        // This pins the actual decision: the ONLY text on the card is the
        // label, the count, and — when broken — the lock line. Any new prose,
        // however worded, fails here.
        it.each([
            // Emoji first: the header is one row (emoji + label + count) so the
            // card stays short enough that Column 3's fourth card is not pushed
            // off a 768px-tall screen.
            [0, `${SHIELD_EMOJI}Shield6 / 6`],
            [3, `${SHIELD_EMOJI}Shield3 / 6`],
            [5, `${SHIELD_EMOJI}Shield1 / 6`],
            [6, `${BROKEN_EMOJI}Shield0 / 6${LOCK_LINE}`],
        ])('renders exactly the allowed text at streak %i', (streak, expected) => {
            const { container } = renderAtStreak(streak);
            expect(container.textContent).toBe(expected);
        });
    });
});
