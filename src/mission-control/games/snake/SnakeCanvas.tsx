// ============================================================
// Snake Game — Canvas Renderer
// Draws the game grid, snake, fruit emojis, and junk food.
// ⚠️  Internal to src/mission-control/games/snake/ only.
// ============================================================

import { useRef, useEffect } from 'react';
import type { SnakeGameState, Position, Direction, FoodItem } from './types';
import {
    CELL_SIZE,
    CANVAS_WIDTH,
    CANVAS_HEIGHT,
    COLORS,
    LEVEL_GRID_SIZES,
} from './types';

// ── Pre-computed font strings (avoid per-frame string creation) ──
const FONT_FOOD = `${CELL_SIZE - 6}px serif`;
const FONT_WAITING = "bold 22px 'Nunito', sans-serif";
const FONT_GAMEOVER_TITLE = "bold 42px 'Nunito', sans-serif";
const FONT_GAMEOVER_SCORE = "bold 24px 'Nunito', sans-serif";
const FONT_GAMEOVER_HINT = "16px 'Nunito', sans-serif";

// ── Dynamic Grid Drawer ──
function drawGrid(ctx: CanvasRenderingContext2D, cols: number, rows: number) {
    // Grid lines
    ctx.strokeStyle = COLORS.gridLine;
    ctx.lineWidth = 1;
    for (let x = 0; x <= cols; x++) {
        ctx.beginPath();
        ctx.moveTo(x * CELL_SIZE, 0);
        ctx.lineTo(x * CELL_SIZE, rows * CELL_SIZE);
        ctx.stroke();
    }
    for (let y = 0; y <= rows; y++) {
        ctx.beginPath();
        ctx.moveTo(0, y * CELL_SIZE);
        ctx.lineTo(cols * CELL_SIZE, y * CELL_SIZE);
        ctx.stroke();
    }

    // Border Wall
    ctx.strokeStyle = '#334155'; // Slate 700 border
    ctx.lineWidth = 4;
    ctx.strokeRect(0, 0, cols * CELL_SIZE, rows * CELL_SIZE);
}

function drawRoundedRect(
    ctx: CanvasRenderingContext2D,
    x: number, y: number, w: number, h: number, r: number,
) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
}

