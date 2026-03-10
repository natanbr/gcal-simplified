// ============================================================
// Mission Control — Reducer unit tests
// Covers the race-condition bug where resetting/cancelling a
// mission allowed the scheduler to re-fire it the same day.
// ============================================================

import { describe, it, expect } from 'vitest';
import { mcReducer, initialState } from './mcReducer';
import type { MCAction, MCState } from '../types';

// ──────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────

function isToday(isoString: string | undefined): boolean {
    if (!isoString) return false;
    const d = new Date(isoString);
    const now = new Date();
    return (
        d.getFullYear() === now.getFullYear() &&
        d.getMonth() === now.getMonth() &&
        d.getDate() === now.getDate()
    );
}

function applyActions(actions: MCAction[], state: MCState = initialState): MCState {
    return actions.reduce((s, a) => mcReducer(s, a), state);
}

function morningMission(state: MCState) {
    return state.missions.find(m => m.phase === 'morning')!;
}
function eveningMission(state: MCState) {
    return state.missions.find(m => m.phase === 'evening')!;
}

// ──────────────────────────────────────────────────────────────
// CANCEL_MISSION
// ──────────────────────────────────────────────────────────────

describe('mcReducer — CANCEL_MISSION', () => {
    it('sets activeMission to none', () => {
        const state = applyActions([
            { type: 'SET_ACTIVE_MISSION', phase: 'morning' },
            { type: 'CANCEL_MISSION', missionPhase: 'morning' },
        ]);
        expect(state.activeMission).toBe('none');
    });

    it('sets mission.active to false', () => {
        const state = applyActions([
            { type: 'SET_ACTIVE_MISSION', phase: 'morning' },
            { type: 'CANCEL_MISSION', missionPhase: 'morning' },
        ]);
        expect(morningMission(state).active).toBe(false);
    });

    it('clears startedAt (scheduler no longer guards with it)', () => {
        const state = applyActions([
            { type: 'SET_ACTIVE_MISSION', phase: 'morning' },
            { type: 'CANCEL_MISSION', missionPhase: 'morning' },
        ]);
        expect(morningMission(state).startedAt).toBeUndefined();
    });

    it('DOES reset task progress (so a re-triggered mission always starts clean)', () => {
        const taskId = morningMission(initialState).tasks[0].id;
        const state = applyActions([
            { type: 'SET_ACTIVE_MISSION', phase: 'morning' },
            { type: 'COMPLETE_TASK', missionPhase: 'morning', taskId },
            { type: 'CANCEL_MISSION', missionPhase: 'morning' },
        ]);
        expect(morningMission(state).tasks[0].completed).toBe(false);
    });
});

// ──────────────────────────────────────────────────────────────
// RESET_MISSION
// ──────────────────────────────────────────────────────────────

describe('mcReducer — RESET_MISSION', () => {
    it('clears all task progress (completed + locked)', () => {
        const taskId = morningMission(initialState).tasks[0].id;
        const state = applyActions([
            { type: 'SET_ACTIVE_MISSION', phase: 'morning' },
            { type: 'COMPLETE_TASK', missionPhase: 'morning', taskId },
            { type: 'RESET_MISSION', missionPhase: 'morning' },
        ]);
        expect(morningMission(state).tasks.every(t => !t.completed && !t.locked)).toBe(true);
    });

    it('does NOT change activeMission — mission stays open', () => {
        const state = applyActions([
            { type: 'SET_ACTIVE_MISSION', phase: 'morning' },
            { type: 'RESET_MISSION', missionPhase: 'morning' },
        ]);
        expect(state.activeMission).toBe('morning');
    });

    it('does NOT clear startedAt — timer keeps running', () => {
        const state = applyActions([
            { type: 'SET_ACTIVE_MISSION', phase: 'morning' },
            { type: 'RESET_MISSION', missionPhase: 'morning' },
        ]);
        expect(isToday(morningMission(state).startedAt)).toBe(true);
    });
});

// ──────────────────────────────────────────────────────────────
// SET_ACTIVE_MISSION:'none' (timer expiry)
// ──────────────────────────────────────────────────────────────

describe('mcReducer — SET_ACTIVE_MISSION:none (timer expiry)', () => {
    // the timer expiry logic no longer needs to preserve startedAt
    it('sets activeMission to none', () => {
        const state = applyActions([
            { type: 'SET_ACTIVE_MISSION', phase: 'morning' },
            { type: 'SET_ACTIVE_MISSION', phase: 'none' },
        ]);
        expect(state.activeMission).toBe('none');
    });
});

// ──────────────────────────────────────────────────────────────
// SET_ACTIVE_MISSION overlap guard
// ──────────────────────────────────────────────────────────────

describe('mcReducer — SET_ACTIVE_MISSION overlap rejection', () => {
    it('ignores new triggers if a mission is already running', () => {
        const state = applyActions([
            { type: 'SET_ACTIVE_MISSION', phase: 'morning' },
            { type: 'SET_ACTIVE_MISSION', phase: 'evening' }, // This should be ignored
        ]);

        expect(state.activeMission).toBe('morning'); // Evening was rejected
        expect(eveningMission(state).active).toBe(false);
    });
});

