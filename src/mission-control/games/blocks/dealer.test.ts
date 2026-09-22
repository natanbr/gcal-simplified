// ============================================================
// The Space Rescue dealer — the shape triple handed to the child.
//
// Pins the four rules of the deal (docs/requirements.md → "Proactive Shapes
// Generator"). Before this existed the intended clearing bias was dead code:
// its predicate was "can this shape be placed at all", which is what the
// candidate list had already been filtered by, so it never changed a deal.
//
// ⚠️  BOARDS MUST BE TIGHT. The first version of this file used a board with 46+
// free cells of 64, and mutation testing found three of its assertions vacuous:
// on an open board every shape fits, every pair co-fits, and the first candidate
// in the list happens to complete a line, so deleting the bias, the shuffle and
// the whole pairing engine changed nothing any test could see. Each board below
// is built to make exactly one rule observable — check the mutant numbers in the
// comments before loosening a threshold.
// ============================================================

import { describe, it, expect } from 'vitest';
import { dealStandardTriple, dealRescueShape, difficultyFor, Rng } from './dealer';
import {
    CELL,
    hasAnyPlacement,
    completingAnchors,
    findCompletedLines,
    canBothBePlaced,
    findAnchors,
    linesClearedBy,
    projectPlacement,
} from './placement';
import { candidatesFor } from './candidates';
import { GRID_SIZE, GameShape, HELP_SHAPES, SHAPE_POOL } from './types';

function emptyBoard(fill = CELL.EMPTY): number[][] {
    return Array.from({ length: GRID_SIZE }, () => Array<number>(GRID_SIZE).fill(fill));
}

/** A full board with only `free` cleared — the way every tight fixture is built. */
function filledExcept(free: Array<[number, number]>): number[][] {
    const grid = emptyBoard(CELL.BLOCK);
    for (const [r, c] of free) grid[r][c] = CELL.EMPTY;
    return grid;
}

function run(row: number, from: number, to: number): Array<[number, number]> {
    const cells: Array<[number, number]> = [];
    for (let c = from; c <= to; c++) cells.push([row, c]);
    return cells;
}

/**
 * One continuous generator across a whole sample. Re-seeding per deal makes the
 * k-th draw a linear ramp in the seed — an LCG artefact that showed up as a
 * fake 3.5x skew in the shape distribution before this was fixed.
 */
function seeded(seed: number): Rng {
    let s = seed >>> 0;
    return () => {
        s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
        return s / 2 ** 32;
    };
}

// ── Fixtures ────────────────────────────────────────────────
// Isolated single cells break every row and column so no line is ALREADY
// complete, while being too small to host any pool shape (the smallest is 3
// cells). They shape the board without adding placements.

/** Row 7 has a four-cell gap: only a horizontal 4-bar can finish it. */
function oneClearableRow(): number[][] {
    const grid = emptyBoard();
    for (let c = 0; c <= 3; c++) grid[7][c] = CELL.BLOCK;
    return grid;
}

/**
 * The only room is a horizontal 4-run, so ONLY horizontal orientations fit.
 * The scattered singles are load-bearing: without one in every row and column
 * the 4-run completes its row (and each of its columns), the line clears, and
 * the board hands back eight free cells that the fixture was built to deny.
 */
function horizontalCorridor(): number[][] {
    return filledExcept([
        ...run(4, 2, 5),
        [0, 0], [0, 2], [1, 1], [1, 5], [2, 6], [3, 0],
        [4, 7], [5, 0], [6, 1], [6, 4], [7, 3], [7, 6],
    ]);
}

/** A 4-run and a 3-run: two 4-bars cannot both go down, other pairs can. */
function fourRunAndThreeRun(): number[][] {
    return filledExcept([
        ...run(2, 2, 5),
        ...run(5, 2, 4),
        [0, 0], [1, 1], [2, 7], [3, 6], [4, 0], [5, 7], [6, 0], [7, 1], [7, 5],
    ]);
}

/**
 * A 2x2 pocket whose bottom row is row 7's only gap, and one 3-run. Two
 * trominoes cannot both go down as the board stands, but can once the Block
 * clears row 7; two Blocks never can. So the pair has to be planned on the
 * board AFTER the Block's clear, not on the board as it is now.
 */
function clearMakesRoomForThePair(): number[][] {
    return filledExcept([
        [6, 0], [6, 1], [7, 0], [7, 1],
        ...run(3, 2, 4),
        [0, 1], [0, 5], [1, 3], [2, 0], [3, 7], [4, 6], [5, 2], [6, 4],
    ]);
}

