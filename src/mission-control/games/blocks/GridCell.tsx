import { memo } from 'react';
import { motion } from 'framer-motion';
import { CELL_DISPLAY_SIZE } from './types';

interface GridCellProps {
    r: number;
    c: number;
    val: number;
}

export const GridCell = memo(function GridCell({ r, c, val }: GridCellProps) {
    let bg = 'rgba(255, 255, 255, 0.015)';
    let border = '1px solid rgba(255, 255, 255, 0.03)';
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
    } else if (val === 4) {
        bg = 'white';
        shadow = '0 0 20px #fff, 0 0 40px #fbbf24';
    }

    return (
        <motion.div
            data-cell-index={`${r}-${c}`}
            initial={false}
            animate={isExploding ? {
                scale: [1, 1.2, 0],
                rotate: [0, 45, 90],
                opacity: [1, 1, 0],
                backgroundColor: ['#fff', '#fbbf24', '#f59e0b'],
                boxShadow: [
                    '0 0 10px #fff, 0 0 20px #fbbf24',
                    '0 0 20px #fff, 0 0 40px #fbbf24',
                    '0 0 0px transparent'
                ]
            } : {
                scale: 1,
                rotate: 0,
                opacity: 1,
                backgroundColor: 'transparent',
                boxShadow: 'none'
            }}
            transition={isExploding ? {
                duration: 0.8,
                delay: (r + c) * 0.04,
                ease: "easeInOut"
            } : { duration: 0.2 }}
            style={{
                width: CELL_DISPLAY_SIZE,
                height: CELL_DISPLAY_SIZE,
                background: isExploding ? 'white' : bg,
                border: isExploding ? 'none' : border,
                borderRadius: 8,
                boxShadow: isExploding ? undefined : shadow,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                userSelect: 'none',
                zIndex: isExploding ? 10 : 1,
            }}
        >
            {content}
        </motion.div>
    );
});
