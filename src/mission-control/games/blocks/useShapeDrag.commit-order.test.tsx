// ============================================================
// Commit-order guards: what useShapeDrag.ts reads across a grid change must be
// synced in a LAYOUT effect — the grid-keyed recompute, and the callbacks the
// window listeners call.
//
// The 1200ms line-clear timer in useBlocksGame.ts commits a new grid from a
// setTimeout, and `pointerup` is a native window listener. The passive flush
// after that commit is a separate scheduler callback: when the render overruns
// the scheduler's ~5ms slice, the browser runs queued input before it. With
// `useEffect` the lift is then validated against the grid the child is no
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
// A native event can land in that window too, but only when the commit queued
// no synchronous update of its own: one from a layout effect flushes the
// passive effects before the task ends (see the second describe).
//
// Asserted in BOTH directions on purpose: `not.toHaveBeenCalled()` on its own
// passes vacuously if the harness never reaches the handler at all.
//
// Runs as touch. What is re-read across the grid change is where the shape was
// last drawn, which on the child's touchscreen includes its TOUCH_LIFT_PX
// float; on the mouse path that float is 0, so a recompute that dropped it
// would pass unnoticed. (`liftAt` below is the finger's release, not that
// float.) Each finger sits at fingerBelow, so the floating shape is squarely on
// the named cell. Each precondition pins that cell as well as the ghost's
// colour: on an empty board every cell is green, so colour alone would let a
// lift regression through to fail later under the wrong message.
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
    dragProxy,
    draggableItem,
    emptyGrid,
    fingerBelow,
    ghostCell,
    grabCorner,
    pinDraggables,
    stateWith,
    stubBoard,
} from './dragTestKit';

/** Grid value for a meteor, as written by useBlocksGame.ts / types.ts. */
const METEOR = 2;

/** The finger that puts the floating shape squarely on (3,3), with no fractional
 *  offset, so forgiveness snapping cannot quietly rescue the projection onto a
 *  neighbour: every neighbour is a full cell away and SNAP_RADIUS_CELLS is 0.75. */
const SQUARELY_ON_3_3 = { ...fingerBelow(3, 3), pointerId: 1, pointerType: 'touch' };

/** The ghost cell (3,3) draws, 1-indexed as CSS grid lines. */
const GHOST_ON_3_3 = ['4', '4'];
const ghostAt = (cell: HTMLElement) => [cell.style.gridRowStart, cell.style.gridColumnStart];

interface PtrInit { clientX: number; clientY: number; pointerId: number; pointerType: string }

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
        proxy: () => dragProxy(view.container),
        commit,
    };
}

const MUST_BE_LAYOUT =
    'The grid-keyed recompute in useShapeDrag.ts ran too late: a native pointerup ' +
    'arriving in the same commit as the new grid read the OLD projection. That effect ' +
    'must be a useLayoutEffect — a useEffect is flushed in a separate scheduler ' +
    'callback, which queued input can run ahead of. (Or, on touch, the recompute ' +
    'no longer projects from where the floating shape was last drawn.)';

describe('a lift arriving in the same commit as a new grid sees the new grid', () => {
    beforeEach(() => vi.clearAllMocks());

    it('refuses the drop when the incoming grid blocks the cell the green ghost was on', () => {
        const { item, placeShape, ghost, commit } = setup(emptyGrid());

        fireEvent.pointerDown(item, grabCorner(1, { pointerType: 'touch' }));
        fireEvent.pointerMove(window, SQUARELY_ON_3_3);
        expect(ghost()!.style.background, 'precondition: the ghost is green on (3,3)')
            .toContain('74, 222, 128');
        expect(ghostAt(ghost()!), 'precondition: the ghost is ON (3,3)').toEqual(GHOST_ON_3_3);

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

        fireEvent.pointerDown(item, grabCorner(1, { pointerType: 'touch' }));
        fireEvent.pointerMove(window, SQUARELY_ON_3_3);
        expect(ghost()!.style.background, 'precondition: the ghost is red on (3,3)')
            .toContain('239, 68, 68');
        expect(ghostAt(ghost()!), 'precondition: the ghost is ON (3,3)').toEqual(GHOST_ON_3_3);

        // The clear lands: (3,3) is empty again, and the child lifts on it.
        act(() => { commit(emptyGrid(), SQUARELY_ON_3_3); });

        expect(placeShape, MUST_BE_LAYOUT)
            .toHaveBeenCalledWith(expect.objectContaining({ id: 'dot' }), 3, 3, 'standard', 0);
    });
});

