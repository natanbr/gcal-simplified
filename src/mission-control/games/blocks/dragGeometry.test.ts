// ============================================================
// The snapping maths, tested without a DOM. This is the part that can put a
// block somewhere the child did not aim, so the rules the user set are asserted
// literally: nearest valid neighbour, never further than 0.75 of a cell,
// straight before diagonal on a tie but a diagonal when the straights are
// blocked, and — the one that matters most — an invalid anchor with nothing
// valid in reach stays invalid rather than teleporting the shape to a distant
// free spot.
// ============================================================
import { describe, it, expect } from 'vitest';
import {
    SNAP_RADIUS_CELLS,
    TOUCH_LIFT_PX,
    anchorPosition,
    projectShape,
    proxyOrigin,
    snapAnchor,
} from './dragGeometry';
import { isPlaceable } from './placement';
import { BOARD_CELL_PITCH, CELL_DISPLAY_SIZE, GameShape } from './types';

const DOT: GameShape = { id: 'dot', name: 'Dot', color: '#38bdf8', cells: [{ x: 0, y: 0 }] };
const BLOCK_2X2: GameShape = {
    id: 'block-2x2', name: 'Block', color: '#f59e0b',
    cells: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }],
};

const emptyGrid = () => Array.from({ length: 8 }, () => Array(8).fill(0));
const gridWith = (...filled: Array<[number, number]>) => {
    const grid = emptyGrid();
    for (const [r, c] of filled) grid[r][c] = 1;
    return grid;
};

describe('proxyOrigin — where the dragged shape is drawn', () => {
    it('centres the grabbed cell on the pointer when there is no lift', () => {
        expect(proxyOrigin(300, 200, { row: 0, col: 0, lift: 0 }))
            .toEqual({ x: 300 - CELL_DISPLAY_SIZE / 2, y: 200 - CELL_DISPLAY_SIZE / 2 });
    });

    it('offsets by the grabbed cell so a wide shape does not jump at pickup', () => {
        const origin = proxyOrigin(300, 200, { row: 1, col: 3, lift: 0 });
        expect(origin.x).toBe(300 - 3 * BOARD_CELL_PITCH - CELL_DISPLAY_SIZE / 2);
        expect(origin.y).toBe(200 - 1 * BOARD_CELL_PITCH - CELL_DISPLAY_SIZE / 2);
    });

    it('raises the shape by the lift without moving it sideways', () => {
        const flat = proxyOrigin(300, 200, { row: 0, col: 0, lift: 0 });
        const lifted = proxyOrigin(300, 200, { row: 0, col: 0, lift: TOUCH_LIFT_PX });
        expect(lifted.x).toBe(flat.x);
        expect(flat.y - lifted.y).toBe(TOUCH_LIFT_PX);
    });

    it('lifts the shape clear of a fingertip without detaching it from the hand', () => {
        // The exact lift is game feel and is expected to be retuned on the real
        // device, so pinning 78px would fail on a legitimate tweak with no bug
        // present. What must hold is the property either side of it: at least a
        // full board cell (or the hand still covers the shape and its ghost),
        // and under two (or the shape stops reading as the thing being held).
        expect(TOUCH_LIFT_PX).toBeGreaterThanOrEqual(BOARD_CELL_PITCH);
        expect(TOUCH_LIFT_PX).toBeLessThan(2 * BOARD_CELL_PITCH);
    });
});

describe('anchorPosition — the shape measured in board cells', () => {
    // `board` is the first CELL's screen position, measured from the DOM — not
    // the board's border box. Chromium snaps the 2.5px border to whole device
    // pixels, so border + padding arithmetic lands half a pixel out and flips
    // the rounding for a shape sitting on a cell boundary.
    const board = { left: 120, top: 90 };

    it('puts the first cell at cell 0', () => {
        expect(anchorPosition({ x: board.left, y: board.top }, board)).toEqual({ r: 0, c: 0 });
    });

    it('measures fractions of a cell, not whole cells', () => {
        const origin = {
            x: board.left + BOARD_CELL_PITCH * 2.5,
            y: board.top + BOARD_CELL_PITCH * 0.25,
        };
        expect(anchorPosition(origin, board)).toEqual({ r: 0.25, c: 2.5 });
    });

    it('reads a shape above or left of the board as negative, so it cannot round onto it', () => {
        const origin = { x: board.left - BOARD_CELL_PITCH, y: board.top - BOARD_CELL_PITCH * 2 };
        expect(anchorPosition(origin, board)).toEqual({ r: -2, c: -1 });
    });
});

