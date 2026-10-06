// ============================================================
// Mission Control — what the parent's Claim on a responsibility does
// ------------------------------------------------------------
// RESET_RESPONSIBILITY is the desktop card's Claim button (the phone cannot
// send it: it is not on REMOTE_ALLOWED_ACTIONS). The reducer used to pay the
// action's claimTokens whatever the count and the task, and the button keeps
// its click handler while it animates out, so a double tap paid twice, a
// Claim racing a phone ➖ paid for a task below its goal, and a Claim naming
// an unknown task paid with no line (PR 195 review).
//
// Only a completed task can be claimed. It pays the task's own reward
// (`tokenReward`: Activity 3, Recycling none, its reward being the
// bottle-depot money), never a number carried on the action (journal
// 2026-09-23: a value the reducer can derive must not ride on the action).
//
// The reducer AND createLogEntry call responsibilityClaim, so a refused Claim
// pays nothing and writes no line. Guarded by
// store/__tests__/mcReducer.responsibility-claim.test.ts.
// ⚠️  Internal to src/mission-control/ only.
// ============================================================

import type { MCAction, MCState, ResponsibilityTask } from '../types';

export interface ResponsibilityClaim {
    /** The task as it was before the Claim. */
    task: ResponsibilityTask;
    /** Bank tokens the Claim pays: the task's own reward, 0 when it has none. */
    tokens: number;
}

/** The Claim's effect, or null when the task does not exist or is not complete. */
export function responsibilityClaim(
    state: MCState,
    action: Extract<MCAction, { type: 'RESET_RESPONSIBILITY' }>,
): ResponsibilityClaim | null {
    const task = state.responsibilities.find(r => r.id === action.taskId);
    if (!task || !task.completedAt) return null;
    const reward = task.tokenReward ?? 0;
    return { task, tokens: Number.isFinite(reward) && reward > 0 ? reward : 0 };
}
