// ============================================================
// Mission Control — Reducer: Responsibility tests
// Covers ADD_RESPONSIBILITY_POINT and RESET_RESPONSIBILITY.
// ============================================================

import { describe, it, expect } from 'vitest';
import { mcReducer, initialState } from './mcReducer';
import type { MCAction, MCState } from '../types';

function applyActions(actions: MCAction[], state: MCState = initialState): MCState {
    return actions.reduce((s, a) => mcReducer(s, a), state);
}

function recycling(state: MCState) {
    return state.responsibilities.find(r => r.id === 'recycling')!;
}

// ──────────────────────────────────────────────────────────────
// ADD_RESPONSIBILITY_POINT
// ──────────────────────────────────────────────────────────────

describe('mcReducer — ADD_RESPONSIBILITY_POINT', () => {
    it('increments pointsEarned by 1', () => {
        const state = applyActions([{ type: 'ADD_RESPONSIBILITY_POINT', taskId: 'recycling' }]);
        expect(recycling(state).pointsEarned).toBe(1);
    });

    it('does not affect other responsibilities', () => {
        const state = applyActions([{ type: 'ADD_RESPONSIBILITY_POINT', taskId: 'recycling' }]);
        // Only one responsibility exists by default — confirm it changed
        expect(state.responsibilities.filter(r => r.id !== 'recycling').every(r => r.pointsEarned === 0)).toBe(true);
    });

    it('sets completedAt when pointsEarned reaches pointsRequired', () => {
        const required = recycling(initialState).pointsRequired; // 3
        const actions: MCAction[] = Array.from({ length: required }, () => ({
            type: 'ADD_RESPONSIBILITY_POINT',
            taskId: 'recycling',
        }));
        const state = applyActions(actions);
        expect(recycling(state).completedAt).not.toBeNull();
    });

    it('completedAt is null if not yet at pointsRequired', () => {
        const required = recycling(initialState).pointsRequired; // 3
        const actions: MCAction[] = Array.from({ length: required - 1 }, () => ({
            type: 'ADD_RESPONSIBILITY_POINT',
            taskId: 'recycling',
        }));
        const state = applyActions(actions);
        expect(recycling(state).completedAt).toBeNull();
    });

    it('ignores extra points once already completed', () => {
        const required = recycling(initialState).pointsRequired;
        const actions: MCAction[] = Array.from({ length: required + 2 }, () => ({
            type: 'ADD_RESPONSIBILITY_POINT',
            taskId: 'recycling',
        }));
        const state = applyActions(actions);
        // Should cap at pointsRequired — completedAt guard stops further increments
        expect(recycling(state).pointsEarned).toBe(required);
    });

    it('ignores unknown taskId', () => {
        const state = applyActions([{ type: 'ADD_RESPONSIBILITY_POINT', taskId: 'nonexistent' }]);
        expect(state.responsibilities).toEqual(initialState.responsibilities);
    });
});

// ──────────────────────────────────────────────────────────────
// RESET_RESPONSIBILITY
// ──────────────────────────────────────────────────────────────

