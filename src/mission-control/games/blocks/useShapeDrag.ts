import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { GameShape, SHAPE_ITEM_GAP } from './types';
import { measureBoardOrigin } from './boardOrigin';
import { DragPerf, freshPerf, recordDragTick } from './dragPerf';
import {
    BoardOrigin,
    GrabPoint,
    Projection,
    TOUCH_LIFT_PX,
    anchorPosition,
    projectShape,
    proxyOrigin,
    sameProjection,
} from './dragGeometry';

export type SlotType = 'standard' | 'rescue';

export interface DragSlot { slotType: SlotType; slotIndex: number }

export type StartDragHandler = (
    event: ReactPointerEvent<HTMLDivElement>,
    shape: GameShape,
    slotType: SlotType,
    slotIndex: number,
    /** Cell size the slot actually renders — 36 in the tray, 22 in the rescue
     *  slot. Dividing by the 48px board cell picks the wrong grabbed cell. */
    cellSize: number,
) => void;

export type PlaceShape = (
    shape: GameShape,
    gridX: number,
    gridY: number,
    slotType: SlotType,
    slotIndex: number,
) => boolean;

interface ActiveDrag {
    pointerId: number;
    shape: GameShape;
    slot: DragSlot;
    /** Grabbed cell + how far the shape floats above the pointer: TOUCH_LIFT_PX
     *  on touch, 0 for a mouse or pen, which have no hand covering the target. */
    grab: GrabPoint;
}

interface UseShapeDragOptions { grid: number[][]; placeShape: PlaceShape }

const NO_PROJECTION: Projection = { anchor: null, cells: [], valid: false };

/**
 * Owns the whole drag gesture. Three invariants the touchscreen depends on:
 * the drag belongs to the `pointerId` that started it (a second finger or a
 * resting palm can neither steer it, drop it, nor start a second drag); the
 * ghost is derived from the *shape's* position, not the finger's, so a lifted
 * shape stays aimable with the hand below the board; and the drop lands on the
 * anchor the projection last showed, never on the lift.
 */
