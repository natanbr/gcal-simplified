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
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
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

/** Action types that must never be reachable over the wire. */
const FORBIDDEN: Array<{ type: string; why: string }> = [
    { type: 'CLEAR_LOGS', why: 'would let the remote erase the parent-facing history' },
    { type: 'RESET_GAME_TOKENS', why: 'no remote button exists; destroys earned tokens' },
    { type: 'ADD_LOG', why: 'would let the remote forge activity-log entries' },
    { type: 'SET_SETTINGS', why: 'no remote button exists; could move mission times' },
    { type: 'START_GAME', why: 'strands snakeGameActive when no overlay is mounted to close it' },
    { type: 'CLEAR_CHEAT_FLAG', why: 'would let the remote silently dismiss a cheat alert' },
    { type: 'RECORD_QUIZ_ANSWER', why: 'would let a tampered remote pump the invisible reading level and forge practice stats' },
];

describe('remote action allowlist', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    afterEach(() => {
        delete window.ipcRenderer;
    });

    describe('refuses actions the remote has no business sending', () => {
        for (const { type, why } of FORBIDDEN) {
            it(`rejects ${type} — ${why}`, () => {
                const listener = mountAndGetListener();
                listener({ type });
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
            listener({ type: 'ADD_TOKEN' });

            expect(mockDispatch).toHaveBeenCalledWith(
                expect.objectContaining({ type: 'ADD_TOKEN', isRemote: true, origin: 'remote' })
            );
        });

        it('accepts every type on the allowlist', () => {
            const listener = mountAndGetListener();
            // Minimal valid payloads for the types whose numeric fields are
            // validated (PAYLOAD_VALIDATORS in the hook).
            const payloads: Record<string, Record<string, unknown>> = {
                ADD_TOKENS: { amount: 1 },
                SET_ACTIVE_MISSION: { phase: 'morning' },
                ADJUST_SHIELD: { delta: 1 },
                COMPLETE_MISSION_ROUTINE: { missionPhase: 'morning', bonusTokens: 2 },
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
        // 2026-08-19. Update BOTH sides together.
        const TYPES_SENT_BY_REMOTE_APP = [
            'ADD_RESPONSIBILITY_POINT',
            'ADD_TOKENS',
            'ADJUST_BEHAVIOR_PROGRESS',
            'ADJUST_MISSION_END',
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

        it('allows every action the companion remote app actually sends', () => {
            const missing = TYPES_SENT_BY_REMOTE_APP.filter(
                t => !REMOTE_ALLOWED_ACTIONS.has(t as MCAction['type'])
            );
            expect(
                missing,
                `mc-remote sends these but the allowlist rejects them — the buttons would silently do nothing: ${missing.join(', ')}`
            ).toEqual([]);
        });

        it('has a list that still matches the real mc-remote repo, when it is present', () => {
            // The hardcoded list above is the contract, and it is a snapshot — it
            // cannot notice that the other repo changed. This test closes that
            // hole opportunistically: when the sibling checkout exists it
            // re-derives the truth and compares. It SKIPS rather than fails when
            // the repo is absent (CI, another machine, a fresh clone), because a
            // guard that fails for environmental reasons gets deleted.
            const remoteRepo = join(repoRoot, '..', 'mc-remote', 'src');
            if (!existsSync(remoteRepo)) {
                console.info('[drift guard] mc-remote checkout not found — skipping live comparison');
                return;
            }

            const actual = new Set<string>();
            const walk = (dir: string) => {
                for (const name of readdirSync(dir)) {
                    const full = join(dir, name);
                    if (statSync(full).isDirectory()) walk(full);
                    else if (/\.(ts|tsx|js|jsx)$/.test(name)) {
                        for (const m of readFileSync(full, 'utf-8').matchAll(/type:\s*'([A-Z_]+)'/g)) {
                            actual.add(m[1]);
                        }
                    }
                }
            };
            walk(remoteRepo);

            // Handled outside the reducer allowlist by design.
            const SPECIAL = new Set(['SNAKE_DIR', 'SYNC_REQUEST']);
            const nowSent = [...actual].filter(t => !SPECIAL.has(t)).sort();
            const snapshot = [...TYPES_SENT_BY_REMOTE_APP].sort();

            const added = nowSent.filter(t => !snapshot.includes(t));
            const removed = snapshot.filter(t => !nowSent.includes(t));

            expect(
                { added, removed },
                `mc-remote has drifted from the snapshot in this test.\n` +
                `  newly sent by the remote: ${added.join(', ') || '(none)'}\n` +
                `  no longer sent:           ${removed.join(', ') || '(none)'}\n` +
                `Update TYPES_SENT_BY_REMOTE_APP, and add any new type to REMOTE_ALLOWED_ACTIONS\n` +
                `in useRemoteControl.ts — otherwise the new button silently does nothing.`
            ).toEqual({ added: [], removed: [] });
        });

        it('does not allow anything the remote app never sends', () => {
            // Keeps the allowlist minimal: every entry must be justified by a
            // real button. Extras here are latent authorisation surface.
            const extras = [...REMOTE_ALLOWED_ACTIONS].filter(
                t => !TYPES_SENT_BY_REMOTE_APP.includes(t) &&
                    // Deliberate: mission completion/reset variants the remote
                    // reaches indirectly through COMPLETE_TASK flows.
                    // ADJUST_SHIELD is the host running AHEAD of the app on
                    // purpose — the +/- shield buttons are specified in
                    // docs/requirements.md and wired here, but mc-remote has not
                    // shipped them yet. Remove this exemption once it does.
                    !['ADD_TOKEN', 'ADJUST_SHIELD', 'COMPLETE_MISSION_ROUTINE', 'RESET_MISSION_WITH_TIMER'].includes(t)
            );
            expect(extras, `allowlist entries with no corresponding remote button: ${extras.join(', ')}`).toEqual([]);
        });
    });
});
