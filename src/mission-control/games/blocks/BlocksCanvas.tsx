import { useRef, useState, useCallback, useEffect, memo, useMemo } from 'react';
import { GameShape, BlocksGameState, GRID_SIZE, CELL_DISPLAY_SIZE } from './types';
import { QuizOverlay } from '../quiz/QuizOverlay';
import { Altimeter } from './Altimeter';
import { StandardShapesTray } from './StandardShapesTray';
import { RescueSlot } from './RescueSlot';
import { ShapeItem } from './ShapeItem';
import { BlocksGrid } from './BlocksGrid';
import { PerformanceHUD } from './PerformanceHUD';
import { ClearedFeedbackOverlay } from './ClearedFeedbackOverlay';

interface BlocksCanvasProps {
    gameState: BlocksGameState;
    placeShape: (shape: GameShape, gridX: number, gridY: number, slotType: 'standard' | 'rescue', slotIndex: number) => boolean;
    triggerRescueQuiz: () => void;
    submitQuizAnswer: (answer: number) => void;
    refreshRescueShape: () => void;
}

interface ProjectionOverlayProps {
    hoverCells: { r: number; c: number }[];
    hoverValid: boolean;
}

const ProjectionOverlay = memo(function ProjectionOverlay({ hoverCells, hoverValid }: ProjectionOverlayProps) {
    if (hoverCells.length === 0) return null;
    
    const bg = hoverValid ? 'rgba(74, 222, 128, 0.4)' : 'rgba(239, 68, 68, 0.4)';
    const border = hoverValid ? '2px solid #4ade80' : '2px solid #ef4444';
    
    return (
        <div 
            style={{ 
                position: 'absolute', 
                inset: 8, 
                pointerEvents: 'none', 
                display: 'grid', 
                gridTemplateColumns: `repeat(${GRID_SIZE}, ${CELL_DISPLAY_SIZE}px)`, 
                gridTemplateRows: `repeat(${GRID_SIZE}, ${CELL_DISPLAY_SIZE}px)`, 
                gap: 4 
            }}
        >
            {hoverCells.map((cell, idx) => (
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
    gameState, placeShape, triggerRescueQuiz, submitQuizAnswer, refreshRescueShape
}: BlocksCanvasProps) {
    const boardRef = useRef<HTMLDivElement>(null);
    const boardRectRef = useRef<DOMRect | null>(null);
    
    const rendersRef = useRef(0);
    rendersRef.current += 1;
    const dragPerfRef = useRef({
        lastTickTime: 0,
        ticks: 0,
        fps: 60,
        totalScriptTime: 0,
        avgScriptTime: 0
    });

    const [hoverCells, setHoverCells] = useState<{ r: number; c: number }[]>([]);
    const [hoverValid, setHoverValid] = useState(false);
    const lastHoverCoordRef = useRef<{ r: number; c: number } | null>(null);

    const activeDragRef = useRef<{
        shape: GameShape;
        slotType: 'standard' | 'rescue';
        slotIndex: number;
        grabRow: number;
        grabCol: number;
    } | null>(null);

    const [isDragging, setIsDragging] = useState(false);
    const [pendingPlacement, setPendingPlacement] = useState<{ slotType: 'standard' | 'rescue'; slotIndex: number } | null>(null);
    const [showProjection, setShowProjection] = useState(true);
    const dragProxyRef = useRef<HTMLDivElement>(null);
    
    // Performance tracking
    const lastGridRef = useRef(gameState.grid);
    const gridRendersRef = useRef(0);
    if (lastGridRef.current !== gameState.grid) {
        gridRendersRef.current += 1;
        lastGridRef.current = gameState.grid;
    }

    const getGridCoord = useCallback((clientX: number, clientY: number) => {
        if (!boardRef.current) return null;
        const rect = boardRectRef.current || boardRef.current.getBoundingClientRect();
        const x = clientX - rect.left;
        const y = clientY - rect.top;
        
        const padding = 8;
        const gap = 4;
        const cellSize = CELL_DISPLAY_SIZE;
        
        const col = Math.floor((x - padding) / (cellSize + gap));
        const row = Math.floor((y - padding) / (cellSize + gap));
        
        if (col >= 0 && col < GRID_SIZE && row >= 0 && row < GRID_SIZE) {
            return { r: row, c: col };
        }
        return null;
    }, []);

    const updateHoverProjections = useCallback((clientX: number, clientY: number, shape: GameShape, grabRow: number, grabCol: number) => {
        const coord = getGridCoord(clientX, clientY);
        if (!coord) {
            if (lastHoverCoordRef.current !== null) {
                lastHoverCoordRef.current = null;
                setHoverCells([]);
            }
            return;
        }

        if (lastHoverCoordRef.current && 
            lastHoverCoordRef.current.r === coord.r && 
            lastHoverCoordRef.current.c === coord.c) {
            return;
        }

        lastHoverCoordRef.current = coord;

        const cells: { r: number; c: number }[] = [];
        let valid = true;

        for (const cell of shape.cells) {
            const r = coord.r - grabRow + cell.y;
            const c = coord.c - grabCol + cell.x;
            if (r < 0 || r >= GRID_SIZE || c < 0 || c >= GRID_SIZE) {
                valid = false;
            } else {
                cells.push({ r, c });
                const currentCellVal = gameState.grid[r][c];
                if (currentCellVal !== 0 && currentCellVal !== 3) {
                    valid = false;
                }
            }
        }

        setHoverCells(cells);
        setHoverValid(valid);
    }, [gameState.grid, getGridCoord]);

    const handleStartDrag = useCallback((
        event: React.PointerEvent<HTMLDivElement>,
        shape: GameShape,
        slotType: 'standard' | 'rescue',
        slotIndex: number
    ) => {
        event.preventDefault();
        if (boardRef.current) {
            boardRectRef.current = boardRef.current.getBoundingClientRect();
        }

        const rect = event.currentTarget.getBoundingClientRect();
        const offsetX = event.clientX - rect.left;
        const offsetY = event.clientY - rect.top;

        const xs = shape.cells.map(c => c.x);
        const ys = shape.cells.map(c => c.y);
        const minX = Math.min(...xs);
        const maxX = Math.max(...xs);
        const minY = Math.min(...ys);
        const maxY = Math.max(...ys);
        const widthCells = maxX - minX + 1;
        const heightCells = maxY - minY + 1;

        const col = Math.floor(offsetX / CELL_DISPLAY_SIZE);
        const row = Math.floor(offsetY / CELL_DISPLAY_SIZE);

        const grabCol = Math.max(0, Math.min(widthCells - 1, col));
        const grabRow = Math.max(0, Math.min(heightCells - 1, row));

        activeDragRef.current = {
            shape,
            slotType,
            slotIndex,
            grabRow,
            grabCol
        };

        dragPerfRef.current = {
            lastTickTime: performance.now(),
            ticks: 0,
            fps: 60,
            totalScriptTime: 0,
            avgScriptTime: 0
        };

        setIsDragging(true);

        requestAnimationFrame(() => {
            if (dragProxyRef.current) {
                dragProxyRef.current.style.transform = `translate(${event.clientX - grabCol * CELL_DISPLAY_SIZE - 24}px, ${event.clientY - grabRow * CELL_DISPLAY_SIZE - 24}px)`;
            }
        });
    }, []);

    useEffect(() => {
        if (!isDragging) return;

        const handlePointerMove = (e: PointerEvent) => {
            const start = performance.now();
            const drag = activeDragRef.current;
            if (!drag) return;

            if (dragProxyRef.current) {
                const x = e.clientX - drag.grabCol * CELL_DISPLAY_SIZE - 24;
                const y = e.clientY - drag.grabRow * CELL_DISPLAY_SIZE - 24;
                dragProxyRef.current.style.transform = `translate(${x}px, ${y}px)`;
            }
            
            if (showProjection) {
                updateHoverProjections(e.clientX, e.clientY, drag.shape, drag.grabRow, drag.grabCol);
            }

            const end = performance.now();
            const elapsed = end - start;
            
            const perf = dragPerfRef.current;
            perf.ticks += 1;
            perf.totalScriptTime += elapsed;
            perf.avgScriptTime = perf.totalScriptTime / perf.ticks;

            const timeDiff = end - perf.lastTickTime;
            if (timeDiff > 0) {
                const instantFps = 1000 / timeDiff;
                perf.fps = perf.fps * 0.9 + instantFps * 0.1;
            }
            perf.lastTickTime = end;

            if (perf.ticks % 10 === 0 && import.meta.env.DEV) {
                // We'll let the PerformanceHUD component poll the ref instead of triggering canvas re-renders
            }
        };

        const handlePointerUp = (e: PointerEvent) => {
            const drag = activeDragRef.current;
            if (!drag) return;

            const coord = getGridCoord(e.clientX, e.clientY);
            
            activeDragRef.current = null;
            setIsDragging(false);
            setHoverCells([]);
            lastHoverCoordRef.current = null;
            boardRectRef.current = null;

            if (coord) {
                const gridX = coord.c - drag.grabCol;
                const gridY = coord.r - drag.grabRow;
                
                // Mask the slot immediately to prevent "jump back" visual flicker
                setPendingPlacement({ slotType: drag.slotType, slotIndex: drag.slotIndex });
                // The slot will stay hidden for 250ms or until it disappears from the bank
                setTimeout(() => setPendingPlacement(null), 250);
                
                placeShape(drag.shape, gridX, gridY, drag.slotType, drag.slotIndex);
            }
        };

        window.addEventListener('pointermove', handlePointerMove);
        window.addEventListener('pointerup', handlePointerUp);

        return () => {
            window.removeEventListener('pointermove', handlePointerMove);
            window.removeEventListener('pointerup', handlePointerUp);
        };
    }, [isDragging, updateHoverProjections, getGridCoord, placeShape, showProjection]);

    const activeDragSlot = useMemo(() => {
        if (isDragging && activeDragRef.current) {
            return { slotType: activeDragRef.current.slotType, slotIndex: activeDragRef.current.slotIndex };
        }
        return pendingPlacement;
    }, [isDragging, pendingPlacement]);

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
                        onToggleProjection={() => {
                            setShowProjection(prev => !prev);
                            if (showProjection) setHoverCells([]);
                        }}
                    />
                )}

                <div style={{ position: 'relative' }}>
                    <BlocksGrid ref={boardRef} grid={gameState.grid} />
                    {showProjection && <ProjectionOverlay hoverCells={hoverCells} hoverValid={hoverValid} />}
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

            {isDragging && activeDragRef.current && (
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
                    <ShapeItem shape={activeDragRef.current.shape} />
                </div>
            )}

            {gameState.quizQuestion && (
                <div style={{ 
                    position: 'absolute', 
                    inset: -12, 
                    zIndex: 1000, 
                    background: 'rgba(15, 23, 42, 0.75)', 
                    backdropFilter: 'blur(8px)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: 28
                }}>
                    <div style={{ width: 420 }}>
                        <QuizOverlay
                            open={true}
                            requiredCorrect={1}
                            currentCorrect={0}
                            livesRemaining={3}
                            generator={() => ({ text: gameState.quizQuestion!.text, answer: gameState.quizQuestion!.answer })}
                            onCorrect={() => submitQuizAnswer(gameState.quizQuestion!.answer)}
                            title="Solve Math to Unlock Golden Shape!"
                        />
                    </div>
                </div>
            )}
        </div>
    );
}