describe('snapAnchor — rounding', () => {
    it('rounds to the cell the shape most overlaps', () => {
        expect(snapAnchor({ r: 1.49, c: 1.51 }, DOT, emptyGrid()).anchor).toEqual({ r: 1, c: 2 });
    });

    it('rounds half a cell up, so a shape on the boundary commits to one side', () => {
        expect(snapAnchor({ r: 2.5, c: 3.5 }, DOT, emptyGrid()).anchor).toEqual({ r: 3, c: 4 });
    });

    it('never produces -0 as a grid index', () => {
        const { anchor } = snapAnchor({ r: -0.4, c: -0.2 }, DOT, emptyGrid());
        expect(Object.is(anchor.r, 0)).toBe(true);
        expect(Object.is(anchor.c, 0)).toBe(true);
    });

    it('leaves a placeable anchor exactly where it landed', () => {
        expect(snapAnchor({ r: 3.4, c: 3.4 }, BLOCK_2X2, emptyGrid()))
            .toEqual({ anchor: { r: 3, c: 3 }, valid: true });
    });
});

describe('snapAnchor — forgiveness', () => {
    it('snaps an unplaceable anchor to the nearest valid neighbour', () => {
        // Rounds onto the blocked cell (2,2); the cell below is 0.6 away.
        expect(snapAnchor({ r: 2.4, c: 2 }, DOT, gridWith([2, 2])))
            .toEqual({ anchor: { r: 3, c: 2 }, valid: true });
    });

    it('prefers the straight neighbour when a diagonal is exactly as close', () => {
        // Rounded (2,3) and the closer straight neighbour (2,2) are both blocked.
        // (3,3) — straight — and (3,2) — diagonal — are then equidistant.
        expect(snapAnchor({ r: 2.45, c: 2.5 }, DOT, gridWith([2, 3], [2, 2])))
            .toEqual({ anchor: { r: 3, c: 3 }, valid: true });
    });

    it('reaches a neighbour 0.7 of a cell away', () => {
        expect(snapAnchor({ r: 2.3, c: 2 }, DOT, gridWith([2, 2])))
            .toEqual({ anchor: { r: 3, c: 2 }, valid: true });
    });

    it('refuses the same neighbour at 0.8 of a cell — the radius is the whole guarantee', () => {
        expect(snapAnchor({ r: 2.2, c: 2 }, DOT, gridWith([2, 2])))
            .toEqual({ anchor: { r: 2, c: 2 }, valid: false });
        expect(SNAP_RADIUS_CELLS).toBeLessThan(1);
    });

    it('stays invalid where it landed when nothing valid is in reach', () => {
        // Squarely on a blocked cell: every neighbour is a full cell away, so the
        // shape must NOT jump to one of the eight empty cells around it.
        const grid = gridWith([4, 4]);
        expect(snapAnchor({ r: 4, c: 4 }, DOT, grid)).toEqual({ anchor: { r: 4, c: 4 }, valid: false });
    });

    it('never travels to a distant free spot, however empty the board is', () => {
        // Only a 3x3 island is blocked; the rest of the board is free. The nearest
        // valid anchor is two cells away and must be ignored.
        const grid = emptyGrid();
        for (let r = 3; r <= 5; r++) for (let c = 3; c <= 5; c++) grid[r][c] = 1;
        expect(snapAnchor({ r: 4, c: 4 }, DOT, grid)).toEqual({ anchor: { r: 4, c: 4 }, valid: false });
    });

    it('forgives an overhang at the board edge', () => {
        expect(snapAnchor({ r: -0.6, c: 3 }, BLOCK_2X2, emptyGrid()))
            .toEqual({ anchor: { r: 0, c: 3 }, valid: true });
    });

    // ------------------------------------------------------------
    // The four DIAGONAL entries in SNAP_OFFSETS. Deleting that line left the
    // whole blocks suite green: every forgiveness case above is won by a
    // straight offset, and the tie case asserts the straight one WINS, so it
    // passes with the diagonals gone too. These four are what fails.
    //
    // Each case leaves exactly one diagonal in play. On an axis the diagonal
    // points UP/LEFT along, the position sits half a cell BELOW/RIGHT of the
    // rounded cell (2.5 rounds up to 3, so the neighbour beyond it is 0.5
    // away); on an axis it points DOWN/RIGHT along, 0.49 ABOVE/LEFT of it
    // (3.49 rounds down to 3, so the neighbour beyond it is 0.51 away).
    // The chosen diagonal therefore lands at a squared distance of
    // 0.50-0.5202, inside the 0.5625 radius, while the neighbours on the
    // opposite sides are 1.49-1.5 away (2.2+ squared) and out of reach. With
    // the rounded cell and both reachable straight neighbours blocked, the
    // diagonal is the only candidate left — and with the diagonals gone the
    // shape stays on the blocked rounded cell and the drop is refused.
    // ------------------------------------------------------------

    it('reaches the up-left diagonal when both straight neighbours are blocked', () => {
        expect(snapAnchor({ r: 2.5, c: 2.5 }, DOT, gridWith([3, 3], [2, 3], [3, 2])))
            .toEqual({ anchor: { r: 2, c: 2 }, valid: true });
    });

    it('reaches the up-right diagonal when both straight neighbours are blocked', () => {
        expect(snapAnchor({ r: 2.5, c: 3.49 }, DOT, gridWith([3, 3], [2, 3], [3, 4])))
            .toEqual({ anchor: { r: 2, c: 4 }, valid: true });
    });

    it('reaches the down-left diagonal when both straight neighbours are blocked', () => {
        expect(snapAnchor({ r: 3.49, c: 2.5 }, DOT, gridWith([3, 3], [4, 3], [3, 2])))
            .toEqual({ anchor: { r: 4, c: 2 }, valid: true });
    });

    it('reaches the down-right diagonal when both straight neighbours are blocked', () => {
        expect(snapAnchor({ r: 3.49, c: 3.49 }, DOT, gridWith([3, 3], [4, 3], [3, 4])))
            .toEqual({ anchor: { r: 4, c: 4 }, valid: true });
    });
});

