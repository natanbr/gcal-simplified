import { memo } from 'react';
import { GameShape } from './types';
import { ShapeItem } from './ShapeItem';
import type { DragSlot, StartDragHandler } from './useShapeDrag';

/** Passed to ShapeItem *and* to onStartDrag: the grabbed cell is derived from
 *  the size the slot really renders. */
const TRAY_CELL_SIZE = 36;

interface StandardShapesTrayProps {
    standardShapes: (GameShape | null)[];
    activeDragSlot: DragSlot | null;
    onStartDrag: StartDragHandler;
}

export const StandardShapesTray = memo(function StandardShapesTray({
    standardShapes,
    activeDragSlot,
    onStartDrag,
}: StandardShapesTrayProps) {
    return (
        // A row under the board, or two rows beside it: styles/mc-short-screens.css. No inline
        // style here, so nothing can beat the media query.
        <div className="mc-blocks-tray">
            {standardShapes.map((shape, idx) => {
                return (
                    <div
                        key={shape ? shape.id : `empty-${idx}`}
                        style={{
                            // Fixed, so a deal never moves the slots: 200 holds a 1x5 bar at 36 px cells.
                            width: 200,
                            height: 200,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            position: 'relative',
                            background: 'rgba(255,255,255,0.005)',
                            border: '1.5px dashed rgba(255,255,255,0.05)',
                            borderRadius: 16,
                        }}
                    >
                        {shape ? (
                            <ShapeItem
                                shape={shape}
                                cellSize={TRAY_CELL_SIZE}
                                isTransparent={activeDragSlot?.slotType === 'standard' && activeDragSlot?.slotIndex === idx}
                                onPointerDown={(e) => onStartDrag(e, shape, 'standard', idx, TRAY_CELL_SIZE)}
                            />
                        ) : null}
                    </div>
                );
            })}
        </div>
    );
});
