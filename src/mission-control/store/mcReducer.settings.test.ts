// ============================================================
// Mission Control — Reducer: Settings & Cream Routine
// ============================================================

import { describe, it, expect } from 'vitest';
import { mcReducer, initialState } from './mcReducer';
import type { MCState } from '../types';

function eveningMission(state: MCState) {
    return state.missions.find(m => m.phase === 'evening')!;
}

function morningMission(state: MCState) {
    return state.missions.find(m => m.phase === 'morning')!;
}

describe('mcReducer — SET_SETTINGS and Cream Routine logic', () => {
    it('enabling cream task dynamically injects it into evening mission by default', () => {
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

    it('enabling cream task for morning schedule injects it into morning mission', () => {
        expect(morningMission(initialState).tasks.some(t => t.id === 'cream')).toBe(false);

        const state = mcReducer(initialState, {
            type: 'SET_SETTINGS',
            settings: { creamTaskEnabled: true, creamTaskDaysTarget: 5, creamTaskSchedule: 'morning' }
        });

        expect(state.settings.creamTaskEnabled).toBe(true);
        expect(morningMission(state).tasks.some(t => t.id === 'cream')).toBe(true);
        expect(eveningMission(state).tasks.some(t => t.id === 'cream')).toBe(false);
    });

    it('enabling cream task for both schedules injects it into both missions', () => {
        const state = mcReducer(initialState, {
            type: 'SET_SETTINGS',
            settings: { creamTaskEnabled: true, creamTaskDaysTarget: 5, creamTaskSchedule: 'both' }
        });

        expect(morningMission(state).tasks.some(t => t.id === 'cream')).toBe(true);
        expect(eveningMission(state).tasks.some(t => t.id === 'cream')).toBe(true);
    });

    it('disabling cream task dynamically removes it from both missions', () => {
        let state = mcReducer(initialState, {
            type: 'SET_SETTINGS',
            settings: { creamTaskEnabled: true, creamTaskDaysTarget: 5, creamTaskSchedule: 'both' }
        });
        
        state = mcReducer(state, {
            type: 'SET_SETTINGS',
            settings: { creamTaskEnabled: false }
        });

        expect(morningMission(state).tasks.some(t => t.id === 'cream')).toBe(false);
        expect(eveningMission(state).tasks.some(t => t.id === 'cream')).toBe(false);
    });

    it('completing cream task decrements creamTaskDaysLeft and updates label (evening only)', () => {
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

    it('completing cream task in both schedule decrements by 0.5', () => {
        let state = mcReducer(initialState, {
            type: 'SET_SETTINGS',
            settings: { creamTaskEnabled: true, creamTaskDaysTarget: 3, creamTaskSchedule: 'both' }
        });

        expect(state.creamTaskDaysLeft).toBe(3);

        state = mcReducer(state, {
            type: 'COMPLETE_TASK',
            missionPhase: 'morning',
            taskId: 'cream'
        });

        expect(state.creamTaskDaysLeft).toBe(2.5);
        expect(morningMission(state).tasks.find(t => t.id === 'cream')?.label).toBe('Cream (3d left)');
        
        state = mcReducer(state, {
            type: 'COMPLETE_TASK',
            missionPhase: 'evening',
            taskId: 'cream'
        });
        
        expect(state.creamTaskDaysLeft).toBe(2);
        expect(eveningMission(state).tasks.find(t => t.id === 'cream')?.label).toBe('Cream (2d left)');
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