export function useShapeDrag({ grid, placeShape }: UseShapeDragOptions) {
    const boardRef = useRef<HTMLDivElement>(null);
    /** Screen position of the board's first cell, measured at drag start. */
    const boardOriginRef = useRef<BoardOrigin | null>(null);
    const dragProxyRef = useRef<HTMLDivElement>(null);
    const dragPerfRef = useRef<DragPerf>(freshPerf());

    const activeDragRef = useRef<ActiveDrag | null>(null);
    const grabPointRef = useRef({ x: 0, y: 0 });
    /** Where the shape was last drawn. Kept so the projection can be recomputed
     *  when the board's CONTENTS change under a still finger, not only when the
     *  finger moves. The board's screen position is measured once per grab —
     *  nothing in this layout reflows it mid-drag. */
    const lastOriginRef = useRef<{ x: number; y: number } | null>(null);
    /** What the ghost is showing — the anchor a lift will place on. */
    const lastProjectionRef = useRef<Projection>(NO_PROJECTION);

    const [dragView, setDragView] = useState<{ shape: GameShape; slot: DragSlot } | null>(null);
    const [projection, setProjection] = useState<Projection>(NO_PROJECTION);

    const moveProxy = useCallback((origin: { x: number; y: number }) => {
        const proxy = dragProxyRef.current;
        if (!proxy) return;
        proxy.style.transform = `translate(${origin.x}px, ${origin.y}px)`;
    }, []);

    const updateProjection = useCallback((origin: { x: number; y: number }, drag: ActiveDrag) => {
        lastOriginRef.current = origin;
        const board = boardOriginRef.current;
        if (!board) return;

        const next = projectShape(anchorPosition(origin, board), drag.shape, grid);
        if (sameProjection(lastProjectionRef.current, next)) return;

        // The ref is what a lift places on and the state is what the child sees;
        // they are written together so the two can never disagree. Whether the
        // ghost is *rendered* is the caller's business (BlocksCanvas gates it on
        // the DEV toggle) — a debug switch must not reach into placement.
        lastProjectionRef.current = next;
        setProjection(next);
    }, [grid]);

    const clearDrag = useCallback(() => {
        activeDragRef.current = null;
        boardOriginRef.current = null;
        lastOriginRef.current = null;
        lastProjectionRef.current = NO_PROJECTION;
        setDragView(null);
        setProjection(NO_PROJECTION);
    }, []);

    const handleStartDrag = useCallback<StartDragHandler>((event, shape, slotType, slotIndex, cellSize) => {
        // Unconditional: a refused pointer must still lose its browser default
        // (long-press context menu, selection, synthesised mouse events), or a
        // second finger landing mid-drag hands the OS a gesture of its own.
        event.preventDefault();

        const live = activeDragRef.current;
        // A pointer cannot go down twice without going up, so the same id proves
        // the previous gesture ended without telling us. Reclaim it rather than
        // dead-locking every future grab.
        // ⚠️ Mouse-only in practice: Chromium keeps one id for the mouse but
        // issues a fresh id per touch contact, so this never matches on the
        // touchscreen. Touch relies on the blur/visibilitychange valves below —
        // and, properly, on setPointerCapture, which this gesture does not yet
        // use (see the journal entry on window-listener drags).
        if (live && live.pointerId !== event.pointerId) return;

        if (boardRef.current) boardOriginRef.current = measureBoardOrigin(boardRef.current);

        const rect = event.currentTarget.getBoundingClientRect();
        const pitch = cellSize + SHAPE_ITEM_GAP;

        const xs = shape.cells.map(c => c.x);
        const ys = shape.cells.map(c => c.y);
        const widthCells = Math.max(...xs) - Math.min(...xs) + 1;
        const heightCells = Math.max(...ys) - Math.min(...ys) + 1;

        const col = Math.floor((event.clientX - rect.left) / pitch);
        const row = Math.floor((event.clientY - rect.top) / pitch);

        activeDragRef.current = {
            pointerId: event.pointerId,
            shape,
            slot: { slotType, slotIndex },
            grab: {
                col: Math.max(0, Math.min(widthCells - 1, col)),
                row: Math.max(0, Math.min(heightCells - 1, row)),
                lift: event.pointerType === 'touch' ? TOUCH_LIFT_PX : 0,
            },
        };

        grabPointRef.current = { x: event.clientX, y: event.clientY };
        lastOriginRef.current = null;
        lastProjectionRef.current = NO_PROJECTION;
        dragPerfRef.current = freshPerf();

        // A reclaimed drag can leave a stale ghost on the board.
        setProjection(NO_PROJECTION);
        setDragView({ shape, slot: activeDragRef.current.slot });
    }, []);

    // Place the proxy before paint; a rAF here shows one frame at the origin.
    useLayoutEffect(() => {
        const drag = activeDragRef.current;
        if (!dragView || !drag) return;
        moveProxy(proxyOrigin(grabPointRef.current.x, grabPointRef.current.y, drag.grab));
    }, [dragView, moveProxy]);

    // The board can change under a still finger: the 1200ms line-clear timer in
    // useBlocksGame rewrites the grid, and applyClearEffects/spawnObstacles can
    // drop a meteor into a cell a green ghost is already sitting on — or free
    // the cleared cells a red ghost is sitting on. Without this, a child who
    // holds still through a clear and then lifts gets a silent return-to-bank
    // after being shown green, or a refusal on cells that are visibly empty.
    // `updateProjection` closes over `grid`, so its identity IS the grid change
    // — one recompute per change, never one per frame.
    //
    // ⚠️ Must stay a LAYOUT effect. The grid change arrives from a setTimeout,
    // so React schedules the passive flush as a separate scheduler callback, and
    // a render that overruns the ~5ms slice lets queued input run before it.
    // `pointerup` is a native window listener, so with useEffect the lift can
    // read a projection validated against the grid the child is no longer
    // looking at. A layout effect runs inside the commit, before any input.
    useLayoutEffect(() => {
        const drag = activeDragRef.current;
        const origin = lastOriginRef.current;
        if (!drag || !origin) return;
        updateProjection(origin, drag);
    }, [updateProjection]);

    // The window listeners below live for the whole drag, but the grid changes
    // under it and useBlocksGame rebuilds placeShape with it. Both callbacks are
    // read through this ref, synced in a LAYOUT effect for the same reason as the
    // recompute above: a native move and lift can land before the passive flush
    // that re-subscribes the listeners. (Only when the grid change left the ghost
    // as it was — a changed ghost's setState flushes the effects synchronously.)
    // Read from their closure instead, a move onto a cell the clear just freed
    // shows red, one onto a meteor that just landed shows green, and the lift
    // places against that old grid.
    const latestRef = useRef({ updateProjection, placeShape });
    useLayoutEffect(() => {
        latestRef.current = { updateProjection, placeShape };
    }, [updateProjection, placeShape]);

    useEffect(() => {
        if (!dragView) return;

        const ownedDrag = (e: PointerEvent): ActiveDrag | null => {
            const drag = activeDragRef.current;
            if (!drag || e.pointerId !== drag.pointerId) return null;
            return drag;
        };

        const handlePointerMove = (e: PointerEvent) => {
            const drag = ownedDrag(e);
            if (!drag) return;

            // Metering is for the DEV-only HUD. Vite folds the flag, so Rollup
            // drops recordDragTick from a production build — verified in the
            // bundle. `freshPerf()` below still runs, so dragPerf.ts itself
            // ships; that is one object literal per grab, not per move.
            const start = import.meta.env.DEV ? performance.now() : 0;
            // One origin for both: the proxy and the ghost must never disagree
            // about where the shape is.
            const origin = proxyOrigin(e.clientX, e.clientY, drag.grab);
            moveProxy(origin);
            latestRef.current.updateProjection(origin, drag);
            if (import.meta.env.DEV) recordDragTick(dragPerfRef.current, start, performance.now());
        };

        const handlePointerUp = (e: PointerEvent) => {
            const drag = ownedDrag(e);
            if (!drag) return;

            const { anchor, valid } = lastProjectionRef.current;
            clearDrag();

            // No ghost (a tap, or a drag that never reached the board) and a red
            // ghost are both return-to-bank: what the child saw is what happens.
            if (!anchor || !valid) return;

            // A refused drop must be silent, and a successful one needs no
            // after-mask: the parent empties the slot in this same commit.
            latestRef.current.placeShape(drag.shape, anchor.c, anchor.r, drag.slot.slotType, drag.slot.slotIndex);
        };

        const handlePointerCancel = (e: PointerEvent) => {
            if (!ownedDrag(e)) return;
            clearDrag();
        };

        // Safety valve. Without pointer capture a gesture can end with no
        // pointerup at all (released outside the window, an OS gesture, the app
        // losing focus), and the "one drag at a time" rule would then block every
        // future grab until the game remounts — a dead game on a child's device.
        const handleStranded = () => {
            if (activeDragRef.current) clearDrag();
        };
        const handleVisibility = () => {
            if (document.visibilityState === 'hidden') handleStranded();
        };

        window.addEventListener('pointermove', handlePointerMove);
        window.addEventListener('pointerup', handlePointerUp);
        window.addEventListener('pointercancel', handlePointerCancel);
        window.addEventListener('blur', handleStranded);
        document.addEventListener('visibilitychange', handleVisibility);

        return () => {
            window.removeEventListener('pointermove', handlePointerMove);
            window.removeEventListener('pointerup', handlePointerUp);
            window.removeEventListener('pointercancel', handlePointerCancel);
            window.removeEventListener('blur', handleStranded);
            document.removeEventListener('visibilitychange', handleVisibility);
        };
    }, [dragView, moveProxy, clearDrag]);

    return {
        boardRef,
        dragProxyRef,
        dragPerfRef,
        handleStartDrag,
        /** The slot the live drag came from — masked while its shape is in flight. */
        activeDragSlot: dragView?.slot ?? null,
        draggedShape: dragView?.shape ?? null,
        projection,
    };
}
