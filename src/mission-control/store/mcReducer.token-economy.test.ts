// ============================================================
// Mission Control — Token Economy reducer tests
// Covers: ADD_TOKEN, REMOVE_TOKEN, SELECT_CASE, DEPOSIT_TO_CASE,
//         VACUUM_TO_CASE, REFUND_CASE, CONSUME_CASE,
//         ADJUST_MISSION_END, SET_PRIVILEGE_STATUS, SET_SETTINGS
// ============================================================

import { describe, it, expect } from 'vitest';
import { mcReducer, initialState } from './mcReducer';
import type { MCAction, MCState } from '../types';

// ── Helpers ──────────────────────────────────────────────────────────────────

function applyActions(actions: MCAction[], state: MCState = initialState): MCState {
    return actions.reduce((s, a) => mcReducer(s, a), state);
}

function case0(state: MCState) {
    return state.cases.find(c => c.id === 0)!;
}
function morningMission(state: MCState) {
    return state.missions.find(m => m.phase === 'morning')!;
}
function eveningMission(state: MCState) {
    return state.missions.find(m => m.phase === 'evening')!;
}

// ── ADD_TOKEN ──────────────────────────────────────────────────────────────

describe('mcReducer — ADD_TOKEN', () => {
    it('increments bankCount by 1', () => {
        const state = mcReducer(initialState, { type: 'ADD_TOKEN' });
        expect(state.bankCount).toBe(initialState.bankCount + 1);
    });

    it('adding multiple tokens accumulates correctly', () => {
        const state = applyActions([
            { type: 'ADD_TOKEN' },
            { type: 'ADD_TOKEN' },
            { type: 'ADD_TOKEN' },
        ]);
        expect(state.bankCount).toBe(initialState.bankCount + 3);
    });

    it('does not affect cases', () => {
        const state = mcReducer(initialState, { type: 'ADD_TOKEN' });
        expect(state.cases).toEqual(initialState.cases);
    });
});

// ── REMOVE_TOKEN ────────────────────────────────────────────────────────────

describe('mcReducer — REMOVE_TOKEN', () => {
    it('decrements bankCount by 1', () => {
        const state = mcReducer(initialState, { type: 'REMOVE_TOKEN' });
        expect(state.bankCount).toBe(initialState.bankCount - 1);
    });

    it('does NOT go below 0', () => {
        const broke = { ...initialState, bankCount: 0 };
        const state = mcReducer(broke, { type: 'REMOVE_TOKEN' });
        expect(state.bankCount).toBe(0);
    });

    it('removing 1 from exactly 1 results in 0', () => {
        const state = applyActions(
            [{ type: 'REMOVE_TOKEN' }],
            { ...initialState, bankCount: 1 },
        );
        expect(state.bankCount).toBe(0);
    });
});

// ── SELECT_CASE ─────────────────────────────────────────────────────────────

describe('mcReducer — SELECT_CASE', () => {
    it('sets case status to active with the chosen reward and targetCount', () => {
        const state = mcReducer(initialState, {
            type: 'SELECT_CASE',
            caseId: 0,
            reward: 'game',
            targetCount: 7,
        });
        expect(case0(state).status).toBe('active');
        expect(case0(state).reward).toBe('game');
        expect(case0(state).targetCount).toBe(7);
    });

    it('does not change other cases', () => {
        const state = mcReducer(initialState, {
            type: 'SELECT_CASE',
            caseId: 0,
            reward: 'movie-popcorn',
            targetCount: 5,
        });
        state.cases.filter(c => c.id !== 0).forEach(c => {
            expect(c.status).toBe(initialState.cases.find(ic => ic.id === c.id)!.status);
        });
    });

    it('does not modify bankCount', () => {
        const state = mcReducer(initialState, {
            type: 'SELECT_CASE',
            caseId: 1,
            reward: 'show',
            targetCount: 3,
        });
        expect(state.bankCount).toBe(initialState.bankCount);
    });
});

