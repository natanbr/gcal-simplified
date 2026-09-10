import { memo } from 'react';
import { CELL_DISPLAY_SIZE } from './types';

interface GridCellProps {
    r: number;
    c: number;
    val: number;
}

/**
 * Stagger step for the line-clear explosion, in ms. `r + c` maxes at 14 on the
 * 8x8 board, so the last cell starts at 280ms and the 0.8s keyframe ends at
 * 1080ms — inside the 1200ms grid reset in useBlocksGame.ts. The margin is
 * deliberately more than a rounding error: the CSS clock starts at the first
 * paint after the commit while the reset timer starts at the state update, so
 * on a slow tablet the real headroom is smaller than the arithmetic suggests.
 * Raising either number without lowering the other cuts the animation off
 * mid-flight.
 */
const EXPLODE_STAGGER_MS = 20;

export const GridCell = memo(function GridCell({ r, c, val }: GridCellProps) {
    let bg = 'rgba(255, 255, 255, 0.035)';
    let border = '1px solid rgba(255, 255, 255, 0.08)';
    let content = null;
    let shadow = 'none';
    const isExploding = val === 4;

    if (val === 1) {
        bg = 'linear-gradient(135deg, #a855f7, #6b21a8)';
        border = '1px solid rgba(168, 85, 247, 0.4)';
        shadow = '0 0 10px rgba(168, 85, 247, 0.2)';
    } else if (val === 2) {
        bg = 'rgba(30, 41, 59, 0.6)';
        border = '1.5px dashed #f43f5e';
        content = <span style={{ fontSize: 16 }}>☄️</span>;
    } else if (val === 3) {
        bg = 'linear-gradient(135deg, #06b6d4, #0891b2)';
        border = '1px solid rgba(6, 182, 212, 0.6)';
        content = <span className="mc-anim-icon-pulse" style={{ fontSize: 16 }}>🛰️</span>;
        shadow = '0 0 12px rgba(6, 182, 212, 0.4)';
    } else if (val === 5) {
        bg = 'linear-gradient(135deg, #facc15, #eab308)';
        border = '1.5px solid rgba(250, 204, 21, 0.7)';
        content = <span className="mc-anim-icon-pulse" style={{ fontSize: 16 }}>⚡</span>;
        shadow = '0 0 12px rgba(250, 204, 21, 0.4)';
    } else if (isExploding) {
        // The flash is painted ONCE and then only transformed — see
        // `.mc-anim-cell-explode` in styles/mc.css.
        bg = 'white';
        border = 'none';
        shadow = '0 0 20px #fff, 0 0 40px #fbbf24';
    }

    return (
        <div
            data-cell-index={`${r}-${c}`}
            className={isExploding ? 'mc-anim-cell-explode' : undefined}
            style={{
                width: CELL_DISPLAY_SIZE,
                height: CELL_DISPLAY_SIZE,
                background: bg,
                border,
                borderRadius: 8,
                boxShadow: shadow,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                userSelect: 'none',
                zIndex: isExploding ? 10 : 1,
                animationDelay: isExploding ? `${(r + c) * EXPLODE_STAGGER_MS}ms` : undefined,
            }}
        >
            {content}
        </div>
    );
});
