import { memo } from 'react';
import { GameShape } from './types';
import { ShapeItem } from './ShapeItem';
import type { DragSlot, StartDragHandler } from './useShapeDrag';

/** Passed to ShapeItem *and* to onStartDrag: the grabbed cell is derived from
 *  the size the slot really renders. */
export const TRAY_CELL_SIZE = 36;

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
        <div style={{ display: 'flex', gap: 16, alignItems: 'center', width: '100%', justifyContent: 'center' }}>
            <div style={{ display: 'flex', gap: 24, background: 'rgba(255,255,255,0.01)', border: '1.5px dashed rgba(255,255,255,0.06)', borderRadius: 20, padding: 12, alignItems: 'center' }}>
                {standardShapes.map((shape, idx) => {
                    return (
                        <div 
                            key={shape ? shape.id : `empty-${idx}`} 
                            style={{ 
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
        </div>
    );
});
