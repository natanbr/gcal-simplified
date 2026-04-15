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

// ──────────────────────────────────────────────────────────────
// RESET_MISSION_WITH_TIMER
// ──────────────────────────────────────────────────────────────

describe('mcReducer — RESET_MISSION_WITH_TIMER', () => {
    it('clears all task progress', () => {
        const taskId = morningMission(initialState).tasks[0].id;
        const state = applyActions([
            { type: 'SET_ACTIVE_MISSION', phase: 'morning' },
            { type: 'COMPLETE_TASK', missionPhase: 'morning', taskId },
            { type: 'RESET_MISSION_WITH_TIMER', missionPhase: 'morning' },
        ]);
        expect(morningMission(state).tasks.every(t => !t.completed && !t.locked)).toBe(true);
    });

    it('refreshes startedAt (timer restarts from scratch)', () => {
        const state1 = applyActions([
            { type: 'SET_ACTIVE_MISSION', phase: 'morning' },
        ]);
        const originalStartedAt = morningMission(state1).startedAt;

        const state2 = applyActions([
            { type: 'RESET_MISSION_WITH_TIMER', missionPhase: 'morning' },
        ], state1);

        // startedAt should differ (or at least be a fresh ISO string)
        expect(morningMission(state2).startedAt).toBeDefined();
        expect(isToday(morningMission(state2).startedAt)).toBe(true);
        // New startedAt should be >= original (created slightly later)
        expect(new Date(morningMission(state2).startedAt!).getTime())
            .toBeGreaterThanOrEqual(new Date(originalStartedAt!).getTime());
    });

    it('recalculates durationMins from startsAt/endsAt', () => {
        const state = applyActions([
            { type: 'SET_ACTIVE_MISSION', phase: 'morning' },
            { type: 'RESET_MISSION_WITH_TIMER', missionPhase: 'morning' },
        ]);
        const m = morningMission(state);
        const [sh, sm] = m.startsAt.split(':').map(Number);
        const [eh, em] = m.endsAt.split(':').map(Number);
        let expectedDuration = (eh * 60 + em) - (sh * 60 + sm);
        if (expectedDuration < 0) expectedDuration += 24 * 60; // overnight wrap
        expect(m.durationMins).toBe(expectedDuration);
    });

    it('keeps mission active (activeMission unchanged)', () => {
        const state = applyActions([
            { type: 'SET_ACTIVE_MISSION', phase: 'morning' },
            { type: 'RESET_MISSION_WITH_TIMER', missionPhase: 'morning' },
        ]);
        expect(state.activeMission).toBe('morning');
        expect(morningMission(state).active).toBe(true);
    });

    it('clears loggedTimeoutAt', () => {
        const state = applyActions([
            { type: 'SET_ACTIVE_MISSION', phase: 'morning' },
            { type: 'MARK_MISSION_TIMEOUT', missionPhase: 'morning' },
            { type: 'RESET_MISSION_WITH_TIMER', missionPhase: 'morning' },
        ]);
        expect(morningMission(state).loggedTimeoutAt).toBeUndefined();
    });
});
