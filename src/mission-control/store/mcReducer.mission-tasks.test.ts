// ============================================================
// Mission Control — Reducer: Mission Task tests
// Covers: COMPLETE_TASK, LOCK_TASK, and task-related invariants
// on SET_ACTIVE_MISSION (clean slate per trigger).
// ============================================================

import { describe, it, expect } from 'vitest';
import { mcReducer, initialState } from './mcReducer';
import type { MCAction, MCState } from '../types';

// ── Helpers ───────────────────────────────────────────────────────────────────

function applyActions(actions: MCAction[], state: MCState = initialState): MCState {
    return actions.reduce((s, a) => mcReducer(s, a), state);
}

function morningMission(state: MCState) {
    return state.missions.find(m => m.phase === 'morning')!;
}
function eveningMission(state: MCState) {
    return state.missions.find(m => m.phase === 'evening')!;
}

// First task IDs from default missions
const MORNING_TASK_1 = 'tshirt';
const MORNING_TASK_2 = 'toothbrush';
const EVENING_TASK_1 = 'shower';

// ── COMPLETE_TASK ─────────────────────────────────────────────────────────────

describe('mcReducer — COMPLETE_TASK', () => {
    it('marks the specified task as completed', () => {
        const state = mcReducer(initialState, {
            type: 'COMPLETE_TASK',
            missionPhase: 'morning',
            taskId: MORNING_TASK_1,
        });
        const task = morningMission(state).tasks.find(t => t.id === MORNING_TASK_1)!;
        expect(task.completed).toBe(true);
    });

    it('does not affect other tasks in the same mission', () => {
        const state = mcReducer(initialState, {
            type: 'COMPLETE_TASK',
            missionPhase: 'morning',
            taskId: MORNING_TASK_1,
        });
        const others = morningMission(state).tasks.filter(t => t.id !== MORNING_TASK_1);
        others.forEach(t => expect(t.completed).toBe(false));
    });

    it('does not affect tasks in the other mission phase', () => {
        const state = mcReducer(initialState, {
            type: 'COMPLETE_TASK',
            missionPhase: 'morning',
            taskId: MORNING_TASK_1,
        });
        eveningMission(state).tasks.forEach(t => expect(t.completed).toBe(false));
    });

    it('is idempotent — completing an already-completed task stays completed', () => {
        const state = applyActions([
            { type: 'COMPLETE_TASK', missionPhase: 'morning', taskId: MORNING_TASK_1 },
            { type: 'COMPLETE_TASK', missionPhase: 'morning', taskId: MORNING_TASK_1 },
        ]);
        const task = morningMission(state).tasks.find(t => t.id === MORNING_TASK_1)!;
        expect(task.completed).toBe(true);
    });

    it('completing all morning tasks makes every task completed', () => {
        const morningTaskIds = morningMission(initialState).tasks.map(t => t.id);
        const actions: MCAction[] = morningTaskIds.map(id => ({
            type: 'COMPLETE_TASK',
            missionPhase: 'morning',
            taskId: id,
        }));
        const state = applyActions(actions);
        const allDone = morningMission(state).tasks.every(t => t.completed);
        expect(allDone).toBe(true);
    });

    it('can complete a task in the evening mission independently', () => {
        const state = mcReducer(initialState, {
            type: 'COMPLETE_TASK',
            missionPhase: 'evening',
            taskId: EVENING_TASK_1,
        });
        const task = eveningMission(state).tasks.find(t => t.id === EVENING_TASK_1)!;
        expect(task.completed).toBe(true);
        // Morning tasks must not be affected
        morningMission(state).tasks.forEach(t => expect(t.completed).toBe(false));
    });
});

// ── LOCK_TASK ─────────────────────────────────────────────────────────────────

