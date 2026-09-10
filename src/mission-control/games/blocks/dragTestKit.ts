// ============================================================
// Shared setup for the Space Rescue drag suites — the four DOM tests around
// BlocksCanvas plus the pure-maths dragGeometry test. Setup only: nothing here
// asserts anything, so a test's meaning still lives entirely in its own file.
//
// All of it was hand-rolled four times over, and one copy had already drifted in
// two places: BlocksCanvas.gesture-defects.test.tsx measured the board's content
// box from the padding alone — 8px, not the 2.5px border *and* 8px padding the
// DOM really insets by — and sized the board 428px instead of 433. Nothing
// failed, and nothing would have: a stale copy of a geometry constant does not
// break a test, it quietly re-points it at a board that does not exist.
//
// So every number below is DERIVED — from types.ts for the board, and from the
// two slot components for their cell sizes. There are no restated literals left
// to drift, which is the whole point of the file.
//
// ⚠️  Internal to src/mission-control/games/blocks/ only.
// ============================================================
import { createElement } from 'react';
import { render } from '@testing-library/react';
import { vi } from 'vitest';
import type { QuizEngineApi } from '../quiz/types';
import { BlocksCanvas } from './BlocksCanvas';
import { RESCUE_CELL_SIZE } from './RescueSlot';
import { TRAY_CELL_SIZE } from './StandardShapesTray';
import type { PlaceShape } from './useShapeDrag';
import type { BlocksGameState, GameShape } from './types';
import {
    BOARD_BORDER,
    BOARD_CELL_PITCH,
    BOARD_GAP,
    BOARD_PADDING,
    CELL_DISPLAY_SIZE,
    GRID_SIZE,
    HELP_SHAPES,
    SHAPE_ITEM_GAP,
    SHAPE_POOL,
} from './types';

// ── Board geometry ───────────────────────────────────────────

/** 48px cell + 4px gap. */
export const PITCH = BOARD_CELL_PITCH;
/**
 * Border + padding: how far inside its border box jsdom puts the first cell.
 *
 * ⚠️ Test geometry only. This is the DECLARED sum, which jsdom reports verbatim
 * from the inline style — and which Chromium does not: a 2.5px border snaps to
 * 2px at DPR 1 and to something else again under Windows display scaling. That
 * is why types.ts deliberately exports no such constant and boardOrigin.ts reads
 * computed style instead. Never lift this into production code.
 */
export const CONTENT_INSET = BOARD_BORDER + BOARD_PADDING;
export const HALF_CELL = CELL_DISPLAY_SIZE / 2;
/** Gap between the cells of a bank/tray item, which fixes its rendered pitch. */
export const SHAPE_GAP = SHAPE_ITEM_GAP;
/** The board's BORDER box — what getBoundingClientRect returns: 8 cells, the 7
 *  gaps between them, and the inset on both sides. */
export const BOARD_SIZE =
    GRID_SIZE * CELL_DISPLAY_SIZE + (GRID_SIZE - 1) * BOARD_GAP + 2 * CONTENT_INSET;

/** Where the stubbed board is pinned on screen. Arbitrary, but not (0,0): an
 *  origin of zero hides an inset that was never subtracted. */
export const BOARD_LEFT = 10;
export const BOARD_TOP = 10;
export const BOARD_BOTTOM = BOARD_TOP + BOARD_SIZE;

/**
 * Client coordinate at the centre of board cell (r, c). Fractional indices are
 * welcome — `cellCentre(4.4, 4)` sits 40% of a cell below row 4's centre.
 *
 * Read it the other way round for a drag: because the grabbed cell is centred on
 * the pointer, this is also the pointer position that puts an *unlifted* shape's
 * grabbed cell exactly on (r, c).
 */
export const cellCentre = (r: number, c: number) => ({
    clientX: BOARD_LEFT + CONTENT_INSET + PITCH * c + HALF_CELL,
    clientY: BOARD_TOP + CONTENT_INSET + PITCH * r + HALF_CELL,
});

// ── Tray / rescue-slot geometry ──────────────────────────────

export const TRAY_LEFT = 100;
export const TRAY_TOP = 100;
/** Horizontal spacing between stubbed tray items — wide enough that no two
 *  overlap, so a grab can only be aimed at one of them. */
export const TRAY_SLOT_SPACING = 300;
/** The sizes the two slots really render. Dividing a grab by the 48px board
 *  cell instead of these is the defect BlocksCanvas.gesture-defects pins. */
export const TRAY_CELL = TRAY_CELL_SIZE;
export const RESCUE_CELL = RESCUE_CELL_SIZE;

interface GrabOptions {
    /** Which stubbed tray slot, at TRAY_SLOT_SPACING intervals. */
    slot?: number;
    /** Omitted leaves it '' — the unlifted mouse path. 'touch' opts into the lift. */
    pointerType?: string;
}

/** Grabs a tray item 4px into its top-left cell, so the grabbed cell is (0, 0). */
export function grabCorner(pointerId: number, { slot = 0, pointerType }: GrabOptions = {}) {
    return {
        clientX: TRAY_LEFT + slot * TRAY_SLOT_SPACING + 4,
        clientY: TRAY_TOP + 4,
        pointerId,
        ...(pointerType ? { pointerType } : {}),
    };
}