// ── DEPOSIT_TO_CASE ─────────────────────────────────────────────────────────

describe('mcReducer — DEPOSIT_TO_CASE', () => {
    const activeState: MCState = {
        ...initialState,
        bankCount: 5,
        cases: initialState.cases.map(c =>
            c.id === 0 ? { ...c, status: 'active', reward: 'game', tokenCount: 0, targetCount: 5 } : c,
        ),
    };

    it('moves tokens from bank to case', () => {
        const state = mcReducer(activeState, { type: 'DEPOSIT_TO_CASE', caseId: 0, amount: 2 });
        expect(case0(state).tokenCount).toBe(2);
        expect(state.bankCount).toBe(3);
    });

    it('clamps deposit to available bank tokens', () => {
        // Only 5 tokens in bank — depositing 10 should cap at 5
        const state = mcReducer(activeState, { type: 'DEPOSIT_TO_CASE', caseId: 0, amount: 10 });
        expect(case0(state).tokenCount).toBe(5);
        expect(state.bankCount).toBe(0);
    });

    it('depositing 0 is a no-op', () => {
        const state = mcReducer(activeState, { type: 'DEPOSIT_TO_CASE', caseId: 0, amount: 0 });
        expect(case0(state).tokenCount).toBe(0);
        expect(state.bankCount).toBe(5);
    });
});

// ── VACUUM_TO_CASE ──────────────────────────────────────────────────────────

describe('mcReducer — VACUUM_TO_CASE', () => {
    const activeState: MCState = {
        ...initialState,
        bankCount: 10,
        cases: initialState.cases.map(c =>
            c.id === 0 ? { ...c, status: 'active', reward: 'game', tokenCount: 1, targetCount: 5 } : c,
        ),
    };

    it('moves exactly the remaining tokens needed to fill the case', () => {
        // case needs 5 - 1 = 4 more tokens; bank has 10
        const state = mcReducer(activeState, { type: 'VACUUM_TO_CASE', caseId: 0 });
        expect(case0(state).tokenCount).toBe(5);   // filled
        expect(state.bankCount).toBe(6);            // 10 - 4
    });

    it('is a no-op when bank is empty', () => {
        const broke = { ...activeState, bankCount: 0 };
        const state = mcReducer(broke, { type: 'VACUUM_TO_CASE', caseId: 0 });
        expect(case0(state).tokenCount).toBe(1);
        expect(state.bankCount).toBe(0);
    });

    it('is a no-op when case is already full', () => {
        const full: MCState = {
            ...activeState,
            cases: activeState.cases.map(c =>
                c.id === 0 ? { ...c, tokenCount: 5, targetCount: 5 } : c,
            ),
        };
        const state = mcReducer(full, { type: 'VACUUM_TO_CASE', caseId: 0 });
        expect(case0(state).tokenCount).toBe(5);
        expect(state.bankCount).toBe(10);
    });

    it('only moves as many tokens as the bank has when bank < gap', () => {
        // case needs 4 more, bank has 2
        const limited: MCState = { ...activeState, bankCount: 2 };
        const state = mcReducer(limited, { type: 'VACUUM_TO_CASE', caseId: 0 });
        expect(case0(state).tokenCount).toBe(3);  // 1 + 2
        expect(state.bankCount).toBe(0);
    });
});

// ── REFUND_CASE ─────────────────────────────────────────────────────────────

