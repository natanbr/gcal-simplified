// ============================================================
// Mission Control — the mood gauge's single writer
// The gauge (`behaviorProgress`) and the game-token cap it pays into.
// Every in-dispatch write of the gauge goes through `moveGauge`:
// the heartbeat, the mission bonus, a missed mission, whining, and
// the parent's adjustment. Guarded by
// src/__tests__/gauge-writer-boundary.test.ts.
// ⚠️  Internal to src/mission-control/ only.
// ============================================================

import type { MCState } from '../types';

/** Progress points that fill the gauge from empty to one game token. */
export const PROGRESS_PER_TOKEN = 100;

/** Hard cap on banked game tokens. */
export const MAX_GAME_TOKENS = 5;

/**
 * Game tokens committed to a Quick-Game goal: already out of the balance, but a
 * trash refunds them. They count against the cap, or a held gauge would pay its
 * token into that gap and the refund would then be clamped away.
 */
function reservedGameTokens(cases: MCState['cases']): number {
    return cases.filter(c => c.reward === 'quick-game').length;
}

/**
 * Game tokens that may still be added before the cap, counting a Quick-Game
 * goal's token. The one cap check for every adder (the gauge and the parent's
 * grant). A corrupt balance → none.
 */
export function gameTokenRoom(state: MCState): number {
    if (!Number.isFinite(state.gameTokens)) return 0;
    return Math.max(0, MAX_GAME_TOKENS - state.gameTokens - reservedGameTokens(state.cases));
}

/** A gauge value made safe: finite, within [0, full]. */
function clampProgress(value: number): number {
    return Number.isFinite(value) ? Math.max(0, Math.min(PROGRESS_PER_TOKEN, value)) : 0;
}

export interface GaugeMove {
    patch: Pick<MCState, 'behaviorProgress' | 'gameTokens' | 'moodWind'>;
    granted: number;
}

/**
 * The ONE writer of `behaviorProgress` during a dispatch (guarded by
 * src/__tests__/gauge-writer-boundary.test.ts). Moves the gauge by `amount` and
 * pays at most `maxGrants` tokens, and only what fits under the cap. The grant
 * is decided FIRST and only granted tokens are subtracted, so a gauge with no
 * room holds at full: wrapping first once dropped a full gauge to ~0 %
 * unlogged. Earning a token resets the mood. A non-finite amount counts as 0.
 */
export function moveGauge(state: MCState, amount: number, maxGrants: number): GaugeMove {
    const progress = clampProgress(state.behaviorProgress) + (Number.isFinite(amount) ? amount : 0);
    const earned = progress >= PROGRESS_PER_TOKEN ? Math.floor(progress / PROGRESS_PER_TOKEN) : 0;
    const granted = Math.min(earned, gameTokenRoom(state), maxGrants);
    return {
        patch: {
            behaviorProgress: clampProgress(progress - granted * PROGRESS_PER_TOKEN),
            gameTokens: state.gameTokens + granted,
            moodWind: granted > 0 ? 0 : state.moodWind,
        },
        granted,
    };
}

/** Full gauge, no room for its token: nothing can change until one is spent. */
export function isGaugeHeldFull(state: MCState): boolean {
    return gameTokenRoom(state) === 0 && state.behaviorProgress >= PROGRESS_PER_TOKEN;
}

/** Hydration: a corrupt gauge (NaN persists as null) loads empty; a missing one gets the default. */
export function sanitizeBehaviorProgress(raw: unknown, fallback: number): number {
    if (raw === undefined) return fallback;
    return typeof raw === 'number' ? clampProgress(raw) : 0;
}

/**
 * Hydration: a corrupt balance (NaN persists as null) loads as 0; the default
 * would hand out a fresh 5 tokens. The cap counts the loaded Quick-Game goals,
 * because the trash's refund does not clamp: a saved 5 plus a goal (reachable
 * before gameTokenRoom existed) would otherwise trash to 6.
 */
export function sanitizeGameTokens(raw: unknown, fallback: number, cases: MCState['cases']): number {
    const value = raw === undefined ? fallback : typeof raw === 'number' && Number.isFinite(raw) ? raw : 0;
    return Math.max(0, Math.min(MAX_GAME_TOKENS - reservedGameTokens(cases), value));
}