describe('isPlaceable', () => {
    it('allows building over a satellite (3) but not over debris', () => {
        const grid = emptyGrid();
        grid[1][1] = 3;
        expect(isPlaceable(grid, DOT, { r: 1, c: 1 })).toBe(true);
        grid[1][1] = 1;
        expect(isPlaceable(grid, DOT, { r: 1, c: 1 })).toBe(false);
    });

    it('refuses an anchor that hangs off the board', () => {
        expect(isPlaceable(emptyGrid(), BLOCK_2X2, { r: 7, c: 7 })).toBe(false);
    });
});

describe('projectShape', () => {
    it('reports no anchor at all when the shape is nowhere near the board', () => {
        expect(projectShape({ r: -5, c: -5 }, DOT, emptyGrid()))
            .toEqual({ anchor: null, cells: [], valid: false });
    });

    it('draws only the cells that fall on the board, in red, when overhanging', () => {
        // Two cells hang off the right edge and no neighbour is in reach.
        const projection = projectShape({ r: 3, c: 7 }, BLOCK_2X2, emptyGrid());
        expect(projection.valid).toBe(false);
        expect(projection.anchor).toEqual({ r: 3, c: 7 });
        expect(projection.cells).toEqual([{ r: 3, c: 7 }, { r: 4, c: 7 }]);
    });

    it('shows the snapped cells, not the cells under the raw position', () => {
        const projection = projectShape({ r: 2.4, c: 2 }, DOT, gridWith([2, 2]));
        expect(projection).toEqual({ anchor: { r: 3, c: 2 }, cells: [{ r: 3, c: 2 }], valid: true });
    });
});
