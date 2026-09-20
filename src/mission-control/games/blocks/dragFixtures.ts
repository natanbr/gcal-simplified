// ============================================================
// DOM-free fixtures for the Space Rescue drag suites: shapes, grids, game state,
// and the board/tray geometry every expected coordinate is computed from. Every
// number is DERIVED — from types.ts, or from the lift in dragGeometry.ts — and
// never restated: a restated copy is how one suite drifted onto a board that
// does not exist. Derive from what production RENDERS with, though: see PITCH. dragTestKit.ts re-exports all
// of this and adds the render helpers; a DOM-free suite imports this file alone.
//
// ⚠️  Test helper. Import it from tests only — enforced by
// src/__tests__/test-kit-boundary.test.ts, since nothing else would fail.
// ============================================================
import type { BlocksGameState, GameShape } from './types';
import { TOUCH_LIFT_PX } from './dragGeometry';
import {
    BOARD_BORDER,
    BOARD_GAP,
    BOARD_PADDING,
    CELL_DISPLAY_SIZE,
    GRID_SIZE,
    HELP_SHAPES,
    SHAPE_POOL,
} from './types';

// ── Board geometry ───────────────────────────────────────────

/**
 * ⚠️ jsdom only: the DECLARED border + padding, which jsdom reports verbatim and
 * Chromium does not (it snaps the 2.5px border). That is why types.ts exports no
 * such constant and boardOrigin.ts reads computed style.
 */
const CONTENT_INSET = BOARD_BORDER + BOARD_PADDING;

/**
 * Cell pitch, derived from what BlocksGrid DRAWS — a cell plus the grid gap —
 * and deliberately NOT from types.ts's `BOARD_CELL_PITCH`, which nothing
 * renders with: only dragGeometry's maths reads it.
 *
 * ⚠️ Sharing that constant makes this oracle circular: an expected cell computed
 * with the code's own formula agrees with a wrong one. Deriving improves that
 * without curing it — the error must accumulate across cells before it crosses
 * a rounding boundary, so a small drift is still only visible to an aim far
 * from the origin (the lift suite's BOARD_BOTTOM one). Measurements are in the
 * journal, 2026-09-20.
 */
const PITCH = CELL_DISPLAY_SIZE + BOARD_GAP;

export const HALF_CELL = CELL_DISPLAY_SIZE / 2;

/** The board's border box. Production reads only the rect's left/top, so the
 *  size matters solely to a test that aims relative to the board's far edge. */
export const BOARD_SIZE =
    GRID_SIZE * CELL_DISPLAY_SIZE + (GRID_SIZE - 1) * BOARD_GAP + 2 * CONTENT_INSET;

/** Not (0,0): an origin of zero hides an inset that was never subtracted. */
export const BOARD_LEFT = 10;
export const BOARD_TOP = 10;
export const BOARD_BOTTOM = BOARD_TOP + BOARD_SIZE;

/**
 * Client coordinate at the centre of board cell (r, c); fractional indices are
 * welcome. For an unlifted drag it is also the pointer position that puts the
 * grabbed cell on (r, c) — on touch the shape floats, so a finger aims with
 * `fingerBelow` instead and this one lands it on a half-cell tie.
 *
 * An integer centre proves the anchor only up to rounding direction — round,
 * floor and a centring error under half a cell all land on the same cell. A test
 * whose subject is WHERE the shape lands should aim off-centre on purpose (see
 * OFF_CENTRE in BlocksCanvas.gesture-defects.test.tsx).
 */
export const cellCentre = (r: number, c: number) => ({
    clientX: BOARD_LEFT + CONTENT_INSET + PITCH * c + HALF_CELL,
    clientY: BOARD_TOP + CONTENT_INSET + PITCH * r + HALF_CELL,
});

/**
 * cellCentre's touch twin: where the FINGER must be to put a *lifted* shape's
 * grabbed cell on (r, c). The finger sits TOUCH_LIFT_PX lower, which cancels
 * the lift exactly — whatever it is retuned to — so a test converted to touch
 * keeps its expected anchor.
 *
 * Why not `cellCentre` on touch: at today's 1.5-cell lift, a finger on a cell
 * centre leaves the shape on a half-cell boundary, and the test would pin
 * Math.round's tie rule instead of the gesture.
 *
 * The cancelling cuts both ways: a *retuned* lift moves finger and shape
 * together, so no suite aiming this way can see it. dragGeometry.test.ts bounds
 * the value and BlocksCanvas.lift.test.tsx pins the transform it produces.
 */
export const fingerBelow = (r: number, c: number) => {
    const { clientX, clientY } = cellCentre(r, c);
    return { clientX, clientY: clientY + TOUCH_LIFT_PX };
};

