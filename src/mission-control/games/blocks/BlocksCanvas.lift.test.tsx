// ============================================================
// Group B: the shape is lifted clear of the hand on touch, the ghost follows
// the SHAPE instead of the fingertip, forgiveness snapping is bounded, and a
// stranded drag cannot dead-lock the game. Written against the real ShapeItem
// and the real board geometry — a stubbed pitch is what hid the last defect.
//
// Setup comes from dragTestKit, so "the real board geometry" is derived from
// types.ts rather than restated here.
// ============================================================
import { within, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { BlocksGameState } from './types';
import type { PlaceShape } from './useShapeDrag';
import { TOUCH_LIFT_PX } from './dragGeometry';
import {
    BLOCK_2X2,
    BOARD_BOTTOM,
    BOARD_LEFT,
    BOARD_SIZE,
    BOARD_TOP,
    DOT,
    HALF_CELL,
    PITCH,
    TRAY_CELL,
    TRAY_LEFT,
    TRAY_SLOT_SPACING,
    TRAY_TOP,
    blockedGrid,
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
    const { container } = renderCanvas(gameState, placeShape);

    // Two boards can be on screen at once (the mouse/touch pair below), so every
    // query is scoped to this render's own container.
    const scoped = within(container);
    const board = scoped.getByTestId('blocks-grid');
    board.getBoundingClientRect = () => rect(BOARD_LEFT, BOARD_TOP, BOARD_SIZE, BOARD_SIZE);

    const items = draggableItems(container);
    items.forEach((item, idx) => stubItemRect(item, BLOCK_2X2, TRAY_CELL, TRAY_LEFT + idx * TRAY_SLOT_SPACING, TRAY_TOP));

    const proxy = () => dragProxy(container);
    const ghost = () => scoped.queryByTestId('projection-overlay');
    return { container, items, placeShape, proxy, ghost };
}

describe('the shape is lifted clear of the hand', () => {
    beforeEach(() => vi.clearAllMocks());

    it('floats the shape above the fingertip on touch', () => {
        const { items, proxy } = setup(stateWith(BLOCK_2X2));
        const grab = grabCorner(1, { pointerType: 'touch' });
        fireEvent.pointerDown(items[0], grab);

        const expectedY = grab.clientY - HALF_CELL - TOUCH_LIFT_PX;
        expect(proxy()!.style.transform).toBe(`translate(${grab.clientX - HALF_CELL}px, ${expectedY}px)`);
    });

    it('keeps the shape under the cursor for a mouse', () => {
        const { items, proxy } = setup(stateWith(BLOCK_2X2));
        const grab = grabCorner(1, { pointerType: 'mouse' });
        fireEvent.pointerDown(items[0], grab);

        expect(proxy()!.style.transform)
            .toBe(`translate(${grab.clientX - HALF_CELL}px, ${grab.clientY - HALF_CELL}px)`);
    });

    it('lifts on every move, not just at pickup, and never sideways', () => {
        const { items, proxy } = setup(stateWith(BLOCK_2X2));
        fireEvent.pointerDown(items[0], grabCorner(1, { pointerType: 'touch' }));

        fireEvent.pointerMove(window, { clientX: 300, clientY: 400, pointerId: 1, pointerType: 'touch' });

        expect(proxy()!.style.transform)
            .toBe(`translate(${300 - HALF_CELL}px, ${400 - HALF_CELL - TOUCH_LIFT_PX}px)`);
    });
});

describe('the projection follows the shape, not the fingertip', () => {
    beforeEach(() => vi.clearAllMocks());

    it('places from the lifted shape while the finger is still below the board', () => {
        const { items, placeShape } = setup(stateWith(BLOCK_2X2));
        fireEvent.pointerDown(items[0], grabCorner(1, { pointerType: 'touch' }));

        // Finger 12px BELOW the bottom edge of the board. The lifted shape sits
        // on rows 6-7; under the old fingertip rule this was a return-to-bank.
        const finger = { clientX: cellCentre(0, 3).clientX, clientY: BOARD_BOTTOM + 12, pointerId: 1, pointerType: 'touch' };
        expect(finger.clientY).toBeGreaterThan(BOARD_BOTTOM);

        fireEvent.pointerMove(window, finger);
        fireEvent.pointerUp(window, finger);

        expect(placeShape).toHaveBeenCalledWith(expect.objectContaining({ id: 'block-2x2' }), 3, 6, 'standard', 0);
    });

    it('ignores which cell the finger is over — the same finger position places differently once lifted', () => {
        // 0.3 of a cell past row 4's edge, so neither reading sits on a rounding
        // boundary: the mouse shape is at 4.3, the lifted touch shape at 2.8.
        const finger = cellCentre(4, 4);
        finger.clientY += 0.3 * PITCH;

        const mouse = setup(stateWith(BLOCK_2X2));
        fireEvent.pointerDown(mouse.items[0], grabCorner(1, { pointerType: 'mouse' }));
        fireEvent.pointerMove(window, { ...finger, pointerId: 1, pointerType: 'mouse' });
        fireEvent.pointerUp(window, { ...finger, pointerId: 1, pointerType: 'mouse' });
        expect(mouse.placeShape).toHaveBeenCalledWith(expect.anything(), 4, 4, 'standard', 0);

        const touch = setup(stateWith(BLOCK_2X2));
        fireEvent.pointerDown(touch.items[0], grabCorner(1, { pointerType: 'touch' }));
        fireEvent.pointerMove(window, { ...finger, pointerId: 1, pointerType: 'touch' });
        fireEvent.pointerUp(window, { ...finger, pointerId: 1, pointerType: 'touch' });
        // The shape is 1.5 cells higher than the finger, so it lands a row up.
        expect(touch.placeShape).toHaveBeenCalledWith(expect.anything(), 4, 3, 'standard', 0);
    });
});

describe('forgiveness snapping is what the child sees', () => {
    beforeEach(() => vi.clearAllMocks());

    it('shows the snapped cell in green and places there', () => {
        const { items, placeShape, ghost } = setup(stateWith(DOT, { grid: blockedGrid([4, 4]) }));
        stubItemRect(items[0], DOT, TRAY_CELL, TRAY_LEFT, TRAY_TOP);
        fireEvent.pointerDown(items[0], grabCorner(1));

        // 0.4 of a cell below the blocked (4,4): inside the forgiveness radius.
        const finger = { ...cellCentre(4, 4), pointerId: 1 };
        finger.clientY += 0.4 * PITCH;
        fireEvent.pointerMove(window, finger);

        const cell = ghost()!.children[0] as HTMLDivElement;
        expect(cell.style.background).toContain('74, 222, 128'); // green
        expect(cell.style.gridRowStart).toBe('6'); // 1-indexed: row 5
        expect(cell.style.gridColumnStart).toBe('5');

        fireEvent.pointerUp(window, finger);
        expect(placeShape).toHaveBeenCalledWith(expect.anything(), 4, 5, 'standard', 0);
    });

    it('shows red at the rounded cell and returns to the bank when nothing valid is in reach', () => {
        const { items, placeShape, ghost } = setup(stateWith(DOT, { grid: blockedGrid([4, 4]) }));
        stubItemRect(items[0], DOT, TRAY_CELL, TRAY_LEFT, TRAY_TOP);
        fireEvent.pointerDown(items[0], grabCorner(1));

        // Squarely on the blocked cell: every free neighbour is a full cell away.
        const finger = { ...cellCentre(4, 4), pointerId: 1 };
        fireEvent.pointerMove(window, finger);

        const cell = ghost()!.children[0] as HTMLDivElement;
        expect(cell.style.background).toContain('239, 68, 68'); // red
        expect(cell.style.gridRowStart).toBe('5');

        fireEvent.pointerUp(window, finger);
        expect(placeShape).not.toHaveBeenCalled();
        expect(items[0].style.opacity).toBe('1'); // back in the bank
    });
});

describe('a stranded drag cannot dead-lock the game', () => {
    beforeEach(() => vi.clearAllMocks());

    it('window blur ends the drag and frees the next grab', () => {
        const { items, placeShape, proxy } = setup(stateWith(BLOCK_2X2, { standardShapes: [BLOCK_2X2, DOT, null] }));
        stubItemRect(items[1], DOT, TRAY_CELL, TRAY_LEFT + TRAY_SLOT_SPACING, TRAY_TOP);

        fireEvent.pointerDown(items[0], grabCorner(1, { pointerType: 'touch' }));
        fireEvent.pointerMove(window, { ...cellCentre(2, 2), pointerId: 1, pointerType: 'touch' });

        act(() => { window.dispatchEvent(new Event('blur')); });

        expect(proxy()).toBeNull();
        expect(items[0].style.opacity).toBe('1');
        expect(placeShape).not.toHaveBeenCalled();

        // A different finger can grab again — without the valve this is refused forever.
        fireEvent.pointerDown(items[1], grabCorner(7, { slot: 1, pointerType: 'touch' }));
        expect(proxy()).not.toBeNull();
        expect(items[1].style.opacity).toBe('0');
    });

    it('hiding the window ends the drag too', () => {
        const { items, proxy } = setup(stateWith(BLOCK_2X2));
        fireEvent.pointerDown(items[0], grabCorner(1, { pointerType: 'touch' }));

        const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
        act(() => { document.dispatchEvent(new Event('visibilitychange')); });
        visibility.mockRestore();

        expect(proxy()).toBeNull();
    });

    it('a pointerdown from the SAME pointer reclaims a drag whose pointerup was lost', () => {
        const { items, placeShape, proxy } = setup(stateWith(BLOCK_2X2, { standardShapes: [BLOCK_2X2, DOT, null] }));
        stubItemRect(items[1], DOT, TRAY_CELL, TRAY_LEFT + TRAY_SLOT_SPACING, TRAY_TOP);

        // The mouse is released outside the window: no pointerup ever arrives.
        fireEvent.pointerDown(items[0], grabCorner(1, { pointerType: 'mouse' }));
        fireEvent.pointerMove(window, { ...cellCentre(2, 2), pointerId: 1, pointerType: 'mouse' });

        // Same pointerId cannot be down twice, so the old drag is provably over.
        fireEvent.pointerDown(items[1], grabCorner(1, { slot: 1, pointerType: 'mouse' }));
        expect(proxy()).not.toBeNull();
        expect(items[1].style.opacity).toBe('0');
        expect(items[0].style.opacity).toBe('1');

        const drop = { ...cellCentre(5, 5), pointerId: 1, pointerType: 'mouse' };
        fireEvent.pointerMove(window, drop);
        fireEvent.pointerUp(window, drop);

        expect(placeShape).toHaveBeenCalledTimes(1);
        expect(placeShape).toHaveBeenCalledWith(expect.objectContaining({ id: 'dot' }), 5, 5, 'standard', 1);
    });

    it('still refuses a second finger while the first is genuinely dragging', () => {
        const { items, proxy } = setup(stateWith(BLOCK_2X2, { standardShapes: [BLOCK_2X2, DOT, null] }));
        stubItemRect(items[1], DOT, TRAY_CELL, TRAY_LEFT + TRAY_SLOT_SPACING, TRAY_TOP);

        fireEvent.pointerDown(items[0], grabCorner(1, { pointerType: 'touch' }));
        const first = proxy()!.style.transform;

        fireEvent.pointerDown(items[1], grabCorner(2, { slot: 1, pointerType: 'touch' }));

        expect(items[1].style.opacity).toBe('1');
        expect(proxy()!.style.transform).toBe(first);
    });
});