/**
 * A vertical 4-run in which rows 1 and 3 have no other gap. A tromino fits it at
 * two anchors: the upper clears row 1; the lower, later in scan order, clears
 * rows 1 AND 3, and only that double clear turns [2,2] and [2,6] into vertical
 * 3-runs. Every 3-run is vertical, so a freed row on its own holds nothing.
 * [6,2] and [7,6] are load-bearing: without them a tromino dropped into a new
 * 3-run completes its column, and the freed column takes a second bar.
 */
function lowerAnchorClearsTwo(): number[][] {
    return filledExcept([
        [0, 0], [1, 0], [2, 0], [3, 0],
        [2, 2], [2, 6],
        [0, 4], [4, 3], [4, 7], [5, 1], [5, 5], [6, 0], [6, 2], [7, 6],
    ]);
}

/**
 * Two pockets, top-right and bottom-left: a 2x2 with one cell hanging off it,
 * whose outer row (row 0, row 7) has no other gap. Every 3-run is vertical, so
 * nothing that fits here fits a freed ROW. Once the first shape takes a pocket
 * and clears its row, the other pocket holds one shape and nothing co-fits.
 * That is what reaches dealPair's line-finisher fallback: give `fitting` any
 * straight shape lying along the freed line and the finisher co-fits with it,
 * so the fallback never runs. One pocket reaches it too, but then the child can
 * only ever use one shape, so the fallback changes nothing they could see.
 */
function twoPockets(): number[][] {
    return filledExcept([
        [5, 0], [6, 0], [7, 0], [6, 1], [7, 1],
        [0, 6], [0, 7], [1, 6], [1, 7], [2, 7],
        [1, 1], [2, 4], [3, 0], [3, 5], [4, 2], [4, 6], [5, 3], [6, 7],
    ]);
}

/** Singles plus one horizontal 2-cell gap: no pool shape fits (the smallest is 3 cells). */
function dominoPocket(): number[][] {
    return filledExcept([[0, 0], [1, 2], [2, 4], [3, 6], [4, 1], [5, 3], [6, 5], ...run(7, 6, 7)]);
}

const TROMINO_H = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }];
const TROMINO_V = [{ x: 0, y: 0 }, { x: 0, y: 1 }, { x: 0, y: 2 }];
const BAR4_H = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 3, y: 0 }];
const BAR4_V = [{ x: 0, y: 0 }, { x: 0, y: 1 }, { x: 0, y: 2 }, { x: 0, y: 3 }];
const BLOCK = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }];

function isClearer(board: number[][], shape: GameShape): boolean {
    return completingAnchors(board, shape.cells).length > 0;
}

/** Names of the level-0 pool shapes that fit the board in some orientation. */
function fittingNames(board: number[][]): string[] {
    const fitting = candidatesFor(SHAPE_POOL).filter(c => hasAnyPlacement(board, c.cells));
    return [...new Set(fitting.map(c => c.shape.name))].sort();
}

/**
 * The most shapes the child can put down from `hand`, and the most lines they
 * can clear doing it, over every order and anchor with lines draining between
 * moves. Exhaustive, so test-only: cheap on these tight boards, far too slow
 * for the drop path.
 */
function bestPlay(board: number[][], hand: GameShape[]): { placed: number; lines: number } {
    let placed = 0;
    let lines = 0;
    hand.forEach((shape, i) => {
        const rest = hand.filter((_, j) => j !== i);
        for (const anchor of findAnchors(board, shape.cells)) {
            const next = projectPlacement(board, shape.cells, anchor);
            const after = bestPlay(next.grid, rest);
            placed = Math.max(placed, 1 + after.placed);
            lines = Math.max(lines, next.linesCleared + after.lines);
        }
    });
    return { placed, lines };
}