describe('mcReducer — RESET_RESPONSIBILITY', () => {
    it('resets pointsEarned to 0', () => {
        const state = applyActions([
            { type: 'ADD_RESPONSIBILITY_POINT', taskId: 'recycling' },
            { type: 'ADD_RESPONSIBILITY_POINT', taskId: 'recycling' },
            { type: 'RESET_RESPONSIBILITY', taskId: 'recycling' },
        ]);
        expect(recycling(state).pointsEarned).toBe(0);
    });

    it('clears completedAt', () => {
        const required = recycling(initialState).pointsRequired;
        const addActions: MCAction[] = Array.from({ length: required }, () => ({
            type: 'ADD_RESPONSIBILITY_POINT',
            taskId: 'recycling',
        }));
        const state = applyActions([
            ...addActions,
            { type: 'RESET_RESPONSIBILITY', taskId: 'recycling' },
        ]);
        expect(recycling(state).completedAt).toBeNull();
    });

    it('allows earning points again after reset', () => {
        const required = recycling(initialState).pointsRequired;
        const addActions: MCAction[] = Array.from({ length: required }, () => ({
            type: 'ADD_RESPONSIBILITY_POINT',
            taskId: 'recycling',
        }));
        const state = applyActions([
            ...addActions,
            { type: 'RESET_RESPONSIBILITY', taskId: 'recycling' },
            { type: 'ADD_RESPONSIBILITY_POINT', taskId: 'recycling' },
        ]);
        expect(recycling(state).pointsEarned).toBe(1);
        expect(recycling(state).completedAt).toBeNull();
    });

    it('is a no-op for unknown taskId', () => {
        const state = applyActions([{ type: 'RESET_RESPONSIBILITY', taskId: 'nonexistent' }]);
        expect(state.responsibilities).toEqual(initialState.responsibilities);
    });
});

// ──────────────────────────────────────────────────────────────
// Activity tokenReward — bank payout on claim
// The UI dispatches ADD_TOKEN × tokenReward then RESET_RESPONSIBILITY.
// These tests validate the reducer produces the correct combined state.
// ──────────────────────────────────────────────────────────────

function activity(state: MCState) {
    return state.responsibilities.find(r => r.id === 'activity')!;
}

describe('Activity tokenReward — bank payout on claim', () => {
    it('Activity responsibility has tokenReward: 3 in initial state', () => {
        expect(activity(initialState).tokenReward).toBe(3);
    });

    it('Recycling has no tokenReward (claim should not add bank tokens)', () => {
        expect(recycling(initialState).tokenReward).toBeUndefined();
    });

    it('claim sequence: ADD_TOKEN ×3 then RESET gives bank +3', () => {
        const startingBank = initialState.bankCount;
        // Simulate what the Claim button dispatches
        const state = applyActions([
            { type: 'ADD_TOKEN' },
            { type: 'ADD_TOKEN' },
            { type: 'ADD_TOKEN' },
            { type: 'RESET_RESPONSIBILITY', taskId: 'activity' },
        ]);
        expect(state.bankCount).toBe(startingBank + 3);
    });

    it('activity is fully reset after claim sequence', () => {
        // First earn all 3 points
        const earned = applyActions([
            { type: 'ADD_RESPONSIBILITY_POINT', taskId: 'activity' },
            { type: 'ADD_RESPONSIBILITY_POINT', taskId: 'activity' },
            { type: 'ADD_RESPONSIBILITY_POINT', taskId: 'activity' },
        ]);
        expect(activity(earned).completedAt).not.toBeNull();

        // Then claim
        const state = applyActions([
            { type: 'ADD_TOKEN' },
            { type: 'ADD_TOKEN' },
            { type: 'ADD_TOKEN' },
            { type: 'RESET_RESPONSIBILITY', taskId: 'activity' },
        ], earned);

        expect(activity(state).pointsEarned).toBe(0);
        expect(activity(state).completedAt).toBeNull();
    });

    it('allows earning points again after claim', () => {
        const afterClaim = applyActions([
            { type: 'ADD_RESPONSIBILITY_POINT', taskId: 'activity' },
            { type: 'ADD_RESPONSIBILITY_POINT', taskId: 'activity' },
            { type: 'ADD_RESPONSIBILITY_POINT', taskId: 'activity' },
            { type: 'ADD_TOKEN' },
            { type: 'ADD_TOKEN' },
            { type: 'ADD_TOKEN' },
            { type: 'RESET_RESPONSIBILITY', taskId: 'activity' },
            { type: 'ADD_RESPONSIBILITY_POINT', taskId: 'activity' }, // new session
        ]);
        expect(activity(afterClaim).pointsEarned).toBe(1);
        expect(afterClaim.bankCount).toBe(initialState.bankCount + 3);
    });
});

