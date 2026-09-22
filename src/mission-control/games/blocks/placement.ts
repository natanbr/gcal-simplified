// ============================================================
// The one rule for "may this shape sit at this anchor", and the searches built
// on it. Its readers must never disagree: the ghost (dragGeometry.projectShape)
// decides what colour the child is shown, the game (useBlocksGame.placeShape)
// decides what actually happens, and the dealer decides what the child is
// handed. A divergence would silently refuse a green ghost — indistinguishable
// from the drop-somewhere-else bug this whole area exists to prevent — or deal a
// shape the board will not take. Every search below goes through `cellsFit`,
// the same check `isPlaceable` makes.
//
// "Is this line full?" is here too, but only as the dealer's FORECAST. The board
// marks and scores its own lines in lineClear.ts, which also knows that an
// all-exploding line must not complete a second time.
// ⚠️  Internal to src/mission-control/games/blocks/ only.
// ============================================================

import { GRID_SIZE, GameShape, Position } from './types';

/** The grid values placement reasons about. Exploding (4) is lineClear.ts's. */
export const CELL = {
    EMPTY: 0,
    BLOCK: 1,
    ASTEROID: 2,
    SATELLITE: 3,
} as const;

/** A cell on the board. Row/column, never x/y — the grid is indexed [r][c]. */
export interface GridCoord { r: number; c: number }

/**
 * A cell the child may build over. The satellite is the single exception:
 * covering it is how the level-2 repair is scored, so it reads as free space.
 */
function isFree(value: number): boolean {
    return value === CELL.EMPTY || value === CELL.SATELLITE;
}

/** Shifts a shape so its top-left corner sits on the origin. */
export function normalizeCells(cells: Position[]): Position[] {
    const minX = Math.min(...cells.map(c => c.x));
    const minY = Math.min(...cells.map(c => c.y));
    return cells.map(c => ({ x: c.x - minX, y: c.y - minY }));
}

/** Order-independent identity of a shape, for de-duplicating orientations. */
function signature(cells: Position[]): string {
    return cells
        .map(c => `${c.x},${c.y}`)
        .sort()
        .join('|');
}

/**
 * Every visually distinct orientation of a shape — its 4 rotations x 2 mirrors,
 * with duplicates collapsed.
 *
 * The de-duplication is load-bearing, not tidiness: a 2x2 square has one form
 * but eight raw transforms, so keeping duplicates would weight symmetric shapes
 * eight times heavier than an L in any draw over the orientation list.
 */
export function orientations(cells: Position[]): Position[][] {
    const seen = new Set<string>();
    const result: Position[][] = [];

    for (let rotation = 0; rotation < 4; rotation++) {
        for (const mirror of [false, true]) {
            const turned = cells.map(({ x, y }) => {
                let nx: number, ny: number;
                switch (rotation) {
                    case 1: nx = -y; ny = x; break;
                    case 2: nx = -x; ny = -y; break;
                    case 3: nx = y; ny = -x; break;
                    default: nx = x; ny = y;
                }
                return { x: mirror ? -nx : nx, y: ny };
            });
            const normalized = normalizeCells(turned);
            const key = signature(normalized);
            if (seen.has(key)) continue;
            seen.add(key);
            result.push(normalized);
        }
    }
    return result;
}

/** Can `cells` sit with its origin at `anchor`? The rule, at cell level. */
function cellsFit(grid: number[][], cells: Position[], anchor: GridCoord): boolean {
    for (const cell of cells) {
        const r = anchor.r + cell.y;
        const c = anchor.c + cell.x;
        if (r < 0 || r >= GRID_SIZE || c < 0 || c >= GRID_SIZE) return false;
        if (!isFree(grid[r][c])) return false;
    }
    return true;
}

export function isPlaceable(grid: number[][], shape: GameShape, anchor: GridCoord): boolean {
    return cellsFit(grid, shape.cells, anchor);
}

/** Every anchor at which `cells` fits. */
export function findAnchors(grid: number[][], cells: Position[]): GridCoord[] {
    const anchors: GridCoord[] = [];
    for (let r = 0; r < GRID_SIZE; r++) {
        for (let c = 0; c < GRID_SIZE; c++) {
            if (cellsFit(grid, cells, { r, c })) anchors.push({ r, c });
        }
    }
    return anchors;
}

export function hasAnyPlacement(grid: number[][], cells: Position[]): boolean {
    for (let r = 0; r < GRID_SIZE; r++) {
        for (let c = 0; c < GRID_SIZE; c++) {
            if (cellsFit(grid, cells, { r, c })) return true;
        }
    }
    return false;
}

/**
 * Full rows and columns, for the dealer's forecast. ANY non-empty value counts,
 * so an asteroid the child can never cover still fills its row. A hand is only
 * ever dealt on a board with no clear pending (useBlocksGame's refillBank), so
 * there is no exploding cell here, which is why this can ignore the once-only
 * rule that lineClear.markCompletedLines enforces for the real board.
 */
