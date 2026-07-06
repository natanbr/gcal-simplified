// ============================================================
// Mission Control — Activity Log (Command Interceptor) Tests
// Tests the REAL createLogEntry implementation (store/activityLog),
// including the bank/total snapshots derived via the reducer.
// ============================================================

import { describe, it, expect } from 'vitest';
import { createLogEntry } from './activityLog';
import { mcReducer, initialState, selectTotalWealth } from './mcReducer';
import type { MCAction, MCState } from '../types';

function applyActions(actions: MCAction[], state: MCState = initialState): MCState {
    return actions.reduce((s, a) => mcReducer(s, a), state);
}

describe('createLogEntry — translation', () => {
    it('translates ADD_TOKEN to a manual entry with delta +1', () => {
        const log = createLogEntry({ type: 'ADD_TOKEN' }, initialState);
        expect(log).not.toBeNull();
        expect(log?.type).toBe('manual');
        expect(log?.delta).toBe(1);
    });

    it('translates REMOVE_TOKEN to a manual entry with delta -1', () => {
        const log = createLogEntry({ type: 'REMOVE_TOKEN' }, initialState);
        expect(log?.type).toBe('manual');
        expect(log?.delta).toBe(-1);
    });

    it('does not log COMPLETE_TASK (only main events are logged)', () => {
        const log = createLogEntry({ type: 'COMPLETE_TASK', missionPhase: 'morning', taskId: 'tshirt' }, initialState);
        expect(log).toBeNull();
    });

    it('labels mission start with the phase', () => {
        const log = createLogEntry({ type: 'SET_ACTIVE_MISSION', phase: 'morning' }, initialState);
        expect(log?.message).toContain('morning mission started');
        expect(log?.colorKey).toBe('morning');
    });

    it('does not log mission expiry when no mission is active', () => {
        const log = createLogEntry({ type: 'SET_ACTIVE_MISSION', phase: 'none' }, initialState);
        expect(log).toBeNull();
    });

    it('marks remote actions with isRemote', () => {
        const log = createLogEntry({ type: 'ADD_TOKEN', isRemote: true }, initialState);
        expect(log?.isRemote).toBe(true);
    });
});

describe('createLogEntry — snapshots match reducer output', () => {
    it('ADD_TOKENS snapshot reflects the post-action bank and total', () => {
        const action: MCAction = { type: 'ADD_TOKENS', amount: 3, source: 'manual' };
        const log = createLogEntry(action, initialState);
        const nextState = mcReducer(initialState, action);
        expect(log?.bankTokens).toBe(nextState.bankCount);
        expect(log?.totalTokens).toBe(selectTotalWealth(nextState));
    });

    it('MOVE_TOKEN bank→case decrements the bank snapshot but keeps total', () => {
        const state = applyActions([
            { type: 'SELECT_CASE', caseId: 0, reward: 'show', targetCount: 5 },
        ]);
        const action: MCAction = { type: 'MOVE_TOKEN', from: 'bank', to: 0 };
        const log = createLogEntry(action, state);
        expect(log?.bankTokens).toBe(state.bankCount - 1);
        expect(log?.totalTokens).toBe(selectTotalWealth(state));
    });

    it('invalid MOVE_TOKEN (empty bank) leaves the snapshot unchanged', () => {
        const state: MCState = { ...initialState, bankCount: 0 };
        const withCase = applyActions([
            { type: 'SELECT_CASE', caseId: 0, reward: 'show', targetCount: 5 },
        ], state);
        const log = createLogEntry({ type: 'MOVE_TOKEN', from: 'bank', to: 0 }, withCase);
        expect(log?.bankTokens).toBe(0);
    });

    it('CONSUME_CASE reduces total wealth by the case tokens, bank untouched', () => {
        const state = applyActions([
            { type: 'SELECT_CASE', caseId: 0, reward: 'show', targetCount: 2 },
            { type: 'DEPOSIT_TO_CASE', caseId: 0, amount: 2 },
        ]);
        const log = createLogEntry({ type: 'CONSUME_CASE', caseId: 0 }, state);
        expect(log?.bankTokens).toBe(state.bankCount);
        expect(log?.totalTokens).toBe(selectTotalWealth(state) - 2);
    });
});

describe('createLogEntry — COMPLETE_MISSION_ROUTINE idempotency', () => {
    it('logs the completion while the mission is active', () => {
        const state = applyActions([{ type: 'SET_ACTIVE_MISSION', phase: 'morning' }]);
        const log = createLogEntry({ type: 'COMPLETE_MISSION_ROUTINE', missionPhase: 'morning', bonusTokens: 2 }, state);
        expect(log?.message).toContain('Morning mission completed');
        expect(log?.delta).toBe(2);
    });

    it('suppresses a duplicate completion after the mission is already done', () => {
        const state = applyActions([
            { type: 'SET_ACTIVE_MISSION', phase: 'morning' },
            { type: 'COMPLETE_MISSION_ROUTINE', missionPhase: 'morning', bonusTokens: 2 },
        ]);
        const log = createLogEntry({ type: 'COMPLETE_MISSION_ROUTINE', missionPhase: 'morning', bonusTokens: 2 }, state);
        expect(log).toBeNull();
    });
});
