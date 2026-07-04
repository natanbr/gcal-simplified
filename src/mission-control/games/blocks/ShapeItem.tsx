import React, { memo } from 'react';
import { GameShape, CELL_DISPLAY_SIZE } from './types';

interface ShapeItemProps {
    shape: GameShape;
    onPointerDown?: (e: React.PointerEvent<HTMLDivElement>) => void;
    style?: React.CSSProperties;
    isTransparent?: boolean;
    cellSize?: number;
}

export const ShapeItem = memo(function ShapeItem({
    shape,
    onPointerDown,
    style,
    isTransparent = false,
    cellSize = CELL_DISPLAY_SIZE,
}: ShapeItemProps) {
    // Find shape bounding box for sizing
    const xs = shape.cells.map(c => c.x);
    const ys = shape.cells.map(c => c.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const widthCells = maxX - minX + 1;
    const heightCells = maxY - minY + 1;

    return (
        <div
            onPointerDown={onPointerDown}
            style={{
                cursor: onPointerDown ? 'grab' : 'default',
                touchAction: 'none',
                position: 'absolute',
                display: 'grid',
                gridTemplateColumns: `repeat(${widthCells}, ${cellSize}px)`,
                gridTemplateRows: `repeat(${heightCells}, ${cellSize}px)`,
                gap: 1.5,
                zIndex: onPointerDown ? 100 : 1,
                opacity: isTransparent ? 0.0 : 1.0,
                pointerEvents: isTransparent ? 'none' : 'auto',
                willChange: 'transform',
                ...style,
            }}
        >
            {shape.cells.map((cell, idx) => {
                const col = cell.x - minX;
                const row = cell.y - minY;
                return (
                    <div
                        key={idx}
                        style={{
                            gridColumnStart: col + 1,
                            gridRowStart: row + 1,
                            width: cellSize,
                            height: cellSize,
                            background: shape.color,
                            borderRadius: 6,
                            border: '1.5px solid rgba(255,255,255,0.2)',
                            boxShadow: 'inset 0 1.5px 0 rgba(255,255,255,0.3)',
                        }}
                    />
                );
            })}
        </div>
    );
});
