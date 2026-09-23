// ============================================================
// Space Rescue — where randomness comes from.
//
// Its own module because two unrelated things draw from it: where a clear's
// meteors land, and which shapes the dealer deals. Neither owns it, and homing
// it in either one makes the other import a module it has no business knowing.
// ⚠️  Internal to src/mission-control/games/blocks/ only.
// ============================================================

/** Any source of numbers in [0, 1): `Math.random`, or a seeded generator. */
export type Rng = () => number;

/**
 * mulberry32: the same seed always rolls the same sequence.
 *
 * Built INSIDE the state updater that spends it, from a seed rolled outside —
 * never the other way round. The generator is stateful, so one built outside
 * and captured would continue its sequence on a replayed run instead of
 * repeating it, which looks like the fix and is not one.
 */
export function seededRandom(seed: number): Rng {
    let state = seed >>> 0;
    return () => {
        state = (state + 0x6D2B79F5) >>> 0;
        let t = Math.imul(state ^ (state >>> 15), state | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