describe('fixtures', () => {
    // These guards are what keep the tests below honest. A board that quietly
    // gains space — because a placement completes a line and clears it — makes
    // every assertion in this file pass for the wrong reason. That is exactly
    // how the first version of this suite ended up with three vacuous tests.
    it('start with no line already complete', () => {
        for (const board of [
            oneClearableRow(), horizontalCorridor(), fourRunAndThreeRun(),
            clearMakesRoomForThePair(), lowerAnchorClearsTwo(), twoPockets(), dominoPocket(),
        ]) {
            expect(findCompletedLines(board)).toEqual({ rows: [], cols: [] });
        }
    });

    it('clearMakesRoomForThePair fits two trominoes only after the Block clears row 7', () => {
        const board = clearMakesRoomForThePair();
        expect(fittingNames(board)).toEqual(['Block', 'Tromino H', 'Tromino V']);
        expect(completingAnchors(board, BLOCK)).toEqual([{ r: 6, c: 0 }]);
        const after = projectPlacement(board, BLOCK, { r: 6, c: 0 });
        expect(after.linesCleared).toBe(1);
        expect(canBothBePlaced(board, TROMINO_H, TROMINO_H)).toBe(false);
        expect(canBothBePlaced(after.grid, TROMINO_H, TROMINO_H)).toBe(true);
        expect(hasAnyPlacement(after.grid, BLOCK)).toBe(false);
    });

    it('lowerAnchorClearsTwo fits two trominoes only after the double clear', () => {
        const board = lowerAnchorClearsTwo();
        expect(fittingNames(board)).toEqual(['Bar H', 'Bar V', 'Tromino H', 'Tromino V']);
        expect(hasAnyPlacement(board, TROMINO_H)).toBe(false);
        const upper = { r: 0, c: 0 };
        const lower = { r: 1, c: 0 };
        expect(completingAnchors(board, TROMINO_V)).toEqual([upper, lower]);
        expect(linesClearedBy(board, TROMINO_V, upper)).toBe(1);
        expect(linesClearedBy(board, TROMINO_V, lower)).toBe(2);
        const afterUpper = projectPlacement(board, TROMINO_V, upper).grid;
        const afterLower = projectPlacement(board, TROMINO_V, lower).grid;
        expect(canBothBePlaced(afterUpper, TROMINO_V, TROMINO_V)).toBe(false);
        expect(canBothBePlaced(afterLower, TROMINO_V, TROMINO_V)).toBe(true);
        expect(canBothBePlaced(board, BAR4_V, BAR4_V)).toBe(false);
    });

    it('twoPockets leaves no pair that co-fits once a pocket is used, but a line still to finish', () => {
        const board = twoPockets();
        expect(fittingNames(board)).toEqual(['Block', 'L Shape', 'T Shape', 'Tromino H', 'Tromino V']);
        expect(hasAnyPlacement(board, TROMINO_H)).toBe(false);
        const fitting = candidatesFor(SHAPE_POOL).filter(c => hasAnyPlacement(board, c.cells));
        for (const pocket of [{ r: 0, c: 6 }, { r: 6, c: 0 }]) {
            const after = projectPlacement(board, BLOCK, pocket);
            expect(after.linesCleared).toBe(1);
            expect(completingAnchors(after.grid, BLOCK)).toHaveLength(1);
            for (const a of fitting) {
                for (const b of fitting) expect(canBothBePlaced(after.grid, a.cells, b.cells)).toBe(false);
            }
        }
    });

    it('dominoPocket takes no pool shape and a domino only lying down', () => {
        const board = dominoPocket();
        expect(fittingNames(board)).toEqual([]);
        expect(hasAnyPlacement(board, [{ x: 0, y: 0 }, { x: 1, y: 0 }])).toBe(true);
        expect(hasAnyPlacement(board, [{ x: 0, y: 0 }, { x: 0, y: 1 }])).toBe(false);
    });

    it('horizontalCorridor admits horizontal shapes only, and clears nothing', () => {
        const board = horizontalCorridor();
        expect(hasAnyPlacement(board, BAR4_H)).toBe(true);
        expect(hasAnyPlacement(board, BAR4_V)).toBe(false);
        expect(completingAnchors(board, BAR4_H)).toEqual([]);
        expect(completingAnchors(board, TROMINO_H)).toEqual([]);
    });

    it('fourRunAndThreeRun denies two 4-bars but allows other pairs', () => {
        const board = fourRunAndThreeRun();
        expect(canBothBePlaced(board, BAR4_H, BAR4_H)).toBe(false);
        expect(canBothBePlaced(board, TROMINO_H, TROMINO_H)).toBe(true);
        expect(canBothBePlaced(board, BAR4_H, TROMINO_H)).toBe(true);
        expect(completingAnchors(board, BAR4_H)).toEqual([]);
    });
});

