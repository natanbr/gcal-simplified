// ============================================================
// E2E state isolation — CLAUDE.md → Testing
// ------------------------------------------------------------
// The whole Playwright suite runs against the DEVELOPER'S REAL userData
// directory: one `config.json`, one `mc-state-v5` localStorage blob, the same
// ones the app lives in. Playwright never rebuilds and never sandboxes, so a
// spec that writes state is writing the real thing.
//
// That was not theoretical. Before this guard existed:
//   * mission-control.spec.ts left `activeMission: 'morning'` with a 60-minute
//     duration behind — the overlay then covered the UI for every spec that ran
//     afterwards AND for the next hour of real use
//   * mission-control-responsibility-privilege.spec.ts suspended the Knife
//     privilege for a full day, through the real UI
//   * mc-settings.spec.ts rewrote `morningStartsAt` to 07:15
//   * mc-bank-management.spec.ts minted a token into the real bank
//
// The last one matters most: "tokens appear and disappear for no reason" was a
// reported symptom, and running the test suite was one of the causes.
//
// The containment is `mcTest` in e2e/helpers/mcApp.ts — it snapshots the blob
// before each test and restores it afterwards, pass or fail. This guard asserts
// every spec that touches Mission Control state actually uses it, because the
// failure mode is silent: a spec written the old way still passes.
//
// This is a structural test — it reads source rather than executing it. Unit
// tests cannot run Playwright specs, and an E2E run is too slow and too
// non-deterministic here to be the place this is caught.
// ============================================================

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { repoRoot } from './helpers/sourceFiles';

const E2E_DIR = join(repoRoot, 'e2e');
const HELPER = join(E2E_DIR, 'helpers', 'mcApp.ts');

/** Every `*.spec.ts` in the E2E directory, as { name, source }. */
function specs(): Array<{ name: string; source: string }> {
    return readdirSync(E2E_DIR)
        .filter(f => f.endsWith('.spec.ts'))
        .map(name => ({ name, source: readFileSync(join(E2E_DIR, name), 'utf-8') }));
}

/**
 * A spec can pollute MC state if it enters Mission Control at all.
 *
 * The discriminator is `?mc=1`, not the storage key. Naming the key is the
 * OBVIOUS way to write state, but it is not the only one, and the first version
 * of this guard only looked for the key — which would have missed
 * mc-bank-management.spec.ts entirely as it was originally written: no
 * `localStorage` call anywhere in it, just clicks on a +1 button that minted a
 * real token. A new spec written the same way would slip straight through.
 *
 * Entering MC mode is what makes pollution possible, so that is what to test.
 */
function touchesMCState(source: string): boolean {
    return (
        source.includes('mc=1') ||
        source.includes('gotoMC') ||
        source.includes('mc-state-v5') ||
        source.includes('STORAGE_KEY')
    );
}

/**
 * Only `mcTest` guarantees teardown; a bare `test` from Playwright does not.
 *
 * This checks the IMPORT, not "does the word mcTest appear anywhere" — the
 * first version of this guard did the latter and passed a mutation, because
 * every one of these specs mentions `mcTest` in its header comment. A guard
 * satisfied by a comment is not a guard.
 */
function usesIsolatedTest(source: string): boolean {
    const importsFixture = /import\s*\{[^}]*\bmcTest\b[^}]*\}\s*from\s*['"][^'"]*helpers\/mcApp['"]/s.test(source);
    // Importing Playwright's own `test` re-opens the hole even if the fixture is
    // also imported — the un-isolated one is what the spec bodies would use.
    const importsBareTest = /import\s*\{[^}]*(?<![\w.])test(?!\w)[^}]*\}\s*from\s*['"]@playwright\/test['"]/s.test(source);
    return importsFixture && !importsBareTest;
}

