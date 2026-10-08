// ============================================================
// Mission Control — remote allowlist drift guard
// ------------------------------------------------------------
// The companion phone app lives in a separate repo (mc-remote). These tests
// pin the list of action types it sends against REMOTE_ALLOWED_ACTIONS, and,
// when a sibling checkout is present, re-derive that list from its sources.
// Moved out of useRemoteControl.allowlist.test.ts (2026-09-28) unchanged.
// ============================================================

import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { REMOTE_ALLOWED_ACTIONS } from './useRemoteControl';
import type { MCAction } from '../types';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

describe('remote action allowlist', () => {
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
                + 'occurrence" specifies the full Reset as remote-reachable, and since 2026-10-07 ("Reset is '
                + 'phone-only") the remote is its only way in; no phone build sends it yet',
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
