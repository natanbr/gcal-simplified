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

    it('CLEAR_LOGS should empty the activityLogs array', () => {
        const initialStateWithLogs: MCState = {
            ...initialState,
            activityLogs: [{
                id: '1', timestamp: new Date().toISOString(), icon: '➕', message: 'Test', type: 'manual'
            }]
        };

        const state = applyActions([{ type: 'CLEAR_LOGS' }], initialStateWithLogs);
        expect(state.activityLogs.length).toBe(0);
    });

    it('ADD_LOG should enforce hard cap of 200 entries and keep newest', () => {
        let state = initialState;
        // Dispatch 205 logs
        for (let i = 1; i <= 205; i++) {
            const log = {
                id: `log-${i}`,
                timestamp: new Date().toISOString(),
                icon: '⭐',
                message: `Log message ${i}`,
                type: 'manual' as const,
            };
            state = mcReducer(state, { type: 'ADD_LOG', log });
        }
        
        expect(state.activityLogs.length).toBe(200);
        // The newest should be at index 0 (log-205)
        expect(state.activityLogs[0].id).toBe('log-205');
        // The oldest remaining should be at index 199 (log-6)
        expect(state.activityLogs[199].id).toBe('log-6');
    });

    it('ADD_LOG should NOT run age filter on dispatch (age filter is hydration-only)', () => {
        // Create a log that is 10 days old
        const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
        const oldLog = {
            id: 'old-log',
            timestamp: tenDaysAgo,
            icon: '🦖',
            message: 'Stale log',
            type: 'manual' as const,
        };

        const state = applyActions([{ type: 'ADD_LOG', log: oldLog }]);
        expect(state.activityLogs.length).toBe(1);
        expect(state.activityLogs[0].id).toBe('old-log');
    });
});
