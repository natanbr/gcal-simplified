// ============================================================
// Group B: the shape is lifted clear of the hand on touch, the ghost follows
// the SHAPE instead of the fingertip, forgiveness snapping is bounded, and a
// stranded drag cannot dead-lock the game. Written against the real ShapeItem
// and the real board geometry — a stubbed pitch is what hid the last defect.
// ============================================================
import { render, within, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BlocksCanvas } from './BlocksCanvas';
import type { BlocksGameState, GameShape } from './types';
import type { QuizEngineApi } from '../quiz/types';
import { TOUCH_LIFT_PX } from './dragGeometry';

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
const DOT: GameShape = { id: 'dot', name: 'Dot', color: '#38bdf8', cells: [{ x: 0, y: 0 }] };

// Real board geometry: border box at (10,10), 2.5px border + 8px padding, 48px
// cells on a 52px pitch. 8 cells + 7 gaps + padding + border = 433px, so the
// board's bottom edge is at y = 443.
const BOARD_LEFT = 10;
const BOARD_TOP = 10;
const BOARD_SIZE = 433;
const BOARD_BOTTOM = BOARD_TOP + BOARD_SIZE;
const CONTENT_INSET = 10.5;
const PITCH = 52;
const HALF_CELL = 24;

/** Client coordinate that puts an unlifted, corner-grabbed shape's top-left
 *  exactly on cell (r, c). */
const shapeOnCell = (r: number, c: number) => ({
    clientX: BOARD_LEFT + CONTENT_INSET + PITCH * c + HALF_CELL,
    clientY: BOARD_TOP + CONTENT_INSET + PITCH * r + HALF_CELL,
});

const TRAY_LEFT = 100;
const TRAY_TOP = 100;
const SHAPE_GAP = 1.5;

function rect(left: number, top: number, width: number, height: number): DOMRect {
    return { left, top, width, height, x: left, y: top, right: left + width, bottom: top + height, toJSON: () => ({}) };
}

interface PtrInit { clientX: number; clientY: number; pointerId: number; pointerType?: string }
function ptr(type: string, init: PtrInit) {
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

    const scoped = within(container);
    const board = scoped.getByTestId('blocks-grid');
    board.getBoundingClientRect = () => rect(BOARD_LEFT, BOARD_TOP, BOARD_SIZE, BOARD_SIZE);

    const items = [...container.querySelectorAll<HTMLDivElement>('div[style*="cursor: grab"]')];
    items.forEach((item, idx) => stubItemRect(item, BLOCK_2X2, 36, TRAY_LEFT + idx * 300, TRAY_TOP));

    const proxy = () => container.querySelector<HTMLDivElement>('div[style*="z-index: 9999"]');
    const ghost = () => scoped.queryByTestId('projection-overlay');
    return { container, items, placeShape, proxy, ghost };
}

/** The corner of the tray item, so the grabbed cell is (0,0). */
const grabCorner = (idx: number, pointerId: number, pointerType?: string) => ({
    clientX: TRAY_LEFT + idx * 300 + 4,
    clientY: TRAY_TOP + 4,
    pointerId,
    ...(pointerType ? { pointerType } : {}),
});

describe('the shape is lifted clear of the hand', () => {
    beforeEach(() => vi.clearAllMocks());

    it('floats the shape above the fingertip on touch', () => {
        const { items, proxy } = setup(stateWith());
        const grab = grabCorner(0, 1, 'touch');
        fireEvent(items[0], ptr('pointerdown', grab));

        const expectedY = grab.clientY - HALF_CELL - TOUCH_LIFT_PX;
        expect(proxy()!.style.transform).toBe(`translate(${grab.clientX - HALF_CELL}px, ${expectedY}px)`);
    });

    it('keeps the shape under the cursor for a mouse', () => {
        const { items, proxy } = setup(stateWith());
        const grab = grabCorner(0, 1, 'mouse');
        fireEvent(items[0], ptr('pointerdown', grab));

        expect(proxy()!.style.transform)
            .toBe(`translate(${grab.clientX - HALF_CELL}px, ${grab.clientY - HALF_CELL}px)`);
    });

    it('lifts on every move, not just at pickup, and never sideways', () => {
        const { items, proxy } = setup(stateWith());
        fireEvent(items[0], ptr('pointerdown', grabCorner(0, 1, 'touch')));

        const finger = { clientX: 300, clientY: 400, pointerId: 1, pointerType: 'touch' };
        act(() => { window.dispatchEvent(ptr('pointermove', finger)); });

        expect(proxy()!.style.transform)
            .toBe(`translate(${300 - HALF_CELL}px, ${400 - HALF_CELL - TOUCH_LIFT_PX}px)`);
    });
});

