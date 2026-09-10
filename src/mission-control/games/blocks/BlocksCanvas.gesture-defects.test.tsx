// ============================================================
// The touchscreen drag contract for Space Rescue. Written RED against the six
// gesture defects a child hit on 2026-09-07 (a second finger dropping the
// shape, a drop landing away from the green ghost, a grab cell computed at the
// wrong scale, a cancelled touch freezing the drag, a refused drop blanking the
// bank) and green since those were fixed. Real ShapeItem, no mock: the tray
// renders 36px cells and the geometry bug hid behind a 48px stub.
// ============================================================
import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BlocksCanvas } from './BlocksCanvas';
import type { BlocksGameState, GameShape } from './types';
import type { QuizEngineApi } from '../quiz/types';

function stubEngine(): QuizEngineApi {
    return {
        generator: () => ({ kind: 'numeric', skill: 'math-add', level: 0, text: '1 + 1 = ?', answer: 2 }),
        beginSession: vi.fn(),
        setDifficulty: vi.fn(),
        onAnswered: vi.fn(),
        notifyQuizClosed: vi.fn(),
    };
}

const BAR_H: GameShape = {
    id: 'bar-h', name: 'Bar H', color: '#a78bfa',
    cells: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 3, y: 0 }],
};
const BLOCK_2X2: GameShape = {
    id: 'block-2x2', name: 'Block', color: '#f59e0b',
    cells: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }],
};

function stateWith(shape: GameShape): BlocksGameState {
    return {
        grid: Array.from({ length: 8 }, () => Array(8).fill(0)),
        standardShapes: [shape, null, null],
        rescueShape: null,
        rescueShapeLocked: true,
        altitude: 0, score: 0, phase: 'playing', level: 0,
        rescueQuizActive: false, clearedFeedback: null,
    };
}

// Board stub: border box at (10,10). BlocksGrid pads 8px, cells are 48px on a
// 52px pitch, so the centre of cell (r, c) is at 10 + 8 + 24 + 52·index.
const BOARD_LEFT = 10;
const BOARD_TOP = 10;
const cellCentre = (r: number, c: number) => ({
    clientX: BOARD_LEFT + 8 + 24 + 52 * c,
    clientY: BOARD_TOP + 8 + 24 + 52 * r,
});

// Tray stub: the item sits at (100,100) and renders cellSize=36 with a 1.5px gap.
const TRAY_LEFT = 100;
const TRAY_TOP = 100;
const TRAY_CELL = 36;
const TRAY_GAP = 1.5;

function rect(left: number, top: number, width: number, height: number): DOMRect {
    return {
        left, top, width, height, x: left, y: top,
        right: left + width, bottom: top + height, toJSON: () => ({}),
    };
}

function ptr(type: string, init: { clientX: number; clientY: number; pointerId: number }) {
    return new PointerEvent(type, { bubbles: true, ...init });
}

function setup(shape: GameShape, placeShape = vi.fn().mockReturnValue(true)) {
    const { container } = render(
        <BlocksCanvas
            gameState={stateWith(shape)}
            placeShape={placeShape}
            triggerRescueQuiz={vi.fn()}
            resolveRescueQuiz={vi.fn()}
            cancelRescueQuiz={vi.fn()}
            engine={stubEngine()}
            refreshRescueShape={vi.fn()}
        />,
    );

    const board = screen.getByTestId('blocks-grid');
    board.getBoundingClientRect = () => rect(BOARD_LEFT, BOARD_TOP, 8 * 52 + 12, 8 * 52 + 12);

    const item = container.querySelector<HTMLDivElement>('div[style*="cursor: grab"]');
    if (!item) throw new Error('draggable tray item not rendered');
    const xs = shape.cells.map(c => c.x);
    const ys = shape.cells.map(c => c.y);
    const w = (Math.max(...xs) + 1) * TRAY_CELL + Math.max(...xs) * TRAY_GAP;
    const h = (Math.max(...ys) + 1) * TRAY_CELL + Math.max(...ys) * TRAY_GAP;
    item.getBoundingClientRect = () => rect(TRAY_LEFT, TRAY_TOP, w, h);

    const proxy = () => container.querySelector('div[style*="z-index: 9999"]');
    return { container, item, placeShape, proxy };
}

