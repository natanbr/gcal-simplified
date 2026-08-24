/**
 * Behavioural counterpart to `src/__tests__/e2e-state-isolation.test.ts`.
 *
 * That guard reads source text: it can tell you the fixture *mentions*
 * `removeUserData` inside a `finally`, but not that the directory actually went
 * away. Two real leaks passed it — the profile was created outside the `try`,
 * and a rejecting `close()` skipped the removal — because both are true
 * statements about the text and false statements about the behaviour.
 *
 * This closes that gap the only way it can be closed: look at the disk. Record
 * which `gcal-e2e-*` directories exist before the run, and fail the run if any
 * NEW one survives it. Pre-existing directories are ignored, so a leak from an
 * earlier killed run cannot fail an innocent one.
 *
 * Wired as `globalSetup` in playwright.config.ts. The returned function is run
 * by Playwright as the global teardown, which keeps both halves in one closure
 * rather than depending on two module loads sharing state.
 */

import { readdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PREFIX = 'gcal-e2e-';

function currentProfiles(): string[] {
    const root = tmpdir();
    if (!existsSync(root)) return [];
    try {
        return readdirSync(root).filter(name => name.startsWith(PREFIX));
    } catch {
        // Never let a listing failure take down the suite — this is a guard,
        // not a feature.
        return [];
    }
}

export default function globalSetup(): () => void {
    const preExisting = new Set(currentProfiles());
    if (preExisting.size > 0) {
        console.info(
            `[e2e] ${preExisting.size} pre-existing ${PREFIX}* profile(s) in ${tmpdir()} — ` +
            `ignoring them; they are leftovers from an earlier run.`
        );
    }

    return function globalTeardown(): void {
        const leaked = currentProfiles().filter(name => !preExisting.has(name));
        if (leaked.length === 0) return;

        throw new Error(
            `${leaked.length} throwaway userData profile(s) leaked from this run:\n` +
            leaked.map(n => `  ${join(tmpdir(), n)}`).join('\n') +
            `\n\nEvery isolated launch must remove its profile in teardown — including when the ` +
            `test failed, and including when close() rejects. Check the nested finally in ` +
            `e2e/helpers/mcApp.ts and the afterEach of any spec that manages its own launch.`
        );
    };
}
