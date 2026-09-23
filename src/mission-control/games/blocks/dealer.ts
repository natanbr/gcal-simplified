// ============================================================
// Space Rescue — the shape dealer
// ⚠️  Internal to src/mission-control/games/blocks/ only.
//
// Deals the three shapes in the bank as a COHERENT SET rather than three
// independent draws, so the child is handed a hand that can actually be played
// out. See docs/requirements.md → "Proactive Shapes Generator".
//
// Randomness comes in as a REQUIRED `rng` parameter. No Math.random default:
// every caller inside a React state updater must pass a seeded generator, and a
// default would let a forgotten argument reintroduce the re-rolling deal
// (2026-09-23) without so much as a type error.
// ============================================================

import { GameShape, SHAPE_POOL, HELP_SHAPES, LEVEL_COMPLEX_SHAPES } from './types';
import {
    hasAnyPlacement,
    completingAnchors,
    canCompleteLine,
    canBothBePlaced,
    linesClearedBy,
    projectPlacement,
} from './placement';
import { Candidate, candidatesFor, groupByTemplate, pick, pickCandidate, shuffle, toGameShape } from './candidates';
import { Rng } from './rng';

export interface Difficulty {
    /** Chance the first shape is one that can finish a line. */
    clearChance: number;
    /** Chance the other two are chosen so both can be placed in one round. */
    pairChance: number;
}

/**
 * Generosity per altitude level. The pair chance always sits above the clearing
 * chance, and the whole table stays kind: the player is eight, and the board is
 * already spawning asteroids and satellites against them by level 2.
 */
const DIFFICULTY_BY_LEVEL: Difficulty[] = [
    { clearChance: 0.8, pairChance: 1 },
    { clearChance: 0.7, pairChance: 0.95 },
    { clearChance: 0.6, pairChance: 0.9 },
    { clearChance: 0.5, pairChance: 0.85 },
];

export function difficultyFor(level: number): Difficulty {
    const index = Math.min(Math.max(Math.floor(level) || 0, 0), DIFFICULTY_BY_LEVEL.length - 1);
    return DIFFICULTY_BY_LEVEL[index];
}

/** Backstop on the pair walk. The level-3 pool has at most 105 distinct pairs,
 *  so this never trips today — it exists so a bigger pool cannot stall the drop. */
const MAX_PAIR_ATTEMPTS = 120;

function poolForLevel(level: number): GameShape[] {
    let pool = [...SHAPE_POOL];
    for (let l = 1; l <= level; l++) {
        if (LEVEL_COMPLEX_SHAPES[l]) pool = [...pool, ...LEVEL_COMPLEX_SHAPES[l]];
    }
    return pool;
}

/** The last resort when the board has no room for a pool shape at all. */
function fallbackCandidate(grid: number[][], rng: Rng): Candidate {
    const help = candidatesFor(HELP_SHAPES).filter(c => hasAnyPlacement(grid, c.cells));
    if (help.length > 0) return pickCandidate(help, rng);
    return { shape: HELP_SHAPES[0], cells: HELP_SHAPES[0].cells };
}

/**
 * The board as it will look if the child plays `candidate` at its most
 * profitable anchor. Null when the shape cannot finish a line, in which case
 * there is nothing to forecast and the other two plan against the board as it
 * stands.
 */
function projectBestClear(grid: number[][], candidate: Candidate): number[][] | null {
    const anchors = completingAnchors(grid, candidate.cells);
    if (anchors.length === 0) return null;

    let best = anchors[0];
    let bestCleared = 0;
    for (const anchor of anchors) {
        const cleared = linesClearedBy(grid, candidate.cells, anchor);
        if (cleared > bestCleared) {
            bestCleared = cleared;
            best = anchor;
        }
    }
    return projectPlacement(grid, candidate.cells, best).grid;
}

function coPlaceable(board: number[][], a: Candidate, b: Candidate): boolean {
    return canBothBePlaced(board, a.cells, b.cells);
}

/**
 * Draws a random ORDER over the templates and walks distinct pairs in it,
 * rather than sampling pairs with replacement.
 *
 * Sampling would re-test the same pair over and over and could miss the only
 * workable combination on a tight board — precisely the bounded-grid rejection
 * sampling the project journal warns against. Walking a shuffled order keeps the
 * choice random while covering every template pair exactly once. `j` starts at
 * `i` because two copies of the same shape are a legitimate pair.
 *
 * The coverage is over TEMPLATES, not orientations: each pair is tried with one
 * random orientation of each shape. A pair that co-fits in only one of an L's
 * eight orientations can therefore still be missed, and the deal falls back to
 * the line-finisher branch. That is a less generous hand, never an illegal one,
 * which is why it is left as is rather than exhausting 8x8 combinations on the
 * drop path.
 */
