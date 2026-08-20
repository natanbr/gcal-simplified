// ============================================================
// E2E state isolation — CLAUDE.md → Testing
// ------------------------------------------------------------
// The Playwright suite launches the real app. Left alone, every instance uses
// the DEVELOPER'S REAL userData directory — not a detail, but the app's whole
// persistent identity: the Mission Control store (`mc-state-v5`), config.json
// (theme, weekStartDay, AND the Supabase remote-control pairing keys), the
// Google tokens, and the durable audit trail.
//
// That was not theoretical. Before these guards existed:
//   * mission-control.spec.ts left `activeMission: 'morning'` with a 60-minute
//     duration behind — the overlay then covered the UI for every spec that ran
//     afterwards AND for the next hour of real use
//   * mission-control-responsibility-privilege.spec.ts suspended the Knife
//     privilege for a full day, through the real UI
//   * mc-settings.spec.ts rewrote `morningStartsAt` to 07:15
//   * mc-bank-management.spec.ts minted a token into the real bank
//   * settings-power.spec.ts flipped the real theme to Manual
//   * week-display-customization.spec.ts called `localStorage.clear()`
//   * and because the pairing keys live in config.json, every launch joined the
//     household's real remote-control room and broadcast test state to the phone
//
// Two defences, in order of preference:
//   1. ISOLATION (`--user-data-dir`) — a throwaway profile per launch. Nothing
//      real is present, so nothing has to be put back. Available to any spec
//      that does not need real Google credentials.
//   2. RESTORE — snapshot the real file and write it back in teardown. Weaker,
//      but the only option for specs that still need a signed-in calendar.
//
// These are structural tests: they read source rather than executing it. The
// failure mode is silent — a spec written the old way still passes — and an E2E
// run is too slow and too non-deterministic here to be where this is caught.
// ============================================================

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { repoRoot } from './helpers/sourceFiles';

const E2E_DIR = join(repoRoot, 'e2e');
const MC_HELPER = join(E2E_DIR, 'helpers', 'mcApp.ts');
const ISOLATION_HELPER = join(E2E_DIR, 'helpers', 'userDataDir.ts');

/** Every `*.spec.ts` in the E2E directory, as { name, source }. */
function specs(): Array<{ name: string; source: string }> {
    return readdirSync(E2E_DIR)
        .filter(f => f.endsWith('.spec.ts'))
        .map(name => ({ name, source: readFileSync(join(E2E_DIR, name), 'utf-8') }));
}

/**
 * A spec can pollute Mission Control state if it enters MC at all.
 *
 * The discriminator is `?mc=1`, not the storage key. Naming the key is the
 * OBVIOUS way to write state, but it is not the only one: mc-bank-management as
 * originally written had no `localStorage` call anywhere in it, just clicks on a
 * +1 button that minted a real token. An earlier version of this guard looked
 * only for the key and would have missed it entirely.
 */
function touchesMCState(source: string): boolean {
    return (
        source.includes('mc=1') ||
        source.includes('gotoMC') ||
        source.includes('mc-state-v5') ||
        source.includes('STORAGE_KEY') ||
        // Blunter than any of the above and worse than all of them:
        // week-display-customization.spec.ts wipes the entire store this way
        // without ever entering Mission Control or naming the key.
        source.includes('localStorage.clear')
    );
}

/** Only `mcTest` guarantees an isolated profile; a bare Playwright `test` does not. */
function usesIsolatedTest(source: string): boolean {
    // Checks the IMPORT, not "does the word mcTest appear anywhere" — the first
    // version of this guard did the latter and passed a mutation, because every
    // one of these specs mentions `mcTest` in its header comment. A guard
    // satisfied by a comment is not a guard.
    const importsFixture = /import\s*\{[^}]*\bmcTest\b[^}]*\}\s*from\s*['"][^'"]*helpers\/mcApp['"]/s.test(source);
    // Importing Playwright's own `test` re-opens the hole even if the fixture is
    // also imported — the un-isolated one is what the spec bodies would use.
    const importsBareTest = /import\s*\{[^}]*(?<![\w.])test(?!\w)[^}]*\}\s*from\s*['"]@playwright\/test['"]/s.test(source);
    return importsFixture && !importsBareTest;
}

/**
 * A spec that manages its own launch may still isolate it directly.
 *
 * Matches the CALL, not the name — `userDataArg` appears in the import line
 * whether or not it is ever used, and an earlier version of this check was
 * satisfied by that import alone. Same failure as the `mcTest`-in-a-comment
 * bug above: a guard that a mutation leaves green is not guarding anything.
 */
