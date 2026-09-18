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
import { useLayoutEffect, useMemo } from 'react';
import { render, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BlocksCanvas } from './BlocksCanvas';
import { isPlaceable } from './placement';
import type { PlaceShape } from './useShapeDrag';
import {
    DOT,
    blockedGrid,
    canvasProps,
    cellCentre,
    draggableItem,
    emptyGrid,
    ghostCell,
    grabCorner,
    pinDraggables,
    stateWith,
    stubBoard,
} from './dragTestKit';

/** Grid value for a meteor, as written by useBlocksGame.ts / types.ts. */
const METEOR = 2;

/** Squarely on (3,3), with no fractional offset, so forgiveness snapping cannot
 *  quietly rescue the projection onto a neighbour: every neighbour is a full
 *  cell away and SNAP_RADIUS_CELLS is 0.75. */
const SQUARELY_ON_3_3 = { ...cellCentre(3, 3), pointerId: 1 };

interface PtrInit { clientX: number; clientY: number; pointerId: number }

/**
 * A placeShape shaped like production's: useBlocksGame rebuilds it whenever the
 * grid changes and re-checks the cell against the grid it closed over. Accepted
 * and refused drops are recorded separately, so a refusal cannot hide behind a
 * "was called" assertion.
 */
interface GridClosedPlace { placed: ReturnType<typeof vi.fn>; refused: ReturnType<typeof vi.fn> }
const placeShapeFor = (grid: number[][], { placed, refused }: GridClosedPlace): PlaceShape =>
    (shape, gridX, gridY, slotType, slotIndex) => {
        const ok = isPlaceable(grid, shape, { r: gridY, c: gridX });
        (ok ? placed : refused)(shape, gridX, gridY, slotType, slotIndex);
        return ok;
    };

interface HarnessProps {
    grid: number[][];
    /** When set, placeShape is rebuilt per grid like production's; otherwise
     *  the kit's stable, always-accepting spy. */
    gridClosed?: GridClosedPlace;
    /** Also dispatch a pointermove at the lift point, just before the lift. */
    moveFirst?: boolean;
    /** Built once in setup and passed down, never inside the harness's render:
     *  new collaborator identities on every commit would change the very commit
     *  this guard isolates. */
    props: ReturnType<typeof canvasProps>;
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
function CommitOrderHarness({ grid, props, liftAt, gridClosed, moveFirst = false }: HarnessProps) {
    const placeShape = useMemo(
        () => (gridClosed ? placeShapeFor(grid, gridClosed) : props.placeShape),
        [grid, gridClosed, props.placeShape],
    );

    useLayoutEffect(() => {
        if (!liftAt) return;
        if (moveFirst) window.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, ...liftAt }));
        // A plain dispatch, not fireEvent: this runs mid-commit, inside the one
        // window this guard measures, and fireEvent would wrap it in act().
        window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, ...liftAt }));
    }, [liftAt, moveFirst]);

    return <BlocksCanvas {...props} placeShape={placeShape} gameState={stateWith(DOT, { grid })} />;
}

function setup(grid: number[][], gridClosed?: GridClosedPlace) {
    const props = canvasProps();
    const view = render(<CommitOrderHarness grid={grid} props={props} liftAt={null} gridClosed={gridClosed} />);
    /** Re-renders in place: the board, the tray item and their stubs survive. */
    const commit = (nextGrid: number[][], liftAt: PtrInit | null, moveFirst = false) =>
        view.rerender(
            <CommitOrderHarness grid={nextGrid} props={props} liftAt={liftAt} gridClosed={gridClosed} moveFirst={moveFirst} />,
        );

    stubBoard(view.container);
    pinDraggables(view.container);
    return {
        item: draggableItem(view.container),
        placeShape: props.placeShape,
        ghost: () => ghostCell(view.container),
        commit,
    };
}

const MUST_BE_LAYOUT =
    'The grid-keyed recompute in useShapeDrag.ts ran too late: a native pointerup ' +
    'arriving in the same commit as the new grid read the OLD projection. That effect ' +
    'must be a useLayoutEffect — a useEffect is flushed as a separate task, which ' +
    'React cannot order a window listener against.';

