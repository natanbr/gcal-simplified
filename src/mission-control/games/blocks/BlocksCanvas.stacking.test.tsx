// ============================================================
// The landing projection must paint ABOVE the board cells.
//
// ProjectionOverlay is a sibling of BlocksGrid, not a descendant, so it does
// not automatically win. A grid ITEM takes a z-index without being positioned,
// and neither the board nor its `position: relative` wrapper opens a stacking
// context (relative + z-index:auto does not), so the cells participate in the
// same stacking context as the overlay and an `auto` overlay loses to them.
//
// Why the bug hid: an EMPTY cell is 3.5% white, so a ghost behind it still
// reads as a ghost — the green case looked perfect. A FILLED cell is opaque,
// which put the red "you cannot put this here" warning behind exactly the
// block that made the spot invalid, and a mid-explosion cell paints at 10.
//
// jsdom does no painting, so this asserts the stacking RELATIONSHIP: both
// sides are read from rendered elements rather than hardcoded, so retuning
// either number keeps the guard honest.
// ============================================================
import { render, within, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GridCell } from './GridCell';
import type { BlocksGameState } from './types';
import {
    CANVAS_SUITE_TIMEOUT_MS,
    DOT,
    cellCentre,
    dragProxy,
    draggableItem,
    grabCorner,
    renderCanvas,
    stateWith,
} from './dragTestKit';

vi.setConfig({ testTimeout: CANVAS_SUITE_TIMEOUT_MS });

/**
 * Every value a board cell can hold, from the contract in types.ts:
 * `0 = empty, 1 = debris/filled, 2 = meteor, 3 = satellite, 4 = exploding,
 * 5 = electricity`. The overlay has to beat the tallest of them, not just the
 * common one — 4 (mid-explosion) is the tall one, and it is on screen exactly
 * when the child is aiming the next piece.
 */
const CELL_VALUES = [0, 1, 2, 3, 4, 5];

/** The z-index a GridCell declares for one grid value. NaN when it declares none. */
function cellZIndex(val: number): number {
    const { container } = render(<GridCell r={0} c={0} val={val} />);
    const cell = container.querySelector<HTMLElement>('[data-cell-index="0-0"]');
    if (!cell) throw new Error(`GridCell rendered nothing for value ${val}`);
    return Number.parseInt(cell.style.zIndex, 10);
}

/** Drags the tray shape onto the board so the projection overlay is on screen.
 *  Unlifted mouse path on purpose: stacking order is the same for any pointer. */
function dragOntoBoard(state: BlocksGameState = stateWith(DOT)) {
    const { container } = renderCanvas(state);
    const scoped = within(container);

    fireEvent.pointerDown(draggableItem(container), grabCorner(1));
    fireEvent.pointerMove(window, { ...cellCentre(3, 3), pointerId: 1 });

    const overlay = scoped.getByTestId('projection-overlay');
    return { container, scoped, overlay };
}

describe('the landing projection stacks above the board cells', () => {
    beforeEach(() => vi.clearAllMocks());

    it('declares a z-index higher than any state a board cell can take', () => {
        const measured = CELL_VALUES.map(val => ({ val, z: cellZIndex(val) }));
        const maxCellZ = Math.max(...measured.map(entry => entry.z));
        expect(
            maxCellZ,
            `No numeric z-index read off GridCell (${JSON.stringify(measured)}). ` +
            'The comparison below would be vacuous, so this side of the guard is broken, ' +
            'not the overlay.',
        ).toBeGreaterThanOrEqual(1);

        const { overlay } = dragOntoBoard();

        expect(
            overlay.style.position,
            'A z-index on a statically positioned box is ignored outright, which would ' +
            'make the comparison below meaningless.',
        ).toBe('absolute');

        const overlayZ = Number.parseInt(overlay.style.zIndex, 10);
        expect(
            Number.isFinite(overlayZ),
            'ProjectionOverlay declares no numeric z-index. An `auto` overlay LOSES to the ' +
            'grid cells: a grid item takes a z-index without being positioned, and neither ' +
            'the board nor its wrapper opens a stacking context. The red warning then paints ' +
            'behind the opaque cell that caused it.',
        ).toBe(true);

        expect(
            overlayZ,
            `Projection overlay at z-index ${overlayZ}, but a GridCell reaches ` +
            `${maxCellZ} (${JSON.stringify(measured)}). The ghost paints under the board.`,
        ).toBeGreaterThan(maxCellZ);
    });

    it('still stacks below the shape the child is holding', () => {
        // The upper bound of the same sandwich: the ghost is a hint about where
        // the held shape will land, so it must never cover the held shape.
        const { container, overlay } = dragOntoBoard();

        const proxy = dragProxy(container);
        expect(proxy, 'precondition: the drag proxy is on screen').not.toBeNull();

        const proxyZ = Number.parseInt(proxy!.style.zIndex, 10);
        const overlayZ = Number.parseInt(overlay.style.zIndex, 10);
        expect(Number.isFinite(proxyZ) && Number.isFinite(overlayZ)).toBe(true);
        expect(overlayZ).toBeLessThan(proxyZ);
    });

    it('still stacks below the line-clear feedback card', () => {
        // The card celebrates the clear that is repainting the board underneath
        // it; a ghost drawn over it would sit on top of the celebration.
        const { scoped, overlay } = dragOntoBoard(stateWith(DOT, {
            clearedFeedback: { text: 'DOUBLE CLEAR', stars: 2, id: 'fb-1' },
        }));

        const card = scoped.getByText('DOUBLE CLEAR').parentElement;
        if (!card) throw new Error('cleared-feedback card did not render');

        const cardZ = Number.parseInt(card.style.zIndex, 10);
        const overlayZ = Number.parseInt(overlay.style.zIndex, 10);
        expect(Number.isFinite(cardZ) && Number.isFinite(overlayZ)).toBe(true);
        expect(overlayZ).toBeLessThan(cardZ);
    });
});

describe('the held shape stacks above everything it is dragged across', () => {
    beforeEach(() => vi.clearAllMocks());

    it('paints above the tray shapes and the line-clear card', () => {
        // The drag proxy is the one thing the child is holding: it must never
        // pass under another tray shape or under the celebration card while it
        // is dragged across them. Both sides read from rendered elements, so a
        // retuned number keeps the guard honest.
        const { container, scoped } = dragOntoBoard(stateWith(DOT, {
            clearedFeedback: { text: 'DOUBLE CLEAR', stars: 2, id: 'fb-1' },
        }));

        const proxy = dragProxy(container);
        expect(proxy, 'precondition: the drag proxy is on screen').not.toBeNull();
        const card = scoped.getByText('DOUBLE CLEAR').parentElement;
        if (!card) throw new Error('cleared-feedback card did not render');

        const proxyZ = Number.parseInt(proxy!.style.zIndex, 10);
        const trayShapeZ = Number.parseInt(draggableItem(container).style.zIndex, 10);
        const cardZ = Number.parseInt(card.style.zIndex, 10);
        expect(
            [proxyZ, trayShapeZ, cardZ].every(Number.isFinite),
            'a z-index did not render as a number, so the comparison below would be vacuous',
        ).toBe(true);
        expect(proxyZ, 'the held shape paints under the other tray shapes').toBeGreaterThan(trayShapeZ);
        expect(proxyZ, 'the held shape paints under the line-clear card').toBeGreaterThan(cardZ);
    });
});
