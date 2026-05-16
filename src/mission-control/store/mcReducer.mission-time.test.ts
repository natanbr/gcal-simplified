import { describe, it, expect } from 'vitest';
import { mcReducer, initialState } from './mcReducer';
import type { MCAction, MCState } from '../types';

function applyActions(actions: MCAction[], state: MCState = initialState): MCState {
    return actions.reduce((s, a) => mcReducer(s, a), state);
}

function getMission(state: MCState, phase: 'morning' | 'evening') {
    return state.missions.find(m => m.phase === phase)!;
}

describe('mcReducer — ADJUST_MISSION_END', () => {
    const MORNING_INITIAL_DURATION = 30; // 06:00 to 06:30

    it('increases durationMins by delta when mission is active', () => {
        const state = applyActions([
            { type: 'SET_ACTIVE_MISSION', phase: 'morning' },
            { type: 'ADJUST_MISSION_END', missionPhase: 'morning', deltaMinutes: 5 },
        ]);
        
        const m = getMission(state, 'morning');
        expect(m.durationMins).toBe(MORNING_INITIAL_DURATION + 5);
    });

    it('decreases durationMins by delta when mission is active', () => {
        const state = applyActions([
            { type: 'SET_ACTIVE_MISSION', phase: 'morning' },
            { type: 'ADJUST_MISSION_END', missionPhase: 'morning', deltaMinutes: -5 },
        ]);
        
        const m = getMission(state, 'morning');
        expect(m.durationMins).toBe(MORNING_INITIAL_DURATION - 5);
    });

    it('prevents durationMins from going below 1', () => {
        const state = applyActions([
            { type: 'SET_ACTIVE_MISSION', phase: 'morning' },
            { type: 'ADJUST_MISSION_END', missionPhase: 'morning', deltaMinutes: -999 },
        ]);
        
        const m = getMission(state, 'morning');
        expect(m.durationMins).toBe(1);
    });

    it('ignores adjustment if the mission is NOT active (BUG FIX VERIFICATION)', () => {
        const originalMission = getMission(initialState, 'morning');
        const originalEndsAt = originalMission.endsAt;

        const state = applyActions([
            { type: 'ADJUST_MISSION_END', missionPhase: 'morning', deltaMinutes: 10 },
        ]);
        
        const m = getMission(state, 'morning');
        expect(m.active).toBe(false);
        expect(m.endsAt).toBe(originalEndsAt);
        expect(m.durationMins).toBeUndefined();
    });

    it('ignores adjustment if the mission is for the wrong phase', () => {
        const state = applyActions([
            { type: 'SET_ACTIVE_MISSION', phase: 'morning' },
            { type: 'ADJUST_MISSION_END', missionPhase: 'evening', deltaMinutes: 10 },
        ]);
        
        const morning = getMission(state, 'morning');
        const evening = getMission(state, 'evening');
        
        expect(morning.durationMins).toBe(MORNING_INITIAL_DURATION);
        expect(evening.active).toBe(false);
        expect(evening.durationMins).toBeUndefined();
    });
});
