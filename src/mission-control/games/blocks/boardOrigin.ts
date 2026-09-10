// ============================================================
// The one DOM measurement the drag depends on: where the board's first cell
// actually starts on screen. Everything downstream (dragGeometry) is pure and
// works in cell units, so this is the single place a layout mistake can put
// every projection off.
// ⚠️  Internal to src/mission-control/games/blocks/ only.
// ============================================================
import { BOARD_BORDER, BOARD_PADDING } from './types';
import type { BoardOrigin } from './dragGeometry';

/**
 * The board's own rect plus the inset its computed style reports.
 *
 * ⚠️ Do NOT measure the first cell's rect instead. getBoundingClientRect()
 * includes CSS transforms, and cell (0,0) carries a 0ms animationDelay, so it is
 * the first cell to explode on any row-0 or column-0 clear. Mid-keyframe it is
 * scale(1.2) rotate(45deg), whose axis-aligned box is ~81px for a 48px cell —
 * an origin ~17px (a third of a cell) out, captured once at grab and held for
 * the whole drag. The contaminated window is the ~800ms right after a clear,
 * which is exactly when a child grabs the next piece.
 *
 * Computed style keeps the device-pixel snapping that motivated measuring in the
 * first place and is transform-independent: Chromium reports the declared 2.5px
 * border as the snapped used value ("2px" at DPR 1, different again at the
 * 125%/150% scaling common on Windows touch devices), which is where the first
 * cell really starts.
 */
export function measureBoardOrigin(board: HTMLDivElement): BoardOrigin {
    const rect = board.getBoundingClientRect();
    const style = getComputedStyle(board);
    // Each half falls back on its own. Summing first and finite-checking the
    // total would discard a good measurement because the other half was
    // missing — and the fallback is the declared value, the one the browser was
    // proven not to use.
    const used = (value: string, fallback: number) => {
        const parsed = Number.parseFloat(value);
        return Number.isFinite(parsed) ? parsed : fallback;
    };
    return {
        left: rect.left + used(style.borderLeftWidth, BOARD_BORDER) + used(style.paddingLeft, BOARD_PADDING),
        top: rect.top + used(style.borderTopWidth, BOARD_BORDER) + used(style.paddingTop, BOARD_PADDING),
    };
}
