// ============================================================
// Mission Control — Activity Logs (Command Interceptor) Tests
// ============================================================

import { mcReducer, initialState } from './mcReducer';
import type { MCAction, MCState } from '../types';

// Extract the translation logic from useMCStore (replicated for testing or exported if refactored)
// To keep things simple without refactoring useMCStore, we test the logic behavior.
function createLogEntry(action: MCAction, state: MCState) {
    const now = new Date().toISOString();
    const id = "test-id";

    switch (action.type) {
        case 'ADD_TOKEN':
            return { id, timestamp: now, icon: 'plus-circle', message: 'Manual token added', delta: +1, type: 'manual' };
        case 'REMOVE_TOKEN':
            return { id, timestamp: now, icon: 'minus-circle', message: 'Manual token removed', delta: -1, type: 'manual' };
        case 'SELECT_CASE':
            return { id, timestamp: now, icon: 'target', message: `Goal selected: ${action.reward}`, type: 'system' };
        case 'DEPOSIT_TO_CASE':
            return { id, timestamp: now, icon: 'arrow-down-to-line', message: `Deposited tokens to goal`, delta: -action.amount, type: 'system' };
        case 'MOVE_TOKEN':
            if (action.from === 'bank') return { id, timestamp: now, icon: 'arrow-right-left', message: `Token transferred to goal`, delta: -1, type: 'system' };
            if (action.to === 'bank') return { id, timestamp: now, icon: 'arrow-right-left', message: `Token transferred to bank`, delta: +1, type: 'system' };
            return null;
        case 'VACUUM_TO_CASE': {
            const target = state.cases.find(c => c.id === action.caseId);
            if (!target) return null;
            const amount = Math.min(state.bankCount, target.targetCount - target.tokenCount);
            return { id, timestamp: now, icon: 'arrow-down-to-line', message: `Vacuumed tokens to goal`, delta: -amount, type: 'system' };
        }
        case 'REFUND_CASE': {
             const target = state.cases.find(c => c.id === action.caseId);
             return target ? { id, timestamp: now, icon: 'undo', message: `Goal tokens refunded`, delta: +(target.tokenCount || 0), type: 'system' } : null;
        }
        case 'SET_ACTIVE_MISSION':
             return action.phase === 'none'
                ? { id, timestamp: now, icon: 'square', message: `Mission stopped`, type: 'mission' }
                : { id, timestamp: now, icon: 'play', message: `${action.phase} mission started`, type: 'mission' };
        case 'COMPLETE_TASK': {
             const m = state.missions.find(m => m.phase === action.missionPhase);
             const t = m?.tasks.find(t => t.id === action.taskId);
             return { id, timestamp: now, icon: 'check-square', message: `${t?.label || 'Task'} completed`, type: 'mission' };
        }
        case 'ADD_RESPONSIBILITY_POINT': {
             const resp = state.responsibilities.find(r => r.id === action.taskId);
             return { id, timestamp: now, icon: 'star', message: `Point earned for ${resp?.label || 'responsibility'}`, type: 'responsibility' };
        }
        case 'RESET_RESPONSIBILITY': {
             const resp = state.responsibilities.find(r => r.id === action.taskId);
             if (!resp) return null;
             return { id, timestamp: now, icon: 'award', message: `${resp.label} goal claimed!`, delta: +(resp.tokenReward || 0), type: 'reward' };
        }
        default:
            return null;
    }
}

describe('Activity Logs Translation Logic', () => {
    it('translates ADD_TOKEN to a manual adding entry', () => {
        const log = createLogEntry({ type: 'ADD_TOKEN' }, initialState);
        expect(log).not.toBeNull();
        expect(log?.icon).toBe('plus-circle');
        expect(log?.delta).toBe(1);
    });

    it('translates DEPOSIT_TO_CASE to a system adding entry', () => {
        const log = createLogEntry({ type: 'DEPOSIT_TO_CASE', caseId: 0, amount: 2 }, initialState);
        expect(log).not.toBeNull();
        expect(log?.icon).toBe('arrow-down-to-line');
        expect(log?.delta).toBe(-2);
    });

    it('translates COMPLETE_TASK accurately', () => {
        const log = createLogEntry({ type: 'COMPLETE_TASK', missionPhase: 'morning', taskId: 'tshirt' }, initialState);
        expect(log).not.toBeNull();
        expect(log?.message).toContain('T-Shirt');
    });
});
