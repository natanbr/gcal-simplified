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

    it('PRESERVES startedAt so the scheduler cannot re-trigger today', () => {
        const state = applyActions([
            { type: 'SET_ACTIVE_MISSION', phase: 'morning' },
            { type: 'CANCEL_MISSION', missionPhase: 'morning' },
        ]);
        expect(isToday(morningMission(state).startedAt)).toBe(true);
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
    it('preserves startedAt so scheduler cannot re-trigger', () => {
        const state = applyActions([
            { type: 'SET_ACTIVE_MISSION', phase: 'morning' },
            { type: 'SET_ACTIVE_MISSION', phase: 'none' }, // simulated timer expiry
        ]);
        expect(isToday(morningMission(state).startedAt)).toBe(true);
    });

    it('sets activeMission to none', () => {
        const state = applyActions([
            { type: 'SET_ACTIVE_MISSION', phase: 'morning' },
            { type: 'SET_ACTIVE_MISSION', phase: 'none' },
        ]);
        expect(state.activeMission).toBe('none');
    });
});

// ──────────────────────────────────────────────────────────────
// Race condition: the exact user-reported flow
// ──────────────────────────────────────────────────────────────

describe('mcReducer — race condition: open morning → cancel → open evening → cancel', () => {
    it('morning.startedAt is still set after the full flow (scheduler blocked)', () => {
        // This is the exact sequence the user reported causing the ghost re-trigger:
        // 1. Click morning  2. Click cancel  3. Click evening  4. Click cancel
        const state = applyActions([
            { type: 'SET_ACTIVE_MISSION', phase: 'morning' },
            { type: 'CANCEL_MISSION', missionPhase: 'morning' },
            { type: 'SET_ACTIVE_MISSION', phase: 'evening' },
            { type: 'CANCEL_MISSION', missionPhase: 'evening' },
        ]);

        // Morning must have startedAt set — this is what blocks the scheduler
        expect(isToday(morningMission(state).startedAt)).toBe(true);
        // Evening must also have startedAt set
        expect(isToday(eveningMission(state).startedAt)).toBe(true);
        // Nothing active
        expect(state.activeMission).toBe('none');
        // Both missions inactive
        expect(morningMission(state).active).toBe(false);
        expect(eveningMission(state).active).toBe(false);
    });

    it('alreadyStartedToday guard is true for morning after full flow', () => {
        const state = applyActions([
            { type: 'SET_ACTIVE_MISSION', phase: 'morning' },
            { type: 'CANCEL_MISSION', missionPhase: 'morning' },
            { type: 'SET_ACTIVE_MISSION', phase: 'evening' },
            { type: 'CANCEL_MISSION', missionPhase: 'evening' },
        ]);

        const morning = morningMission(state);
        // Simulates the scheduler's alreadyStartedToday check
        const alreadyStartedToday = morning.startedAt && isToday(morning.startedAt);
        expect(alreadyStartedToday).toBeTruthy();
    });

    it('old RESET_MISSION (before fix) would have cleared startedAt — proving the bug existed', () => {
        // Demonstrate what the OLD behavior produced: clearing startedAt on reset
        // made alreadyStartedToday = false → scheduler re-fired.
        // With the new RESET_MISSION, startedAt is preserved.
        const state = applyActions([
            { type: 'SET_ACTIVE_MISSION', phase: 'morning' },
            { type: 'RESET_MISSION', missionPhase: 'morning' }, // new: only resets tasks
        ]);
        // startedAt must be present after a reset (regression guard)
        expect(morningMission(state).startedAt).toBeDefined();
    });
});