// ── Shape fixtures ───────────────────────────────────────────

/**
 * A real template from types.ts, deep-copied and given a short id the assertions
 * read back (`expect.objectContaining({ id: 'bar-h' })`). Deriving rather than
 * retyping means the suites cannot drift onto cells the game never deals — and
 * it keeps the templates' raw hex out of this file, where the styling ratchet
 * would rightly count it as a new violation.
 */
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

/** 1×1. The only shape whose projection is a single cell, so a ghost assertion
 *  can read `children[0]` and mean the whole shape. */
export const DOT = fixture('1x1', 'dot', 'Dot');
/** 2×2. */
export const BLOCK_2X2 = fixture('2x2', 'block-2x2');
/** 1×4 horizontal — four cells wide, so the grabbed *column* is observable. */
export const BAR_H = fixture('1x4-h', 'bar-h');

// ── Grid and state builders ──────────────────────────────────

export const emptyGrid = (): number[][] => Array.from({ length: GRID_SIZE }, () => Array(GRID_SIZE).fill(0));

/** An empty grid with the given cells filled with debris (1). */
export const blockedGrid = (...cells: Array<[number, number]>): number[][] => {
    const grid = emptyGrid();
    for (const [r, c] of cells) grid[r][c] = 1;
    return grid;
};

/** A playing board holding `shape` in the first standard slot. Anything else
 *  the test needs — a blocked grid, an unlocked rescue shape, an empty tray —
 *  goes in `overrides`. */
export function stateWith(shape: GameShape, overrides: Partial<BlocksGameState> = {}): BlocksGameState {
    return {
        grid: emptyGrid(),
        standardShapes: [shape, null, null],
        rescueShape: null,
        rescueShapeLocked: true,
        altitude: 0, score: 0, phase: 'playing', level: 0,
        rescueQuizActive: false, clearedFeedback: null,
        ...overrides,
    };
}

// ── DOM stubs ────────────────────────────────────────────────

export function rect(left: number, top: number, width: number, height: number): DOMRect {
    return { left, top, width, height, x: left, y: top, right: left + width, bottom: top + height, toJSON: () => ({}) };
}

/** Gives a rendered tray/rescue item the rect it would really have: the slot's
 *  own cell size, with SHAPE_GAP between cells. jsdom lays nothing out, so
 *  without this every item reports 0×0 and every grab reads as cell (0,0). */
export function stubItemRect(
    item: HTMLElement, shape: GameShape, cellSize: number, left: number, top: number,
): void {
    const cols = Math.max(...shape.cells.map(c => c.x)) + 1;
    const rows = Math.max(...shape.cells.map(c => c.y)) + 1;
    item.getBoundingClientRect = () => rect(
        left, top,
        cols * cellSize + (cols - 1) * SHAPE_GAP,
        rows * cellSize + (rows - 1) * SHAPE_GAP,
    );
}

export function stubEngine(): QuizEngineApi {
    return {
        generator: () => ({ kind: 'numeric', skill: 'math-add', level: 0, text: '1 + 1 = ?', answer: 2 }),
        beginSession: vi.fn(),
        setDifficulty: vi.fn(),
        onAnswered: vi.fn(),
        notifyQuizClosed: vi.fn(),
    };
}

// ── Rendering ────────────────────────────────────────────────

/** The in-flight drag proxy BlocksCanvas mounts while a shape is held. */
export const dragProxy = (container: HTMLElement) =>
    container.querySelector<HTMLDivElement>('div[style*="z-index: 9999"]');

/** Every draggable tray/rescue item currently rendered, in DOM order. */
export const draggableItems = (container: HTMLElement) =>
    [...container.querySelectorAll<HTMLDivElement>('div[style*="cursor: grab"]')];

/** The single draggable item, for the suites that render exactly one. */
export function draggableItem(container: HTMLElement): HTMLDivElement {
    const [item] = draggableItems(container);
    if (!item) throw new Error('draggable tray item not rendered');
    return item;
}

/**
 * BlocksCanvas with every collaborator stubbed. `rerenderWith` re-renders in
 * place, so the rect stubs the caller installs afterwards survive it.
 *
 * `createElement` rather than JSX so this stays a plain `.ts` helpers module:
 * a `.tsx` exporting nothing but functions and constants trips
 * react-refresh/only-export-components, and the rule is right — nothing here is
 * a component.
 */
export function renderCanvas(gameState: BlocksGameState, placeShape: PlaceShape) {
    const canvas = (state: BlocksGameState) => createElement(BlocksCanvas, {
        gameState: state,
        placeShape,
        triggerRescueQuiz: vi.fn(),
        resolveRescueQuiz: vi.fn(),
        cancelRescueQuiz: vi.fn(),
        engine: stubEngine(),
        refreshRescueShape: vi.fn(),
    });
    const view = render(canvas(gameState));
    return { ...view, rerenderWith: (next: BlocksGameState) => view.rerender(canvas(next)) };
}
