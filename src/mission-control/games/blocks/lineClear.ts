// ============================================================
// Line clears — pure. A full row or column is marked exploding (4) the moment
// the shape that completes it lands, and emptied CLEAR_DELAY_MS later, when the
// satellite/electricity effects and the level's obstacles are applied.
// The wait in between is STATE, never a timer started by the placement:
// useBlocksGame schedules it from what React committed, because a state updater
// can run more than once and anything it schedules is scheduled once per run.
// ⚠️  Internal to src/mission-control/games/blocks/ only.
// ============================================================
import { GRID_SIZE, applyClearEffects, spawnObstacles, BlocksGameState } from './types';

export const CLEAR_DELAY_MS = 1200;
const EXPLODING = 4;

/** A cell being cleared, and what it held before it was marked — a satellite or
 *  electricity cell fires its effect from that value. */
interface ClearingCell { r: number; c: number; original: number }

/** Every cell still exploding. There is only ever one: a line completed while
 *  another is exploding joins it, and they finish together. */
export interface PendingClear { cells: ClearingCell[] }

const lineIndices = [...Array(GRID_SIZE).keys()];

/** Full, and not already exploding. An exploding cell counts as filled — a line
 *  crossing one can complete — but a line that is ALL exploding was completed by
 *  an earlier drop, and counting it again would re-score it on every later drop. */
const isNewlyComplete = (line: number[]) => line.every(cell => cell > 0) && line.some(cell => cell !== EXPLODING);

/**
 * Marks every newly completed row and column of `grid` (mutated) as exploding and
 * folds the marked cells into `pending`. A cell already exploding keeps its
 * first original — by now it reads 4. With no line completed, `pending` comes
 * back as the same object, so the timer waiting on it is not restarted.
 */
export function markCompletedLines(
    grid: number[][],
    pending: PendingClear | null,
): { linesCleared: number; pendingClear: PendingClear | null } {
    const rows = lineIndices.filter(r => isNewlyComplete(grid[r]));
    const cols = lineIndices.filter(c => isNewlyComplete(grid.map(row => row[c])));
    const linesCleared = rows.length + cols.length;
    if (linesCleared === 0) return { linesCleared, pendingClear: pending };

    const cells = [...(pending?.cells ?? [])];
    const marked = new Set(cells.map(({ r, c }) => `${r}-${c}`));
    const mark = (r: number, c: number) => {
        if (!marked.has(`${r}-${c}`)) {
            marked.add(`${r}-${c}`);
            cells.push({ r, c, original: grid[r][c] });
        }
        grid[r][c] = EXPLODING;
    };
    rows.forEach(r => lineIndices.forEach(c => mark(r, c)));
    cols.forEach(c => lineIndices.forEach(r => mark(r, c)));
    return { linesCleared, pendingClear: { cells } };
}

/** mulberry32: the same seed always rolls the same sequence. */
function seededRandom(seed: number): () => number {
    let state = seed >>> 0;
    return () => {
        state = (state + 0x6D2B79F5) >>> 0;
        let t = Math.imul(state ^ (state >>> 15), state | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/** The board once `pending` has finished exploding: its cells emptied, their
 *  effects applied, and the level's obstacles topped up. Where meteors land is
 *  a pure function of `seed`, rolled by the caller OUTSIDE the state updater —
 *  so an updater React replays lands them in the same cells again. */
export function resolvePendingClear(grid: number[][], pending: PendingClear, level: number, seed: number): number[][] {
    const random = seededRandom(seed);
    const next = grid.map(row => [...row]);
    for (const { r, c } of pending.cells) {
        if (next[r][c] === EXPLODING) next[r][c] = 0;
    }
    const originals = new Map(pending.cells.map(({ r, c, original }) => [`${r}-${c}`, original]));
    applyClearEffects(next, pending.cells, originals, random);
    spawnObstacles(next, level, random);
    return next;
}

export function clearFeedback(linesCleared: number, id: string): NonNullable<BlocksGameState['clearedFeedback']> {
    if (linesCleared >= 3) return { text: 'EXCELLENT!', stars: 3, id };
    if (linesCleared === 2) return { text: 'GREAT!', stars: 2, id };
    return { text: 'GOOD!', stars: 1, id };
}
