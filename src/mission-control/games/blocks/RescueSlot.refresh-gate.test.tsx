// ============================================================
// Refresh is refused while the RESCUE shape is in flight.
//
// `refreshRescueShape` re-locks the rescue slot, and a locked slot makes
// placeShape refuse a drop the child was already shown in green — the exact
// "it landed nowhere and I never saw why" failure the whole drag rework exists
// to remove. A second finger can reach the Refresh button mid-drag: the drag
// ignores that pointer, but a click is not a pointer the drag owns.
//
// The gate is deliberately rescue-only. Dragging a standard tray shape must
// leave Refresh usable, because refreshing the rescue slot then affects nothing
// the child is holding.
//
// Driven through BlocksCanvas rather than RescueSlot alone, so the wiring
// (useShapeDrag -> activeDragSlot -> RescueSlot) is covered too.
//
// NOT asserted via `fireEvent.click` + `expect(refresh).not.toHaveBeenCalled()`:
// `onClick` is undefined while gated, so that assertion passes whether the
// button is disabled or not. The `disabled` state itself is the contract.
// ============================================================
import { render, within, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BlocksCanvas } from './BlocksCanvas';
import type { BlocksGameState, GameShape } from './types';
import type { QuizEngineApi } from '../quiz/types';

function stubEngine(): QuizEngineApi {
    return {
        generator: () => ({ kind: 'numeric', skill: 'math-add', level: 0, text: '1 + 1 = ?', answer: 2 }),
        beginSession: vi.fn(),
        setDifficulty: vi.fn(),
        onAnswered: vi.fn(),
        notifyQuizClosed: vi.fn(),
    };
}

const BLOCK_2X2: GameShape = {
    id: 'block-2x2', name: 'Block', color: '#f59e0b',
    cells: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }],
};
const DOT: GameShape = { id: 'dot', name: 'Dot', color: '#38bdf8', cells: [{ x: 0, y: 0 }] };

interface PtrInit { clientX: number; clientY: number; pointerId: number }
function ptr(type: string, init: PtrInit) {
    return new PointerEvent(type, { bubbles: true, ...init });
}

const GRAB: PtrInit = { clientX: 120, clientY: 120, pointerId: 1 };

function stateWith(): BlocksGameState {
    return {
        grid: Array.from({ length: 8 }, () => Array(8).fill(0)),
        standardShapes: [BLOCK_2X2, null, null],
        rescueShape: DOT,
        // Unlocked, or the rescue shape gets no onPointerDown at all and there
        // is nothing to put in flight.
        rescueShapeLocked: false,
        altitude: 0, score: 0, phase: 'playing', level: 0,
        rescueQuizActive: false, clearedFeedback: null,
    };
}

function setup() {
    const refreshRescueShape = vi.fn();
    const { container } = render(
        <BlocksCanvas
            gameState={stateWith()}
            placeShape={vi.fn().mockReturnValue(true)}
            triggerRescueQuiz={vi.fn()}
            resolveRescueQuiz={vi.fn()}
            cancelRescueQuiz={vi.fn()}
            engine={stubEngine()}
            refreshRescueShape={refreshRescueShape}
        />,
    );
    const scoped = within(container);

    // Two draggables render here — the tray shape and the rescue shape. Picking
    // by subtree rather than by array index: index luck is how the wrong one
    // gets dragged and the test still passes.
    const slot = scoped.getByText('Rescue Slot').parentElement;
    if (!slot) throw new Error('rescue slot did not render');

    const grabbables = [...container.querySelectorAll<HTMLDivElement>('div[style*="cursor: grab"]')];
    expect(grabbables, 'expected exactly one tray shape and one rescue shape').toHaveLength(2);

    const rescueItem = grabbables.find(el => slot.contains(el));
    const trayItem = grabbables.find(el => !slot.contains(el));
    if (!rescueItem || !trayItem) throw new Error('could not tell the rescue shape from the tray shape');

    const refresh = () => scoped.getByRole('button', { name: /refresh/i });
    const proxy = () => container.querySelector('div[style*="z-index: 9999"]');
    return { rescueItem, trayItem, refresh, proxy, refreshRescueShape };
}

describe('the Refresh button is gated on the rescue shape being in flight', () => {
    beforeEach(() => vi.clearAllMocks());

    it('is enabled while nothing is being dragged', () => {
        const { refresh } = setup();
        expect(refresh()).toBeEnabled();
    });

    it('is disabled while the RESCUE shape is in flight', () => {
        const { rescueItem, refresh, proxy } = setup();

        fireEvent(rescueItem, ptr('pointerdown', GRAB));
        expect(proxy(), 'precondition: the rescue shape is actually in flight').not.toBeNull();

        expect(
            refresh(),
            'Refresh stayed live under the dragged rescue shape. Tapping it re-locks ' +
            'the slot, and placeShape then refuses the drop the child was shown in green.',
        ).toBeDisabled();
    });

    it('stays enabled while a STANDARD tray shape is in flight', () => {
        // The gate is rescue-only on purpose: refreshing the rescue slot cannot
        // invalidate a tray shape, so widening it to "any drag" would take a
        // working button away from the child for no reason.
        const { trayItem, refresh, proxy } = setup();

        fireEvent(trayItem, ptr('pointerdown', GRAB));
        expect(proxy(), 'precondition: the tray shape is actually in flight').not.toBeNull();

        expect(
            refresh(),
            'Refresh was disabled during a STANDARD drag — the gate has been widened ' +
            'beyond the rescue slot it protects.',
        ).toBeEnabled();
    });

    it('is enabled again once the rescue drag ends', () => {
        const { rescueItem, refresh, proxy } = setup();

        fireEvent(rescueItem, ptr('pointerdown', GRAB));
        expect(refresh()).toBeDisabled();

        // A lift with no projection is a return-to-bank; it still ends the drag.
        act(() => { window.dispatchEvent(ptr('pointerup', GRAB)); });

        expect(proxy(), 'precondition: the drag really ended').toBeNull();
        expect(
            refresh(),
            'Refresh stayed dead after the drag ended — the gate latched on.',
        ).toBeEnabled();
    });
});
