// ============================================================
// Drag contract, second half. BlocksCanvas.gesture-defects.test.tsx covers the
// six defects found on the child's touchscreen; this file covers the rules
// around them that nothing else asserts: the board's 2.5px border, the rescue
// slot's 22px cells, a refused second grab, and tap-to-return.
//
// The old version of this file mocked ShapeItem at a 48px pitch, which is
// exactly what hid the wrong-cell-size defect. It now renders the real one.
//
// Setup comes from dragTestKit — board geometry derived from types.ts, cell
// sizes from the slot components themselves.
// ============================================================
import { fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { BlocksGameState } from './types';
import type { PlaceShape } from './useShapeDrag';
import {
    BAR_H,
    BLOCK_2X2,
    BOARD_LEFT,
    BOARD_SIZE,
    BOARD_TOP,
    DOT,
    RESCUE_CELL,
    TRAY_CELL,
    TRAY_LEFT,
    TRAY_SLOT_SPACING,
    TRAY_TOP,
    cellCentre,
    dragProxy,
    draggableItems,
    grabCorner,
    rect,
    renderCanvas,
    stateWith,
    stubItemRect,
} from './dragTestKit';

function setup(gameState: BlocksGameState, placeShape: PlaceShape = vi.fn().mockReturnValue(true)) {
    const { container, getByTestId } = renderCanvas(gameState, placeShape);

    const board = getByTestId('blocks-grid');
    board.getBoundingClientRect = () => rect(BOARD_LEFT, BOARD_TOP, BOARD_SIZE, BOARD_SIZE);

    const items = draggableItems(container);
    const proxy = () => dragProxy(container);
    return { container, items, placeShape, proxy };
}

describe('BlocksCanvas drag geometry and gesture ownership', () => {
    beforeEach(() => vi.clearAllMocks());

    it("places on the cell the child sees: the board's 2.5px border shifts every cell", () => {
        const { items, placeShape } = setup(stateWith(BLOCK_2X2));
        stubItemRect(items[0], BLOCK_2X2, TRAY_CELL, TRAY_LEFT, TRAY_TOP);

        fireEvent.pointerDown(items[0], grabCorner(1));

        // 59px into the border box puts the shape's top-left 24.5px into the
        // content box — 0.47 of a cell, so it rounds onto cell 0. Content starts
        // at 2.5 + 8 = 10.5; ignoring the 2.5px border reads it as 0.52 → cell 1.
        const inFirstCell = { clientX: BOARD_LEFT + 59, clientY: BOARD_TOP + 59, pointerId: 1 };
        fireEvent.pointerMove(window, inFirstCell);
        fireEvent.pointerUp(window, inFirstCell);

        expect(placeShape).toHaveBeenCalledWith(expect.objectContaining({ id: 'block-2x2' }), 0, 0, 'standard', 0);
    });

    it('lands on the cell the shape most overlaps, so the 4px gutter reads as the next cell', () => {
        // The anchor comes from the shape's own position now, not from which cell
        // the finger is inside. Sitting 50.5px into the content box, the shape
        // covers 21.5px of cell 0 and 22.5px of cell 1 — so cell 1 wins. The old
        // finger-based rule floored the pitch and lumped the gutter into cell 0.
        const { items, placeShape } = setup(stateWith(BLOCK_2X2));
        stubItemRect(items[0], BLOCK_2X2, TRAY_CELL, TRAY_LEFT, TRAY_TOP);

        fireEvent.pointerDown(items[0], grabCorner(1));
        const inGutter = { clientX: BOARD_LEFT + 61, clientY: BOARD_TOP + 61, pointerId: 1 };
        fireEvent.pointerMove(window, inGutter);
        fireEvent.pointerUp(window, inGutter);

        expect(placeShape).toHaveBeenCalledWith(expect.objectContaining({ id: 'block-2x2' }), 1, 1, 'standard', 0);
    });

    it('derives the grab cell from the rescue slot\'s 22px cells, not the tray\'s 36px', () => {
        const { items, placeShape } = setup(stateWith(BAR_H, {
            standardShapes: [null, null, null],
            rescueShape: BAR_H,
            rescueShapeLocked: false,
        }));
        stubItemRect(items[0], BAR_H, RESCUE_CELL, TRAY_LEFT, TRAY_TOP);

        // 55px into a 22px/1.5px-gap bar is the third cell (pitch 23.5 → index 2).
        fireEvent.pointerDown(items[0], { clientX: TRAY_LEFT + 55, clientY: TRAY_TOP + 8, pointerId: 1 });
        fireEvent.pointerMove(window, { ...cellCentre(4, 5), pointerId: 1 });
        fireEvent.pointerUp(window, { ...cellCentre(4, 5), pointerId: 1 });

        expect(placeShape).toHaveBeenCalledWith(expect.objectContaining({ id: 'bar-h' }), 3, 4, 'rescue', 0);
    });

    it('refuses a second grab while a drag is live', () => {
        const { items, placeShape } = setup(stateWith(BLOCK_2X2, { standardShapes: [BLOCK_2X2, DOT, null] }));
        stubItemRect(items[0], BLOCK_2X2, TRAY_CELL, TRAY_LEFT, TRAY_TOP);
        stubItemRect(items[1], DOT, TRAY_CELL, TRAY_LEFT + TRAY_SLOT_SPACING, TRAY_TOP);

        fireEvent.pointerDown(items[0], grabCorner(1));
        fireEvent.pointerDown(items[1], grabCorner(2, { slot: 1 }));

        // Only the first slot is masked — the second finger started nothing.
        expect(items[0].style.opacity).toBe('0');
        expect(items[1].style.opacity).toBe('1');

        fireEvent.pointerMove(window, { ...cellCentre(1, 1), pointerId: 1 });
        fireEvent.pointerUp(window, { ...cellCentre(1, 1), pointerId: 1 });

        expect(placeShape).toHaveBeenCalledTimes(1);
        expect(placeShape).toHaveBeenCalledWith(expect.objectContaining({ id: 'block-2x2' }), 1, 1, 'standard', 0);
    });

    it('ignores a pointercancel from another pointer — Windows palm rejection cancels the palm, not the drag', () => {
        const { items, placeShape, proxy } = setup(stateWith(BLOCK_2X2));
        stubItemRect(items[0], BLOCK_2X2, TRAY_CELL, TRAY_LEFT, TRAY_TOP);

        fireEvent.pointerDown(items[0], grabCorner(1));
        fireEvent.pointerMove(window, { ...cellCentre(2, 2), pointerId: 1 });
        fireEvent.pointerCancel(window, { clientX: 0, clientY: 0, pointerId: 2 });

        expect(proxy()).not.toBeNull();

        fireEvent.pointerUp(window, { ...cellCentre(2, 2), pointerId: 1 });
        expect(placeShape).toHaveBeenCalledWith(expect.anything(), 2, 2, 'standard', 0);
    });

    it('returns the shape to the bank on a tap with no movement', () => {
        const { items, placeShape, proxy } = setup(stateWith(BLOCK_2X2));
        stubItemRect(items[0], BLOCK_2X2, TRAY_CELL, TRAY_LEFT, TRAY_TOP);

        const tap = grabCorner(1);
        fireEvent.pointerDown(items[0], tap);
        fireEvent.pointerUp(window, tap);

        expect(placeShape).not.toHaveBeenCalled();
        expect(proxy()).toBeNull();
        expect(items[0].style.opacity).toBe('1');
    });
});
