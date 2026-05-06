import { describe, it, expect } from 'vitest';
import { mcReducer, initialState } from '../mcReducer';
import type { MCState } from '../../types';

describe('mcReducer — Quick Game Token Logic', () => {
    const stateWithTokens: MCState = {
        ...initialState,
        gameTokens: 2,
        bankCount: 20, // Enough for minimum bank balance
    };

    it('should consume 1 game token when selecting a quick-game goal', () => {
        const action = { 
            type: 'SELECT_CASE' as const, 
            caseId: 0, 
            reward: 'quick-game' as const, 
            targetCount: 1 
        };
        const nextState = mcReducer(stateWithTokens, action);

        expect(nextState.gameTokens).toBe(1);
        expect(nextState.cases[0].reward).toBe('quick-game');
        expect(nextState.cases[0].status).toBe('active');
    });

    it('should NOT allow selecting a quick-game goal if tokens are 0', () => {
        const stateNoTokens: MCState = {
            ...stateWithTokens,
            gameTokens: 0,
        };
        const action = { 
            type: 'SELECT_CASE' as const, 
            caseId: 0, 
            reward: 'quick-game' as const, 
            targetCount: 1 
        };
        const nextState = mcReducer(stateNoTokens, action);

        expect(nextState.gameTokens).toBe(0);
        expect(nextState.cases[0].reward).toBeNull();
        expect(nextState.cases[0].status).toBe('empty');
    });

    it('should return 1 game token when refunding a quick-game goal', () => {
        // Setup state with an active quick-game goal
        const stateWithActiveGoal: MCState = {
            ...stateWithTokens,
            gameTokens: 1, // one already spent
            cases: initialState.cases.map(c => 
                c.id === 0 ? { ...c, status: 'active', reward: 'quick-game', tokenCount: 0 } : c
            )
        };

        const action = { type: 'REFUND_CASE' as const, caseId: 0 };
        const nextState = mcReducer(stateWithActiveGoal, action);

        expect(nextState.gameTokens).toBe(2);
        expect(nextState.cases[0].reward).toBeNull();
        expect(nextState.cases[0].status).toBe('empty');
    });

    it('should NOT return a game token when consuming a quick-game goal (Use!)', () => {
        const stateWithActiveGoal: MCState = {
            ...stateWithTokens,
            gameTokens: 1,
            cases: initialState.cases.map(c => 
                c.id === 0 ? { ...c, status: 'active', reward: 'quick-game', tokenCount: 0 } : c
            )
        };

        const action = { type: 'CONSUME_CASE' as const, caseId: 0 };
        const nextState = mcReducer(stateWithActiveGoal, action);

        expect(nextState.gameTokens).toBe(1); // Still 1, token was used
        expect(nextState.cases[0].reward).toBeNull();
        expect(nextState.cases[0].status).toBe('empty');
    });

    it('should return a game token and any deposited coins when refunding a quick-game goal', () => {
         const stateWithCoins: MCState = {
            ...stateWithTokens,
            bankCount: 5,
            gameTokens: 1,
            cases: initialState.cases.map(c => 
                c.id === 0 ? { ...c, status: 'active', reward: 'quick-game', tokenCount: 2 } : c
            )
        };

        const action = { type: 'REFUND_CASE' as const, caseId: 0 };
        const nextState = mcReducer(stateWithCoins, action);

        expect(nextState.gameTokens).toBe(2);
        expect(nextState.bankCount).toBe(7); // 5 + 2
        expect(nextState.cases[0].tokenCount).toBe(0);
    });
});
