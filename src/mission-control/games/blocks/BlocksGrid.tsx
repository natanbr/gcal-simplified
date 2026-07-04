import { memo, forwardRef } from 'react';
import { GRID_SIZE, CELL_DISPLAY_SIZE } from './types';
import { GridCell } from './GridCell';

interface BlocksGridProps {
    grid: number[][];
}

/**
 * Optimized Grid component that only re-renders when the grid data actually changes.
 * This prevents 64+ cell re-renders during drag operations.
 */
export const BlocksGrid = memo(forwardRef<HTMLDivElement, BlocksGridProps>(function BlocksGrid({ grid }, ref) {
    return (
        <div 
            ref={ref}
            data-testid="blocks-grid"
            style={{
                display: 'grid',
                gridTemplateColumns: `repeat(${GRID_SIZE}, ${CELL_DISPLAY_SIZE}px)`,
                gridTemplateRows: `repeat(${GRID_SIZE}, ${CELL_DISPLAY_SIZE}px)`,
                gap: 4,
                padding: 8,
                background: 'rgba(15, 23, 42, 0.4)',
                border: '2px solid rgba(255, 255, 255, 0.08)',
                borderRadius: 18,
                boxShadow: 'inset 0 4px 20px rgba(0,0,0,0.4)',
                position: 'relative',
            }}
        >
            {grid.map((row, r) =>
                row.map((val, c) => (
                    <GridCell
                        key={`${r}-${c}`}
                        r={r}
                        c={c}
                        val={val}
                    />
                ))
            )}
        </div>
    );
}), (prev, next) => {
    // Deep comparison of the grid to ensure we only re-render on data change
    if (prev.grid === next.grid) return true;
    if (prev.grid.length !== next.grid.length) return false;
    for (let r = 0; r < GRID_SIZE; r++) {
        if (prev.grid[r] !== next.grid[r]) {
            for (let c = 0; c < GRID_SIZE; c++) {
                if (prev.grid[r][c] !== next.grid[r][c]) return false;
            }
        }
    }
    return true;
});
