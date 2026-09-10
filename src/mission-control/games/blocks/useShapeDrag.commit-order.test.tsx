// ============================================================
// Commit-order guard: the grid-keyed recompute in useShapeDrag.ts must stay a
// LAYOUT effect.
//
// The 1200ms line-clear timer in useBlocksGame.ts commits a new grid from a
// setTimeout, and `pointerup` is a native window listener — React has no
// opportunity to order that listener against a passive-effect flush. With
// `useEffect` the lift is therefore validated against the grid the child is no
// longer looking at: a silent return-to-bank after a green ghost, or a refusal
// on cells that are visibly empty.
//
// Neither obvious harness can tell the two effect kinds apart, so neither of
// them is what this file does:
//   * the meteor test in useShapeDrag.contract.test.tsx wraps its rerender in
//     act(), which flushes layout AND passive effects before returning;
//   * flushSync(() => rerender(...)) also flushes pending passive effects
//     before returning — a sync-lane commit ends with a passive flush.
// What DOES discriminate is a parent that dispatches the lift from its own
// layout effect. React commits layout effects child-first, then parent, and
// runs passive effects only after the whole layout pass, so the dispatch lands
// in the one window between the child's layout effect and its passive effect.
// That window is exactly where a native `pointerup` lands.
//
// Asserted in BOTH directions on purpose: `not.toHaveBeenCalled()` on its own
// passes vacuously if the harness never reaches the handler at all.
// ============================================================
import { useLayoutEffect } from 'react';
import { render, within, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BlocksCanvas } from './BlocksCanvas';
import type { BlocksGameState, GameShape } from './types';
import type { PlaceShape } from './useShapeDrag';
import type { QuizEngineApi } from '../quiz/types';

function stubEngine(): QuizEngineApi {
    return {
        generator: () => ({ kind: 'numeric', skill: 'math-add', level: 0, text: '1 + 1 = ?', answer: 2 }),
        beginSession: vi.fn(),
        setDifficulty: vi.fn(),
        onAnswered: vi.fn(),
        notifyQuizClosed: vi.fn(),
    };
}

const DOT: GameShape = { id: 'dot', name: 'Dot', color: '#38bdf8', cells: [{ x: 0, y: 0 }] };

// Real board geometry, as in the other drag suites: border box at (10,10),
// 2.5px border + 8px padding, 48px cells on a 52px pitch.
const BOARD_LEFT = 10;
const BOARD_TOP = 10;
const BOARD_SIZE = 433;
const CONTENT_INSET = 10.5;
const PITCH = 52;
const HALF_CELL = 24;
const TRAY_LEFT = 100;
const TRAY_TOP = 100;
const TRAY_CELL = 36;

/** Grid values, as written by useBlocksGame.ts / types.ts. */
const FILLED = 1;
const METEOR = 2;

/** Client coordinate that puts the corner-grabbed DOT squarely on cell (r, c).
 *  Squarely, with no fractional offset, so forgiveness snapping cannot quietly
 *  rescue the projection onto a neighbour: every neighbour is then a full cell
 *  away and SNAP_RADIUS_CELLS is 0.75. */
const shapeAt = (r: number, c: number) => ({
    clientX: BOARD_LEFT + CONTENT_INSET + PITCH * c + HALF_CELL,
    clientY: BOARD_TOP + CONTENT_INSET + PITCH * r + HALF_CELL,
});

function rect(left: number, top: number, width: number, height: number): DOMRect {
    return { left, top, width, height, x: left, y: top, right: left + width, bottom: top + height, toJSON: () => ({}) };
}

interface PtrInit { clientX: number; clientY: number; pointerId: number }
function ptr(type: string, init: PtrInit) {
    return new PointerEvent(type, { bubbles: true, ...init });
}

const emptyGrid = (): number[][] => Array.from({ length: 8 }, () => Array(8).fill(0));

function stateWith(grid: number[][]): BlocksGameState {
    return {
        grid,
        standardShapes: [DOT, null, null],
        rescueShape: null,
        rescueShapeLocked: true,
        altitude: 0, score: 0, phase: 'playing', level: 0,
        rescueQuizActive: false, clearedFeedback: null,
    };
}

interface HarnessProps {
    grid: number[][];
    placeShape: PlaceShape;
    /** Non-null lifts the finger from the harness's OWN layout effect, i.e.
     *  after the child's layout effects have run and before any passive flush. */
    liftAt: PtrInit | null;
}

/**
 * `liftAt` is handed over in the SAME rerender as the new grid, so one commit
 * carries both the child's grid-keyed recompute and this dispatch. Keying the
 * effect on `liftAt` alone (rather than also on `grid`) keeps
 * react-hooks/exhaustive-deps happy without changing when it fires.
 */