describe('the projection follows the shape, not the fingertip', () => {
    beforeEach(() => vi.clearAllMocks());

    it('places from the lifted shape while the finger is still below the board', () => {
        const { items, placeShape } = setup(stateWith());
        fireEvent(items[0], ptr('pointerdown', grabCorner(0, 1, 'touch')));

        // Finger 12px BELOW the bottom edge of the board. The lifted shape sits
        // on rows 6-7; under the old fingertip rule this was a return-to-bank.
        const finger = { clientX: shapeOnCell(0, 3).clientX, clientY: BOARD_BOTTOM + 12, pointerId: 1, pointerType: 'touch' };
        expect(finger.clientY).toBeGreaterThan(BOARD_BOTTOM);

        act(() => { window.dispatchEvent(ptr('pointermove', finger)); });
        act(() => { window.dispatchEvent(ptr('pointerup', finger)); });

        expect(placeShape).toHaveBeenCalledWith(expect.objectContaining({ id: 'block-2x2' }), 3, 6, 'standard', 0);
    });

    it('ignores which cell the finger is over — the same finger position places differently once lifted', () => {
        // 0.3 of a cell past row 4's edge, so neither reading sits on a rounding
        // boundary: the mouse shape is at 4.3, the lifted touch shape at 2.8.
        const finger = shapeOnCell(4, 4);
        finger.clientY += 0.3 * PITCH;

        const mouse = setup(stateWith());
        fireEvent(mouse.items[0], ptr('pointerdown', grabCorner(0, 1, 'mouse')));
        act(() => { window.dispatchEvent(ptr('pointermove', { ...finger, pointerId: 1, pointerType: 'mouse' })); });
        act(() => { window.dispatchEvent(ptr('pointerup', { ...finger, pointerId: 1, pointerType: 'mouse' })); });
        expect(mouse.placeShape).toHaveBeenCalledWith(expect.anything(), 4, 4, 'standard', 0);

        const touch = setup(stateWith());
        fireEvent(touch.items[0], ptr('pointerdown', grabCorner(0, 1, 'touch')));
        act(() => { window.dispatchEvent(ptr('pointermove', { ...finger, pointerId: 1, pointerType: 'touch' })); });
        act(() => { window.dispatchEvent(ptr('pointerup', { ...finger, pointerId: 1, pointerType: 'touch' })); });
        // The shape is 1.5 cells higher than the finger, so it lands a row up.
        expect(touch.placeShape).toHaveBeenCalledWith(expect.anything(), 4, 3, 'standard', 0);
    });
});

describe('forgiveness snapping is what the child sees', () => {
    beforeEach(() => vi.clearAllMocks());

    const blocked = (...cells: Array<[number, number]>) => {
        const grid = Array.from({ length: 8 }, () => Array(8).fill(0));
        for (const [r, c] of cells) grid[r][c] = 1;
        return grid;
    };

    it('shows the snapped cell in green and places there', () => {
        const { items, placeShape, ghost } = setup(stateWith({
            standardShapes: [DOT, null, null],
            grid: blocked([4, 4]),
        }));
        stubItemRect(items[0], DOT, 36, TRAY_LEFT, TRAY_TOP);
        fireEvent(items[0], ptr('pointerdown', grabCorner(0, 1)));

        // 0.4 of a cell below the blocked (4,4): inside the forgiveness radius.
        const finger = { ...shapeOnCell(4, 4), pointerId: 1 };
        finger.clientY += 0.4 * PITCH;
        act(() => { window.dispatchEvent(ptr('pointermove', finger)); });

        const cell = ghost()!.children[0] as HTMLDivElement;
        expect(cell.style.background).toContain('74, 222, 128'); // green
        expect(cell.style.gridRowStart).toBe('6'); // 1-indexed: row 5
        expect(cell.style.gridColumnStart).toBe('5');

        act(() => { window.dispatchEvent(ptr('pointerup', finger)); });
        expect(placeShape).toHaveBeenCalledWith(expect.anything(), 4, 5, 'standard', 0);
    });

    it('shows red at the rounded cell and returns to the bank when nothing valid is in reach', () => {
        const { items, placeShape, ghost } = setup(stateWith({
            standardShapes: [DOT, null, null],
            grid: blocked([4, 4]),
        }));
        stubItemRect(items[0], DOT, 36, TRAY_LEFT, TRAY_TOP);
        fireEvent(items[0], ptr('pointerdown', grabCorner(0, 1)));

        // Squarely on the blocked cell: every free neighbour is a full cell away.
        const finger = { ...shapeOnCell(4, 4), pointerId: 1 };
        act(() => { window.dispatchEvent(ptr('pointermove', finger)); });

        const cell = ghost()!.children[0] as HTMLDivElement;
        expect(cell.style.background).toContain('239, 68, 68'); // red
        expect(cell.style.gridRowStart).toBe('5');

        act(() => { window.dispatchEvent(ptr('pointerup', finger)); });
        expect(placeShape).not.toHaveBeenCalled();
        expect(items[0].style.opacity).toBe('1'); // back in the bank
    });
});