function findCoPlaceablePair(
    board: number[][],
    fitting: Candidate[],
    rng: Rng,
): [Candidate, Candidate] | null {
    const groups = groupByTemplate(fitting);

    // Shuffle the PAIRS, not the groups. Walking a shuffled group list in
    // nested-loop order always tests (first, first) first, which on an open
    // board succeeds immediately and deals the child two copies of the same
    // shape every single round.
    const pairs: Array<[number, number]> = [];
    for (let i = 0; i < groups.length; i++) {
        for (let j = i; j < groups.length; j++) pairs.push([i, j]);
    }

    let budget = MAX_PAIR_ATTEMPTS;
    for (const [i, j] of shuffle(pairs, rng)) {
        if (budget-- <= 0) return null;
        const a = pick(groups[i], rng);
        const b = pick(groups[j], rng);
        if (coPlaceable(board, a, b)) return [a, b];
    }
    return null;
}

/**
 * The two shapes that accompany the first.
 *
 * `fitting` has already been filtered against the board as it stands, so the
 * standing promise holds — every shape in the bank fits RIGHT NOW — while
 * co-placement is judged on `board`, the forecast after the first shape clears
 * its line, which is the space the child will really be working in. When the
 * first shape cannot clear anything, `board` IS the current grid, so the pair is
 * checked without accounting for the first shape's own footprint; the spec only
 * promises the pair, not all three.
 * Filtering on `board` alone would deal shapes that only fit once a line goes,
 * which is how a bank full of unplayable shapes happens.
 */
function dealPair(
    board: number[][],
    fitting: Candidate[],
    pairChance: number,
    rng: Rng,
): [Candidate, Candidate] {
    if (rng() < pairChance) {
        const pair = findCoPlaceablePair(board, fitting, rng);
        if (pair) return pair;

        // Very limited space: nothing co-fits, so favour shapes that buy some
        // back by finishing a line.
        const clearing = fitting.filter(c => canCompleteLine(board, c.cells));
        if (clearing.length > 0) return [pickCandidate(clearing, rng), pickCandidate(clearing, rng)];
    }

    return [pickCandidate(fitting, rng), pickCandidate(fitting, rng)];
}

/**
 * The three shapes for the bank.
 *
 * 1. one shape may be a line-finisher (`clearChance`),
 * 2. the board is forecast forward as if that shape is played first,
 * 3. the other two are chosen so both fit in the round (`pairChance`),
 * 4. and the three are shuffled, so the gift is not always in slot one.
 */
export function dealStandardTriple(grid: number[][], level: number, rng: Rng): GameShape[] {
    const { clearChance, pairChance } = difficultyFor(level);
    const candidates = candidatesFor(poolForLevel(level));
    const fitting = candidates.filter(c => hasAnyPlacement(grid, c.cells));

    if (fitting.length === 0) {
        const jammed = [0, 1, 2].map(() => fallbackCandidate(grid, rng));
        return jammed.map(c => toGameShape(c, rng));
    }

    const clearing = fitting.filter(c => canCompleteLine(grid, c.cells));
    const first =
        clearing.length > 0 && rng() < clearChance ? pickCandidate(clearing, rng) : pickCandidate(fitting, rng);

    const board = projectBestClear(grid, first) ?? grid;
    const rest = dealPair(board, fitting, pairChance, rng);

    return shuffle([first, ...rest], rng).map(c => toGameShape(c, rng));
}

/**
 * Could ANY shape available at this level be placed? The last clause of the
 * game-over rule, and the reason a refresh of the rescue slot is worth offering.
 *
 * It tries every orientation, like the deal. With today's pool that gives the
 * same answer as trying each template as declared — every shape but the 2x2
 * contains a straight run of three, and both `1x3-h` and `1x3-v` are templates —
 * so this is consistency with the deal, not a fix. A pool without both
 * trominoes would make the difference real.
 */
export function anyPoolShapeFits(grid: number[][], level: number): boolean {
    return candidatesFor(poolForLevel(level)).some(c => hasAnyPlacement(grid, c.cells));
}

/**
 * The golden rescue shape. Reaches into HELP_SHAPES as well as the pool, since
 * this slot is the promise that a maths answer can always rescue the child from
 * a game-over — a monomino is a legitimate answer when one cell is all there is.
 */
export function dealRescueShape(grid: number[][], rng: Rng): GameShape {
    const candidates = candidatesFor([...HELP_SHAPES, ...SHAPE_POOL]);
    const fitting = candidates.filter(c => hasAnyPlacement(grid, c.cells));
    const chosen = fitting.length > 0 ? pickCandidate(fitting, rng) : fallbackCandidate(grid, rng);
    return toGameShape(chosen, rng);
}
