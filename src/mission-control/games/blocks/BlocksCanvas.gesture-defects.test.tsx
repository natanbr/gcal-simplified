// ============================================================
// The touchscreen drag contract for Space Rescue. Written RED against the six
// gesture defects a child hit on 2026-09-07 (a second finger dropping the
// shape, a drop landing away from the green ghost, a grab cell computed at the
// wrong scale, a cancelled touch freezing the drag, a refused drop blanking the
// bank) and green since those were fixed. Real ShapeItem, no mock: the tray
// renders 36px cells and the geometry bug hid behind a 48px stub.
//
// The two drop tests aim OFF_CENTRE on purpose; see its note before changing
// any coordinate here.
//
// A test runs as touch when its defect only exists on a touchscreen (a second
// finger or palm, an OS-cancelled touch, finger roll on release) or when its
// expected anchor is reached through the lift (the grab-cell scale). Where a
// shape is dropped, the finger aims with fingerBelow, OFF_CENTRE included. The
// rejected drop is neither — a refusal unmasks the slot the same way for any
// pointer — so it stays on the unlifted path.
// ============================================================
import { fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { GameShape } from './types';
import type { PlaceShape } from './useShapeDrag';
import {
    BAR_H,
    BLOCK_2X2,
    CANVAS_SUITE_TIMEOUT_MS,
    TRAY_LEFT,
    TRAY_TOP,
    cellCentre,
    draggableItem,
    fingerBelow,
    renderCanvas,
    stateWith,
} from './dragTestKit';

vi.setConfig({ testTimeout: CANVAS_SUITE_TIMEOUT_MS });

/**
 * How far past an anchor the drop tests aim, in cells. At a whole cell, a
 * floored snap and a grab offset by a whole cell instead of half both still land
 * on the expected anchor; at three quarters, both move it a full cell, and the
 * rounding boundary is a quarter-cell away. The opposite centring error — the
 * half-cell offset dropped altogether — moves the shape toward the next cell and
 * cannot be caught from here: dragGeometry's proxyOrigin tests and the lift
 * suite's transform strings own it. Verified by mutation.
 */
const OFF_CENTRE = 0.75;

/** The tray passes its 36px cell size to the drag; useShapeDrag adds the 1.5px
 *  SHAPE_ITEM_GAP itself. That 37.5px pitch is what the first test pins. */
function setup(shape: GameShape, rejecting?: PlaceShape) {
    const { container, placeShape, proxy } = renderCanvas(stateWith(shape), rejecting);
    return { item: draggableItem(container), placeShape, proxy };
}

describe('BlocksCanvas gesture contract', () => {
    beforeEach(() => vi.clearAllMocks());

    it('grab cell is derived from the cell size the tray actually renders (36px), not the 48px board size', () => {
        const { item, placeShape } = setup(BAR_H);

        // Finger lands 140px into a 148.5px-wide bar: the 4th cell (index 3).
        // With a 48px divisor the code decides it was the 3rd cell (index 2).
        fireEvent.pointerDown(item, { clientX: TRAY_LEFT + 140, clientY: TRAY_TOP + 18, pointerId: 1, pointerType: 'touch' });
        const drop = { ...fingerBelow(1 + OFF_CENTRE, 4 + OFF_CENTRE), pointerId: 1, pointerType: 'touch' };
        fireEvent.pointerMove(window, drop);
        fireEvent.pointerUp(window, drop);

        // Grabbed by cell 3 and dropped with that cell three quarters onto column 5,
        // so the bar's corner is at column 1.75 ⇒ anchor column 2. A 48px divisor
        // grabs cell 2 instead ⇒ corner at 2.75 ⇒ column 3.
        expect(placeShape).toHaveBeenCalledWith(expect.objectContaining({ id: 'bar-h' }), 2, 2, 'standard', 0);
    });

    it('a pointerup from a different pointer (second finger, palm) does not drop the shape', () => {
        const { item, placeShape, proxy } = setup(BLOCK_2X2);

        // Touch for both: only a touchscreen has a second finger or a palm.
        fireEvent.pointerDown(item, { clientX: TRAY_LEFT + 10, clientY: TRAY_TOP + 10, pointerId: 1, pointerType: 'touch' });
        expect(proxy()).not.toBeNull();

        fireEvent.pointerUp(window, { ...cellCentre(2, 2), pointerId: 2, pointerType: 'touch' });

        expect(placeShape).not.toHaveBeenCalled();
        expect(proxy()).not.toBeNull(); // finger 1 is still dragging
    });

    it('pointermove from a different pointer does not steer the dragged shape', () => {
        const { item, proxy } = setup(BLOCK_2X2);

        // Touch for both. The comparison is before/after on the same lifted
        // proxy, so the lift cancels out of it.
        fireEvent.pointerDown(item, { clientX: TRAY_LEFT + 10, clientY: TRAY_TOP + 10, pointerId: 1, pointerType: 'touch' });
        fireEvent.pointerMove(window, { ...fingerBelow(1, 1), pointerId: 1, pointerType: 'touch' });
        const underFinger1 = proxy()!.style.transform;

        fireEvent.pointerMove(window, { ...cellCentre(5, 5), pointerId: 2, pointerType: 'touch' }); // palm

        expect(proxy()!.style.transform).toBe(underFinger1);
    });

    it('drops the shape where the projection was last shown, not where the finger happened to lift', () => {
        const { item, placeShape } = setup(BLOCK_2X2);

        // Touch — finger roll on release is a fingertip thing.
        fireEvent.pointerDown(item, { clientX: TRAY_LEFT + 10, clientY: TRAY_TOP + 10, pointerId: 1, pointerType: 'touch' });
        fireEvent.pointerMove(window, { ...fingerBelow(1 + OFF_CENTRE, 1 + OFF_CENTRE), pointerId: 1, pointerType: 'touch' });
        // The green ghost is at (2,2): the shape sits three quarters of the way onto
        // it. The release registers one cell away (finger roll, coalesced moves, or a
        // frame of React latency on the ghost).
        fireEvent.pointerUp(window, { ...fingerBelow(3, 3), pointerId: 1, pointerType: 'touch' });

        expect(placeShape).toHaveBeenCalledWith(expect.anything(), 2, 2, 'standard', 0);
    });

    it('pointercancel ends the drag: proxy unmounts and the tray shape is visible again', () => {
        const { item, placeShape, proxy } = setup(BLOCK_2X2);

        // Touch: the OS cancels a touch it takes over (edge swipe, palm rejection).
        fireEvent.pointerDown(item, { clientX: TRAY_LEFT + 10, clientY: TRAY_TOP + 10, pointerId: 1, pointerType: 'touch' });
        expect(proxy()).not.toBeNull();

        fireEvent.pointerCancel(window, { clientX: 0, clientY: 0, pointerId: 1, pointerType: 'touch' });

        expect(proxy()).toBeNull();
        expect(item.style.opacity).toBe('1');
        expect(placeShape).not.toHaveBeenCalled();
    });

    it('a rejected drop leaves the tray shape visible instead of blanking it for 250ms', () => {
        const rejecting = vi.fn().mockReturnValue(false);
        const { item } = setup(BLOCK_2X2, rejecting);

        // Unlifted on purpose — see the header.
        fireEvent.pointerDown(item, { clientX: TRAY_LEFT + 10, clientY: TRAY_TOP + 10, pointerId: 1 });
        fireEvent.pointerMove(window, { ...cellCentre(2, 2), pointerId: 1 });
        fireEvent.pointerUp(window, { ...cellCentre(2, 2), pointerId: 1 });

        expect(rejecting).toHaveBeenCalled();
        expect(item.style.opacity).toBe('1');
    });
});
