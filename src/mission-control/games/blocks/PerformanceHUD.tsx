import { memo, useState, useEffect } from 'react';
import type { DragPerf } from './dragPerf';

interface PerformanceHUDProps {
    perfRef: React.RefObject<DragPerf>;
    canvasRenders: number;
    gridRenders: number;
    showProjection: boolean;
    onToggleProjection: () => void;
}

// /*#__PURE__*/ is load-bearing, not decoration. BlocksCanvas mounts this behind
// `import.meta.env.DEV`, so Rollup drops the call site in a production build —
// but it cannot prove `memo(...)` is side-effect-free, so without this annotation
// it keeps the whole component, including the 200ms setInterval below, as dead
// bytes in the shipped bundle. Verified by grepping dist/assets for this file's
// strings: present before the annotation, absent after.
export const PerformanceHUD = /*#__PURE__*/ memo(function PerformanceHUD({
    perfRef, 
    canvasRenders, 
    gridRenders,
    showProjection,
    onToggleProjection
}: PerformanceHUDProps) {
    const [metrics, setMetrics] = useState({ fps: 60, scripting: 0 });

    useEffect(() => {
        const interval = setInterval(() => {
            if (perfRef.current) {
                setMetrics({
                    fps: Math.round(perfRef.current.fps),
                    scripting: Number(perfRef.current.avgScriptTime.toFixed(3))
                });
            }
        }, 200);
        return () => clearInterval(interval);
    }, [perfRef]);

    return (
        <div style={{
            position: 'absolute',
            top: -42,
            left: 0,
            right: 0,
            display: 'flex',
            justifyContent: 'space-between',
            // No backdrop-filter and no transition: this strip sits directly
            // above the board and its numbers change every 200ms, so either one
            // would put a permanently re-compositing layer into every
            // performance trace taken to measure the thing below it.
            background: 'rgba(15, 23, 42, 0.7)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: 14,
            padding: '6px 14px',
            fontSize: 10,
            fontWeight: 800,
            color: '#94a3b8',
            fontFamily: 'monospace',
            pointerEvents: 'none',
            zIndex: 100,
            boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
        }}>
            <div style={{ display: 'flex', gap: 12 }}>
                <span>FPS: <span style={{ color: metrics.fps >= 58 ? '#22c55e' : metrics.fps >= 45 ? '#f59e0b' : '#ef4444' }}>{metrics.fps}</span></span>
                <span>JS: <span style={{ color: metrics.scripting < 2 ? '#38bdf8' : '#f43f5e' }}>{metrics.scripting}ms</span></span>
            </div>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                <span>Grid Renders: <span style={{ color: gridRenders === 0 ? '#94a3b8' : '#fbbf24' }}>{gridRenders}</span></span>
                <span>Canvas Tick: <span style={{ color: '#a78bfa' }}>{canvasRenders}</span></span>
                <button 
                    onClick={(e) => {
                        e.stopPropagation();
                        onToggleProjection();
                    }}
                    style={{
                        background: showProjection ? '#22c55e' : '#64748b',
                        border: 'none',
                        borderRadius: 6,
                        color: 'white',
                        fontSize: 9,
                        padding: '2px 6px',
                        cursor: 'pointer',
                        pointerEvents: 'auto',
                        marginLeft: 8,
                        fontWeight: 'bold'
                    }}
                >
                    {showProjection ? 'Projection ON' : 'Projection OFF'}
                </button>
            </div>
        </div>
    );
});
