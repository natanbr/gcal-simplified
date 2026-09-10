// ============================================================
// Holes the other drag tests cannot catch. Each was found by mutating
// useShapeDrag.ts and watching the rest of the blocks suite stay green:
//
//  1. Every integration test elsewhere is `down → one move → up`, so freezing
//     the projection after the FIRST move survives the whole suite. That leaves
//     the spec's safety valve for forgiveness snapping — "computed continuously
//     while the finger is down… a snap the child does not want can be corrected
//     by moving" — unpinned in both directions: a bad snap that cannot be
//     corrected, and a stale green ghost that places after the shape has been
//     moved onto a blocked cell. The second is the "never lands somewhere he
//     did not see" rule failing in the most dangerous direction.
//  1b. The same rule when the BOARD moves instead of the finger: the 1200ms
//     line-clear timer can drop a meteor under a still, green ghost.
//  2. `measureBoardOrigin` reads the board's computed style, which jsdom DOES
//     populate from the inline `border`/`padding` — and to exactly the declared
//     10.5px, so the measured and fallback branches agree by default and every
//     other test passes through either one. Both branches are forced apart here.
//     The regression test alongside them pins the reason it is computed style
//     and not the first cell's rect: that rect carries the explosion transform.
//  3. Nothing asserted the window listeners are released when the game closes
//     mid-drag. A leaked `pointerup` places a shape into an unmounted game.
//
// Shared setup lives in dragTestKit; what is deliberately local below is the
// computed-style stub and the two hand-built finger positions, because their
// literal pixel values ARE the subject of the tests that use them.
// ============================================================
import { within, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { BlocksGameState } from './types';
import type { PlaceShape } from './useShapeDrag';
import { BOARD_PADDING } from './types';
import { TOUCH_LIFT_PX } from './dragGeometry';
import {
    BOARD_LEFT,
    BOARD_SIZE,
    BOARD_TOP,
    DOT,
    HALF_CELL,
    PITCH,
    TRAY_CELL,
    TRAY_LEFT,
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
    /** `rerenderWith` re-renders in place, so the rect stubs below survive. */
    const view = renderCanvas(gameState, placeShape);

    const scoped = within(view.container);
    const board = scoped.getByTestId('blocks-grid');
    board.getBoundingClientRect = () => rect(BOARD_LEFT, BOARD_TOP, BOARD_SIZE, BOARD_SIZE);

    const [item] = draggableItems(view.container);
    if (!item) throw new Error('draggable tray item not rendered');
    stubItemRect(item, DOT, TRAY_CELL, TRAY_LEFT, TRAY_TOP);

    /** The one cell the DOT's projection draws, or null when no ghost is shown. */
    const ghostCell = () => (scoped.queryByTestId('projection-overlay')?.children[0] ?? null) as HTMLDivElement | null;
    return { ...view, board, item, placeShape, ghostCell };
}

type BoxModelProperty = 'borderLeftWidth' | 'borderTopWidth' | 'paddingLeft' | 'paddingTop';

/**
 * Overrides the four box-model properties `measureBoardOrigin` reads, for the
 * board element only — Framer's motion components in the rescue slot call
 * getComputedStyle too and must keep the real one.
 *
 * Own data properties shadow the CSSStyleDeclaration accessors, so what comes
 * back is still a genuine computed style rather than a cast-shaped literal.
 * Stubbing `board.style` instead would pass whether the code reads the inline
 * style or the computed one, and would prove less.
 */
function stubComputedBox(board: HTMLElement, overrides: Partial<Record<BoxModelProperty, string>>) {
    const real = window.getComputedStyle.bind(window);
    const seen = { board: false };
    vi.spyOn(window, 'getComputedStyle').mockImplementation((element, pseudo) => {
        const style = real(element, pseudo);
        if (element !== board) return style;
        seen.board = true;
        for (const [property, value] of Object.entries(overrides)) {
            Object.defineProperty(style, property, { value, configurable: true });
        }
        return style;
    });
    return seen;
}

describe('the projection is recomputed on every move, not just the first', () => {
    beforeEach(() => vi.clearAllMocks());

    it('lets the child correct a forgiveness snap by moving on', () => {
        const { item, placeShape, ghostCell } = setup(stateWith(DOT, { grid: blockedGrid([4, 4]) }));
        fireEvent.pointerDown(item, grabCorner(1));

        // 0.4 of a cell below the blocked (4,4): forgiveness snaps it down to
        // (5,4) and shows that in green. The child did not want that cell.
        fireEvent.pointerMove(window, { ...cellCentre(4.4, 4), pointerId: 1 });
        expect(ghostCell()!.style.gridRowStart).toBe('6'); // 1-indexed: row 5
        expect(ghostCell()!.style.gridColumnStart).toBe('5');

        // He moves on to a clear cell. The ghost must follow, and the drop must
        // land there — not on the snap he was shown a moment earlier.
        fireEvent.pointerMove(window, { ...cellCentre(1, 1), pointerId: 1 });
        expect(ghostCell()!.style.gridRowStart).toBe('2');
        expect(ghostCell()!.style.gridColumnStart).toBe('2');

        fireEvent.pointerUp(window, { ...cellCentre(1, 1), pointerId: 1 });
        expect(placeShape).toHaveBeenCalledTimes(1);
        expect(placeShape).toHaveBeenCalledWith(expect.objectContaining({ id: 'dot' }), 1, 1, 'standard', 0);
    });

    it('turns a stale green ghost red when the shape moves onto a blocked cell', () => {
        // The dangerous direction: if the projection stopped updating, the lift
        // would place on the cell the shape has already left.
        const { item, placeShape, ghostCell } = setup(stateWith(DOT, { grid: blockedGrid([4, 4]) }));
        fireEvent.pointerDown(item, grabCorner(1));

        fireEvent.pointerMove(window, { ...cellCentre(1, 1), pointerId: 1 });
        expect(ghostCell()!.style.background).toContain('74, 222, 128'); // green

        // Squarely on the blocked cell — every free neighbour is a full cell
        // away, so nothing is inside the forgiveness radius.
        fireEvent.pointerMove(window, { ...cellCentre(4, 4), pointerId: 1 });
        expect(ghostCell()!.style.background).toContain('239, 68, 68'); // red
        expect(ghostCell()!.style.gridRowStart).toBe('5');

        fireEvent.pointerUp(window, { ...cellCentre(4, 4), pointerId: 1 });
        expect(placeShape).not.toHaveBeenCalled();
        expect(item.style.opacity).toBe('1'); // back in the bank
    });
});

describe('a freshly dealt shape is grabbable the instant it appears', () => {
    beforeEach(() => vi.clearAllMocks());

    it('leaves the slot unmasked after the placement that emptied it', () => {
        // Every third placement empties the last standard slot, and
        // useBlocksGame deals three new shapes in the SAME React commit (React
        // 18 batches the update from a native listener). A success mask keyed on
        // the drag slot therefore hides a shape that is genuinely there.
        const { item, placeShape, rerenderWith, container } = setup(stateWith(DOT));
        fireEvent.pointerDown(item, grabCorner(1));

        const finger = { ...cellCentre(3, 3), pointerId: 1 };
        fireEvent.pointerMove(window, finger);
        fireEvent.pointerUp(window, finger);
        expect(placeShape).toHaveBeenCalledTimes(1);

        act(() => { rerenderWith(stateWith({ ...DOT, id: 'dot-fresh' })); });

        const dealt = draggableItems(container)[0] ?? null;
        expect(dealt, 'the freshly dealt shape did not render at all').not.toBeNull();
        expect(dealt!.style.opacity, 'the new shape is invisible in its slot').toBe('1');
        expect(dealt!.style.pointerEvents).not.toBe('none');

        fireEvent.pointerDown(dealt!, grabCorner(2));
        expect(
            dragProxy(container),
            'the freshly dealt shape could not be picked up',
        ).not.toBeNull();
    });
});

describe('the projection is recomputed when the board changes under a still finger', () => {
    beforeEach(() => vi.clearAllMocks());

    it('turns green red when a meteor lands under the ghost during a line clear', () => {
        // The 1200ms timer in useBlocksGame rewrites the grid after a clear, and
        // spawnObstacles can drop a meteor into the cell a green ghost is
        // already on. The finger never moves, so nothing but a grid-keyed
        // recompute can catch it — and a lift on a stale green ghost is the
        // silent return-to-bank this whole change exists to remove.
        const { item, placeShape, ghostCell, rerenderWith } = setup(stateWith(DOT));
        fireEvent.pointerDown(item, grabCorner(1));

        // Squarely on cell (3,3): no fractional offset, so forgiveness snapping
        // cannot quietly rescue the projection onto a neighbour once it blocks.
        const finger = { ...cellCentre(3, 3), pointerId: 1 };
        fireEvent.pointerMove(window, finger);
        expect(ghostCell()!.style.background).toContain('74, 222, 128'); // green

        const withMeteor = blockedGrid();
        withMeteor[3][3] = 2; // meteor
        act(() => { rerenderWith(stateWith(DOT, { grid: withMeteor })); });

        expect(ghostCell()!.style.background).toContain('239, 68, 68'); // red
        expect(ghostCell()!.style.gridRowStart).toBe('4');

        fireEvent.pointerUp(window, finger);
        expect(placeShape).not.toHaveBeenCalled();
        expect(item.style.opacity).toBe('1'); // back in the bank
    });
});

describe('the board origin is measured from the board box model, not assumed', () => {
    beforeEach(() => vi.clearAllMocks());
    afterEach(() => vi.restoreAllMocks()); // clearAllMocks does NOT undo a spy

    /**
     * Sits exactly 1.5 cells past the SNAPPED first cell — border box 10 + 2px
     * border + 8px padding = 20 — so the measured branch rounds to cell 2. The
     * declared 2.5px border puts the same finger at 1.49, which rounds to 1.
     * That half a pixel is the entire reason the inset is read rather than
     * computed from the constants.
     *
     * The 2 is a literal on purpose: it is the SNAPPED border this test stubs,
     * which by definition has no constant. Only the padding, which the stub
     * leaves alone, comes from types.ts.
     */
    const SNAPPED_FINGER = {
        clientX: BOARD_LEFT + 2 + BOARD_PADDING + 1.5 * PITCH + HALF_CELL,
        clientY: BOARD_TOP + 2 + BOARD_PADDING + 1.5 * PITCH + HALF_CELL,
        pointerId: 1,
    };

    /**
     * The same SHAPE position as SNAPPED_FINGER, reached by a finger instead of
     * a mouse. On touch the shape floats TOUCH_LIFT_PX above the fingertip, so
     * the finger has to be exactly that much lower for the shape's top-left to
     * land in the same place — which cancels out, whatever the lift is retuned
     * to (dragGeometry.test.ts deliberately refuses to pin its value):
     *
     *   proxyOrigin.y = clientY − grabRow·PITCH − CELL_DISPLAY_SIZE/2 − lift
     *                 = (SNAPPED_FINGER.clientY + lift) − 0 − 24 − lift
     *                 = SNAPPED_FINGER.clientY − 24 = 98      ← the mouse case exactly
     *
     * Three readings of that one shape position land a whole cell apart, so
     * this test is not a restatement of the mouse pair above:
     *   measured inset (2px border + 8 padding → 20)  → (98 − 20)/52   = 1.5    → cell 2 ✔
     *   declared inset (2.5 + 8 → 20.5)               → (98 − 20.5)/52 = 1.4904 → cell 1
     *   lift dropped on touch (origin.y = 200 − 24)   → (176 − 20)/52  = 3.0    → cell 3
     *                                                   (at today's 1.5-cell lift)
     */
    const SNAPPED_TOUCH = {
        clientX: SNAPPED_FINGER.clientX,
        clientY: SNAPPED_FINGER.clientY + TOUCH_LIFT_PX,
        pointerId: 1,
        pointerType: 'touch',
    };

    it('uses the inset computed style reports, not the declared constant', () => {
        // Chromium reports the declared 2.5px border as its snapped used value
        // ("2px" at DPR 1, different again at the 125%/150% scaling common on
        // Windows touch displays). That is where the first cell really starts.
        const { board, item, placeShape } = setup(stateWith(DOT));
        const seen = stubComputedBox(board, { borderLeftWidth: '2px', borderTopWidth: '2px' });

        fireEvent.pointerDown(item, grabCorner(1));
        fireEvent.pointerMove(window, SNAPPED_FINGER);
        fireEvent.pointerUp(window, SNAPPED_FINGER);

        expect(seen.board, 'measureBoardOrigin never asked the board for its computed style').toBe(true);
        expect(
            placeShape,
            'Placed on the constant-inset cell — the computed border width was ignored.',
        ).toHaveBeenCalledWith(expect.objectContaining({ id: 'dot' }), 2, 2, 'standard', 0);
    });

    it('falls back to the declared inset when there is no box model to read', () => {
        // A computed style that reports nothing — parseFloat('') is NaN, so the
        // constant has to take over. Same finger as above, the other branch, so
        // neither test can pass by the two branches agreeing.
        const { board, item, placeShape } = setup(stateWith(DOT));
        const seen = stubComputedBox(board, {
            borderLeftWidth: '', borderTopWidth: '', paddingLeft: '', paddingTop: '',
        });

        fireEvent.pointerDown(item, grabCorner(1));
        fireEvent.pointerMove(window, SNAPPED_FINGER);
        fireEvent.pointerUp(window, SNAPPED_FINGER);

        expect(seen.board).toBe(true);
        expect(placeShape).toHaveBeenCalledWith(expect.anything(), 1, 1, 'standard', 0);
    });

    it('reads the computed inset on the TOUCH path too, where the shape is lifted', () => {
        // The child's device is a Windows touchscreen, so pointerType is
        // 'touch' for every drag it will ever see. The two tests above run the
        // mouse branch (lift = 0), so the measured origin and the lift had
        // never been exercised together: a lift applied to the raw board rect
        // instead of the measured first cell, or dropped for a lifted drag,
        // passes both of them.
        const { board, item, placeShape } = setup(stateWith(DOT));
        const seen = stubComputedBox(board, { borderLeftWidth: '2px', borderTopWidth: '2px' });

        fireEvent.pointerDown(item, grabCorner(1, { pointerType: 'touch' }));
        fireEvent.pointerMove(window, SNAPPED_TOUCH);
        fireEvent.pointerUp(window, SNAPPED_TOUCH);

        expect(seen.board, 'measureBoardOrigin never asked the board for its computed style').toBe(true);
        expect(
            placeShape,
            'Row 1 means the declared inset won; row 3 means the touch lift was dropped.',
        ).toHaveBeenCalledWith(expect.objectContaining({ id: 'dot' }), 2, 2, 'standard', 0);
    });

    it('falls back to the declared inset on the touch path as well', () => {
        // The other branch under the same lift, so neither touch test can pass
        // by the two insets happening to agree.
        const { board, item, placeShape } = setup(stateWith(DOT));
        const seen = stubComputedBox(board, {
            borderLeftWidth: '', borderTopWidth: '', paddingLeft: '', paddingTop: '',
        });

        fireEvent.pointerDown(item, grabCorner(1, { pointerType: 'touch' }));
        fireEvent.pointerMove(window, SNAPPED_TOUCH);
        fireEvent.pointerUp(window, SNAPPED_TOUCH);

        expect(seen.board).toBe(true);
        expect(placeShape).toHaveBeenCalledWith(expect.anything(), 1, 1, 'standard', 0);
    });

    it('ignores the first cell rect, which is mid-explosion exactly when the next piece is grabbed', () => {
        // Cell (0,0) carries animationDelay 0ms, so it is the FIRST cell to
        // explode on any row-0 or column-0 clear, and the ~800ms it spends
        // deformed is exactly when a child grabs the next piece.
        // getBoundingClientRect() includes transforms: at the keyframe's
        // scale(1.2) rotate(45deg) the 48px cell reports an axis-aligned box of
        // 48·1.2·√2 ≈ 81.5px around the same centre, i.e. an origin ~16.7px —
        // a third of a cell — above and left of the truth, captured once at
        // grab and held for the whole drag.
        const calm = setup(stateWith(DOT));
        fireEvent.pointerDown(calm.item, grabCorner(1));
        const finger = { ...cellCentre(3.4, 3.4), pointerId: 1 };
        fireEvent.pointerMove(window, finger);
        fireEvent.pointerUp(window, finger);
        expect(calm.placeShape).toHaveBeenCalledWith(expect.anything(), 3, 3, 'standard', 0);

        const grid = blockedGrid();
        grid[0][0] = 4; // exploding
        const clearing = setup(stateWith(DOT, { grid }));
        const firstCell = clearing.board.firstElementChild as HTMLElement | null;
        expect(firstCell, 'board must render cells for the defect to be reachable').not.toBeNull();
        firstCell!.getBoundingClientRect = () => rect(3.77, 3.77, 81.46, 81.46);

        fireEvent.pointerDown(clearing.item, grabCorner(1));
        fireEvent.pointerMove(window, finger);
        fireEvent.pointerUp(window, finger);

        expect(
            clearing.placeShape,
            'The exploding cell\'s inflated rect moved the anchor — the child would land a cell off.',
        ).toHaveBeenCalledWith(expect.anything(), 3, 3, 'standard', 0);
    });
});

describe('closing the game mid-drag', () => {
    beforeEach(() => vi.clearAllMocks());

    it('releases the window listeners, so a later pointerup cannot place into a dead game', () => {
        const { item, placeShape, unmount } = setup(stateWith(DOT));
        fireEvent.pointerDown(item, grabCorner(1));
        fireEvent.pointerMove(window, { ...cellCentre(3, 3), pointerId: 1 });

        unmount(); // the child taps Close, or the game-over overlay replaces the board

        fireEvent.pointerUp(window, { ...cellCentre(3, 3), pointerId: 1 });
        expect(placeShape).not.toHaveBeenCalled();
    });
});
