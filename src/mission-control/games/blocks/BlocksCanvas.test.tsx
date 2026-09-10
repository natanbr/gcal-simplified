// ============================================================
// Drag contract, second half. BlocksCanvas.gesture-defects.test.tsx covers the
// six defects found on the child's touchscreen; this file covers the rules
// around them that nothing else asserts: the board's 2.5px border, the rescue
// slot's 22px cells, a refused second grab, and tap-to-return.
//
// The old version of this file mocked ShapeItem at a 48px pitch, which is
// exactly what hid the wrong-cell-size defect. It now renders the real one.
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

const BLOCK_2X2: GameShape = {
    id: 'block-2x2', name: 'Block', color: '#f59e0b',
    cells: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }],
};
const BAR_H: GameShape = {
    id: 'bar-h', name: 'Bar H', color: '#a78bfa',
    cells: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 3, y: 0 }],
};
const DOT: GameShape = { id: 'dot', name: 'Dot', color: '#38bdf8', cells: [{ x: 0, y: 0 }] };

const BOARD_LEFT = 10;
const BOARD_TOP = 10;
const BOARD_BORDER = 2.5;
const BOARD_PADDING = 8;
const BOARD_PITCH = 52;
/** Centre of board cell (r, c) in client coordinates — border included. */
const cellCentre = (r: number, c: number) => ({
    clientX: BOARD_LEFT + BOARD_BORDER + BOARD_PADDING + 24 + BOARD_PITCH * c,
    clientY: BOARD_TOP + BOARD_BORDER + BOARD_PADDING + 24 + BOARD_PITCH * r,
});

const TRAY_LEFT = 100;
const TRAY_TOP = 100;
const SHAPE_GAP = 1.5;

function rect(left: number, top: number, width: number, height: number): DOMRect {
    return { left, top, width, height, x: left, y: top, right: left + width, bottom: top + height, toJSON: () => ({}) };
}

function ptr(type: string, init: { clientX: number; clientY: number; pointerId: number }) {
    return new PointerEvent(type, { bubbles: true, ...init });
}

function stubItemRect(item: HTMLElement, shape: GameShape, cellSize: number, left: number, top: number) {
    const cols = Math.max(...shape.cells.map(c => c.x)) + 1;
    const rows = Math.max(...shape.cells.map(c => c.y)) + 1;
    item.getBoundingClientRect = () => rect(
        left, top,
        cols * cellSize + (cols - 1) * SHAPE_GAP,
        rows * cellSize + (rows - 1) * SHAPE_GAP,
    );
}

function stateWith(overrides: Partial<BlocksGameState> = {}): BlocksGameState {
    return {
        grid: Array.from({ length: 8 }, () => Array(8).fill(0)),
        standardShapes: [BLOCK_2X2, null, null],
        rescueShape: null,
        rescueShapeLocked: true,
        altitude: 0, score: 0, phase: 'playing', level: 0,
        rescueQuizActive: false, clearedFeedback: null,
        ...overrides,
    };
}

function setup(gameState: BlocksGameState, placeShape = vi.fn().mockReturnValue(true)) {
    const { container } = render(
        <BlocksCanvas
            gameState={gameState}
            placeShape={placeShape}
            triggerRescueQuiz={vi.fn()}
            resolveRescueQuiz={vi.fn()}
            cancelRescueQuiz={vi.fn()}
            engine={stubEngine()}
            refreshRescueShape={vi.fn()}
        />,
    );

    const board = screen.getByTestId('blocks-grid');
    board.getBoundingClientRect = () => rect(BOARD_LEFT, BOARD_TOP, 433, 433);

    const items = [...container.querySelectorAll<HTMLDivElement>('div[style*="cursor: grab"]')];
    const proxy = () => container.querySelector('div[style*="z-index: 9999"]');
    return { container, items, placeShape, proxy };
}

