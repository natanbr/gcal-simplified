// ============================================================
// Fruit Merge — Canvas Renderer
// Draws container, fruits (from matter.js bodies), drop guide,
// merge flash effects, and delete-selection highlights.
// ============================================================

import { useRef, useEffect, useCallback } from 'react';
import Matter from 'matter-js';
import type { FruitMergeGameState, FruitBody, MergeEffect } from './types';
import {
    FRUIT_TYPES, CANVAS_WIDTH, CANVAS_HEIGHT, CONTAINER_WIDTH,
    CONTAINER_HEIGHT, WALL_THICKNESS, DROP_ZONE_Y, GAME_OVER_LINE_Y,
    COLORS,
} from './types';

interface FruitMergeCanvasProps {
    gameState: FruitMergeGameState;
    engineRef: React.RefObject<Matter.Engine | null>;
    fruitMapRef: React.RefObject<Map<number, FruitBody>>;
    mergeEffectsRef: React.RefObject<MergeEffect[]>;
    onDropXChange: (x: number) => void;
    onDrop: () => void;
    onFruitClick: (bodyId: number) => void;
}

// ── Drawing helpers (module-level to avoid per-frame allocation) ──

function drawContainer(ctx: CanvasRenderingContext2D) {
    const x = WALL_THICKNESS;
    const y = DROP_ZONE_Y;

    // Interior
    ctx.fillStyle = COLORS.containerFill;
    ctx.fillRect(x, y, CONTAINER_WIDTH, CONTAINER_HEIGHT);

    // Left wall
    ctx.fillStyle = COLORS.containerWall;
    ctx.fillRect(0, y - WALL_THICKNESS, WALL_THICKNESS, CONTAINER_HEIGHT + WALL_THICKNESS * 2);
    // Right wall
    ctx.fillRect(x + CONTAINER_WIDTH, y - WALL_THICKNESS, WALL_THICKNESS, CONTAINER_HEIGHT + WALL_THICKNESS * 2);
    // Floor
    ctx.fillRect(0, y + CONTAINER_HEIGHT, CONTAINER_WIDTH + WALL_THICKNESS * 2, WALL_THICKNESS);
}

function drawDangerLine(ctx: CanvasRenderingContext2D) {
    ctx.save();
    ctx.strokeStyle = COLORS.dangerLine;
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 4]);
    ctx.beginPath();
    ctx.moveTo(WALL_THICKNESS, GAME_OVER_LINE_Y);
    ctx.lineTo(WALL_THICKNESS + CONTAINER_WIDTH, GAME_OVER_LINE_Y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
}