describe('E2E state isolation', () => {
    const all = specs();

    it('is actually scanning the E2E suite', () => {
        expect(all.length).toBeGreaterThanOrEqual(10);
    });

    it('has the shared isolation helper in place', () => {
        expect(
            existsSync(HELPER),
            'e2e/helpers/mcApp.ts is missing — every Mission Control spec depends on it for ' +
            'snapshot/restore of the real userData state.'
        ).toBe(true);
    });

    it('snapshots and restores around every test, not just on the happy path', () => {
        const helper = readFileSync(HELPER, 'utf-8');

        // The restore must live in the fixture's teardown half (after `use`),
        // which Playwright runs even when the test body throws. A restore in the
        // test body is skipped by exactly the failures most likely to pollute.
        const afterUse = helper.slice(helper.indexOf('await use(app)'));
        expect(
            afterUse.includes('restoreMCState'),
            'restoreMCState must run in the fixture teardown (after `await use(...)`), so it ' +
            'still runs when a test fails.'
        ).toBe(true);
    });

    it('outwaits the renderer persist debounce before restoring', () => {
        // The store persists on a 500ms debounce. Restoring inside that window
        // gets clobbered when the pending write lands — the restore would appear
        // to work and silently do nothing.
        const helper = readFileSync(HELPER, 'utf-8');
        const match = helper.match(/PERSIST_DEBOUNCE_SETTLE_MS\s*=\s*(\d+)/);

        expect(match, 'mcApp.ts must declare PERSIST_DEBOUNCE_SETTLE_MS').not.toBeNull();
        expect(
            Number(match?.[1]),
            'The settle wait must exceed the 500ms persist debounce in useMCStore, or a pending ' +
            'write lands after the restore and undoes it.'
        ).toBeGreaterThan(500);
    });

    it('treats a missing key as a state worth restoring', () => {
        // If `mc-state-v5` did not exist at snapshot time, restore must REMOVE
        // it. Writing the string "null" instead leaves a blob that JSON.parse
        // turns into `null`, which is not the same as a fresh install.
        const helper = readFileSync(HELPER, 'utf-8');
        expect(
            helper.includes('removeItem'),
            'restoreMCState must removeItem when the snapshot is null, not setItem("null").'
        ).toBe(true);
    });

    it('routes every Mission Control spec through the isolated test fixture', () => {
        const leaking = all
            .filter(s => touchesMCState(s.source) && !usesIsolatedTest(s.source))
            .map(s => `  e2e/${s.name}`);

        expect(
            leaking,
            `E2E spec(s) touch Mission Control state without the isolating fixture.\n\n` +
            `The suite runs against your REAL userData directory. A spec that writes state and\n` +
            `does not restore it changes the app you actually use — a suspended privilege, a\n` +
            `moved mission time, a minted token, an overlay stuck open for an hour.\n\n` +
            `Fix: import { mcTest as test } from './helpers/mcApp' and drop the manual\n` +
            `electron.launch / app.close boilerplate — the fixture owns the lifecycle.\n\n${leaking.join('\n')}`
        ).toEqual([]);
    });

    it('restores config.json in every spec that saves settings', () => {
        // The calendar's half of the shared state: theme mode, sleep schedule,
        // selected calendars, weekStartDay, and the remote pairing keys. A spec
        // that clicks Save writes the real file — `themeMode: "manual"` sat in
        // the developer's config for months because of exactly one such click.
        //
        // weekStartDay is the sharp edge: several calendar specs assert on dates
        // derived from it, so whatever the last run left decides whether they
        // pass. That is the mechanism behind "the suite is non-deterministic".
        const SAVE_MARKERS = ['save-settings-button', 'settings:save'];

        const unrestored = all
            .filter(s => SAVE_MARKERS.some(m => s.source.includes(m)))
            // Mocking the ipcMain handler in-process is an equally valid
            // isolation — nothing reaches the file. week-display-customization
            // does this, and it should not be forced into the other pattern.
            .filter(s => !s.source.includes('ipcMain'))
            .filter(s => !s.source.includes('restoreConfig') && !s.source.includes('mcTest'))
            .map(s => `  e2e/${s.name}`);

        expect(
            unrestored,
            `E2E spec(s) save settings without restoring config.json.\n\n` +
            `Fix: snapshotConfig(app) after launch, restoreConfig(app, snapshot) in afterEach\n` +
            `(see e2e/helpers/appConfig.ts) — or mock the settings:save ipcMain handler so the\n` +
            `write never reaches the file.\n\n${unrestored.join('\n')}`
        ).toEqual([]);
    });

    it('leaves no spec closing an app the fixture already owns', () => {
        // A stray `app.close()` in a fixture-based body double-closes and races
        // the restore that has not run yet.
        const doubleClose = all
            .filter(s => usesIsolatedTest(s.source) && /\bapp\.close\(\)/.test(s.source))
            .map(s => `  e2e/${s.name}`);

        expect(
            doubleClose,
            `Spec(s) call app.close() while using the mcTest fixture, which already closes it ` +
            `after restoring state:\n${doubleClose.join('\n')}`
        ).toEqual([]);
    });
});