const MUST_READ_LATEST =
    'A window listener used a callback from before the new grid committed. The ' +
    'listeners are re-subscribed only in the passive flush, so the callbacks they ' +
    'read must be synced in a LAYOUT effect.';

/** The finger that puts the floating shape squarely on (3,4), the neighbour the
 *  grid change frees or fills. A full cell from (3,3), so forgiveness snapping
 *  cannot pull the drop back onto it. */
const SQUARELY_ON_3_4 = { ...fingerBelow(3, 4), pointerId: 1, pointerType: 'touch' };

/**
 * The window the listeners' stale closures are reachable in. When a grid change
 * alters the ghost, the recompute's setState is synchronous and flushes the
 * passive effects before the task ends, so the listeners are fresh before any
 * native event. When the ghost stays as it was, the passive flush is a separate
 * scheduler callback, and a render that overruns the ~5ms slice lets a native
 * move land first. The stale ghost it draws stands until the next move, so the
 * lift may come any time; here it lands in the gap too, which also reaches the
 * stale placeShape. So every case leaves the ghost unchanged on (3,3) and moves
 * onto the neighbour that changed.
 *
 * This proves the ref is synced before the passive flush. It cannot tell a
 * layout effect from a write during render: React orders both before that
 * flush, and only a render it throws away, which act() never does, separates them.
 */
describe('a move and lift after a grid change that left the ghost unchanged see the new grid', () => {
    beforeEach(() => vi.clearAllMocks());

    it('places on a cell the grid change just freed', () => {
        // With the old projection function the move reads (3,4) as still blocked
        // and shows red; with the old placeShape a green drop there is refused.
        // Either one alone sends the shape back to the tray.
        const gridClosed = { placed: vi.fn(), refused: vi.fn() };
        const { item, ghost, commit } = setup(blockedGrid([3, 4]), gridClosed);

        fireEvent.pointerDown(item, grabCorner(1, { pointerType: 'touch' }));
        fireEvent.pointerMove(window, SQUARELY_ON_3_3);
        expect(ghost()!.style.background, 'precondition: the ghost is green on (3,3)')
            .toContain('74, 222, 128');
        expect(ghostAt(ghost()!), 'precondition: the ghost is ON (3,3)').toEqual(GHOST_ON_3_3);

        act(() => { commit(emptyGrid(), SQUARELY_ON_3_4, true); });

        expect(gridClosed.refused, MUST_READ_LATEST).not.toHaveBeenCalled();
        expect(gridClosed.placed, MUST_READ_LATEST)
            .toHaveBeenCalledWith(expect.objectContaining({ id: 'dot' }), 4, 3, 'standard', 0);
    });

    it('returns to the tray from a cell a meteor just landed on, instead of placing against the old grid', () => {
        // With the old projection function the move shows green over the meteor.
        // Production's placeShape then refuses inside its state update, but the
        // child has been shown a green ghost for a drop that bounces.
        const gridClosed = { placed: vi.fn(), refused: vi.fn() };
        const { item, ghost, proxy, commit } = setup(emptyGrid(), gridClosed);

        fireEvent.pointerDown(item, grabCorner(1, { pointerType: 'touch' }));
        fireEvent.pointerMove(window, SQUARELY_ON_3_3);
        expect(ghost()!.style.background, 'precondition: the ghost is green on (3,3)')
            .toContain('74, 222, 128');
        expect(ghostAt(ghost()!), 'precondition: the ghost is ON (3,3)').toEqual(GHOST_ON_3_3);

        const withMeteor = emptyGrid();
        withMeteor[3][4] = METEOR;
        act(() => { commit(withMeteor, SQUARELY_ON_3_4, true); });

        // Proves the lift reached the handler, so the absences below are not vacuous.
        expect(proxy(), 'precondition: the lift ended the drag').toBeNull();
        expect(gridClosed.placed, MUST_READ_LATEST).not.toHaveBeenCalled();
        expect(gridClosed.refused, MUST_READ_LATEST).not.toHaveBeenCalled();
    });
});
