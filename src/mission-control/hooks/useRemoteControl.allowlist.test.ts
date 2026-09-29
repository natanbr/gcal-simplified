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
// ============================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { useRemoteControl, REMOTE_ALLOWED_ACTIONS } from './useRemoteControl';
import type { MCAction } from '../types';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

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

    describe('drift guard', () => {
        // The companion remote app lives in a separate repo (mc-remote). If a
        // button is added there and not here, the button silently does nothing.
        // This is the list of action types that repo dispatches, captured
        // 2026-08-19 and re-captured 2026-09-28 from mc-remote 7372b89 (its
        // shield −1 / +1 buttons). Update BOTH sides together.
        const CAPTURED_FROM = '7372b89';
        const TYPES_SENT_BY_REMOTE_APP = [
            'ADD_RESPONSIBILITY_POINT',
            'ADD_TOKENS',
            'ADJUST_BEHAVIOR_PROGRESS',
            'ADJUST_MISSION_END',
            'ADJUST_SHIELD',
            'CANCEL_MISSION',
            'CHEAT_ATTEMPT',
            'COMPLETE_TASK',
            'CONSUME_GAME_TOKEN',
            'GRANT_GAME_TOKEN',
            'REMOVE_TOKEN',
            'RESET_MISSION',
            'SET_ACTIVE_MISSION',
            'SET_MOOD_WIND',
            'SET_PRIVILEGE_STATUS',
            'TOGGLE_WHINING',
            'TRIGGER_ANIMATION',
        ];

        /**
         * Allowlisted types no phone build sends, each with the reason it stays.
         * The reason must name a remote sender or a spec line: a type this machine
         * dispatches itself is no reason, because a local dispatch never passes
         * the allowlist.
         */
        const ALLOWED_BUT_NOT_SENT: Partial<Record<MCAction['type'], string>> = {
            RESET_MISSION_WITH_TIMER: 'docs/requirements.md → Mission Streak Shield → "Reset re-arms the '
                + 'occurrence" specifies the long-press reset as remote-reachable; no phone build sends it yet',
        };

        /** Every `type: '…'` literal in the phone's production sources under `dir`. */
        function typesSentBy(dir: string, found = new Set<string>()): Set<string> {
            for (const entry of readdirSync(dir, { withFileTypes: true })) {
                // Links are not followed: a dangling one throws and a loop never ends.
                if (entry.isSymbolicLink()) continue;
                const full = join(dir, entry.name);
                if (entry.isDirectory()) typesSentBy(full, found);
                // Production code only: a test fixture is not a button, a .d.ts sends nothing.
                else if (/\.(ts|tsx|js|jsx)$/.test(entry.name) && !/\.(test|spec)\.|\.d\.ts$/.test(entry.name)) {
                    for (const m of readFileSync(full, 'utf-8').matchAll(/type:\s*['"`]([A-Z0-9_]+)['"`]/g)) {
                        found.add(m[1]);
                    }
                }
            }
            return found;
        }

        it('allows every action the companion remote app actually sends', () => {
            const missing = TYPES_SENT_BY_REMOTE_APP.filter(
                t => !REMOTE_ALLOWED_ACTIONS.has(t as MCAction['type'])
            );
            expect(
                missing,
                `mc-remote sends these but the allowlist rejects them — the buttons would silently do nothing: ${missing.join(', ')}`
            ).toEqual([]);
        });

        it('has a list that still matches the real mc-remote repo, when it is present', ctx => {
            // The hardcoded list above is the contract, and it is a snapshot — it
            // cannot notice that the other repo changed. This test closes that
            // hole opportunistically: when the sibling checkout exists it
            // re-derives the truth and compares. It SKIPS rather than fails when
            // the repo is absent (CI, another machine, a fresh clone), because a
            // guard that fails for environmental reasons gets deleted. A skip,
            // not a bare return: vitest counts a return as passed, which cannot be
            // told apart from "compared and matched".
            const remoteRepo = join(repoRoot, '..', 'mc-remote', 'src');
            if (!existsSync(remoteRepo)) {
                console.info('[drift guard] mc-remote checkout not found — skipping live comparison');
                ctx.skip('mc-remote checkout not found');
            }

            // Handled outside the reducer allowlist by design.
            const SPECIAL = new Set(['SNAKE_DIR', 'SYNC_REQUEST']);
            const nowSent = [...typesSentBy(remoteRepo)].filter(t => !SPECIAL.has(t)).sort();
            const snapshot = [...TYPES_SENT_BY_REMOTE_APP].sort();

            const added = nowSent.filter(t => !snapshot.includes(t));
            const removed = snapshot.filter(t => !nowSent.includes(t));

            expect(
                { added, removed },
                `mc-remote has drifted from the snapshot in this test.\n` +
                `  newly sent by the remote: ${added.join(', ') || '(none)'}\n` +
                `  no longer sent:           ${removed.join(', ') || '(none)'}\n` +
                `"No longer sent" can also mean ../mc-remote is older than the capture commit\n` +
                `${CAPTURED_FROM}: fast-forward it first (git -C ../mc-remote fetch, then\n` +
                `git -C ../mc-remote merge --ff-only origin/main) before editing the snapshot.\n` +
                `Then update TYPES_SENT_BY_REMOTE_APP, and add a new type that is a real phone button\n` +
                `to REMOTE_ALLOWED_ACTIONS in useRemoteControl.ts — otherwise it silently does nothing.`
            ).toEqual({ added: [], removed: [] });
        });

        it('does not allow anything the remote app never sends', () => {
            // Keeps the allowlist minimal: every entry must be justified by a
            // real button. Extras here are latent authorisation surface.
            const extras = [...REMOTE_ALLOWED_ACTIONS].filter(
                t => !TYPES_SENT_BY_REMOTE_APP.includes(t) && !(t in ALLOWED_BUT_NOT_SENT)
            );
            expect(extras, `allowlist entries with no corresponding remote button: ${extras.join(', ')}`).toEqual([]);
        });

        it('exempts only types the remote does not send, and that are still allowlisted', () => {
            // Without these, an exemption outlives its reason in silence: once its
            // type is in the snapshot the filter above never reads it, and if the
            // phone later drops the button it quietly re-applies.
            const exempt = Object.entries(ALLOWED_BUT_NOT_SENT);
            const nowSent = exempt.filter(([t]) => TYPES_SENT_BY_REMOTE_APP.includes(t));
            const notAllowed = exempt.filter(([t]) => !REMOTE_ALLOWED_ACTIONS.has(t as MCAction['type']));
            const show = (list: typeof exempt) => list.map(([t, why]) => `${t} (exempt because: ${why})`).join('; ');
            expect(nowSent, `exempt but now sent by the remote — remove the exemption: ${show(nowSent)}`).toEqual([]);
            expect(notAllowed, `exempt but no longer allowlisted — remove the exemption: ${show(notAllowed)}`).toEqual([]);
        });
    });
});
