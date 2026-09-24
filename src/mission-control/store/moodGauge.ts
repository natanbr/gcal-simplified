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

/** Room under the cap, negative when over it. The one piece of cap arithmetic. */
function signedRoom(state: MCState): number {
    return MAX_GAME_TOKENS - state.gameTokens - reservedGameTokens(state.cases);
}

/**
 * Game tokens that may still be added before the cap, counting a Quick-Game
 * goal's token. The one cap check for every adder (the gauge and the parent's
 * grant). A corrupt balance → none.
 */
export function gameTokenRoom(state: MCState): number {
    if (!Number.isFinite(state.gameTokens)) return 0;
    return Math.max(0, signedRoom(state));
}

/**
 * Game tokens over the cap, counting a Quick-Game goal's token. Only a saved
 * balance can be over (v0.0.42 let 5 sit beside a goal): every adder checks
 * gameTokenRoom first. A corrupt balance → none.
 */
export function gameTokensOverCap(state: MCState): number {
    if (!Number.isFinite(state.gameTokens)) return 0;
    return Math.min(state.gameTokens, Math.max(0, -signedRoom(state)));
}

/** SETTLE_GAME_TOKEN_CAP: drops what is over the cap. The same state when nothing is. */
export function settleGameTokenCap(state: MCState): MCState {
    const over = gameTokensOverCap(state);
    return over === 0 ? state : { ...state, gameTokens: state.gameTokens - over };
}

/**
 * The settle's log line, in words a parent reads. Null when nothing is over the cap.
 * No `delta`: it is a BANK-token delta wherever it is read (the day's spent sum,
 * the audit file's `d`), and no bank token moves. Like every game-token line.
 */
export function gameTokenCapNote(state: MCState): { message: string } | null {
    const over = gameTokensOverCap(state);
    if (over === 0) return null;
    const count = (n: number, noun: string) => `${n} ${noun}${n === 1 ? '' : 's'}`;
    const goals = reservedGameTokens(state.cases);
    const held = count(state.gameTokens, 'game token') + (goals > 0 ? ` plus ${count(goals, 'Quick-Game goal')}` : '');
    return { message: `${count(over, 'game token')} removed at load: ${held} is over the ${MAX_GAME_TOKENS}-token cap` };
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
 * would hand out a fresh 5 tokens. The cap is NOT applied here: a balance over
 * it is settled just after load by SETTLE_GAME_TOKEN_CAP (useGameTokenCapSettle),
 * which logs the removal. Clamping here moved a token silently, and a line
 * written at load never reaches the audit trail (useAuditTrail treats the
 * loaded log as already written).
 */
export function sanitizeGameTokens(raw: unknown, fallback: number): number {
    const value = raw === undefined ? fallback : typeof raw === 'number' && Number.isFinite(raw) ? raw : 0;
    return Math.max(0, value);
}
