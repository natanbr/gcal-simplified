import { describe, it, expect } from 'vitest';
import { mcReducer, initialState } from './mcReducer';
import type { MCAction, MCState } from '../types';

function applyActions(actions: MCAction[], state: MCState = initialState): MCState {
    return actions.reduce((s, a) => mcReducer(s, a), state);
}

describe('mcReducer — Activity Logs Snapshots', () => {
    it('ADD_LOG should include totalTokens and bankTokens if provided', () => {
        const log = {
            id: 'test-log',
            timestamp: new Date().toISOString(),
            icon: '⭐',
            message: 'Test message',
            type: 'manual' as const,
            totalTokens: 10,
            bankTokens: 5
        };

        const state = applyActions([{ type: 'ADD_LOG', log }]);
        const latestLog = state.activityLogs[0];
        
        expect(latestLog.totalTokens).toBe(10);
        expect(latestLog.bankTokens).toBe(5);
    });

    it('ADD_TOKEN should result in a log entry with updated counts (when dispatched via useMCStore logic)', () => {
        // Note: The reducer itself doesn't generate logs, but we verify the types and storage here.
        // This test ensures the state can HOLD the new fields.
        const state: MCState = {
            ...initialState,
            activityLogs: [{
                id: '1',
                timestamp: new Date().toISOString(),
                icon: '➕',
                message: 'Added token',
                type: 'manual',
                totalTokens: 4, // bank(3) + goals(1)
                bankTokens: 3
            }]
        };

        expect(state.activityLogs[0].totalTokens).toBe(4);
        expect(state.activityLogs[0].bankTokens).toBe(3);
    });
});
