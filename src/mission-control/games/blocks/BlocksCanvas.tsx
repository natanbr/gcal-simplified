import { useRef, useState, memo } from 'react';
import {
    GameShape, BlocksGameState, GRID_SIZE, CELL_DISPLAY_SIZE, BOARD_GAP, BOARD_BORDER, BOARD_PADDING,
} from './types';
import { RescueQuizLayer } from './RescueQuizLayer';
import type { QuizEngineApi } from '../quiz/types';
import { Altimeter } from './Altimeter';
import { StandardShapesTray } from './StandardShapesTray';
import { RescueSlot } from './RescueSlot';
import { ShapeItem } from './ShapeItem';
import { BlocksGrid } from './BlocksGrid';
import { PerformanceHUD } from './PerformanceHUD';
import { ClearedFeedbackOverlay } from './ClearedFeedbackOverlay';
import { useShapeDrag } from './useShapeDrag';
import type { Projection } from './dragGeometry';

interface BlocksCanvasProps {
    gameState: BlocksGameState;
    placeShape: (shape: GameShape, gridX: number, gridY: number, slotType: 'standard' | 'rescue', slotIndex: number) => boolean;
    triggerRescueQuiz: () => void;
    resolveRescueQuiz: () => void;
    cancelRescueQuiz: () => void;
    engine: QuizEngineApi;
    refreshRescueShape: () => void;
}

interface ProjectionOverlayProps {
    projection: Projection;
}

const ProjectionOverlay = memo(function ProjectionOverlay({ projection }: ProjectionOverlayProps) {
    const { cells, valid } = projection;
    if (cells.length === 0) return null;

    const bg = valid ? 'rgba(74, 222, 128, 0.4)' : 'rgba(239, 68, 68, 0.4)';
    const border = valid ? '2px solid #4ade80' : '2px solid #ef4444';

    return (
        <div
            data-testid="projection-overlay"
            style={{
                position: 'absolute',
                // The overlay is a sibling of BlocksGrid inside a `position:
                // relative` wrapper, so its containing block is that wrapper's
                // padding box — which coincides with the grid's border box only
                // because the wrapper shrink-wraps its single in-flow child.
                // Reproducing the grid's own box model here rather than
                // hardcoding the sum is what keeps the ghost on the cells: a
                // fractional border is snapped to device pixels, and only an
                // identical border gets snapped the same way. Insetting by
                // border+padding directly drew the ghost half a pixel off, which
                // flips the rounding on a boundary.
                inset: 0,
                boxSizing: 'border-box',
                border: `${BOARD_BORDER}px solid transparent`,
                padding: BOARD_PADDING,
                pointerEvents: 'none',
                display: 'grid',
                gridTemplateColumns: `repeat(${GRID_SIZE}, ${CELL_DISPLAY_SIZE}px)`,
                gridTemplateRows: `repeat(${GRID_SIZE}, ${CELL_DISPLAY_SIZE}px)`,
                gap: BOARD_GAP
            }}
        >
            {cells.map((cell, idx) => (
                <div
                    key={idx}
                    style={{
                        gridColumnStart: cell.c + 1,
                        gridRowStart: cell.r + 1,
                        width: CELL_DISPLAY_SIZE,
                        height: CELL_DISPLAY_SIZE,
                        background: bg,
                        border,
                        borderRadius: 8,
                    }}
                />
            ))}
        </div>
    );
});

export function BlocksCanvas({
    gameState, placeShape, triggerRescueQuiz, resolveRescueQuiz, cancelRescueQuiz, engine, refreshRescueShape
}: BlocksCanvasProps) {
    const rendersRef = useRef(0);
    rendersRef.current += 1;

    const [showProjection, setShowProjection] = useState(true);

    const {
        boardRef, dragProxyRef, dragPerfRef, handleStartDrag,
        activeDragSlot, draggedShape, projection,
    } = useShapeDrag({ grid: gameState.grid, placeShape, showProjection });

    // Performance tracking
    const lastGridRef = useRef(gameState.grid);
    const gridRendersRef = useRef(0);
    if (lastGridRef.current !== gameState.grid) {
        gridRendersRef.current += 1;
        lastGridRef.current = gameState.grid;
    }

    return (
        <div style={{ display: 'flex', gap: 28, alignItems: 'stretch', width: '100%', height: '100%', justifyContent: 'center', position: 'relative' }}>
            <Altimeter altitude={gameState.altitude} />

            <div style={{ display: 'flex', flexDirection: 'column', gap: 16, alignItems: 'center', position: 'relative' }}>
                {import.meta.env.DEV && (
                    <PerformanceHUD
                        perfRef={dragPerfRef}
                        canvasRenders={rendersRef.current}
                        gridRenders={gridRendersRef.current}
                        showProjection={showProjection}
                        onToggleProjection={() => setShowProjection(prev => !prev)}
                    />
                )}

                <div style={{ position: 'relative' }}>
                    <BlocksGrid ref={boardRef} grid={gameState.grid} />
                    {showProjection && <ProjectionOverlay projection={projection} />}
                    <ClearedFeedbackOverlay feedback={gameState.clearedFeedback} />
                </div>

                <StandardShapesTray
                    standardShapes={gameState.standardShapes}
                    activeDragSlot={activeDragSlot}
                    onStartDrag={handleStartDrag}
                />
            </div>

            <RescueSlot
                rescueShape={gameState.rescueShape}
                rescueShapeLocked={gameState.rescueShapeLocked}
                triggerRescueQuiz={triggerRescueQuiz}
                refreshRescueShape={refreshRescueShape}
                activeDragSlot={activeDragSlot}
                onStartDrag={handleStartDrag}
            />

            {draggedShape && (
                <div
                    ref={dragProxyRef}
                    style={{
                        position: 'fixed',
                        left: 0,
                        top: 0,
                        pointerEvents: 'none',
                        zIndex: 9999,
                        willChange: 'transform',
                    }}
                >
                    <ShapeItem shape={draggedShape} gap={BOARD_GAP} />
                </div>
            )}

            {gameState.rescueQuizActive && (
                <RescueQuizLayer
                    engine={engine}
                    onSolved={resolveRescueQuiz}
                    onCancel={cancelRescueQuiz}
                />
            )}
        </div>
    );
}