export function findCompletedLines(grid: number[][]): { rows: number[]; cols: number[] } {
    const rows: number[] = [];
    const cols: number[] = [];
    for (let r = 0; r < GRID_SIZE; r++) {
        if (grid[r].every(cell => cell > CELL.EMPTY)) rows.push(r);
    }
    for (let c = 0; c < GRID_SIZE; c++) {
        if (grid.every(row => row[c] > CELL.EMPTY)) cols.push(c);
    }
    return { rows, cols };
}

/**
 * How many lines a placement would complete, without building the grid.
 *
 * Only the rows and columns the shape actually touches can newly fill up, so
 * this checks those and skips the 8x8 copy — it runs for every candidate
 * orientation at every anchor when the dealer looks for a clearing shape.
 */
export function linesClearedBy(grid: number[][], cells: Position[], anchor: GridCoord): number {
    // Numeric cell keys, not `${r},${c}` strings. This runs for every candidate
    // orientation at every anchor on every deal, and the string version cost
    // ~4.5ms per deal — a third of a frame, on the drop path.
    const filled = new Set<number>();
    const rows = new Set<number>();
    const cols = new Set<number>();
    for (const cell of cells) {
        const r = anchor.r + cell.y;
        const c = anchor.c + cell.x;
        filled.add(r * GRID_SIZE + c);
        rows.add(r);
        cols.add(c);
    }

    const occupied = (r: number, c: number) =>
        grid[r][c] > CELL.EMPTY || filled.has(r * GRID_SIZE + c);

    let cleared = 0;
    for (const r of rows) {
        let full = true;
        for (let c = 0; c < GRID_SIZE && full; c++) if (!occupied(r, c)) full = false;
        if (full) cleared++;
    }
    for (const c of cols) {
        let full = true;
        for (let r = 0; r < GRID_SIZE && full; r++) if (!occupied(r, c)) full = false;
        if (full) cleared++;
    }
    return cleared;
}

/**
 * The board as it will look once the child places `cells` at `anchor` and any
 * completed lines drain away.
 *
 * Deliberately simpler than the real board: it skips the satellite's diagonal
 * blast and the post-clear obstacle spawn, both of which are random. This is
 * the dealer's forecast of available space, not a replay of the turn.
 */
export function projectPlacement(
    grid: number[][],
    cells: Position[],
    anchor: GridCoord,
): { grid: number[][]; linesCleared: number } {
    const next = grid.map(row => [...row]);
    for (const cell of cells) {
        next[anchor.r + cell.y][anchor.c + cell.x] = CELL.BLOCK;
    }

    const { rows, cols } = findCompletedLines(next);
    for (const r of rows) {
        for (let c = 0; c < GRID_SIZE; c++) next[r][c] = CELL.EMPTY;
    }
    for (const c of cols) {
        for (let r = 0; r < GRID_SIZE; r++) next[r][c] = CELL.EMPTY;
    }
    return { grid: next, linesCleared: rows.length + cols.length };
}

/** Anchors at which this shape completes at least one line. */
export function completingAnchors(grid: number[][], cells: Position[]): GridCoord[] {
    return findAnchors(grid, cells).filter(anchor => linesClearedBy(grid, cells, anchor) > 0);
}

/**
 * Could this shape finish a line ANYWHERE? Short-circuits on the first anchor
 * that would.
 *
 * The dealer asks this of every candidate orientation on every deal and only
 * needs the yes/no; building the full anchor list for all of them was the bulk
 * of the deal's cost.
 */
export function canCompleteLine(grid: number[][], cells: Position[]): boolean {
    for (let r = 0; r < GRID_SIZE; r++) {
        for (let c = 0; c < GRID_SIZE; c++) {
            const anchor = { r, c };
            if (!cellsFit(grid, cells, anchor)) continue;
            if (linesClearedBy(grid, cells, anchor) > 0) return true;
        }
    }
    return false;
}

/**
 * Can both shapes go down in one round, in either order?
 *
 * Order matters: a big shape played first can block a small one that would
 * otherwise have fitted, so a pair only fails when BOTH orders fail. This is a
 * rule about the board, not about dealing policy, which is why it lives here.
 */
export function canBothBePlaced(board: number[][], a: Position[], b: Position[]): boolean {
    return fitsAfter(board, a, b) || fitsAfter(board, b, a);
}

function fitsAfter(board: number[][], first: Position[], second: Position[]): boolean {
    // Scans anchors inline rather than materialising findAnchors' array: on a
    // pair that does not work this walks all 64, and allocating the list twice
    // over showed up in the deal's p99.
    for (let r = 0; r < GRID_SIZE; r++) {
        for (let c = 0; c < GRID_SIZE; c++) {
            const anchor = { r, c };
            if (!cellsFit(board, first, anchor)) continue;
            const { grid } = projectPlacement(board, first, anchor);
            if (hasAnyPlacement(grid, second)) return true;
        }
    }
    return false;
}