describe('mcReducer — REFUND_CASE', () => {
    const partialState: MCState = {
        ...initialState,
        bankCount: 2,
        cases: initialState.cases.map(c =>
            c.id === 0 ? { ...c, status: 'active', reward: 'movie-popcorn', tokenCount: 3, targetCount: 5 } : c,
        ),
    };

    it('returns deposited tokens to the bank', () => {
        const state = mcReducer(partialState, { type: 'REFUND_CASE', caseId: 0 });
        expect(state.bankCount).toBe(5); // 2 + 3
    });

    it('resets the case to empty with no reward', () => {
        const state = mcReducer(partialState, { type: 'REFUND_CASE', caseId: 0 });
        expect(case0(state).status).toBe('empty');
        expect(case0(state).reward).toBeNull();
        expect(case0(state).tokenCount).toBe(0);
    });

    it('does not change other cases', () => {
        const state = mcReducer(partialState, { type: 'REFUND_CASE', caseId: 0 });
        state.cases.filter(c => c.id !== 0).forEach(c => {
            expect(c).toEqual(partialState.cases.find(ic => ic.id === c.id));
        });
    });
});

// ── CONSUME_CASE ────────────────────────────────────────────────────────────

describe('mcReducer — CONSUME_CASE (reward redeemed)', () => {
    const filledState: MCState = {
        ...initialState,
        bankCount: 5,
        cases: initialState.cases.map(c =>
            c.id === 0 ? { ...c, status: 'active', reward: 'show', tokenCount: 5, targetCount: 5 } : c,
        ),
    };

    it('resets the case to empty', () => {
        const state = mcReducer(filledState, { type: 'CONSUME_CASE', caseId: 0 });
        expect(case0(state).status).toBe('empty');
        expect(case0(state).reward).toBeNull();
        expect(case0(state).tokenCount).toBe(0);
    });

    it('does NOT refund tokens to the bank — they are permanently spent', () => {
        const state = mcReducer(filledState, { type: 'CONSUME_CASE', caseId: 0 });
        expect(state.bankCount).toBe(5); // unchanged
    });

    it('does not affect other cases', () => {
        const state = mcReducer(filledState, { type: 'CONSUME_CASE', caseId: 0 });
        state.cases.filter(c => c.id !== 0).forEach(c => {
            expect(c).toEqual(filledState.cases.find(ic => ic.id === c.id));
        });
    });
});

// ── ADJUST_MISSION_END ──────────────────────────────────────────────────────

describe('mcReducer — ADJUST_MISSION_END', () => {
    it('adjusts durationMins when mission is active (startedAt set)', () => {
        const triggered = applyActions([{ type: 'SET_ACTIVE_MISSION', phase: 'morning' }]);
        const before = morningMission(triggered).durationMins!;

        const after = mcReducer(triggered, {
            type: 'ADJUST_MISSION_END',
            missionPhase: 'morning',
            deltaMinutes: 10,
        });
        expect(morningMission(after).durationMins).toBe(before + 10);
    });

    it('clamps durationMins to minimum 1 when adjusted below 1', () => {
        const triggered = applyActions([{ type: 'SET_ACTIVE_MISSION', phase: 'morning' }]);
        const after = mcReducer(triggered, {
            type: 'ADJUST_MISSION_END',
            missionPhase: 'morning',
            deltaMinutes: -9999,
        });
        expect(morningMission(after).durationMins).toBe(1);
    });

    it('adjusts endsAt HH:MM when mission is NOT started', () => {
        // initial state has no startedAt
        const before = morningMission(initialState).endsAt; // '06:30'
        const [bh, bm] = before.split(':').map(Number);
        const expectedTotal = bh * 60 + bm + 15; // +15 min
        const expectedEndsAt = `${String(Math.floor(expectedTotal / 60)).padStart(2, '0')}:${String(expectedTotal % 60).padStart(2, '0')}`;

        const state = mcReducer(initialState, {
            type: 'ADJUST_MISSION_END',
            missionPhase: 'morning',
            deltaMinutes: 15,
        });
        expect(morningMission(state).endsAt).toBe(expectedEndsAt);
    });

    it('does not affect the other mission phase', () => {
        const state = mcReducer(initialState, {
            type: 'ADJUST_MISSION_END',
            missionPhase: 'morning',
            deltaMinutes: 15,
        });
        // Evening mission should be unchanged
        expect(eveningMission(state).endsAt).toBe(eveningMission(initialState).endsAt);
    });
});