describe('difficultyFor', () => {
    it('starts the child at the agreed 80% clearing / 100% pair chance', () => {
        expect(difficultyFor(0)).toEqual({ clearChance: 0.8, pairChance: 1 });
    });

    it('keeps the pair chance above the clearing chance at every level', () => {
        for (let level = 0; level <= 5; level++) {
            const { clearChance, pairChance } = difficultyFor(level);
            expect(pairChance).toBeGreaterThan(clearChance);
        }
    });

    it('eases off as the board gets busier, but never gets mean', () => {
        expect(difficultyFor(3).clearChance).toBeLessThan(difficultyFor(0).clearChance);
        expect(difficultyFor(3).clearChance).toBeGreaterThanOrEqual(0.5);
        expect(difficultyFor(3).pairChance).toBeGreaterThanOrEqual(0.8);
    });

    it('clamps unknown levels to the hardest defined step', () => {
        expect(difficultyFor(99)).toEqual(difficultyFor(3));
        expect(difficultyFor(-1)).toEqual(difficultyFor(0));
    });
});

describe('dealStandardTriple — shape mix', () => {
    it('deals every shape at roughly equal odds', () => {
        // Guards the trap in enumerating orientations: an L tetromino has 8
        // distinct ones and a 2x2 square has 1, so drawing uniformly over
        // orientations deals the L 38% of the time and the square 4.8% — a
        // silent difficulty rise. Drawing shape-then-orientation gives 1.15x
        // spread here; the flat draw gives 3.5x.
        const rng = seeded(20260910);
        const tally = new Map<string, number>();
        for (let i = 0; i < 900; i++) {
            for (const shape of dealStandardTriple(emptyBoard(), 0, rng)) {
                tally.set(shape.name, (tally.get(shape.name) ?? 0) + 1);
            }
        }
        const counts = [...tally.values()];
        expect(tally.size).toBe(7);
        expect(Math.max(...counts) / Math.min(...counts)).toBeLessThan(1.6);
    }, 20000);

    it('always deals exactly three shapes with unique ids', () => {
        const shapes = dealStandardTriple(emptyBoard(), 0, seeded(1));
        expect(shapes).toHaveLength(3);
        expect(new Set(shapes.map(s => s.id)).size).toBe(3);
    });

    it('offers the harder level shapes only once that level is reached', () => {
        // Exact sets, at every level. Checking only that level 0 lacks them
        // passed with the level shapes never pooled at all; level 3 must also
        // reach back to the level-1 and level-2 additions.
        const base = ['Bar H', 'Bar V', 'Block', 'L Shape', 'T Shape', 'Tromino H', 'Tromino V'];
        const addedAt = [[], ['Staircase', 'U-Shape'], ['Cross', 'Giant L'], ['Giant Block', 'Long Bar H', 'Long Bar V']];
        for (let level = 0; level <= 3; level++) {
            const rng = seeded(4);
            const names = new Set<string>();
            for (let i = 0; i < 200; i++) {
                dealStandardTriple(emptyBoard(), level, rng).forEach(s => names.add(s.name));
            }
            expect([...names].sort()).toEqual([...base, ...addedAt.slice(1, level + 1).flat()].sort());
        }
    }, 20000);
});

describe('dealStandardTriple — the clearing bias (step 1)', () => {
    it('puts a line-finisher in the hand far more often than chance would', () => {
        // Measured: 88.1% with the bias, 36.0% with it deleted. The gap is the
        // whole feature — this is the bug the rewrite exists to fix.
        const board = oneClearableRow();
        const rng = seeded(777);
        let dealsWithClearer = 0;
        for (let i = 0; i < 500; i++) {
            if (dealStandardTriple(board, 0, rng).some(s => isClearer(board, s))) dealsWithClearer++;
        }
        expect(dealsWithClearer / 500).toBeGreaterThan(0.7);
    }, 20000);

    it('does not force a clearing shape onto a board where no line can be finished', () => {
        const rng = seeded(3);
        for (let i = 0; i < 50; i++) {
            const shapes = dealStandardTriple(emptyBoard(), 0, rng);
            expect(shapes).toHaveLength(3);
            for (const shape of shapes) {
                expect(hasAnyPlacement(emptyBoard(), shape.cells)).toBe(true);
            }
        }
    });
});

describe('dealStandardTriple — the shuffle (step 4)', () => {
    it('spreads the line-finisher evenly across the three slots', () => {
        // Set membership is too weak here: unshuffled, slot 0 held the finisher
        // in 1672 of 2000 deals against 316 and 243 — and an assertion that
        // merely asked "does it ever appear elsewhere" still passed. Measured
        // ratios: 1.04 shuffled, 6.88 unshuffled.
        const board = oneClearableRow();
        const rng = seeded(2024);
        const bySlot = [0, 0, 0];
        for (let i = 0; i < 600; i++) {
            dealStandardTriple(board, 0, rng).forEach((shape, slot) => {
                if (isClearer(board, shape)) bySlot[slot]++;
            });
        }
        expect(Math.min(...bySlot)).toBeGreaterThan(0);
        expect(Math.max(...bySlot) / Math.min(...bySlot)).toBeLessThan(2);
    }, 20000);
});

