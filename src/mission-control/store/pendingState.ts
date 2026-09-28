// ============================================================
// Mission Control — the state the next intercepted dispatch applies to
// ------------------------------------------------------------
// useMCDispatch builds each log line (its guards and its balance snapshot) from
// the state it will apply to. It used to read the state of the last RENDER, so
// dispatches made before the next render logged a stale balance: on the launch
// that settles the game-token cap, the overlay's completion (a passive effect,
// run before the settle's re-render) logged the pre-settle 🎮 5 right after the
// line removing that token (review of 7761584, 2026-09-28).
//
// The provider keeps ONE of these for every useMCDispatch: the last render's
// state plus the intercepted actions dispatched since, in order, as the very
// objects React receives (same timestamp). They are folded with the same pure
// mcReducer only when a log needs the state, so a lone dispatch between renders
// costs no extra reducer pass; each render starts again from its state.
//
// Known limit, no worse than before: raw dispatches (the 60 s heartbeat, the
// provider's pairing-key save) are not queued, and a render at a higher priority
// that skips queued lower-priority updates resets to a state without them.
// ⚠️  Internal to src/mission-control/ only.
// ============================================================

import type { MCAction, MCState } from '../types';
import { mcReducer } from './mcReducer';

export interface PendingState {
    base: MCState;
    queue: MCAction[];
}

export const pendingFrom = (state: MCState): PendingState => ({ base: state, queue: [] });

/** The base with every queued action applied; folds once, then the queue is empty. */
export function currentPending(pending: PendingState): MCState {
    if (pending.queue.length > 0) {
        pending.base = pending.queue.reduce(mcReducer, pending.base);
        pending.queue = [];
    }
    return pending.base;
}
