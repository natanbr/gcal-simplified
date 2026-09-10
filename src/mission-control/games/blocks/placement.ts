// ============================================================
// The one rule for "may this shape sit at this anchor". Its two readers must
// never disagree: the ghost (dragGeometry.projectShape) decides what colour the
// child is shown, and the game (useBlocksGame.placeShape) decides what actually
// happens. A divergence would silently refuse a green ghost — indistinguishable
// from the drop-somewhere-else bug this whole area exists to prevent, and
// invisible to any test that only exercises one of the two.
// ⚠️  Internal to src/mission-control/games/blocks/ only.
// ============================================================
import { GRID_SIZE, GameShape } from './types';

/** A cell on the board. Row/column, never x/y — the grid is indexed [r][c]. */
export interface GridCoord { r: number; c: number }

export function isPlaceable(grid: number[][], shape: GameShape, anchor: GridCoord): boolean {
    for (const cell of shape.cells) {
        const r = anchor.r + cell.y;
        const c = anchor.c + cell.x;
        if (r < 0 || r >= GRID_SIZE || c < 0 || c >= GRID_SIZE) return false;
        // 0 = empty, 3 = satellite (can be built over). Everything else blocks.
        if (grid[r][c] !== 0 && grid[r][c] !== 3) return false;
    }
    return true;
}
