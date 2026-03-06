// ============================================================
// Mission Control — Scheduler rules:
//
//  Rule 1: Only trigger if within the mission's time window.
//  Rule 2: Don't start a new mission if one is already active.
//
// There is no "ran today" guard. In rare cases a mission may
// trigger more than once in a day (e.g. Stop then re-open window).
// This is an accepted trade-off for simpler state.
//
// startedAt is a timer anchor only (startedAt + durationMins = end).
// ============================================================

import { describe, it, expect } from 'vitest';
import { mcReducer, initialState } from './mcReducer';
import type { MCAction, MCState } from '../types';

function applyActions(actions: MCAction[], state: MCState = initialState): MCState {
    return actions.reduce((s, a) => mcReducer(s, a), state);
}

const morningMission = (s: MCState) => s.missions.find(m => m.phase === 'morning')!;
const eveningMission = (s: MCState) => s.missions.find(m => m.phase === 'evening')!;

// ──────────────────────────────────────────────────────────────
// SET_ACTIVE_MISSION — every trigger is a fresh start
// ──────────────────────────────────────────────────────────────

describe('SET_ACTIVE_MISSION — fresh state on every trigger', () => {
    it('resets all tasks to uncompleted/unlocked on trigger', () => {
        // Complete a task then re-trigger — tasks must be fresh
        const state = applyActions([
            { type: 'SET_ACTIVE_MISSION', phase: 'morning' },
            { type: 'COMPLETE_TASK', missionPhase: 'morning', taskId: 'tshirt' },
            { type: 'SET_ACTIVE_MISSION', phase: 'none' },   // timer-expired deactivate
            { type: 'SET_ACTIVE_MISSION', phase: 'morning' }, // re-trigger
        ]);
        const allFresh = morningMission(state).tasks.every(t => !t.completed && !t.locked);
        expect(allFresh).toBe(true);
    });

    it('sets a new startedAt on re-trigger', () => {
        const afterFirst = applyActions([{ type: 'SET_ACTIVE_MISSION', phase: 'morning' }]);

        const afterSecond = applyActions([
            { type: 'SET_ACTIVE_MISSION', phase: 'none' },
            { type: 'SET_ACTIVE_MISSION', phase: 'morning' },
        ], afterFirst);
        const startedSecond = morningMission(afterSecond).startedAt!;

        expect(startedSecond).toBeDefined();
        expect(() => new Date(startedSecond).toISOString()).not.toThrow();
        expect(morningMission(afterSecond).durationMins).toBeGreaterThan(0);
    });

    it('is fresh even after CANCEL (tasks completed before cancel)', () => {
        const state = applyActions([
            { type: 'SET_ACTIVE_MISSION', phase: 'morning' },
            { type: 'COMPLETE_TASK', missionPhase: 'morning', taskId: 'tshirt' },
            { type: 'CANCEL_MISSION', missionPhase: 'morning' },
            { type: 'SET_ACTIVE_MISSION', phase: 'morning' }, // re-trigger (e.g. still in window)
        ]);
        const allFresh = morningMission(state).tasks.every(t => !t.completed && !t.locked);
        expect(allFresh).toBe(true);
    });
});

// ──────────────────────────────────────────────────────────────
// CANCEL_MISSION — full reset, no guard logic
// ──────────────────────────────────────────────────────────────

