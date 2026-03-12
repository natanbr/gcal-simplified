// ============================================================
// Mission Control — Reducer: Settings & Cream Routine
// ============================================================

import { describe, it, expect } from 'vitest';
import { mcReducer, initialState } from './mcReducer';
import type { MCState, MissionPhase } from '../types';

function eveningMission(state: MCState) {
    return state.missions.find(m => m.phase === 'evening')!;
}

describe('mcReducer — SET_SETTINGS and Cream Routine logic', () => {
    it('enabling cream task dynamically injects it into evening mission', () => {
        expect(eveningMission(initialState).tasks.some(t => t.id === 'cream')).toBe(false);

        const state = mcReducer(initialState, {
            type: 'SET_SETTINGS',
            settings: { creamTaskEnabled: true, creamTaskDaysTarget: 5 }
        });

        expect(state.settings.creamTaskEnabled).toBe(true);
        expect(state.creamTaskDaysLeft).toBe(5);
        
        const evening = eveningMission(state);
        const creamTask = evening.tasks.find(t => t.id === 'cream');
        expect(creamTask).toBeDefined();
        expect(creamTask?.label).toBe('Cream (5d left)');
    });

    it('disabling cream task dynamically removes it', () => {
        let state = mcReducer(initialState, {
            type: 'SET_SETTINGS',
            settings: { creamTaskEnabled: true, creamTaskDaysTarget: 5 }
        });
        
        state = mcReducer(state, {
            type: 'SET_SETTINGS',
            settings: { creamTaskEnabled: false }
        });

        expect(eveningMission(state).tasks.some(t => t.id === 'cream')).toBe(false);
    });

    it('completing cream task decrements creamTaskDaysLeft and updates label', () => {
        let state = mcReducer(initialState, {
            type: 'SET_SETTINGS',
            settings: { creamTaskEnabled: true, creamTaskDaysTarget: 3 }
        });

        expect(state.creamTaskDaysLeft).toBe(3);

        state = mcReducer(state, {
            type: 'COMPLETE_TASK',
            missionPhase: 'evening',
            taskId: 'cream'
        });

        expect(state.creamTaskDaysLeft).toBe(2);
        const creamTask = eveningMission(state).tasks.find(t => t.id === 'cream');
        expect(creamTask?.label).toBe('Cream (2d left)');
    });

    it('completing cream task on final day auto-disables the setting', () => {
        let state = mcReducer(initialState, {
            type: 'SET_SETTINGS',
            settings: { creamTaskEnabled: true, creamTaskDaysTarget: 1 }
        });

        expect(eveningMission(state).tasks.some(t => t.id === 'cream')).toBe(true);

        state = mcReducer(state, {
            type: 'COMPLETE_TASK',
            missionPhase: 'evening',
            taskId: 'cream'
        });

        // 0 days left auto-toggles enabled to false
        expect(state.creamTaskDaysLeft).toBe(0);
        expect(state.settings.creamTaskEnabled).toBe(false);

        // Because it was disabled, syncCreamTask should have removed it from the array
        expect(eveningMission(state).tasks.some(t => t.id === 'cream')).toBe(false);
    });

    it('changing creamTaskDaysTarget resets creamTaskDaysLeft', () => {
        let state = mcReducer(initialState, {
            type: 'SET_SETTINGS',
            settings: { creamTaskEnabled: true, creamTaskDaysTarget: 5 }
        });
        
        state = mcReducer(state, {
            type: 'COMPLETE_TASK',
            missionPhase: 'evening',
            taskId: 'cream'
        });
        expect(state.creamTaskDaysLeft).toBe(4);

        // Update target in settings
        state = mcReducer(state, {
            type: 'SET_SETTINGS',
            settings: { creamTaskDaysTarget: 10 }
        });

        expect(state.creamTaskDaysLeft).toBe(10);
        expect(eveningMission(state).tasks.find(t => t.id === 'cream')?.label).toBe('Cream (10d left)');
    });
});
