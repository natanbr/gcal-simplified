// ============================================================
// Space Rescue — the candidates the dealer draws from: every template paired
// with each of its distinct orientations, and the draws over them.
// ⚠️  Internal to src/mission-control/games/blocks/ only.
// ============================================================

import { GameShape, Position } from './types';
import { orientations } from './placement';

export type Rng = () => number;

/** A shape template paired with one concrete orientation of it. */
export interface Candidate {
    shape: GameShape;
    cells: Position[];
}

/**
 * React keys must be unique across the bank AND across time — a replenished
 * slot holding the same template as the one just played would otherwise reuse
 * the old element, which is the "jump-back" glitch the unique-id suffix has
 * guarded against since the game was written.
 *
 * The suffix comes from the injected rng, not a module counter: a counter would
 * make the ids depend on how many deals ran earlier in the process, which is
 * neither pure nor reproducible under a seeded rng, and React StrictMode
 * double-invokes the setState updater this runs inside.
 */
export function toGameShape(candidate: Candidate, rng: Rng): GameShape {
    const suffix = Math.floor(rng() * 0x7fffffff).toString(36);
    return {
        ...candidate.shape,
        id: `${candidate.shape.id}-${suffix}`,
        // A copy: `candidate.cells` belongs to the orientation cache below.
        cells: candidate.cells.map(cell => ({ ...cell })),
    };
}

export function pick<T>(items: T[], rng: Rng): T {
    return items[Math.min(items.length - 1, Math.floor(rng() * items.length))];
}

export function groupByTemplate(candidates: Candidate[]): Candidate[][] {
    const byTemplate = new Map<string, Candidate[]>();
    for (const candidate of candidates) {
        const group = byTemplate.get(candidate.shape.id);
        if (group) group.push(candidate);
        else byTemplate.set(candidate.shape.id, [candidate]);
    }
    return [...byTemplate.values()];
}

/**
 * Draw a shape, then an orientation of it — NEVER uniformly over the flat
 * candidate list.
 *
 * Orientation counts differ wildly (an L tetromino has 8 distinct orientations,
 * a 2x2 square has 1), so a flat draw would deal the L 38% of the time and the
 * square 4.8%, against 14% each before orientations were enumerated. That is a
 * silent difficulty increase, and it also throws away the pool's own weighting:
 * SHAPE_POOL deliberately lists the trominoes and bars twice, which is how the
 * easy shapes were given double odds in the first place.
 */
export function pickCandidate(candidates: Candidate[], rng: Rng): Candidate {
    return pick(pick(groupByTemplate(candidates), rng), rng);
}

export function shuffle<T>(items: T[], rng: Rng): T[] {
    const result = [...items];
    for (let i = result.length - 1; i > 0; i--) {
        const j = Math.min(i, Math.floor(rng() * (i + 1)));
        [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
}

/**
 * Orientations per template id. Templates are module constants, so this never
 * goes stale — and enumerating them on every deal was more than half of what a
 * bank-emptying drop cost.
 */
const orientationCache = new Map<string, Position[][]>();

function orientationsOf(shape: GameShape): Position[][] {
    let cached = orientationCache.get(shape.id);
    if (!cached) {
        cached = orientations(shape.cells);
        orientationCache.set(shape.id, cached);
    }
    return cached;
}

export function candidatesFor(pool: GameShape[]): Candidate[] {
    return pool.flatMap(shape => orientationsOf(shape).map(cells => ({ shape, cells })));
}
