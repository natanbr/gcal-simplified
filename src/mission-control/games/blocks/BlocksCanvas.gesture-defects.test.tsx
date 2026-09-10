// ============================================================
// The touchscreen drag contract for Space Rescue. Written RED against the six
// gesture defects a child hit on 2026-09-07 (a second finger dropping the
// shape, a drop landing away from the green ghost, a grab cell computed at the
// wrong scale, a cancelled touch freezing the drag, a refused drop blanking the
// bank) and green since those were fixed. Real ShapeItem, no mock: the tray
// renders 36px cells and the geometry bug hid behind a 48px stub.
//
// ⚠️ This file's board stub had itself drifted. Its `cellCentre` measured the
// content box from the 8px padding alone, ignoring the 2.5px border the DOM
// also insets by, and it sized the board 428px instead of 433 — so every
// "centre of a cell" here was 2.5px up and to the left of the real one. Nothing
// failed, because 2.5px of a 52px pitch never crosses a rounding boundary: a
// stale geometry constant does not break a test, it quietly re-points it at a
// board that does not exist. The geometry now comes from dragTestKit, derived
// from types.ts, and the assertions below are unchanged.
// ============================================================
import { fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { GameShape } from './types';
import type { PlaceShape } from './useShapeDrag';
import {
    BAR_H,
    BLOCK_2X2,
    BOARD_LEFT,
    BOARD_SIZE,
    BOARD_TOP,
    TRAY_CELL,
    TRAY_LEFT,
    TRAY_TOP,
    cellCentre,
    dragProxy,
    draggableItem,
    rect,
    renderCanvas,
    stateWith,
    stubItemRect,
} from './dragTestKit';

function setup(shape: GameShape, placeShape: PlaceShape = vi.fn().mockReturnValue(true)) {
    const { container, getByTestId } = renderCanvas(stateWith(shape), placeShape);

    const board = getByTestId('blocks-grid');
    board.getBoundingClientRect = () => rect(BOARD_LEFT, BOARD_TOP, BOARD_SIZE, BOARD_SIZE);

    // The tray renders 36px cells with a 1.5px gap — the scale the grab must be
    // divided by, and the one the wrong-cell-size defect got wrong.
    const item = draggableItem(container);
    stubItemRect(item, shape, TRAY_CELL, TRAY_LEFT, TRAY_TOP);

    const proxy = () => dragProxy(container);
    return { container, item, placeShape, proxy };
}

describe('BlocksCanvas gesture contract', () => {
    beforeEach(() => vi.clearAllMocks());

    it('grab cell is derived from the cell size the tray actually renders (36px), not the 48px board size', () => {
        const { item, placeShape } = setup(BAR_H);

        // Finger lands 140px into a 148.5px-wide bar: the 4th cell (index 3).
        // With a 48px divisor the code decides it was the 3rd cell (index 2).
        fireEvent.pointerDown(item, { clientX: TRAY_LEFT + 140, clientY: TRAY_TOP + 18, pointerId: 1 });
        fireEvent.pointerMove(window, { ...cellCentre(2, 5), pointerId: 1 });
        fireEvent.pointerUp(window, { ...cellCentre(2, 5), pointerId: 1 });

        // Grabbed by cell 3, dropped with that cell over column 5 ⇒ anchor column 2.
        expect(placeShape).toHaveBeenCalledWith(expect.objectContaining({ id: 'bar-h' }), 2, 2, 'standard', 0);
    });

    it('a pointerup from a different pointer (second finger, palm) does not drop the shape', () => {
        const { item, placeShape, proxy } = setup(BLOCK_2X2);

        fireEvent.pointerDown(item, { clientX: TRAY_LEFT + 10, clientY: TRAY_TOP + 10, pointerId: 1 });
        expect(proxy()).not.toBeNull();

        fireEvent.pointerUp(window, { ...cellCentre(2, 2), pointerId: 2 });

        expect(placeShape).not.toHaveBeenCalled();
        expect(proxy()).not.toBeNull(); // finger 1 is still dragging
    });

    it('pointermove from a different pointer does not steer the dragged shape', () => {
        const { item, proxy } = setup(BLOCK_2X2);

        fireEvent.pointerDown(item, { clientX: TRAY_LEFT + 10, clientY: TRAY_TOP + 10, pointerId: 1 });
        fireEvent.pointerMove(window, { ...cellCentre(1, 1), pointerId: 1 });
        const underFinger1 = proxy()!.style.transform;

        fireEvent.pointerMove(window, { ...cellCentre(5, 5), pointerId: 2 }); // palm

        expect(proxy()!.style.transform).toBe(underFinger1);
    });

    it('drops the shape where the projection was last shown, not where the finger happened to lift', () => {
        const { item, placeShape } = setup(BLOCK_2X2);

        fireEvent.pointerDown(item, { clientX: TRAY_LEFT + 10, clientY: TRAY_TOP + 10, pointerId: 1 });
        fireEvent.pointerMove(window, { ...cellCentre(2, 2), pointerId: 1 });
        // The green ghost is at (2,2). The lift registers one cell away (finger roll,
        // coalesced moves, or a frame of React latency on the ghost).
        fireEvent.pointerUp(window, { ...cellCentre(3, 3), pointerId: 1 });

        expect(placeShape).toHaveBeenCalledWith(expect.anything(), 2, 2, 'standard', 0);
    });

    it('pointercancel ends the drag: proxy unmounts and the tray shape is visible again', () => {
        const { item, placeShape, proxy } = setup(BLOCK_2X2);

        fireEvent.pointerDown(item, { clientX: TRAY_LEFT + 10, clientY: TRAY_TOP + 10, pointerId: 1 });
        expect(proxy()).not.toBeNull();

        fireEvent.pointerCancel(window, { clientX: 0, clientY: 0, pointerId: 1 });

        expect(proxy()).toBeNull();
        expect(item.style.opacity).toBe('1');
        expect(placeShape).not.toHaveBeenCalled();
    });

    it('a rejected drop leaves the tray shape visible instead of blanking it for 250ms', () => {
        const rejecting = vi.fn().mockReturnValue(false);
        const { item } = setup(BLOCK_2X2, rejecting);

        fireEvent.pointerDown(item, { clientX: TRAY_LEFT + 10, clientY: TRAY_TOP + 10, pointerId: 1 });
        fireEvent.pointerMove(window, { ...cellCentre(2, 2), pointerId: 1 });
        fireEvent.pointerUp(window, { ...cellCentre(2, 2), pointerId: 1 });

        expect(rejecting).toHaveBeenCalled();
        expect(item.style.opacity).toBe('1');
    });
});
