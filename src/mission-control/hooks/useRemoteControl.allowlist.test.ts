// ============================================================
// Mission Control — remote action authorisation
// ------------------------------------------------------------
// The channel used to forward ANY action straight into the reducer. The pairing
// key answers "is this the right household?"; it does not answer "is this an
// action the remote is allowed to take?". A stale remote build, a replayed
// payload or a tampered client could reach actions the remote has no button for
// — including CLEAR_LOGS, which destroys the very evidence a parent reviews.
//
// These are negative tests: they assert what the app REFUSES. That whole
// category was missing from the suite, which is why the hole went unnoticed.
// The drift guard against the phone app's sources is useRemoteControl.drift.test.ts.
// ============================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useRemoteControl, REMOTE_ALLOWED_ACTIONS } from './useRemoteControl';

const mockDispatch = vi.fn();

vi.mock('../store/useMCStore', () => ({
    useMCDispatch: () => mockDispatch,
}));

/** Grabs the listener the hook registers for `remote-control:action`. */
function mountAndGetListener(): (payload: unknown) => void {
    let captured: ((payload: unknown) => void) | undefined;
    window.ipcRenderer = {
        on: vi.fn((channel: string, listener: (payload: unknown) => void) => {
            if (channel === 'remote-control:action') captured = listener;
            return vi.fn();
        }),
        invoke: vi.fn().mockResolvedValue(undefined),
    };
    renderHook(() => useRemoteControl());
    if (!captured) throw new Error('hook never subscribed to remote-control:action');
    return captured;
}

/**
 * Action types that must never be reachable over the wire. `payload` makes the
 * send well-formed, so the allowlist refuses it and not a payload validator.
 */
const FORBIDDEN: Array<{ type: string; why: string; payload?: Record<string, unknown> }> = [
    { type: 'ADD_TOKEN', why: 'no phone build sends it; every bank +1, phone or desktop, sends ADD_TOKENS' },
    {
        type: 'COMPLETE_MISSION_ROUTINE',
        payload: { missionPhase: 'morning', bonusTokens: 2 },
        why: 'no phone build sends it; would end a running mission as completed with unticked tasks and any bonus',
    },
    { type: 'CLEAR_LOGS', why: 'would let the remote erase the parent-facing history' },
    { type: 'RESET_GAME_TOKENS', why: 'no remote button exists; destroys earned tokens' },
    { type: 'ADD_LOG', why: 'would let the remote forge activity-log entries' },
    { type: 'SET_SETTINGS', why: 'no remote button exists; could move mission times' },
    { type: 'START_GAME', why: 'strands snakeGameActive when no overlay is mounted to close it' },
    { type: 'CLEAR_CHEAT_FLAG', why: 'would let the remote silently dismiss a cheat alert' },
    { type: 'RECORD_QUIZ_ANSWER', why: 'would let a tampered remote pump the invisible reading level and forge practice stats' },
    { type: 'SET_SCHOOL_CALENDAR', why: 'only this machine reads the family calendar; a forged one would add or drop the school-bag task' },
];

