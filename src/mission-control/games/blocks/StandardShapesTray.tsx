import { memo } from 'react';
import { GameShape } from './types';
import { ShapeItem } from './ShapeItem';

interface StandardShapesTrayProps {
    standardShapes: (GameShape | null)[];
    activeDragSlot: { slotType: 'standard' | 'rescue'; slotIndex: number } | null;
    onStartDrag: (event: React.PointerEvent<HTMLDivElement>, shape: GameShape, slotType: 'standard' | 'rescue', slotIndex: number) => void;
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
                                width: 240, 
                                height: 240, 
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
                                    cellSize={36}
                                    isTransparent={activeDragSlot?.slotType === 'standard' && activeDragSlot?.slotIndex === idx}
                                    onPointerDown={(e) => onStartDrag(e, shape, 'standard', idx)}
                                />
                            ) : null}
                        </div>
                    );
                })}
            </div>
        </div>
    );
});
