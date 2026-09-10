import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { GameShape, BOARD_CONTENT_INSET, SHAPE_ITEM_GAP } from './types';
import { DragPerf, freshPerf, recordDragTick } from './dragPerf';
import {
    BoardOrigin,
    GrabPoint,
    GridCoord,
    Projection,
    TOUCH_LIFT_PX,
    anchorPosition,
    projectShape,
    proxyOrigin,
    sameProjection,
} from './dragGeometry';

export type SlotType = 'standard' | 'rescue';

export interface DragSlot { slotType: SlotType; slotIndex: number }

export type { GridCoord };

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

interface UseShapeDragOptions { grid: number[][]; placeShape: PlaceShape; showProjection: boolean }

const NO_PROJECTION: Projection = { anchor: null, cells: [], valid: false };

/**
 * Where the board's first cell actually is: the board's own rect plus the inset
 * its computed style reports.
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
 *
 * The constant is the fallback for environments that report no box model at all.
 */
function measureBoardOrigin(board: HTMLDivElement): BoardOrigin {
    const rect = board.getBoundingClientRect();
    const style = getComputedStyle(board);
    const insetLeft = Number.parseFloat(style.borderLeftWidth) + Number.parseFloat(style.paddingLeft);
    const insetTop = Number.parseFloat(style.borderTopWidth) + Number.parseFloat(style.paddingTop);
    return {
        left: rect.left + (Number.isFinite(insetLeft) ? insetLeft : BOARD_CONTENT_INSET),
        top: rect.top + (Number.isFinite(insetTop) ? insetTop : BOARD_CONTENT_INSET),
    };
}

/**
 * Owns the whole drag gesture. Three invariants the touchscreen depends on:
 * the drag belongs to the `pointerId` that started it (a second finger or a
 * resting palm can neither steer it, drop it, nor start a second drag); the
 * ghost is derived from the *shape's* position, not the finger's, so a lifted
 * shape stays aimable with the hand below the board; and the drop lands on the
 * anchor the projection last showed, never on the lift.
 */
export function useShapeDrag({ grid, placeShape, showProjection }: UseShapeDragOptions) {
    const boardRef = useRef<HTMLDivElement>(null);
    /** Screen position of the board's first cell, measured at drag start. */
    const boardOriginRef = useRef<BoardOrigin | null>(null);
    const dragProxyRef = useRef<HTMLDivElement>(null);
    const dragPerfRef = useRef<DragPerf>(freshPerf());

    const activeDragRef = useRef<ActiveDrag | null>(null);
    const grabPointRef = useRef({ x: 0, y: 0 });
    /** Where the shape was last drawn. Kept so the projection can be recomputed
     *  when the BOARD moves under a still finger, not only when the finger does. */
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

        // Tracked even with the ghost switched off. Placing on an invisible
        // projection is the unsafe failure and a return-to-bank the safe one, so
        // the honest trade here is the other way round: this keeps the DEV-only
        // toggle from silently changing where a drop lands, at the cost of a
        // drop the child was shown nothing about. Unreachable in production —
        // the toggle only exists behind import.meta.env.DEV.
        lastProjectionRef.current = next;
        if (!showProjection) return;

        setProjection(next);
    }, [grid, showProjection]);

    const clearDrag = useCallback(() => {
        activeDragRef.current = null;
        boardOriginRef.current = null;
        lastOriginRef.current = null;
        lastProjectionRef.current = NO_PROJECTION;
        setDragView(null);
        setProjection(NO_PROJECTION);
    }, []);

    const handleStartDrag = useCallback<StartDragHandler>((event, shape, slotType, slotIndex, cellSize) => {
        const live = activeDragRef.current;
        // A pointer cannot go down twice without going up, so the same id proves
        // the previous gesture ended without telling us (mouse released outside
        // the window). Reclaim it rather than dead-locking every future grab.
        if (live && live.pointerId !== event.pointerId) return;
        event.preventDefault();

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

    useEffect(() => {
        if (!showProjection) setProjection(NO_PROJECTION);
    }, [showProjection]);

    // The board can change under a still finger: the 1200ms line-clear timer in
    // useBlocksGame rewrites the grid, and applyClearEffects/spawnObstacles can
    // drop a meteor into a cell a green ghost is already sitting on. Without
    // this, a child who holds still through a clear and then lifts gets a silent
    // return-to-bank after being shown green. `updateProjection` closes over
    // `grid`, so its identity IS the grid change — one recompute per change,
    // never one per frame.
    useEffect(() => {
        const drag = activeDragRef.current;
        const origin = lastOriginRef.current;
        if (!drag || !origin) return;
        updateProjection(origin, drag);
    }, [updateProjection]);

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

            const start = performance.now();
            // One origin for both: the proxy and the ghost must never disagree
            // about where the shape is.
            const origin = proxyOrigin(e.clientX, e.clientY, drag.grab);
            moveProxy(origin);
            updateProjection(origin, drag);
            recordDragTick(dragPerfRef.current, start, performance.now());
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
            placeShape(drag.shape, anchor.c, anchor.r, drag.slot.slotType, drag.slot.slotIndex);
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
    }, [dragView, moveProxy, updateProjection, placeShape, clearDrag]);

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