describe('CANCEL_MISSION — deactivates and fully resets', () => {
    it('sets activeMission to none', () => {
        const state = applyActions([
            { type: 'SET_ACTIVE_MISSION', phase: 'morning' },
            { type: 'CANCEL_MISSION', missionPhase: 'morning' },
        ]);
        expect(state.activeMission).toBe('none');
    });

    it('clears startedAt (timer anchor only, not a guard)', () => {
        const state = applyActions([
            { type: 'SET_ACTIVE_MISSION', phase: 'morning' },
            { type: 'CANCEL_MISSION', missionPhase: 'morning' },
        ]);
        expect(morningMission(state).startedAt).toBeUndefined();
    });

    it('clears durationMins', () => {
        const state = applyActions([
            { type: 'SET_ACTIVE_MISSION', phase: 'morning' },
            { type: 'CANCEL_MISSION', missionPhase: 'morning' },
        ]);
        expect(morningMission(state).durationMins).toBeUndefined();
    });

    it('resets all task completion state', () => {
        const state = applyActions([
            { type: 'SET_ACTIVE_MISSION', phase: 'morning' },
            { type: 'COMPLETE_TASK', missionPhase: 'morning', taskId: 'tshirt' },
            { type: 'CANCEL_MISSION', missionPhase: 'morning' },
        ]);
        expect(morningMission(state).tasks.every(t => !t.completed && !t.locked)).toBe(true);
    });

    it('does not affect the evening mission', () => {
        const state = applyActions([
            { type: 'SET_ACTIVE_MISSION', phase: 'morning' },
            { type: 'CANCEL_MISSION', missionPhase: 'morning' },
        ]);
        expect(eveningMission(state).startedAt).toBeUndefined();
        expect(eveningMission(state).active).toBe(false);
    });

    it('allows SET_ACTIVE_MISSION to re-trigger after cancel', () => {
        const state = applyActions([
            { type: 'SET_ACTIVE_MISSION', phase: 'morning' },
            { type: 'CANCEL_MISSION', missionPhase: 'morning' },
            { type: 'SET_ACTIVE_MISSION', phase: 'morning' },
        ]);
        expect(state.activeMission).toBe('morning');
        expect(morningMission(state).startedAt).toBeDefined();
    });

    // ── RE-TRIGGER GUARD ─────────────────────────────────────────
    // startedAt must survive cancel — it's the only signal the
    // scheduler uses to know "this mission already ran".
    // Without it, the scheduler sees activeMission='none' + within
    // window → fires again within 15 seconds of every cancel.
    it('preserves startedAt after cancel (scheduler re-trigger guard)', () => {
        const state = applyActions([
            { type: 'SET_ACTIVE_MISSION', phase: 'morning' },
            { type: 'CANCEL_MISSION', missionPhase: 'morning' },
        ]);
        // startedAt must NOT be cleared — the scheduler checks it to
        // prevent re-triggering the same mission after a stop/cancel.
        expect(morningMission(state).startedAt).toBeDefined();
    });
});

// ──────────────────────────────────────────────────────────────
// RESET_MISSION — task-only reset
// ──────────────────────────────────────────────────────────────

describe('RESET_MISSION — task-only reset (startedAt/activeMission unchanged)', () => {
    it('keeps startedAt and activeMission intact', () => {
        const state = applyActions([
            { type: 'SET_ACTIVE_MISSION', phase: 'morning' },
            { type: 'COMPLETE_TASK', missionPhase: 'morning', taskId: 'tshirt' },
            { type: 'RESET_MISSION', missionPhase: 'morning' },
        ]);
        expect(morningMission(state).startedAt).toBeDefined();
        expect(state.activeMission).toBe('morning');
    });

    it('resets task checkboxes', () => {
        const state = applyActions([
            { type: 'SET_ACTIVE_MISSION', phase: 'morning' },
            { type: 'COMPLETE_TASK', missionPhase: 'morning', taskId: 'tshirt' },
            { type: 'RESET_MISSION', missionPhase: 'morning' },
        ]);
        expect(morningMission(state).tasks.every(t => !t.completed && !t.locked)).toBe(true);
    });
});

// ──────────────────────────────────────────────────────────────
// SET_SETTINGS — clears startedAt when trigger time changes (timer reset)
// ──────────────────────────────────────────────────────────────

describe('SET_SETTINGS — clears startedAt when trigger time changes', () => {
    it('clears morning startedAt when morningStartsAt changes', () => {
        const afterTrigger = applyActions([{ type: 'SET_ACTIVE_MISSION', phase: 'morning' }]);
        const afterSettings = mcReducer(afterTrigger, {
            type: 'SET_SETTINGS',
            settings: { morningStartsAt: '07:00' },
        });
        expect(morningMission(afterSettings).startedAt).toBeUndefined();
        expect(morningMission(afterSettings).startsAt).toBe('07:00');
    });

    it('does NOT clear startedAt when only duration changes', () => {
        const afterTrigger = applyActions([{ type: 'SET_ACTIVE_MISSION', phase: 'morning' }]);
        const startedAt = morningMission(afterTrigger).startedAt!;
        const afterSettings = mcReducer(afterTrigger, {
            type: 'SET_SETTINGS',
            settings: { morningDurationMins: 45 },
        });
        expect(morningMission(afterSettings).startedAt).toBe(startedAt);
    });
});
