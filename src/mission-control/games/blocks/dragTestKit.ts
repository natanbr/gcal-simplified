// ============================================================
// Render half of the Space Rescue drag test kit: BlocksCanvas with its
// collaborators stubbed, the board and every draggable pinned, and the element
// queries the DOM drag suites share. Re-exports dragFixtures.ts, so a DOM suite
// needs one import line.
//
// `.ts` rather than `.tsx`: nothing here is a component, and
// react-refresh/only-export-components lints `.tsx` only.
//
// ⚠️  Test helper. Import it from tests only — enforced by
// src/__tests__/test-kit-boundary.test.ts, since nothing else would fail.
// ============================================================
import { createElement } from 'react';
import { render, within } from '@testing-library/react';
import { vi } from 'vitest';
import { stubEngine } from '../quiz/quizTestKit';
import { BlocksCanvas } from './BlocksCanvas';
import type { PlaceShape } from './useShapeDrag';
import type { BlocksGameState } from './types';
import { BOARD_LEFT, BOARD_SIZE, BOARD_TOP, rect, stubItemOrigin } from './dragFixtures';

export * from './dragFixtures';

/**
 * Test timeout for every suite that renders the drag tree through this kit, set
 * with `vi.setConfig` at the top level of the file, before any test is declared —
 * not in a hook: Vitest fixes each test's timeout when `it()` is collected. The
 * first test of each file pays
 * the cold render in a fresh worker, and ~60% of that is jsdom's CSS engine
 * (cssstyle, css-tree, css-color) parsing the canvas's inline styles: 1.1-1.3s
 * in a normal full run, up to 5.9s with three runs sharing the machine — past
 * the 5s default. These tests are synchronous, and a timeout cannot interrupt
 * synchronous code (Vitest checks it after the test returns), so raising it
 * gives up no hang detection. An async test added to one of these suites would
 * get 15s to hang instead of 5s. Measurements: project journal, 2026-09-21.
 */
export const CANVAS_SUITE_TIMEOUT_MS = 15_000;

/** Pins the board's border box at (BOARD_LEFT, BOARD_TOP), the origin every
 *  `cellCentre` is computed against. Must run before the pointerdown: the drag
 *  measures the board once, at grab. */
export function stubBoard(container: HTMLElement): HTMLElement {
    const board = within(container).getByTestId('blocks-grid');
    board.getBoundingClientRect = () => rect(BOARD_LEFT, BOARD_TOP, BOARD_SIZE, BOARD_SIZE);
    return board;
}

/** The in-flight drag proxy BlocksCanvas mounts while a shape is held. */
export const dragProxy = (container: HTMLElement) =>
    within(container).queryByTestId<HTMLDivElement>('drag-proxy');

/** Every draggable tray/rescue item currently rendered, in DOM order. */
export const draggableItems = (container: HTMLElement) =>
    within(container).queryAllByTestId<HTMLDivElement>('draggable-shape');

/** The only draggable. Throws unless exactly one is rendered: with two, "the
 *  first one" is index luck, and the wrong shape gets dragged while the test
 *  still passes. */
export function draggableItem(container: HTMLElement): HTMLDivElement {
    const items = draggableItems(container);
    if (items.length !== 1) throw new Error(`expected exactly one draggable, found ${items.length}`);
    return items[0];
}

/** Pins every rendered draggable at its DOM position (see grabCorner's `index`). */
export function pinDraggables(container: HTMLElement): void {
    draggableItems(container).forEach((item, index) => stubItemOrigin(item, index));
}

/** The first cell the landing ghost draws, or null when no ghost is shown. For a
 *  DOT that single cell is the whole projection. */
export const ghostCell = (container: HTMLElement) =>
    (within(container).queryByTestId('projection-overlay')?.children[0] ?? null) as HTMLDivElement | null;

/**
 * BlocksCanvas's collaborators, built once and reused across rerenders so a
 * rerender changes only the game state.
 *
 * ⚠️ The default placeShape is a bare, stable spy: it records the drop and never
 * refuses it. Production's is stable too, but re-checks the cell inside its
 * state updater, so a refusal there is invisible to a "was called" assertion. A
 * test about what happens when the grid changes under a drag must pass its own
 * cell-checking placeShape (see useShapeDrag.commit-order.test.tsx).
 */
export function canvasProps(placeShape: PlaceShape = vi.fn()) {
    return {
        placeShape,
        triggerRescueQuiz: vi.fn(),
        resolveRescueQuiz: vi.fn(),
        cancelRescueQuiz: vi.fn(),
        engine: stubEngine(),
        refreshRescueShape: vi.fn(),
    };
}

/**
 * BlocksCanvas with its collaborators stubbed, the board pinned, and every
 * draggable pinned — again after each `rerenderWith`, because a tray slot whose
 * shape id changes remounts its item (StandardShapesTray keys slots on shape.id).
 */
export function renderCanvas(gameState: BlocksGameState, placeShape?: PlaceShape) {
    const props = canvasProps(placeShape);
    const canvas = (state: BlocksGameState) => createElement(BlocksCanvas, { ...props, gameState: state });
    const view = render(canvas(gameState));
    const board = stubBoard(view.container);
    pinDraggables(view.container);
    return {
        ...view,
        props,
        placeShape: props.placeShape,
        board,
        proxy: () => dragProxy(view.container),
        ghost: () => ghostCell(view.container),
        rerenderWith: (next: BlocksGameState) => {
            view.rerender(canvas(next));
            pinDraggables(view.container);
        },
    };
}