function CommitOrderHarness({ grid, placeShape, liftAt }: HarnessProps) {
    useLayoutEffect(() => {
        if (!liftAt) return;
        window.dispatchEvent(ptr('pointerup', liftAt));
    }, [liftAt]);

    return (
        <BlocksCanvas
            gameState={stateWith(grid)}
            placeShape={placeShape}
            triggerRescueQuiz={vi.fn()}
            resolveRescueQuiz={vi.fn()}
            cancelRescueQuiz={vi.fn()}
            engine={stubEngine()}
            refreshRescueShape={vi.fn()}
        />
    );
}

function setup(grid: number[][], placeShape: PlaceShape) {
    const view = render(<CommitOrderHarness grid={grid} placeShape={placeShape} liftAt={null} />);
    /** Re-renders in place, so the board and tray rect stubs below survive. */
    const commit = (nextGrid: number[][], liftAt: PtrInit | null) =>
        view.rerender(<CommitOrderHarness grid={nextGrid} placeShape={placeShape} liftAt={liftAt} />);

    const scoped = within(view.container);
    const board = scoped.getByTestId('blocks-grid');
    board.getBoundingClientRect = () => rect(BOARD_LEFT, BOARD_TOP, BOARD_SIZE, BOARD_SIZE);

    const item = view.container.querySelector<HTMLDivElement>('div[style*="cursor: grab"]');
    if (!item) throw new Error('draggable tray item not rendered');
    item.getBoundingClientRect = () => rect(TRAY_LEFT, TRAY_TOP, TRAY_CELL, TRAY_CELL);

    /** The one cell the DOT's projection draws, or null when no ghost is shown. */
    const ghostCell = () => (scoped.queryByTestId('projection-overlay')?.children[0] ?? null) as HTMLDivElement | null;
    return { item, ghostCell, commit };
}

/** Grabs the tray item by its top-left cell, so the grabbed cell is (0,0). */
const GRAB_CORNER: PtrInit = { clientX: TRAY_LEFT + 4, clientY: TRAY_TOP + 4, pointerId: 1 };

const MUST_BE_LAYOUT =
    'The grid-keyed recompute in useShapeDrag.ts ran too late: a native pointerup ' +
    'arriving in the same commit as the new grid read the OLD projection. That effect ' +
    'must be a useLayoutEffect — a useEffect is flushed as a separate task, which ' +
    'React cannot order a window listener against.';

describe('a lift arriving in the same commit as a new grid sees the new grid', () => {
    beforeEach(() => vi.clearAllMocks());

    it('refuses the drop when the incoming grid blocks the cell the green ghost was on', () => {
        const placeShape = vi.fn().mockReturnValue(true);
        const { item, ghostCell, commit } = setup(emptyGrid(), placeShape);

        fireEvent(item, ptr('pointerdown', GRAB_CORNER));
        const finger = { ...shapeAt(3, 3), pointerId: 1 };
        act(() => { window.dispatchEvent(ptr('pointermove', finger)); });
        expect(ghostCell()!.style.background, 'precondition: the ghost is green on (3,3)')
            .toContain('74, 222, 128');

        // The line-clear timer's commit: spawnObstacles drops a meteor into the
        // cell the ghost is sitting on, and the finger lifts in that same commit.
        const withMeteor = emptyGrid();
        withMeteor[3][3] = METEOR;
        act(() => { commit(withMeteor, finger); });

        expect(placeShape, MUST_BE_LAYOUT).not.toHaveBeenCalled();
    });

    it('accepts the drop when the incoming grid frees the cell the red ghost was on', () => {
        // The other direction, and the reason this pair is not vacuous: a
        // positive assertion also proves the harness's layout-effect dispatch
        // really reaches the pointerup handler.
        const placeShape = vi.fn().mockReturnValue(true);
        const blocked = emptyGrid();
        blocked[3][3] = FILLED;
        const { item, ghostCell, commit } = setup(blocked, placeShape);

        fireEvent(item, ptr('pointerdown', GRAB_CORNER));
        const finger = { ...shapeAt(3, 3), pointerId: 1 };
        act(() => { window.dispatchEvent(ptr('pointermove', finger)); });
        expect(ghostCell()!.style.background, 'precondition: the ghost is red on (3,3)')
            .toContain('239, 68, 68');

        // The clear lands: (3,3) is empty again, and the child lifts on it.
        act(() => { commit(emptyGrid(), finger); });

        expect(placeShape, MUST_BE_LAYOUT)
            .toHaveBeenCalledWith(expect.objectContaining({ id: 'dot' }), 3, 3, 'standard', 0);
    });
});
