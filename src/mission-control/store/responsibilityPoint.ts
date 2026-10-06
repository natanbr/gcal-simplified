// ============================================================
// Mission Control — what one responsibility point press really does
// ------------------------------------------------------------
// ADD_RESPONSIBILITY_POINT: the desktop card's +1 (no amount) and the phone's
// ➕ / ➖ (amount 1 / -1). The log used to ignore `amount`, so a ➖ wrote
// "Point earned for Recycling" while the count went down, and a press that
// changed nothing (➖ at 0, ➕ on a completed task) still wrote a line.
//
// A ➕ on a completed task is refused: it waits for the parent's Claim. A ➖
// takes a point back, never below 0, and a completed task taken below its goal
// is not complete any more (the Claim button goes away). Points are not tokens:
// only the Claim (RESET_RESPONSIBILITY) pays, so a ➖ moves no token. Any other
// amount is refused here as well as by the remote validator, so a path that
// skips the validator cannot complete a task in one press.
//
// The reducer AND createLogEntry call responsibilityPointChange, so a press
// that changes nothing changes no state and writes no line (the
// adjustedMissionEnd pattern). Guarded by
// store/__tests__/mcReducer.responsibility-point.test.ts.
// ⚠️  Internal to src/mission-control/ only.
// ============================================================

import type { MCAction, MCState, ResponsibilityTask } from '../types';

export interface ResponsibilityPointChange {
    /** The task before the press. */
    task: ResponsibilityTask;
    pointsEarned: number;
    /** The goal is met after the press: the Claim button shows. */
    complete: boolean;
    /** "+1 point for Recycling (2/3)" or "-1 point for Recycling (1/3)". */
    message: string;
}

/** The press's effect on its task, or null when it changes nothing or is refused. */
export function responsibilityPointChange(
    state: MCState,
    action: Extract<MCAction, { type: 'ADD_RESPONSIBILITY_POINT' }>,
): ResponsibilityPointChange | null {
    const step: number = action.amount ?? 1;
    if (step !== 1 && step !== -1) return null;
    const task = state.responsibilities.find(r => r.id === action.taskId);
    if (!task) return null;
    if (step > 0 && task.completedAt) return null;
    const pointsEarned = Math.max(0, task.pointsEarned + step);
    if (pointsEarned === task.pointsEarned) return null;
    return {
        task,
        pointsEarned,
        complete: pointsEarned >= task.pointsRequired,
        message: `${step > 0 ? '+1' : '-1'} point for ${task.label} (${pointsEarned}/${task.pointsRequired})`,
    };
}