describe('a lift arriving in the same commit as a new grid sees the new grid', () => {
    beforeEach(() => vi.clearAllMocks());

    it('refuses the drop when the incoming grid blocks the cell the green ghost was on', () => {
        const { item, placeShape, ghost, commit } = setup(emptyGrid());

        fireEvent.pointerDown(item, grabCorner(1));
        fireEvent.pointerMove(window, SQUARELY_ON_3_3);
        expect(ghost()!.style.background, 'precondition: the ghost is green on (3,3)')
            .toContain('74, 222, 128');

        // The line-clear timer's commit: spawnObstacles drops a meteor into the
        // cell the ghost is sitting on, and the finger lifts in that same commit.
        const withMeteor = emptyGrid();
        withMeteor[3][3] = METEOR;
        act(() => { commit(withMeteor, SQUARELY_ON_3_3); });

        expect(placeShape, MUST_BE_LAYOUT).not.toHaveBeenCalled();
    });

    it('accepts the drop when the incoming grid frees the cell the red ghost was on', () => {
        // The other direction, and the reason this pair is not vacuous: a
        // positive assertion also proves the harness's layout-effect dispatch
        // really reaches the pointerup handler.
        const { item, placeShape, ghost, commit } = setup(blockedGrid([3, 3]));

        fireEvent.pointerDown(item, grabCorner(1));
        fireEvent.pointerMove(window, SQUARELY_ON_3_3);
        expect(ghost()!.style.background, 'precondition: the ghost is red on (3,3)')
            .toContain('239, 68, 68');

        // The clear lands: (3,3) is empty again, and the child lifts on it.
        act(() => { commit(emptyGrid(), SQUARELY_ON_3_3); });

        expect(placeShape, MUST_BE_LAYOUT)
            .toHaveBeenCalledWith(expect.objectContaining({ id: 'dot' }), 3, 3, 'standard', 0);
    });
});

const MUST_READ_LATEST =
    'The window listener ran a callback from before the new grid committed. The ' +
    'listeners live for the whole drag and are re-subscribed only in a passive ' +
    'effect, so anything they read across a commit must be synced in a LAYOUT effect.';

describe('a drop the ghost shows green is placed, even when the grid changes in the same commit', () => {
    beforeEach(() => vi.clearAllMocks());

    it('uses the placeShape built for the new grid, not the one the listener was subscribed with', () => {
        // useBlocksGame rebuilds placeShape when the grid changes, and the old one
        // re-checks the cell against the OLD grid. The child was shown green and
        // lifts in the clear's commit: calling the old one refuses a legal drop.
        const gridClosed = { placed: vi.fn(), refused: vi.fn() };
        const { item, ghost, commit } = setup(blockedGrid([3, 3]), gridClosed);

        fireEvent.pointerDown(item, grabCorner(1));
        fireEvent.pointerMove(window, SQUARELY_ON_3_3);
        expect(ghost()!.style.background, 'precondition: the ghost is red on (3,3)')
            .toContain('239, 68, 68');

        act(() => { commit(emptyGrid(), SQUARELY_ON_3_3); });

        expect(gridClosed.refused, MUST_READ_LATEST).not.toHaveBeenCalled();
        expect(gridClosed.placed).toHaveBeenCalledWith(expect.objectContaining({ id: 'dot' }), 3, 3, 'standard', 0);
    });

    it('projects a move in that same window against the new grid, not the old one', () => {
        // A pointermove between the commit and the passive flush reaches the old
        // listener too. Projected against the old grid it repaints the ghost red
        // over the freed cell, and the lift that follows is a return-to-bank.
        const gridClosed = { placed: vi.fn(), refused: vi.fn() };
        const { item, ghost, commit } = setup(blockedGrid([3, 3]), gridClosed);

        fireEvent.pointerDown(item, grabCorner(1));
        fireEvent.pointerMove(window, SQUARELY_ON_3_3);
        expect(ghost()!.style.background, 'precondition: the ghost is red on (3,3)')
            .toContain('239, 68, 68');

        act(() => { commit(emptyGrid(), SQUARELY_ON_3_3, true); });

        expect(gridClosed.placed, MUST_READ_LATEST)
            .toHaveBeenCalledWith(expect.objectContaining({ id: 'dot' }), 3, 3, 'standard', 0);
    });
});