// ── SET_PRIVILEGE_STATUS ─────────────────────────────────────────────────────

describe('mcReducer — SET_PRIVILEGE_STATUS', () => {
    it('suspends a privilege with a future suspendedUntil timestamp', () => {
        const until = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
        const state = mcReducer(initialState, {
            type: 'SET_PRIVILEGE_STATUS',
            cardId: 'knife',
            status: 'suspended',
            suspendedUntil: until,
        });
        const knife = state.privileges.find(p => p.id === 'knife')!;
        expect(knife.status).toBe('suspended');
        expect(knife.suspendedUntil).toBe(until);
    });

    it('reinstates a suspended privilege by setting status to active and clearing suspendedUntil', () => {
        const until = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
        const suspended = mcReducer(initialState, {
            type: 'SET_PRIVILEGE_STATUS',
            cardId: 'knife',
            status: 'suspended',
            suspendedUntil: until,
        });
        const reinstated = mcReducer(suspended, {
            type: 'SET_PRIVILEGE_STATUS',
            cardId: 'knife',
            status: 'active',
            suspendedUntil: null,
        });
        const knife = reinstated.privileges.find(p => p.id === 'knife')!;
        expect(knife.status).toBe('active');
        expect(knife.suspendedUntil).toBeNull();
    });

    it('does not affect other privileges', () => {
        const state = mcReducer(initialState, {
            type: 'SET_PRIVILEGE_STATUS',
            cardId: 'knife',
            status: 'suspended',
            suspendedUntil: new Date().toISOString(),
        });
        const others = state.privileges.filter(p => p.id !== 'knife');
        others.forEach(p => {
            expect(p.status).toBe('active');
        });
    });
});

// ── SET_SETTINGS — endsAt computation ───────────────────────────────────────

describe('mcReducer — SET_SETTINGS endsAt computation', () => {
    it('updates morningStartsAt and recomputes endsAt from duration', () => {
        const state = mcReducer(initialState, {
            type: 'SET_SETTINGS',
            settings: { morningStartsAt: '07:00' },
        });
        // default duration is 30 min → endsAt should be 07:30
        expect(morningMission(state).startsAt).toBe('07:00');
        expect(morningMission(state).endsAt).toBe('07:30');
    });

    it('updates eveningStartsAt and recomputes endsAt from duration', () => {
        const state = mcReducer(initialState, {
            type: 'SET_SETTINGS',
            settings: { eveningStartsAt: '20:00' },
        });
        // default duration is 60 min → endsAt should be 21:00
        expect(eveningMission(state).startsAt).toBe('20:00');
        expect(eveningMission(state).endsAt).toBe('21:00');
    });

    it('updates duration without changing start time — endsAt recalculated', () => {
        const state = mcReducer(initialState, {
            type: 'SET_SETTINGS',
            settings: { morningDurationMins: 45 },
        });
        // morningStartsAt default = '06:00' + 45 min → 06:45
        expect(morningMission(state).endsAt).toBe('06:45');
        expect(morningMission(state).startsAt).toBe('06:00');
    });

    it('clears startedAt when morning start time changes', () => {
        const triggered = applyActions([{ type: 'SET_ACTIVE_MISSION', phase: 'morning' }]);
        const state = mcReducer(triggered, {
            type: 'SET_SETTINGS',
            settings: { morningStartsAt: '08:00' },
        });
        expect(morningMission(state).startedAt).toBeUndefined();
    });

    it('does NOT clear startedAt when only morning duration changes', () => {
        const triggered = applyActions([{ type: 'SET_ACTIVE_MISSION', phase: 'morning' }]);
        const startedAt = morningMission(triggered).startedAt;
        const state = mcReducer(triggered, {
            type: 'SET_SETTINGS',
            settings: { morningDurationMins: 45 },
        });
        expect(morningMission(state).startedAt).toBe(startedAt);
    });
});