function drawSnakeSegment(
    ctx: CanvasRenderingContext2D,
    pos: Position,
    index: number,
    total: number,
    direction: Direction,
) {
    const pad = 2;
    const size = CELL_SIZE - pad * 2;
    const px = pos.x * CELL_SIZE + pad;
    const py = pos.y * CELL_SIZE + pad;
    const radius = index === 0 ? 10 : 6;

    // Gradient from head to tail
    const t = total > 1 ? index / (total - 1) : 0;
    const r = Math.round(34 + t * (22 - 34));
    const g = Math.round(197 + t * (163 - 197));
    const b = Math.round(94 + t * (74 - 94));
    ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;

    drawRoundedRect(ctx, px, py, size, size, radius);
    ctx.fill();

    // Head: draw eyes
    if (index === 0) {
        const cx = px + size / 2;
        const cy = py + size / 2;
        const eyeRadius = 4;
        const pupilRadius = 2;
        const eyeOffset = 7;

        let eye1: Position, eye2: Position;
        switch (direction) {
            case 'right':
                eye1 = { x: cx + 4, y: cy - eyeOffset };
                eye2 = { x: cx + 4, y: cy + eyeOffset };
                break;
            case 'left':
                eye1 = { x: cx - 4, y: cy - eyeOffset };
                eye2 = { x: cx - 4, y: cy + eyeOffset };
                break;
            case 'up':
                eye1 = { x: cx - eyeOffset, y: cy - 4 };
                eye2 = { x: cx + eyeOffset, y: cy - 4 };
                break;
            case 'down':
                eye1 = { x: cx - eyeOffset, y: cy + 4 };
                eye2 = { x: cx + eyeOffset, y: cy + 4 };
                break;
        }

        // White of eye
        ctx.fillStyle = COLORS.snakeEyeWhite;
        ctx.beginPath();
        ctx.arc(eye1.x, eye1.y, eyeRadius, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(eye2.x, eye2.y, eyeRadius, 0, Math.PI * 2);
        ctx.fill();

        // Pupil
        ctx.fillStyle = COLORS.snakeEyePupil;
        ctx.beginPath();
        ctx.arc(eye1.x, eye1.y, pupilRadius, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(eye2.x, eye2.y, pupilRadius, 0, Math.PI * 2);
        ctx.fill();
    }
}

/** Draw a food item (fruit or junk) as an emoji with a cheap gradient glow. */
function drawFoodEmoji(
    ctx: CanvasRenderingContext2D,
    item: FoodItem,
    glowColor: string,
) {
    const cx = item.position.x * CELL_SIZE + CELL_SIZE / 2;
    const cy = item.position.y * CELL_SIZE + CELL_SIZE / 2;
    const r = CELL_SIZE / 2 + 4;

    // Cheap radial gradient glow (no shadowBlur — avoids GPU blur pass)
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    grad.addColorStop(0, glowColor);
    grad.addColorStop(1, 'transparent');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();

    // Emoji text
    ctx.font = FONT_FOOD;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(item.emoji, cx, cy + 1);
}

function drawWaitingScreen(ctx: CanvasRenderingContext2D) {
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.font = FONT_WAITING;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    ctx.fillText(
        '🎮  Press an arrow key to start!',
        CANVAS_WIDTH / 2,
        CANVAS_HEIGHT / 2 + 50,
    );

    ctx.fillStyle = '#94a3b8';
    ctx.font = FONT_GAMEOVER_HINT;
    ctx.fillText(
        '(Select speed in the header above)',
        CANVAS_WIDTH / 2,
        CANVAS_HEIGHT / 2 + 80,
    );
}

function drawGameOverScreen(ctx: CanvasRenderingContext2D, score: number) {
    // Overlay
    ctx.fillStyle = 'rgba(15, 23, 42, 0.75)';
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    ctx.fillStyle = '#ef4444';
    ctx.font = FONT_GAMEOVER_TITLE;
    ctx.fillText('Game Over!', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 - 30);

    ctx.fillStyle = '#f8fafc';
    ctx.font = FONT_GAMEOVER_SCORE;
    ctx.fillText(`Score: ${score} 🍎`, CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 20);

    ctx.fillStyle = '#94a3b8';
    ctx.font = FONT_GAMEOVER_HINT;
    ctx.fillText('Press any arrow key to close', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 60);
}

// ── Component ────────────────────────────────────────────────

interface SnakeCanvasProps {
    gameState: SnakeGameState;
}

export function SnakeCanvas({ gameState }: SnakeCanvasProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const animFrameRef = useRef<number>(0);
    const gameStateRef = useRef(gameState);
    gameStateRef.current = gameState;

    // Stable render loop — runs once, reads state from ref
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const loop = () => {
            const gs = gameStateRef.current;
            const { cols, rows } = LEVEL_GRID_SIZES[gs.level];
            const offsetX = (CANVAS_WIDTH - cols * CELL_SIZE) / 2;
            const offsetY = (CANVAS_HEIGHT - rows * CELL_SIZE) / 2;

            // Clear full canvas
            ctx.fillStyle = COLORS.bg;
            ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

            ctx.save();
            ctx.translate(offsetX, offsetY);

            drawGrid(ctx, cols, rows);

            // Draw healthy fruit (green glow)
            drawFoodEmoji(ctx, gs.fruit, COLORS.fruitAura);

            // Draw junk food if present (red glow)
            if (gs.junkFood) {
                drawFoodEmoji(ctx, gs.junkFood, COLORS.junkAura);
            }

            const total = gs.snake.length;
            for (let i = 0; i < total; i++) {
                drawSnakeSegment(ctx, gs.snake[i], i, total, gs.direction);
            }

            ctx.restore();

            if (gs.phase === 'waiting') {
                drawWaitingScreen(ctx);
            } else if (gs.phase === 'game-over') {
                drawGameOverScreen(ctx, gs.score);
            }


            animFrameRef.current = requestAnimationFrame(loop);
        };
        animFrameRef.current = requestAnimationFrame(loop);
        return () => cancelAnimationFrame(animFrameRef.current);
    }, []);

    return (
        <canvas
            ref={canvasRef}
            width={CANVAS_WIDTH}
            height={CANVAS_HEIGHT}
            style={{
                borderRadius: 12,
                display: 'block',
                width: '100%',
                height: '100%',
                objectFit: 'contain',
            }}
        />
    );
}