describe('dealStandardTriple — co-placement (steps 2 and 3)', () => {
    it('always includes two shapes that can both go down, on a board where that is not free', () => {
        // Only one 4-run exists, so two 4-bars cannot both be placed; picking
        // the pair independently deals that dead combination about a quarter of
        // the time. With the pairing step it is never dealt.
        const board = fourRunAndThreeRun();
        const rng = seeded(31);
        let dealsWithoutAPair = 0;
        for (let i = 0; i < 300; i++) {
            const [a, b, c] = dealStandardTriple(board, 0, rng);
            const hasPair =
                canBothBePlaced(board, a.cells, b.cells) ||
                canBothBePlaced(board, a.cells, c.cells) ||
                canBothBePlaced(board, b.cells, c.cells);
            if (!hasPair) dealsWithoutAPair++;
        }
        expect(dealsWithoutAPair).toBe(0);
    });

    it('plans the pair on the board as it will be once the first shape clears its line', () => {
        // Measured: 0 of 300 hands cannot all be played; 265 of 300 with
        // the forecast replaced by the board as it stands, which pairs the
        // Block with a second Block that has nowhere to go.
        const board = clearMakesRoomForThePair();
        const rng = seeded(606);
        let unplayable = 0;
        for (let i = 0; i < 300; i++) {
            if (bestPlay(board, dealStandardTriple(board, 0, rng)).placed < 3) unplayable++;
        }
        expect(unplayable).toBe(0);
    }, 20000);

    it('forecasts the first shape where it clears the most lines, not where it is found first', () => {
        // Measured: 0 of 400 hands cannot all be played; 52 of 400 when
        // the forecast takes the first completing anchor. After the tromino's
        // single clear no pair co-fits, so the pair is drawn blind; all 52
        // are bar+bar+tromino, and two bars never both go down.
        const board = lowerAnchorClearsTwo();
        const rng = seeded(4242);
        let unplayable = 0;
        for (let i = 0; i < 400; i++) {
            if (bestPlay(board, dealStandardTriple(board, 0, rng)).placed < 3) unplayable++;
        }
        expect(unplayable).toBe(0);
    }, 20000);

    it('falls back to line-finishers when no pair co-fits, so both pockets still clear a row', () => {
        // Measured: 362 of 400 hands can clear two lines; 210 of 400 with
        // the line-finisher fallback deleted, which draws the pair blind.
        const board = twoPockets();
        const rng = seeded(808);
        let clearsTwo = 0;
        for (let i = 0; i < 400; i++) {
            if (bestPlay(board, dealStandardTriple(board, 0, rng)).lines >= 2) clearsTwo++;
        }
        expect(clearsTwo / 400).toBeGreaterThan(0.7);
    }, 20000);
});

describe('dealStandardTriple — the orientation actually dealt', () => {
    it('deals shapes that fit IN THE ORIENTATION DEALT, not just as templates', () => {
        // The board's only room is a horizontal 4-run, so the vertical templates
        // (`1x3-v`, `1x4-v`) fit ONLY once turned. Verifying the template and
        // dealing a rotated copy — the shipped bug — hands the child a shape
        // with nowhere to go.
        const board = horizontalCorridor();
        const rng = seeded(88);
        const dealtNames = new Set<string>();
        for (let i = 0; i < 200; i++) {
            for (const shape of dealStandardTriple(board, 0, rng)) {
                expect(hasAnyPlacement(board, shape.cells)).toBe(true);
                dealtNames.add(shape.name);
            }
        }
        // Proves the sample actually exercised a shape whose template does not fit.
        expect([...dealtNames].some(n => n === 'Tromino V' || n === 'Bar V')).toBe(true);
    });
});