function drawFruit(
    ctx: CanvasRenderingContext2D,
    x: number, y: number, angle: number, tier: number,
    highlight: boolean,
) {
    const ft = FRUIT_TYPES[tier];
    const r = ft.radius;

    ctx.save();
    ctx.translate(x, y);

    // Delete-mode highlight glow
    if (highlight) {
        ctx.beginPath();
        ctx.arc(0, 0, r + 6, 0, Math.PI * 2);
        ctx.fillStyle = COLORS.deleteGlow;
        ctx.fill();
        ctx.strokeStyle = COLORS.deleteHighlight;
        ctx.lineWidth = 3;
        ctx.stroke();
    }

    ctx.rotate(angle);

    // Filled circle
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fillStyle = ft.color;
    ctx.fill();
    ctx.strokeStyle = ft.strokeColor;
    ctx.lineWidth = 2;
    ctx.stroke();

    // Emoji (un-rotate so text is upright)
    ctx.rotate(-angle);
    const fontSize = Math.max(12, r * 0.9);
    ctx.font = `${fontSize}px serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(ft.emoji, 0, 1);

    ctx.restore();
}

function drawDropGuide(
    ctx: CanvasRenderingContext2D,
    x: number, tier: number,
) {
    const ft = FRUIT_TYPES[tier];
    const drawX = x;

    // Grey guide line from preview to floor
    ctx.save();
    ctx.strokeStyle = COLORS.dropGuide;
    ctx.lineWidth = ft.radius * 2;
    ctx.globalAlpha = 0.12;
    ctx.beginPath();
    ctx.moveTo(drawX, DROP_ZONE_Y - 40);
    ctx.lineTo(drawX, DROP_ZONE_Y + CONTAINER_HEIGHT);
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.restore();

    // Dashed center line
    ctx.save();
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.25)';
    ctx.lineWidth = 1;
    ctx.setLineDash([6, 6]);
    ctx.beginPath();
    ctx.moveTo(drawX, DROP_ZONE_Y - 30);
    ctx.lineTo(drawX, DROP_ZONE_Y + CONTAINER_HEIGHT);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();

    // Ghost fruit at top
    ctx.globalAlpha = 0.5;
    drawFruit(ctx, drawX, DROP_ZONE_Y - 40, 0, tier, false);
    ctx.globalAlpha = 1;
}

function drawMergeEffects(ctx: CanvasRenderingContext2D, effects: MergeEffect[], now: number) {
    for (let i = effects.length - 1; i >= 0; i--) {
        const e = effects[i];
        const elapsed = now - e.startTime;
        const duration = 300;
        if (elapsed > duration) {
            effects.splice(i, 1);
            continue;
        }
        const progress = elapsed / duration;
        const maxR = FRUIT_TYPES[Math.min(e.tier, FRUIT_TYPES.length - 1)].radius * 2;
        const radius = maxR * progress;
        const alpha = (1 - progress) * 0.6;

        ctx.beginPath();
        ctx.arc(e.x, e.y, radius, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
        ctx.fill();
    }
}

function drawEndScreen(
    ctx: CanvasRenderingContext2D,
    label: string, score: number, highestTier: number,
) {
    ctx.fillStyle = 'rgba(15, 23, 42, 0.75)';
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    ctx.font = 'bold 28px Nunito, sans-serif';
    ctx.fillStyle = '#f8fafc';
    ctx.fillText(label, CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 - 60);

    const emoji = FRUIT_TYPES[Math.min(highestTier, FRUIT_TYPES.length - 1)].emoji;
    ctx.font = '64px serif';
    ctx.fillText(emoji, CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 10);

    ctx.font = 'bold 22px Nunito, sans-serif';
    ctx.fillStyle = '#facc15';
    ctx.fillText(`Score: ${score}`, CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 70);
}

// ── Component ──────────────────────────────────────────────────

export function FruitMergeCanvas({
    gameState, engineRef, fruitMapRef, mergeEffectsRef,
    onDropXChange, onDrop, onFruitClick,
}: FruitMergeCanvasProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const renderFrameRef = useRef<number>(0);
    const gameStateRef = useRef(gameState);
    gameStateRef.current = gameState;

    const hoverBodyIdRef = useRef<number | null>(null);

    // ── Pointer position → drop X or hover highlight ───────────
    const handlePointerMove = useCallback((e: React.PointerEvent) => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        const scaleX = CANVAS_WIDTH / rect.width;
        const rawX = (e.clientX - rect.left) * scaleX;
        const x = rawX - WALL_THICKNESS;

        const gs = gameStateRef.current;

        if (gs.phase === 'playing') {
            onDropXChange(Math.max(0, Math.min(CONTAINER_WIDTH, x)));
            hoverBodyIdRef.current = null;
        } else if (gs.phase === 'selecting-delete') {
            // Find hovered fruit
            const scaleY = CANVAS_HEIGHT / rect.height;
            const mouseY = (e.clientY - rect.top) * scaleY;
            hoverBodyIdRef.current = findBodyAt(engineRef.current, fruitMapRef.current, rawX, mouseY);
        }
    }, [onDropXChange, engineRef, fruitMapRef]);

    const handleClick = useCallback(() => {
        const gs = gameStateRef.current;
        if (gs.phase === 'playing' && gs.canDrop) {
            onDrop();
        } else if (gs.phase === 'selecting-delete' && hoverBodyIdRef.current !== null) {
            onFruitClick(hoverBodyIdRef.current);
        }
    }, [onDrop, onFruitClick]);

    // ── Render loop ────────────────────────────────────────────
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const loop = () => {
            const gs = gameStateRef.current;
            const engine = engineRef.current;
            const now = performance.now();

            ctx.fillStyle = COLORS.bg;
            ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

            drawContainer(ctx);
            drawDangerLine(ctx);

            // Fruits
            if (engine) {
                const bodies = Matter.Composite.allBodies(engine.world);
                const fMap = fruitMapRef.current;
                const isSelectingDelete = gs.phase === 'selecting-delete';
                const hoverId = hoverBodyIdRef.current;

                for (const body of bodies) {
                    if (body.isStatic) continue;
                    const fruit = fMap?.get(body.id);
                    if (!fruit) continue;
                    const highlight = isSelectingDelete && body.id === hoverId;
                    drawFruit(ctx, body.position.x, body.position.y, body.angle, fruit.tier, highlight);
                }
            }

            // Drop guide + preview
            if (gs.phase === 'playing' && gs.canDrop) {
                const r = FRUIT_TYPES[gs.currentDropTier].radius;
                const clampedX = WALL_THICKNESS + Math.max(r, Math.min(CONTAINER_WIDTH - r, gs.dropX));
                drawDropGuide(ctx, clampedX, gs.currentDropTier);
            }

            // Merge effects
            drawMergeEffects(ctx, mergeEffectsRef.current ?? [], now);

            // End screens
            if (gs.phase === 'game-over') {
                drawEndScreen(ctx, 'Game Over', gs.score, gs.highestTier);
            } else if (gs.phase === 'time-up') {
                drawEndScreen(ctx, "Time's Up!", gs.score, gs.highestTier);
            } else if (gs.phase === 'waiting') {
                ctx.fillStyle = 'rgba(15, 23, 42, 0.6)';
                ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.font = 'bold 24px Nunito, sans-serif';
                ctx.fillStyle = '#94a3b8';
                ctx.fillText('Click Play to Start', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2);
            }

            // Delete-mode cursor indicator
            if (gs.phase === 'selecting-delete') {
                ctx.fillStyle = 'rgba(239, 68, 68, 0.08)';
                ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

                ctx.textAlign = 'center';
                ctx.textBaseline = 'top';
                ctx.font = 'bold 14px Nunito, sans-serif';
                ctx.fillStyle = '#ef4444';
                ctx.fillText('Click a fruit to delete', CANVAS_WIDTH / 2, 8);
            }

            renderFrameRef.current = requestAnimationFrame(loop);
        };

        renderFrameRef.current = requestAnimationFrame(loop);
        return () => cancelAnimationFrame(renderFrameRef.current);
    }, [engineRef, fruitMapRef, mergeEffectsRef]);

    return (
        <canvas
            ref={canvasRef}
            width={CANVAS_WIDTH}
            height={CANVAS_HEIGHT}
            onPointerMove={handlePointerMove}
            onClick={handleClick}
            style={{
                borderRadius: 12,
                display: 'block',
                maxWidth: '100%',
                maxHeight: '100%',
                objectFit: 'contain',
                cursor: gameState.phase === 'selecting-delete' ? 'crosshair' : 'default',
            }}
        />
    );
}

// ── Hit-testing for delete selection ───────────────────────────

function findBodyAt(
    engine: Matter.Engine | null,
    fruitMap: Map<number, FruitBody> | null,
    x: number, y: number,
): number | null {
    if (!engine || !fruitMap) return null;
    const bodies = Matter.Composite.allBodies(engine.world);
    for (const body of bodies) {
        if (body.isStatic) continue;
        const fruit = fruitMap.get(body.id);
        if (!fruit) continue;
        const r = FRUIT_TYPES[fruit.tier].radius;
        const dx = body.position.x - x;
        const dy = body.position.y - y;
        if (dx * dx + dy * dy <= r * r) return body.id;
    }
    return null;
}
