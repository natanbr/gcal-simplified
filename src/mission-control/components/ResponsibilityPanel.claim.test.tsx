// ============================================================
// Mission Control — the Claim button pays once, with the REAL framer-motion
// ------------------------------------------------------------
// ResponsibilityPanel.test.tsx mocks framer-motion away, so an exiting button
// unmounts at once there. With the real one, AnimatePresence keeps the Claim
// button on screen, click handler and all, through its exit animation. A
// second tap in that window paid the reward again (bank 3 → 6 → 9, two
// "Activity completed" lines; PR 195 review, on main before it).
// Two defences: the reducer refuses a Claim on a task that is not complete
// (store/responsibilityClaim.ts), and the exiting button takes no pointer.
//
// The button first finishes its enter (a 10 ms MotionConfig), then the exit is
// stretched to 5 s, so the window is there however slowly a loaded machine runs
// the test: the default 0.3 s could pass between two act() calls. Clicked before
// its enter ends, the button has nothing to fade and leaves at once.
// ============================================================

import { MotionConfig } from 'framer-motion';
import { render, screen, fireEvent, act, cleanup, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MCStoreProvider } from '../store/MCStoreProvider';
import { STORAGE_KEY, useMCState } from '../store/useMCStore';
import { initialState } from '../store/mcReducer';
import { ResponsibilityPanel } from './ResponsibilityPanel';
import type { MCState } from '../types';

const live: { state?: MCState } = {};
function StateProbe() {
    live.state = useMCState();
    return null;
}

beforeEach(() => {
    // Saved with Activity complete, so the Claim button is the first thing on its card.
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
        ...initialState,
        responsibilities: initialState.responsibilities.map(r => (r.id === 'activity'
            ? { ...r, pointsEarned: 3, completedAt: '2026-10-06T12:00:00.000Z' }
            : r)),
    }));
});
afterEach(() => { cleanup(); localStorage.clear(); });

const tree = (duration: number) => (
    <MotionConfig transition={{ duration }}>
        <MCStoreProvider><StateProbe /><ResponsibilityPanel /></MCStoreProvider>
    </MotionConfig>
);

/** The panel with Activity's Claim button fully shown, and every later animation 5 s long. */
async function renderPanel() {
    const { rerender } = render(tree(0.01));
    const claim = screen.getByTestId('mc-responsibility-claim-activity');
    await waitFor(() => expect(claim.parentElement?.style.opacity).toBe('1'));
    rerender(tree(5));
    return claim;
}
const bank = () => live.state?.bankCount;
const completedLines = () => (live.state?.activityLogs ?? []).filter(l => l.message === 'Activity completed');

describe('ResponsibilityPanel — Claim, with the real framer-motion', () => {
    it('a tap on the button while it animates out pays nothing more', async () => {
        const claim = await renderPanel();
        const before = bank() ?? NaN;
        await act(async () => { fireEvent.click(claim); });
        expect(screen.getByTestId('mc-responsibility-claim-activity'), 'precondition: still on screen, mid-exit').toBe(claim);
        await act(async () => { fireEvent.click(claim); });

        expect(bank()).toBe(before + 3);
        expect(completedLines()).toHaveLength(1);
    });

    it('two taps before the panel re-renders pay once', async () => {
        const claim = await renderPanel();
        const before = bank() ?? NaN;
        await act(async () => { fireEvent.click(claim); fireEvent.click(claim); });

        expect(bank()).toBe(before + 3);
        expect(completedLines()).toHaveLength(1);
    });

    it('the exiting Claim button takes no pointer', async () => {
        const claim = await renderPanel();
        await act(async () => { fireEvent.click(claim); });
        expect(screen.getByTestId('mc-responsibility-claim-activity'), 'precondition: still on screen, mid-exit').toBe(claim);
        await waitFor(() => expect(claim.parentElement?.style.pointerEvents).toBe('none'));
    });
});