describe('dealStandardTriple — degenerate boards', () => {
    it('survives a nearly full board without throwing or dealing a null', () => {
        const board = emptyBoard(CELL.BLOCK);
        board[0][0] = CELL.EMPTY;
        board[7][7] = CELL.EMPTY;
        const shapes = dealStandardTriple(board, 0, seeded(7));
        expect(shapes).toHaveLength(3);
        for (const shape of shapes) expect(shape.cells.length).toBeGreaterThan(0);
    });

    it('falls back to help shapes that fit, and hands over the domino when the gap takes one', () => {
        // Measured: 192 of 300 shapes are dominoes, none misfit. Always
        // dealing the monomino fits but deals no domino; an unchecked draw
        // deals a standing domino that fits nowhere (90 of 300).
        const board = dominoPocket();
        const rng = seeded(41);
        let dominoes = 0;
        for (let i = 0; i < 100; i++) {
            for (const shape of dealStandardTriple(board, 0, rng)) {
                expect(hasAnyPlacement(board, shape.cells)).toBe(true);
                if (shape.cells.length === 2) dominoes++;
            }
        }
        expect(dominoes / 300).toBeGreaterThan(0.3);
    });

    it('survives a completely full board', () => {
        expect(dealStandardTriple(emptyBoard(CELL.BLOCK), 3, seeded(3))).toHaveLength(3);
    });

    it('treats a satellite as free space, matching the board', () => {
        const board = emptyBoard(CELL.BLOCK);
        for (let c = 0; c < GRID_SIZE; c++) board[3][c] = CELL.SATELLITE;
        for (const shape of dealStandardTriple(board, 0, seeded(11))) {
            expect(hasAnyPlacement(board, shape.cells)).toBe(true);
        }
    });
});

describe('canBothBePlaced', () => {
    it('accepts two shapes with a run each', () => {
        expect(canBothBePlaced(fourRunAndThreeRun(), TROMINO_H, TROMINO_H)).toBe(true);
    });

    it('rejects two shapes competing for the only run that fits them', () => {
        expect(canBothBePlaced(fourRunAndThreeRun(), BAR4_H, BAR4_H)).toBe(false);
    });

    it('counts a pair that works in one order only', () => {
        // The 4-bar has exactly one home; the tromino has two. Placing the
        // tromino into the 4-run first would strand the bar, so an order-blind
        // check would call this pair impossible.
        expect(canBothBePlaced(fourRunAndThreeRun(), BAR4_H, TROMINO_H)).toBe(true);
    });

    it('counts the space a cleared line gives back', () => {
        // Filling row 7's four-cell gap clears it, which is what makes room for
        // the second bar. The forecast has to model the clear, not just the
        // placement.
        expect(canBothBePlaced(oneClearableRow(), BAR4_H, BAR4_H)).toBe(true);
    });

    it('reports the truth when the board is full', () => {
        expect(canBothBePlaced(emptyBoard(CELL.BLOCK), TROMINO_H, TROMINO_H)).toBe(false);
    });
});

describe('dealRescueShape', () => {
    it('deals a shape that fits in the orientation dealt', () => {
        const board = horizontalCorridor();
        const rng = seeded(5);
        for (let i = 0; i < 100; i++) {
            expect(hasAnyPlacement(board, dealRescueShape(board, rng).cells)).toBe(true);
        }
    });

    it('finds the one-cell rescue when only a single gap is left', () => {
        // The rescue slot is the promise that a maths answer can always avoid a
        // game-over, so it must reach for the monomino rather than give up.
        const board = emptyBoard(CELL.BLOCK);
        board[6][2] = CELL.EMPTY;
        const shape = dealRescueShape(board, seeded(5));
        expect(hasAnyPlacement(board, shape.cells)).toBe(true);
        expect(shape.cells).toHaveLength(1);
    });

    it('draws from the help shapes as well as the pool, even when a pool shape fits', () => {
        // Measured: 83 of 300 rescues are help shapes (3 templates of 10).
        // Pool only: 0; help only: 300.
        const helpNames = new Set(HELP_SHAPES.map(s => s.name));
        const rng = seeded(55);
        let help = 0;
        for (let i = 0; i < 300; i++) {
            if (helpNames.has(dealRescueShape(emptyBoard(), rng).name)) help++;
        }
        expect(help / 300).toBeGreaterThan(0.15);
        expect(help / 300).toBeLessThan(0.6);
    });

    it('still returns a shape on a full board', () => {
        expect(dealRescueShape(emptyBoard(CELL.BLOCK), seeded(2)).cells.length).toBeGreaterThan(0);
    });

    it('gives every dealt shape a unique id', () => {
        const rng = seeded(9);
        const ids = new Set<string>();
        for (let i = 0; i < 20; i++) ids.add(dealRescueShape(emptyBoard(), rng).id);
        expect(ids.size).toBe(20);
    });
});