function isolatesItsOwnLaunch(source: string): boolean {
    return /userDataArg\(/.test(source) && /removeUserData\(/.test(source);
}

describe('E2E state isolation', () => {
    const all = specs();
    const mcHelper = readFileSync(MC_HELPER, 'utf-8');

    it('is actually scanning the E2E suite', () => {
        expect(all.length).toBeGreaterThanOrEqual(10);
    });

    it('has both isolation helpers in place', () => {
        expect(existsSync(MC_HELPER), 'e2e/helpers/mcApp.ts is missing').toBe(true);
        expect(existsSync(ISOLATION_HELPER), 'e2e/helpers/userDataDir.ts is missing').toBe(true);
    });

    it('gives every Mission Control launch its own throwaway userData directory', () => {
        // Without the switch the fixture silently falls back to the real profile
        // and every guarantee in this file evaporates — while the tests still
        // pass, which is exactly why this is asserted rather than assumed.
        expect(
            mcHelper,
            'launchMC must pass --user-data-dir (via userDataArg) to electron.launch'
        ).toMatch(/userDataArg\(/);
        expect(
            mcHelper,
            'the mcTest fixture must create an isolated profile per launch'
        ).toMatch(/createIsolatedUserData\(\)/);
    });

    it('removes the throwaway directory even when a test fails', () => {
        // A cleanup that only runs on the happy path leaks a profile per failing
        // test, and failing tests are the common case while debugging.
        const fixture = mcHelper.slice(mcHelper.indexOf('mcApp: async'));
        expect(fixture).toMatch(/finally\s*\{/);
        const finallyBlock = fixture.slice(fixture.indexOf('finally'));
        expect(
            finallyBlock,
            'removeUserData must run in the fixture\'s finally block'
        ).toMatch(/removeUserData\(/);
    });

    it('never lets teardown cleanup fail a green test', () => {
        // Windows can hold a lock on the profile briefly after exit. A leaked
        // temp directory is acceptable; a teardown that throws is not.
        const isolation = readFileSync(ISOLATION_HELPER, 'utf-8');
        const remove = isolation.slice(isolation.indexOf('export function removeUserData'));
        expect(remove).toMatch(/try\s*\{/);
        expect(remove, 'rmSync must retry — Windows releases the profile lock late').toMatch(/maxRetries/);
    });

    it('routes every Mission Control spec through an isolated launch', () => {
        const leaking = all
            .filter(s => touchesMCState(s.source))
            .filter(s => !usesIsolatedTest(s.source) && !isolatesItsOwnLaunch(s.source))
            .map(s => `  e2e/${s.name}`);

        expect(
            leaking,
            `E2E spec(s) touch Mission Control state without an isolated userData directory.\n\n` +
            `Unisolated, the suite runs against your REAL profile: a spec that writes state changes\n` +
            `the app you actually use — a suspended privilege, a moved mission time, a minted token,\n` +
            `an overlay stuck open for an hour — and joins the household's real remote-control room.\n\n` +
            `Fix: import { mcTest as test } from './helpers/mcApp' and drop the manual\n` +
            `electron.launch / app.close boilerplate — the fixture owns the lifecycle. A spec that\n` +
            `must manage its own launch can instead pass userDataArg(dir) and call removeUserData.\n\n${leaking.join('\n')}`
        ).toEqual([]);
    });

    it('isolates or restores config.json in every spec that saves settings', () => {
        // The calendar's half of the shared state: theme, sleep schedule,
        // selected calendars, weekStartDay, and the remote pairing keys.
        // weekStartDay is the sharp edge — several calendar specs assert on
        // dates derived from it, so whatever the last run left behind decides
        // whether they pass. That is the mechanism behind "the suite is
        // non-deterministic".
        const SAVE_MARKERS = ['save-settings-button', 'settings:save'];

        const unprotected = all
            .filter(s => SAVE_MARKERS.some(m => s.source.includes(m)))
            .filter(s => !isolatesItsOwnLaunch(s.source) && !usesIsolatedTest(s.source))
            .filter(s => !/restoreConfig\(/.test(s.source))
            .map(s => `  e2e/${s.name}`);

        expect(
            unprotected,
            `E2E spec(s) save settings against the real config.json.\n\n` +
            `Preferred fix: isolate the launch (userDataArg + removeUserData). If the spec needs\n` +
            `real Google credentials it cannot isolate — snapshotConfig(app) after launch and\n` +
            `restoreConfig(app, snapshot) in afterEach instead (e2e/helpers/appConfig.ts).\n\n${unprotected.join('\n')}`
        ).toEqual([]);
    });

    it('leaves no spec closing an app the fixture already owns', () => {
        // A stray `app.close()` in a fixture-based body double-closes and races
        // the cleanup that has not run yet.
        const doubleClose = all
            .filter(s => usesIsolatedTest(s.source) && /\bapp\.close\(\)/.test(s.source))
            .map(s => `  e2e/${s.name}`);

        expect(
            doubleClose,
            `Spec(s) call app.close() while using the mcTest fixture, which already closes it:\n${doubleClose.join('\n')}`
        ).toEqual([]);
    });
});
