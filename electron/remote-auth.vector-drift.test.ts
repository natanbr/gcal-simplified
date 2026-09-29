// ============================================================
// Remote protocol v2 — the shared test vector matches the phone repo's copy.
// ------------------------------------------------------------
// remote-auth.test.ts pins a key, two bodies and their signatures; the phone
// app (mc-remote, a separate repo) pins the same constants against WebCrypto.
// Each suite only proves its own side reproduces ITS copy: if one copy is
// edited, both stay green and the two sides stop agreeing on the MAC. This
// compares the two copies when a sibling checkout is present, the way
// src/mission-control/hooks/useRemoteControl.drift.test.ts does for the
// action list, and SKIPS when it is absent (CI, another machine, a worktree).
// ============================================================

import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** The vector's constants as each suite names them. */
const DESKTOP_NAMES = { key: 'VECTOR_KEY', actionBody: 'ACTION_BODY', actionSig: 'ACTION_SIG', stateBody: 'STATE_BODY', stateSig: 'STATE_SIG' };
const PHONE_NAMES = { key: 'KEY', actionBody: 'ACTION_BODY', actionSig: 'ACTION_SIG', stateBody: 'STATE_BODY', stateSig: 'STATE_SIG' };

/** `const NAME = '…';` at the start of a line, for every name asked for; a missing one reads as undefined. */
function pinned(source: string, names: Record<string, string>): Record<string, string | undefined> {
    return Object.fromEntries(Object.entries(names).map(([field, name]) =>
        [field, new RegExp(`^const ${name} = '([^']*)';\\r?$`, 'm').exec(source)?.[1]]));
}

const desktop = pinned(readFileSync(join(repoRoot, 'electron', 'remote-auth.test.ts'), 'utf-8'), DESKTOP_NAMES);

describe('remote protocol v2 shared test vector', () => {
    it('finds every pinned constant on this side (or the comparison below would pass vacuously)', () => {
        expect(Object.values(desktop).every(value => typeof value === 'string' && value !== ''), JSON.stringify(desktop)).toBe(true);
    });

    it('matches the constants the mc-remote repo pins, when it is present', ctx => {
        // A skip, not a bare return: vitest counts a return as passed, which cannot be
        // told apart from "compared and matched".
        const remoteRepo = join(repoRoot, '..', 'mc-remote', 'src');
        if (!existsSync(remoteRepo)) {
            console.info('[vector drift guard] mc-remote checkout not found — skipping live comparison');
            ctx.skip('mc-remote checkout not found');
        }

        // Present but moved or renamed: fail, so the guard is updated rather than silently skipped.
        const phoneSuite = join(remoteRepo, 'remote', 'remoteAuth.test.ts');
        expect(existsSync(phoneSuite), `${phoneSuite} is missing: the phone moved its test vector, update this guard`).toBe(true);

        expect(
            pinned(readFileSync(phoneSuite, 'utf-8'), PHONE_NAMES),
            'The shared test vector differs between electron/remote-auth.test.ts and mc-remote ' +
            'src/remote/remoteAuth.test.ts. The MAC input is event + "\\n" + body keyed with the pairing key; ' +
            'change both suites together, or the phone and the desktop stop verifying each other.',
        ).toEqual(desktop);
    });
});