describe('BlocksCanvas drag geometry and gesture ownership', () => {
    beforeEach(() => vi.clearAllMocks());

    it("places on the cell the child sees: the board's 2.5px border shifts every cell", () => {
        const { items, placeShape } = setup(stateWith());
        stubItemRect(items[0], BLOCK_2X2, 36, TRAY_LEFT, TRAY_TOP);

        fireEvent(items[0], ptr('pointerdown', { clientX: TRAY_LEFT + 4, clientY: TRAY_TOP + 4, pointerId: 1 }));

        // 59px into the border box puts the shape's top-left 24.5px into the
        // content box — 0.47 of a cell, so it rounds onto cell 0. Content starts
        // at 2.5 + 8 = 10.5; ignoring the 2.5px border reads it as 0.52 → cell 1.
        const inFirstCell = { clientX: BOARD_LEFT + 59, clientY: BOARD_TOP + 59, pointerId: 1 };
        act(() => { window.dispatchEvent(ptr('pointermove', inFirstCell)); });
        act(() => { window.dispatchEvent(ptr('pointerup', inFirstCell)); });

        expect(placeShape).toHaveBeenCalledWith(expect.objectContaining({ id: 'block-2x2' }), 0, 0, 'standard', 0);
    });

    it('lands on the cell the shape most overlaps, so the 4px gutter reads as the next cell', () => {
        // The anchor comes from the shape's own position now, not from which cell
        // the finger is inside. Sitting 50.5px into the content box, the shape
        // covers 21.5px of cell 0 and 22.5px of cell 1 — so cell 1 wins. The old
        // finger-based rule floored the pitch and lumped the gutter into cell 0.
        const { items, placeShape } = setup(stateWith());
        stubItemRect(items[0], BLOCK_2X2, 36, TRAY_LEFT, TRAY_TOP);

        fireEvent(items[0], ptr('pointerdown', { clientX: TRAY_LEFT + 4, clientY: TRAY_TOP + 4, pointerId: 1 }));
        const inGutter = { clientX: BOARD_LEFT + 61, clientY: BOARD_TOP + 61, pointerId: 1 };
        act(() => { window.dispatchEvent(ptr('pointermove', inGutter)); });
        act(() => { window.dispatchEvent(ptr('pointerup', inGutter)); });

        expect(placeShape).toHaveBeenCalledWith(expect.objectContaining({ id: 'block-2x2' }), 1, 1, 'standard', 0);
    });

    it('derives the grab cell from the rescue slot\'s 22px cells, not the tray\'s 36px', () => {
        const { items, placeShape } = setup(stateWith({
            standardShapes: [null, null, null],
            rescueShape: BAR_H,
            rescueShapeLocked: false,
        }));
        stubItemRect(items[0], BAR_H, 22, TRAY_LEFT, TRAY_TOP);

        // 55px into a 22px/1.5px-gap bar is the third cell (pitch 23.5 → index 2).
        fireEvent(items[0], ptr('pointerdown', { clientX: TRAY_LEFT + 55, clientY: TRAY_TOP + 8, pointerId: 1 }));
        act(() => { window.dispatchEvent(ptr('pointermove', { ...cellCentre(4, 5), pointerId: 1 })); });
        act(() => { window.dispatchEvent(ptr('pointerup', { ...cellCentre(4, 5), pointerId: 1 })); });

        expect(placeShape).toHaveBeenCalledWith(expect.objectContaining({ id: 'bar-h' }), 3, 4, 'rescue', 0);
    });

    it('refuses a second grab while a drag is live', () => {
        const { items, placeShape } = setup(stateWith({ standardShapes: [BLOCK_2X2, DOT, null] }));
        stubItemRect(items[0], BLOCK_2X2, 36, TRAY_LEFT, TRAY_TOP);
        stubItemRect(items[1], DOT, 36, TRAY_LEFT + 300, TRAY_TOP);

        fireEvent(items[0], ptr('pointerdown', { clientX: TRAY_LEFT + 4, clientY: TRAY_TOP + 4, pointerId: 1 }));
        fireEvent(items[1], ptr('pointerdown', { clientX: TRAY_LEFT + 304, clientY: TRAY_TOP + 4, pointerId: 2 }));

        // Only the first slot is masked — the second finger started nothing.
        expect(items[0].style.opacity).toBe('0');
        expect(items[1].style.opacity).toBe('1');

        act(() => { window.dispatchEvent(ptr('pointermove', { ...cellCentre(1, 1), pointerId: 1 })); });
        act(() => { window.dispatchEvent(ptr('pointerup', { ...cellCentre(1, 1), pointerId: 1 })); });

        expect(placeShape).toHaveBeenCalledTimes(1);
        expect(placeShape).toHaveBeenCalledWith(expect.objectContaining({ id: 'block-2x2' }), 1, 1, 'standard', 0);
    });

    it('ignores a pointercancel from another pointer — Windows palm rejection cancels the palm, not the drag', () => {
        const { items, placeShape, proxy } = setup(stateWith());
        stubItemRect(items[0], BLOCK_2X2, 36, TRAY_LEFT, TRAY_TOP);

        fireEvent(items[0], ptr('pointerdown', { clientX: TRAY_LEFT + 4, clientY: TRAY_TOP + 4, pointerId: 1 }));
        act(() => { window.dispatchEvent(ptr('pointermove', { ...cellCentre(2, 2), pointerId: 1 })); });
        act(() => { window.dispatchEvent(ptr('pointercancel', { clientX: 0, clientY: 0, pointerId: 2 })); });

        expect(proxy()).not.toBeNull();

        act(() => { window.dispatchEvent(ptr('pointerup', { ...cellCentre(2, 2), pointerId: 1 })); });
        expect(placeShape).toHaveBeenCalledWith(expect.anything(), 2, 2, 'standard', 0);
    });

    it('returns the shape to the bank on a tap with no movement', () => {
        const { items, placeShape, proxy } = setup(stateWith());
        stubItemRect(items[0], BLOCK_2X2, 36, TRAY_LEFT, TRAY_TOP);

        const tap = { clientX: TRAY_LEFT + 4, clientY: TRAY_TOP + 4, pointerId: 1 };
        fireEvent(items[0], ptr('pointerdown', tap));
        act(() => { window.dispatchEvent(ptr('pointerup', tap)); });

        expect(placeShape).not.toHaveBeenCalled();
        expect(proxy()).toBeNull();
        expect(items[0].style.opacity).toBe('1');
    });
});