describe('a stranded drag cannot dead-lock the game', () => {
    beforeEach(() => vi.clearAllMocks());

    it('window blur ends the drag and frees the next grab', () => {
        const { items, placeShape, proxy } = setup(stateWith({ standardShapes: [BLOCK_2X2, DOT, null] }));
        stubItemRect(items[1], DOT, 36, TRAY_LEFT + 300, TRAY_TOP);

        fireEvent(items[0], ptr('pointerdown', grabCorner(0, 1, 'touch')));
        act(() => { window.dispatchEvent(ptr('pointermove', { ...shapeOnCell(2, 2), pointerId: 1, pointerType: 'touch' })); });

        act(() => { window.dispatchEvent(new Event('blur')); });

        expect(proxy()).toBeNull();
        expect(items[0].style.opacity).toBe('1');
        expect(placeShape).not.toHaveBeenCalled();

        // A different finger can grab again — without the valve this is refused forever.
        fireEvent(items[1], ptr('pointerdown', grabCorner(1, 7, 'touch')));
        expect(proxy()).not.toBeNull();
        expect(items[1].style.opacity).toBe('0');
    });

    it('hiding the window ends the drag too', () => {
        const { items, proxy } = setup(stateWith());
        fireEvent(items[0], ptr('pointerdown', grabCorner(0, 1, 'touch')));

        const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
        act(() => { document.dispatchEvent(new Event('visibilitychange')); });
        visibility.mockRestore();

        expect(proxy()).toBeNull();
    });

    it('a pointerdown from the SAME pointer reclaims a drag whose pointerup was lost', () => {
        const { items, placeShape, proxy } = setup(stateWith({ standardShapes: [BLOCK_2X2, DOT, null] }));
        stubItemRect(items[1], DOT, 36, TRAY_LEFT + 300, TRAY_TOP);

        // The mouse is released outside the window: no pointerup ever arrives.
        fireEvent(items[0], ptr('pointerdown', grabCorner(0, 1, 'mouse')));
        act(() => { window.dispatchEvent(ptr('pointermove', { ...shapeOnCell(2, 2), pointerId: 1, pointerType: 'mouse' })); });

        // Same pointerId cannot be down twice, so the old drag is provably over.
        fireEvent(items[1], ptr('pointerdown', grabCorner(1, 1, 'mouse')));
        expect(proxy()).not.toBeNull();
        expect(items[1].style.opacity).toBe('0');
        expect(items[0].style.opacity).toBe('1');

        const drop = { ...shapeOnCell(5, 5), pointerId: 1, pointerType: 'mouse' };
        act(() => { window.dispatchEvent(ptr('pointermove', drop)); });
        act(() => { window.dispatchEvent(ptr('pointerup', drop)); });

        expect(placeShape).toHaveBeenCalledTimes(1);
        expect(placeShape).toHaveBeenCalledWith(expect.objectContaining({ id: 'dot' }), 5, 5, 'standard', 1);
    });

    it('still refuses a second finger while the first is genuinely dragging', () => {
        const { items, proxy } = setup(stateWith({ standardShapes: [BLOCK_2X2, DOT, null] }));
        stubItemRect(items[1], DOT, 36, TRAY_LEFT + 300, TRAY_TOP);

        fireEvent(items[0], ptr('pointerdown', grabCorner(0, 1, 'touch')));
        const first = proxy()!.style.transform;

        fireEvent(items[1], ptr('pointerdown', grabCorner(1, 2, 'touch')));

        expect(items[1].style.opacity).toBe('1');
        expect(proxy()!.style.transform).toBe(first);
    });
});