// ── Tray geometry ────────────────────────────────────────────

export const TRAY_LEFT = 100;
export const TRAY_TOP = 100;

/**
 * Where the draggable at `index` is pinned: draggables are pinned left to right
 * in DOM order, 300px apart so no two overlap. `index` is that DOM position, NOT
 * the game's tray slot — the two differ once a tray slot is empty or an unlocked
 * rescue shape is rendered after the tray.
 */
const itemOrigin = (index: number) => ({ left: TRAY_LEFT + index * 300, top: TRAY_TOP });

interface GrabOptions {
    /** DOM position of the draggable to grab; see itemOrigin. */
    index?: number;
    /** Omitted leaves it '' — the unlifted mouse path. 'touch' opts into the lift. */
    pointerType?: string;
}

/** Grabs a pinned draggable 4px into its top-left cell, so the grabbed cell is (0, 0). */
export function grabCorner(pointerId: number, { index = 0, pointerType }: GrabOptions = {}) {
    const { left, top } = itemOrigin(index);
    return {
        clientX: left + 4,
        clientY: top + 4,
        pointerId,
        ...(pointerType ? { pointerType } : {}),
    };
}

// ── Shape fixtures ───────────────────────────────────────────

/** A real types.ts template, deep-copied under the short id the assertions read
 *  back. Deriving keeps the suites on cells the game actually deals, and keeps
 *  the templates' raw hex out of a file the styling ratchet scans. */
function fixture(templateId: string, id: string, name?: string): GameShape {
    const template = [...SHAPE_POOL, ...HELP_SHAPES].find(shape => shape.id === templateId);
    if (!template) throw new Error(`no shape template '${templateId}' in types.ts`);
    return {
        ...template,
        id,
        name: name ?? template.name,
        cells: template.cells.map(cell => ({ ...cell })),
    };
}

/** 1×1: its projection is a single cell, so the first ghost cell is the whole shape. */
export const DOT = fixture('1x1', 'dot', 'Dot');
export const BLOCK_2X2 = fixture('2x2', 'block-2x2');
/** 1×4: four cells wide, so the grabbed *column* is observable. */
export const BAR_H = fixture('1x4-h', 'bar-h');

// ── Grid and state builders ──────────────────────────────────

export const emptyGrid = (): number[][] => Array.from({ length: GRID_SIZE }, () => Array(GRID_SIZE).fill(0));

/** An empty grid with the given cells filled with debris (1). */
export const blockedGrid = (...cells: Array<[number, number]>): number[][] => {
    const grid = emptyGrid();
    for (const [r, c] of cells) grid[r][c] = 1;
    return grid;
};

const TRAY_SLOTS = 3;

/**
 * A playing board. `tray` fills the standard slots in order: one shape, or an
 * array of up to three (`[]` for an empty tray). The tray has exactly one way in,
 * enforced at RUNTIME because the suites calling this are never type-checked: a
 * second way to set it, or a fourth shape, is a shape silently thrown away.
 */
export function stateWith(
    tray: GameShape | GameShape[],
    overrides: Partial<Omit<BlocksGameState, 'standardShapes'>> & { standardShapes?: never } = {},
): BlocksGameState {
    if ('standardShapes' in overrides) throw new Error('stateWith: pass the tray as the first argument, not as an override');
    const shapes = Array.isArray(tray) ? tray : [tray];
    if (shapes.length > TRAY_SLOTS) throw new Error(`stateWith: the tray holds ${TRAY_SLOTS} shapes, got ${shapes.length}`);
    return {
        grid: emptyGrid(),
        standardShapes: Array.from({ length: TRAY_SLOTS }, (_, slot) => shapes[slot] ?? null),
        rescueShape: null,
        rescueShapeLocked: true,
        altitude: 0, score: 0, phase: 'playing', level: 0,
        rescueQuizActive: false, clearedFeedback: null,
        ...overrides,
    };
}

// ── DOM stubs (type-only DOM use; jsdom lays nothing out) ────

export function rect(left: number, top: number, width: number, height: number): DOMRect {
    return { left, top, width, height, x: left, y: top, right: left + width, bottom: top + height, toJSON: () => ({}) };
}

/**
 * Pins a draggable at its itemOrigin. Only the ORIGIN: useShapeDrag reads the
 * grabbed item's rect.left/top and clamps the grabbed cell to the shape itself,
 * so a width/height here could never fail a test. Unpinned, jsdom puts the item
 * at (0,0) and a grab lands on whichever cell the pointer happens to be over.
 */
export function stubItemOrigin(item: HTMLElement, index = 0): void {
    const { left, top } = itemOrigin(index);
    item.getBoundingClientRect = () => rect(left, top, 0, 0);
}
