import { memo, useState, useEffect } from 'react';

interface PerformanceHUDProps {
    perfRef: React.RefObject<{
        fps: number;
        avgScriptTime: number;
    }>;
    canvasRenders: number;
    gridRenders: number;
    showProjection: boolean;
    onToggleProjection: () => void;
}

export const PerformanceHUD = memo(function PerformanceHUD({ 
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
            background: 'rgba(15, 23, 42, 0.7)',
            backdropFilter: 'blur(8px)',
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
            transition: 'all 0.3s'
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
