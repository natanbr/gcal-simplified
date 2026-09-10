// ============================================================
// Pure drag geometry for Space Rescue: fingertip → shape position → the board
// anchor the green ghost shows. Split out of useShapeDrag.ts so the snapping
// maths — the part that can put a block somewhere the child did not aim — is
// testable without a DOM.
// ⚠️  Internal to src/mission-control/games/blocks/ only.
// ============================================================
import {
    GameShape,
    GRID_SIZE,
    CELL_DISPLAY_SIZE,
    BOARD_CELL_PITCH,
} from './types';
import { GridCoord, isPlaceable } from './placement';

export type { GridCoord };

/** The shape's top-left corner in board-cell units, fractional: `{ r: 2.4 }`
 *  means the shape sits 40% of a cell below row 2's top edge. */
export interface CellPoint { r: number; c: number }

/** Screen position of the board's FIRST CELL, not its border box. Measured from
 *  the DOM (see measureBoardOrigin) because a fractional CSS border does not
 *  survive device-pixel snapping. */
export interface BoardOrigin { left: number; top: number }

/** Where the grabbed cell sits inside the shape, plus how far the shape floats
 *  above the pointer (touch only — see TOUCH_LIFT_PX). */
export interface GrabPoint { row: number; col: number; lift: number }

export interface Projection {
    /** `null` = the shape overlaps no board cell at all. No ghost is drawn and
     *  the lift is a return-to-bank, never a placement attempt. */
    anchor: GridCoord | null;
    cells: GridCoord[];
    valid: boolean;
}

/**
 * Touch only: the shape floats this far above the fingertip so the hand never
 * covers it or its landing ghost. 1.5 board cells — far enough to clear a
 * fingertip and the knuckle behind it, close enough that the shape still reads
 * as "the thing I am holding".
 */
export const TOUCH_LIFT_PX = 1.5 * BOARD_CELL_PITCH; // 78px

/**
 * Forgiveness radius, in board cells. Strictly below 1 by design: a shape may
 * be nudged onto a neighbouring anchor, it may never travel to a distant free
 * spot. Combined with the 8-neighbour candidate list this caps the correction
 * at three quarters of a cell.
 */
export const SNAP_RADIUS_CELLS = 0.75;
const SNAP_RADIUS_SQ = SNAP_RADIUS_CELLS * SNAP_RADIUS_CELLS;

/**
 * Anchor offsets tried when the rounded anchor is not placeable. Straight
 * neighbours come first so an exact distance tie — the shape sitting on a cell
 * boundary makes one real — resolves to the smaller, more predictable move.
 */
const SNAP_OFFSETS: readonly GridCoord[] = [
    { r: -1, c: 0 }, { r: 1, c: 0 }, { r: 0, c: -1 }, { r: 0, c: 1 },
    { r: -1, c: -1 }, { r: -1, c: 1 }, { r: 1, c: -1 }, { r: 1, c: 1 },
];

/**
 * Screen position of the dragged shape's top-left corner. The grabbed cell
 * stays centred on the pointer horizontally; `lift` raises the whole shape.
 */
export function proxyOrigin(clientX: number, clientY: number, grab: GrabPoint): { x: number; y: number } {
    return {
        x: clientX - grab.col * BOARD_CELL_PITCH - CELL_DISPLAY_SIZE / 2,
        y: clientY - grab.row * BOARD_CELL_PITCH - CELL_DISPLAY_SIZE / 2 - grab.lift,
    };
}

/**
 * The shape's own position on the board, in cells — not the pointer's. This is
 * what makes a lifted shape placeable while the finger is still below the board.
 *
 * Invariant: dealt shapes are bounding-box-normalised — `transformShape` in
 * types.ts subtracts minX/minY from every cell after rotating and mirroring, so
 * the rendered top-left corner *is* the anchor cell. (Not every template starts
 * at (0,0): `staircase` and `cross` in LEVEL_COMPLEX_SHAPES only have a bounding
 * box that does.) A shape reaching here un-normalised would need its
 * bounding-box offset subtracting.
 */
export function anchorPosition(origin: { x: number; y: number }, board: BoardOrigin): CellPoint {
    // `board` is already the first cell's screen position, so this is a plain
    // division — no border/padding term to get wrong.
    return {
        r: (origin.y - board.top) / BOARD_CELL_PITCH,
        c: (origin.x - board.left) / BOARD_CELL_PITCH,
    };
}

/** The shape's cells that actually fall on the board — what the ghost draws. */
export function onBoardCells(shape: GameShape, anchor: GridCoord): GridCoord[] {
    const cells: GridCoord[] = [];
    for (const cell of shape.cells) {
        const r = anchor.r + cell.y;
        const c = anchor.c + cell.x;
        if (r >= 0 && r < GRID_SIZE && c >= 0 && c < GRID_SIZE) cells.push({ r, c });
    }
    return cells;
}

/**
 * Round the shape onto the cell it most overlaps, and forgive a near miss.
 *
 * When the rounded anchor is not placeable the eight neighbours are tested and
 * the nearest valid one within SNAP_RADIUS_CELLS wins. When none qualifies the
 * rounded anchor is returned as invalid — the ghost goes red there and the lift
 * returns the shape to the bank. A shape never lands somewhere it was not shown.
 */
export function snapAnchor(position: CellPoint, shape: GameShape, grid: number[][]): { anchor: GridCoord; valid: boolean } {
    // `+ 0` normalises Math.round's -0 for values in (-0.5, 0].
    const rounded: GridCoord = { r: Math.round(position.r) + 0, c: Math.round(position.c) + 0 };
    if (isPlaceable(grid, shape, rounded)) return { anchor: rounded, valid: true };

    let best: GridCoord | null = null;
    let bestDistanceSq = Infinity;

    for (const offset of SNAP_OFFSETS) {
        const candidate: GridCoord = { r: rounded.r + offset.r, c: rounded.c + offset.c };
        const dr = candidate.r - position.r;
        const dc = candidate.c - position.c;
        const distanceSq = dr * dr + dc * dc;
        if (distanceSq > SNAP_RADIUS_SQ) continue;
        // Strict improvement only: on a tie the earlier (straight) offset keeps it.
        if (distanceSq >= bestDistanceSq) continue;
        if (!isPlaceable(grid, shape, candidate)) continue;
        best = candidate;
        bestDistanceSq = distanceSq;
    }

    return best ? { anchor: best, valid: true } : { anchor: rounded, valid: false };
}

/** Full ghost for a shape at `position`: where it lands, which cells light up, and in what colour. */
export function projectShape(position: CellPoint, shape: GameShape, grid: number[][]): Projection {
    const { anchor, valid } = snapAnchor(position, shape, grid);
    const cells = onBoardCells(shape, anchor);
    if (cells.length === 0) return { anchor: null, cells, valid: false };
    return { anchor, cells, valid };
}

export function sameProjection(a: Projection, b: Projection): boolean {
    if (a.valid !== b.valid) return false;
    if (!a.anchor || !b.anchor) return a.anchor === b.anchor;
    return a.anchor.r === b.anchor.r && a.anchor.c === b.anchor.c;
}