describe('remote action allowlist', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    afterEach(() => {
        delete window.ipcRenderer;
    });

    describe('refuses actions the remote has no business sending', () => {
        for (const { type, why, payload } of FORBIDDEN) {
            it(`rejects ${type} — ${why}`, () => {
                const listener = mountAndGetListener();
                listener({ type, ...payload });
                expect(mockDispatch).not.toHaveBeenCalled();
            });
        }

        it('rejects an unknown action type outright', () => {
            const listener = mountAndGetListener();
            listener({ type: 'TOTALLY_MADE_UP' });
            expect(mockDispatch).not.toHaveBeenCalled();
        });

        it('drops a malformed payload without throwing', () => {
            const listener = mountAndGetListener();
            expect(() => {
                listener(null);
                listener(undefined);
                listener({});
                listener({ type: 42 });
                listener('a string');
            }).not.toThrow();
            expect(mockDispatch).not.toHaveBeenCalled();
        });

        it('rejects allowlisted actions whose numeric payload is missing or NaN', () => {
            // {type:'ADD_TOKENS'} with no amount reduces to bankCount +
            // undefined = NaN, which persists (as null) and zeroes the bank on
            // reload — the allowlist alone does not stop a tampered payload.
            const listener = mountAndGetListener();
            listener({ type: 'ADD_TOKENS' });
            listener({ type: 'ADD_TOKENS', amount: 'seven' });
            listener({ type: 'ADD_TOKENS', amount: NaN });
            listener({ type: 'ADJUST_BEHAVIOR_PROGRESS' });
            listener({ type: 'ADJUST_MISSION_END', missionPhase: 'morning' });
            listener({ type: 'SET_MOOD_WIND' });
            expect(mockDispatch).not.toHaveBeenCalled();
        });

        it("rejects a phone Stop whose phase is missing or not a real mission", () => {
            // Stop is phone-only since 2026-09-24. A malformed phase is dropped here;
            // a well-formed one naming a mission that is not running is refused later,
            // by the reducer and the log (mcReducer.stale-mission-action.test.ts).
            const listener = mountAndGetListener();
            listener({ type: 'CANCEL_MISSION' });
            listener({ type: 'CANCEL_MISSION', missionPhase: 'none' });
            listener({ type: 'CANCEL_MISSION', missionPhase: 'noon' });
            listener({ type: 'CANCEL_MISSION', missionPhase: 1 });
            expect(mockDispatch).not.toHaveBeenCalled();
            listener({ type: 'CANCEL_MISSION', missionPhase: 'morning' });
            listener({ type: 'CANCEL_MISSION', missionPhase: 'evening' });
            expect(mockDispatch).toHaveBeenCalledTimes(2);
        });

        it('rejects a privilege change the reducer would store as garbage', () => {
            // The reducer stores status and suspendedUntil as they arrive. A number
            // end time is a year to one parser and a 1970 timestamp to another; an
            // unknown status was logged as "locked".
            const listener = mountAndGetListener();
            const ok = { type: 'SET_PRIVILEGE_STATUS', cardId: 'phone-games', status: 'suspended', suspendedUntil: '2030-01-01T00:00:00.000Z' };
            listener({ ...ok, suspendedUntil: 2030 });
            listener({ ...ok, suspendedUntil: 'next tuesday' });
            listener({ ...ok, suspendedUntil: null });
            listener({ ...ok, status: 'bogus' });
            listener({ ...ok, cardId: 7 });
            listener({ ...ok, status: 'active', suspendedUntil: '2030-01-01T00:00:00.000Z' });
            // Already over on this clock: stored, it would be lifted at once and
            // log "suspension ended" with no "suspended" line before it.
            listener({ ...ok, suspendedUntil: new Date(Date.now() - 60_000).toISOString() });
            expect(mockDispatch).not.toHaveBeenCalled();
            listener(ok);
            listener({ ...ok, status: 'active', suspendedUntil: null });
            // A build that leaves the field out must still be able to reinstate.
            listener({ type: 'SET_PRIVILEGE_STATUS', cardId: 'phone-games', status: 'active' });
            expect(mockDispatch).toHaveBeenCalledTimes(3);
        });
    });

    describe('still accepts the legitimate remote surface', () => {
        it('dispatches an allowed action, tagged as remote', () => {
            const listener = mountAndGetListener();
            listener({ type: 'ADJUST_SHIELD', delta: 1 });

            expect(mockDispatch).toHaveBeenCalledWith(
                expect.objectContaining({ type: 'ADJUST_SHIELD', delta: 1, isRemote: true, origin: 'remote' })
            );
        });

        it('accepts every type on the allowlist', () => {
            const listener = mountAndGetListener();
            // Minimal valid payloads for the types whose numeric fields are
            // validated (PAYLOAD_VALIDATORS in the hook).
            const payloads: Record<string, Record<string, unknown>> = {
                ADD_TOKENS: { amount: 1 },
                SET_ACTIVE_MISSION: { phase: 'morning' },
                CANCEL_MISSION: { missionPhase: 'morning' },
                ADJUST_SHIELD: { delta: 1 },
                ADJUST_BEHAVIOR_PROGRESS: { amount: 1, reason: 'test' },
                ADJUST_MISSION_END: { missionPhase: 'morning', deltaMinutes: 5 },
                SET_MOOD_WIND: { level: 1 },
                SET_PRIVILEGE_STATUS: { cardId: 'phone-games', status: 'active', suspendedUntil: null },
            };
            for (const type of REMOTE_ALLOWED_ACTIONS) {
                mockDispatch.mockClear();
                listener({ type, ...(payloads[type] ?? {}) });
                expect(mockDispatch, `allowlisted ${type} was rejected`).toHaveBeenCalled();
            }
        });

        it('translates SNAKE_DIR into a key event without touching the store', () => {
            const listener = mountAndGetListener();
            const spy = vi.spyOn(window, 'dispatchEvent');

            listener({ type: 'SNAKE_DIR', dir: 'left' });

            expect(spy).toHaveBeenCalledWith(expect.objectContaining({ key: 'ArrowLeft' }));
            expect(mockDispatch).not.toHaveBeenCalled();
        });

        it('ignores an invalid SNAKE_DIR direction', () => {
            const listener = mountAndGetListener();
            const spy = vi.spyOn(window, 'dispatchEvent');

            listener({ type: 'SNAKE_DIR', dir: 'sideways' });

            expect(spy).not.toHaveBeenCalled();
        });
    });
});
