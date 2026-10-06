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
// is not complete any more (the Claim button goes away; the line says so).
// Points are not tokens: only the Claim pays (responsibilityClaim.ts), so a ➖
// moves no token. An amount other than none, 1 or -1 (null included) is
// refused here as well as by the remote validator, so a path that skips the
// validator cannot complete a task in one press.
//
// The reducer AND createLogEntry call responsibilityPointChange, so a press
// that changes nothing leaves the responsibilities as they were and writes no
// line (the adjustedMissionEnd pattern). Guarded by
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
    /** "+1 point for Recycling (2/3)", "+1 point for Recycling (3/3) — ready to claim",
     *  "-1 point for Recycling (2/3) — no longer complete". */
    message: string;
}

/** The press's effect on its task, or null when it changes nothing or is refused. */
export function responsibilityPointChange(
    state: MCState,
    action: Extract<MCAction, { type: 'ADD_RESPONSIBILITY_POINT' }>,
): ResponsibilityPointChange | null {
    const amount: unknown = action.amount; // typed 1 | -1, but a path past the validator may carry anything
    const step = amount === undefined ? 1 : amount;
    if (step !== 1 && step !== -1) return null;
    const task = state.responsibilities.find(r => r.id === action.taskId);
    if (!task) return null;
    if (step > 0 && task.completedAt) return null;
    const pointsEarned = Math.max(0, task.pointsEarned + step);
    if (pointsEarned === task.pointsEarned) return null;
    const complete = pointsEarned >= task.pointsRequired;
    const note = step > 0 && complete ? ' — ready to claim' : task.completedAt && !complete ? ' — no longer complete' : '';
    return {
        task,
        pointsEarned,
        complete,
        message: `${step > 0 ? '+1' : '-1'} point for ${task.label} (${pointsEarned}/${task.pointsRequired})${note}`,
    };
}