describe('BlocksCanvas gesture contract', () => {
    beforeEach(() => vi.clearAllMocks());

    it('grab cell is derived from the cell size the tray actually renders (36px), not the 48px board size', () => {
        const { item, placeShape } = setup(BAR_H);

        // Finger lands 140px into a 148.5px-wide bar: the 4th cell (index 3).
        // With a 48px divisor the code decides it was the 3rd cell (index 2).
        fireEvent(item, ptr('pointerdown', { clientX: TRAY_LEFT + 140, clientY: TRAY_TOP + 18, pointerId: 1 }));
        act(() => { window.dispatchEvent(ptr('pointermove', { ...cellCentre(2, 5), pointerId: 1 })); });
        act(() => { window.dispatchEvent(ptr('pointerup', { ...cellCentre(2, 5), pointerId: 1 })); });

        // Grabbed by cell 3, dropped with that cell over column 5 ⇒ anchor column 2.
        expect(placeShape).toHaveBeenCalledWith(expect.objectContaining({ id: 'bar-h' }), 2, 2, 'standard', 0);
    });

    it('a pointerup from a different pointer (second finger, palm) does not drop the shape', () => {
        const { item, placeShape, proxy } = setup(BLOCK_2X2);

        fireEvent(item, ptr('pointerdown', { clientX: TRAY_LEFT + 10, clientY: TRAY_TOP + 10, pointerId: 1 }));
        expect(proxy()).not.toBeNull();

        act(() => { window.dispatchEvent(ptr('pointerup', { ...cellCentre(2, 2), pointerId: 2 })); });

        expect(placeShape).not.toHaveBeenCalled();
        expect(proxy()).not.toBeNull(); // finger 1 is still dragging
    });

    it('pointermove from a different pointer does not steer the dragged shape', () => {
        const { item, proxy } = setup(BLOCK_2X2);

        fireEvent(item, ptr('pointerdown', { clientX: TRAY_LEFT + 10, clientY: TRAY_TOP + 10, pointerId: 1 }));
        act(() => { window.dispatchEvent(ptr('pointermove', { ...cellCentre(1, 1), pointerId: 1 })); });
        const underFinger1 = (proxy() as HTMLDivElement).style.transform;

        act(() => { window.dispatchEvent(ptr('pointermove', { ...cellCentre(5, 5), pointerId: 2 })); }); // palm

        expect((proxy() as HTMLDivElement).style.transform).toBe(underFinger1);
    });

    it('drops the shape where the projection was last shown, not where the finger happened to lift', () => {
        const { item, placeShape } = setup(BLOCK_2X2);

        fireEvent(item, ptr('pointerdown', { clientX: TRAY_LEFT + 10, clientY: TRAY_TOP + 10, pointerId: 1 }));
        act(() => { window.dispatchEvent(ptr('pointermove', { ...cellCentre(2, 2), pointerId: 1 })); });
        // The green ghost is at (2,2). The lift registers one cell away (finger roll,
        // coalesced moves, or a frame of React latency on the ghost).
        act(() => { window.dispatchEvent(ptr('pointerup', { ...cellCentre(3, 3), pointerId: 1 })); });

        expect(placeShape).toHaveBeenCalledWith(expect.anything(), 2, 2, 'standard', 0);
    });

    it('pointercancel ends the drag: proxy unmounts and the tray shape is visible again', () => {
        const { item, placeShape, proxy } = setup(BLOCK_2X2);

        fireEvent(item, ptr('pointerdown', { clientX: TRAY_LEFT + 10, clientY: TRAY_TOP + 10, pointerId: 1 }));
        expect(proxy()).not.toBeNull();

        act(() => { window.dispatchEvent(ptr('pointercancel', { clientX: 0, clientY: 0, pointerId: 1 })); });

        expect(proxy()).toBeNull();
        expect(item.style.opacity).toBe('1');
        expect(placeShape).not.toHaveBeenCalled();
    });

    it('a rejected drop leaves the tray shape visible instead of blanking it for 250ms', () => {
        const rejecting = vi.fn().mockReturnValue(false);
        const { item } = setup(BLOCK_2X2, rejecting);

        fireEvent(item, ptr('pointerdown', { clientX: TRAY_LEFT + 10, clientY: TRAY_TOP + 10, pointerId: 1 }));
        act(() => { window.dispatchEvent(ptr('pointermove', { ...cellCentre(2, 2), pointerId: 1 })); });
        act(() => { window.dispatchEvent(ptr('pointerup', { ...cellCentre(2, 2), pointerId: 1 })); });

        expect(rejecting).toHaveBeenCalled();
        expect(item.style.opacity).toBe('1');
    });
});
