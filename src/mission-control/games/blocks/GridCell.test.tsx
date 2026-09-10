// ============================================================
// GridCell — line-clear explosion (Group C: paint cost around a clear)
//
// The child plays on a touchscreen and grabs the next piece the instant a line
// clears. The old explosion animated `backgroundColor` and `boxShadow` on up to
// 16 Framer Motion cells: both are main-thread PAINT properties, so every frame
// of the celebration competed with the drag the child had already started.
//
// These tests pin the replacement: a CSS keyframe on transform/opacity only
// (compositor-friendly), staggered so the LAST cell finishes before the grid
// reset — see docs/tasks/blocks-gesture-controls-review.md §4.
// ============================================================

import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GridCell } from './GridCell';

const HERE = dirname(fileURLToPath(import.meta.url));
const read = (relative: string): string => readFileSync(resolve(HERE, relative), 'utf-8');

const GRID_CELL_SOURCE = read('GridCell.tsx');
const OVERLAY_SOURCE = read('BlocksGameOverlay.tsx');
const FEEDBACK_SOURCE = read('ClearedFeedbackOverlay.tsx');
const PERF_HUD_SOURCE = read('PerformanceHUD.tsx');
const MC_CSS = read('../../styles/mc.css');

/** Grid values, as written by useBlocksGame.ts. */
const FILLED = 1;
const EXPLODING = 4;

/**
 * useBlocksGame.ts clears the marked cells with `setTimeout(..., 1200)`. That
 * file is the owner of the timing and is not exported from, so the budget is
 * duplicated here deliberately — the point of the test is that the animation
 * must live inside it.
 */
const GRID_RESET_MS = 1200;

/** `<n>ms` / `<n>s` → milliseconds. NaN when the value is absent or malformed. */
function cssTimeToMs(value: string | undefined): number {
    const match = /^(-?[\d.]+)(ms|s)$/.exec((value ?? '').trim());
    if (!match) return Number.NaN;
    const amount = Number.parseFloat(match[1]);
    return match[2] === 's' ? amount * 1000 : amount;
}

/** Body of a top-level CSS block, relying on mc.css closing braces at column 0. */
function cssBlock(selector: string): string {
    const escaped = selector.replace(/[.@]/g, '\\$&');
    return new RegExp(`${escaped}\\s*\\{([\\s\\S]*?)\\n\\}`).exec(MC_CSS)?.[1] ?? '';
}

describe('GridCell — explosion animation', () => {
    it('flags an exploding cell with the CSS explosion class', () => {
        const { container } = render(<GridCell r={0} c={0} val={EXPLODING} />);
        const cell = container.querySelector<HTMLElement>('[data-cell-index="0-0"]');

        expect(cell).not.toBeNull();
        expect(cell?.className).toContain('mc-anim-cell-explode');
    });

    it('leaves a settled cell with no explosion class and no stagger delay', () => {
        const { container } = render(<GridCell r={3} c={2} val={FILLED} />);
        const cell = container.querySelector<HTMLElement>('[data-cell-index="3-2"]');

        expect(cell?.className ?? '').not.toContain('mc-anim-cell-explode');
        expect(cell?.style.animationDelay).toBe('');
    });

    it('finishes the whole staggered explosion inside the 1200ms grid reset', () => {
        // Worst case for an (r + c) stagger on the 8x8 board: the bottom-right cell.
        const { container } = render(<GridCell r={7} c={7} val={EXPLODING} />);
        const cell = container.querySelector<HTMLElement>('[data-cell-index="7-7"]');

        const delayMs = cssTimeToMs(cell?.style.animationDelay);
        expect(
            Number.isNaN(delayMs),
            'No parseable animation-delay on the last cell — the budget check below would be vacuous.'
        ).toBe(false);

        const durationMs = cssTimeToMs(
            /animation:\s*mc-cell-explode\s+([\d.]+m?s)/.exec(cssBlock('.mc-anim-cell-explode'))?.[1]
        );
        expect(
            Number.isNaN(durationMs),
            'No duration found on .mc-anim-cell-explode in mc.css.'
        ).toBe(false);

        expect(
            delayMs + durationMs,
            `Last cell finishes at ${delayMs + durationMs}ms but useBlocksGame.ts wipes the ` +
            `grid at ${GRID_RESET_MS}ms, so the explosion is cut off mid-flight.`
        ).toBeLessThanOrEqual(GRID_RESET_MS);
    });
});

// ── Structural: the paint work must not come back ────────────────────────────
describe('blocks overlay — paint cost around a line clear (structural)', () => {
    it('renders grid cells without Framer Motion', () => {
        expect(
            GRID_CELL_SOURCE,
            'All 64 cells are GridCell instances; a Framer component per cell is 64 ' +
            'animation drivers on the main thread during a drag.'
        ).not.toMatch(/framer-motion/);
    });

    it('never keyframes the paint properties backgroundColor / boxShadow', () => {
        expect(GRID_CELL_SOURCE).not.toMatch(/backgroundColor:\s*\[/);
        expect(GRID_CELL_SOURCE).not.toMatch(/boxShadow:\s*\[/);
    });

    it('animates only transform and opacity in the explosion keyframes', () => {
        const properties = [...cssBlock('@keyframes mc-cell-explode').matchAll(/([a-z-]+)\s*:/g)]
            .map(match => match[1]);

        expect(properties.length).toBeGreaterThan(0);
        expect(
            [...new Set(properties)].sort(),
            'Only transform and opacity are handed to the compositor; anything else ' +
            'repaints on the main thread every frame of the celebration.'
        ).toEqual(['opacity', 'transform']);
    });

    it('runs no backdrop-filter over the board or the game overlay', () => {
        // A backdrop-filter is re-evaluated whenever anything beneath it changes,
        // which during a clear is 8-16 animating cells.
        expect(OVERLAY_SOURCE).not.toMatch(/backdropFilter/);
        expect(FEEDBACK_SOURCE).not.toMatch(/backdropFilter/);
        // The HUD is DEV-only, so it ships nothing — but it sits directly above
        // the board and lands inside every trace taken to measure the board.
        expect(PERF_HUD_SOURCE).not.toMatch(/backdropFilter/);
        // A style value, not the word in a comment: `transition: '...'`.
        expect(PERF_HUD_SOURCE, 'its numbers change every 200ms').not.toMatch(/\btransition[A-Za-z]*:\s*['"`]/);
    });
});