describe('mcReducer — LOCK_TASK', () => {
    it('marks the specified task as locked', () => {
        const state = mcReducer(initialState, {
            type: 'LOCK_TASK',
            missionPhase: 'morning',
            taskId: MORNING_TASK_2,
        });
        const task = morningMission(state).tasks.find(t => t.id === MORNING_TASK_2)!;
        expect(task.locked).toBe(true);
    });

    it('does not affect other tasks in the same mission', () => {
        const state = mcReducer(initialState, {
            type: 'LOCK_TASK',
            missionPhase: 'morning',
            taskId: MORNING_TASK_2,
        });
        const others = morningMission(state).tasks.filter(t => t.id !== MORNING_TASK_2);
        others.forEach(t => expect(t.locked).toBe(false));
    });

    it('does not affect tasks in the other phase', () => {
        const state = mcReducer(initialState, {
            type: 'LOCK_TASK',
            missionPhase: 'morning',
            taskId: MORNING_TASK_2,
        });
        eveningMission(state).tasks.forEach(t => expect(t.locked).toBe(false));
    });

    it('is idempotent — locking an already-locked task stays locked', () => {
        const state = applyActions([
            { type: 'LOCK_TASK', missionPhase: 'morning', taskId: MORNING_TASK_1 },
            { type: 'LOCK_TASK', missionPhase: 'morning', taskId: MORNING_TASK_1 },
        ]);
        const task = morningMission(state).tasks.find(t => t.id === MORNING_TASK_1)!;
        expect(task.locked).toBe(true);
    });

    it('locking a task does not complete it', () => {
        const state = mcReducer(initialState, {
            type: 'LOCK_TASK',
            missionPhase: 'morning',
            taskId: MORNING_TASK_1,
        });
        const task = morningMission(state).tasks.find(t => t.id === MORNING_TASK_1)!;
        expect(task.locked).toBe(true);
        expect(task.completed).toBe(false);
    });

    it('a locked task can still be completed independently', () => {
        const state = applyActions([
            { type: 'LOCK_TASK', missionPhase: 'morning', taskId: MORNING_TASK_1 },
            { type: 'COMPLETE_TASK', missionPhase: 'morning', taskId: MORNING_TASK_1 },
        ]);
        const task = morningMission(state).tasks.find(t => t.id === MORNING_TASK_1)!;
        expect(task.locked).toBe(true);
        expect(task.completed).toBe(true);
    });
});

// ── SET_ACTIVE_MISSION — clean slate invariant ────────────────────────────────

describe('mcReducer — SET_ACTIVE_MISSION: tasks reset to clean state', () => {
    it('resets completed tasks when mission is triggered (fresh start)', () => {
        const state = applyActions([
            { type: 'SET_ACTIVE_MISSION', phase: 'morning' },
            { type: 'COMPLETE_TASK', missionPhase: 'morning', taskId: MORNING_TASK_1 },
            // Trigger again (simulate tomorrow re-activation path: SET_ACTIVE_MISSION always resets)
            { type: 'SET_ACTIVE_MISSION', phase: 'morning' },
        ]);
        morningMission(state).tasks.forEach(t => {
            expect(t.completed).toBe(false);
            expect(t.locked).toBe(false);
        });
    });

    it('resets locked tasks when mission is triggered', () => {
        const state = applyActions([
            { type: 'SET_ACTIVE_MISSION', phase: 'morning' },
            { type: 'LOCK_TASK', missionPhase: 'morning', taskId: MORNING_TASK_2 },
            { type: 'SET_ACTIVE_MISSION', phase: 'morning' },
        ]);
        morningMission(state).tasks.forEach(t => expect(t.locked).toBe(false));
    });

    it('all morning tasks start as not completed and not locked', () => {
        const state = mcReducer(initialState, { type: 'SET_ACTIVE_MISSION', phase: 'morning' });
        morningMission(state).tasks.forEach(t => {
            expect(t.completed).toBe(false);
            expect(t.locked).toBe(false);
        });
    });

    it('all evening tasks start as not completed and not locked', () => {
        const state = mcReducer(initialState, { type: 'SET_ACTIVE_MISSION', phase: 'evening' });
        eveningMission(state).tasks.forEach(t => {
            expect(t.completed).toBe(false);
            expect(t.locked).toBe(false);
        });
    });
});

// ── allDone derived state ─────────────────────────────────────────────────────

describe('all-done predicate — derived from task state', () => {
    it('is false when no tasks are completed', () => {
        const mission = morningMission(initialState);
        expect(mission.tasks.every(t => t.completed)).toBe(false);
    });

    it('is false when only some tasks are completed', () => {
        const state = mcReducer(initialState, {
            type: 'COMPLETE_TASK',
            missionPhase: 'morning',
            taskId: MORNING_TASK_1,
        });
        expect(morningMission(state).tasks.every(t => t.completed)).toBe(false);
    });

    it('is true when all morning tasks are completed', () => {
        const taskIds = morningMission(initialState).tasks.map(t => t.id);
        const actions: MCAction[] = taskIds.map(id => ({
            type: 'COMPLETE_TASK',
            missionPhase: 'morning',
            taskId: id,
        }));
        const state = applyActions(actions);
        expect(morningMission(state).tasks.every(t => t.completed)).toBe(true);
    });
});
