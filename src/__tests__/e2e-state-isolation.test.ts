// ============================================================
// E2E state isolation — CLAUDE.md → Testing → userData isolation
// ------------------------------------------------------------
// The Playwright suite launches the real app. Left alone, every instance uses
// the DEVELOPER'S REAL userData directory — not a detail, but the app's whole
// persistent identity: the Mission Control store (`mc-state-v5`), config.json
// (theme, weekStartDay, AND the Supabase remote-control pairing keys), the
// Google tokens, and the durable audit trail.
//
// That was not theoretical. Specs left `activeMission` running for an hour,
// suspended a privilege for a day, rewrote `morningStartsAt`, minted a token
// into the real bank, flipped the theme, called `localStorage.clear()`, and —
// because the pairing keys live in config.json — joined the household's real
// remote-control room and broadcast test state to the phone.
//
// WHY THIS GUARD IS SHAPED THE WAY IT IS
// --------------------------------------
// The first version asked "does this spec look like it touches Mission Control
// state?" and keyword-matched the source for `mc=1`, `gotoMC`, `mc-state-v5`.
// A max-effort review took it apart, and every hole was the same hole:
//
//   * `MCStoreProvider` is mounted ABOVE the view switch in App.tsx, so a
//     calendar spec writes `mc-state-v5`, ticks the behaviour heartbeat, appends
//     to the audit trail and joins the real Supabase room WITHOUT ever visiting
//     `?mc=1`. The central discriminator was simply wrong.
//   * Of 14 specs it inspected 4 — two of them only because a stale header
//     comment happened to contain the string `mc-state-v5`. Correcting the
//     comment would have silently dropped them.
//   * `learning-progress.spec.ts` fell OUT of scope the moment it was isolated,
//     because isolating it removed the `?mc=1` that put it in scope.
//   * `readdirSync` was non-recursive while Playwright collects recursively.
//
// So the question changed. It is no longer "does this spec touch MC state" —
// that is unknowable from source text. It is:
//
//     DOES THIS SPEC LAUNCH THE APP AGAINST THE REAL PROFILE?
//
// which is answerable exactly, because it is a property of the `electron.launch`
// call. Every spec must either isolate every launch it makes, or be named in
// NEEDS_REAL_PROFILE below. Adding a name to that list is the reviewable act;
// forgetting fails. This is the ratchet shape the repo already trusts.
//
// The behavioural half lives in e2e/global-profile-leak-check.ts, which fails
// the run if a throwaway profile is left on disk. Source text cannot prove
// cleanup ran; that can.
// ============================================================

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { repoRoot } from './helpers/sourceFiles';

const E2E_DIR = join(repoRoot, 'e2e');
const MC_HELPER = join(E2E_DIR, 'helpers', 'mcApp.ts');
const ISOLATION_HELPER = join(E2E_DIR, 'helpers', 'userDataDir.ts');
const LEAK_CHECK = join(E2E_DIR, 'global-profile-leak-check.ts');

/**
 * Specs that still launch against the developer's real userData directory.
 *
 * All of them need a signed-in Google account, which a fresh profile does not
 * have. `week-display-customization.spec.ts` proves the way out: it mocks
 * `auth:check` via ipcMain and reloads, so it needs no real credentials and is
 * isolated. Giving these the same treatment empties this list.
 *
 * THIS LIST MAY ONLY SHRINK. A new spec belongs on the isolated side.
 */
const NEEDS_REAL_PROFILE = [
    'calendar-cache.spec.ts',
    'dashboard.spec.ts',
    'day-header-enhancement.spec.ts',
    'event-colors.spec.ts',
    'monthly-view.spec.ts',
    'settings-power.spec.ts',
    'weather-modal.spec.ts',
    'week-navigation.spec.ts',
];

interface Spec {
    /** Path relative to e2e/, POSIX-style — matches how Playwright reports it. */
    name: string;
    source: string;
}

/**
 * Every spec Playwright would collect. RECURSIVE, because `testMatch` is
 * `'**\/*.spec.ts'` — a non-recursive read let a spec in a subdirectory run
 * against the real profile while every assertion here stayed green.
 */
function specs(): Spec[] {
    const found: Spec[] = [];

    const walk = (dir: string): void => {
        for (const entry of readdirSync(dir)) {
            const full = join(dir, entry);
            if (statSync(full).isDirectory()) walk(full);
            else if (entry.endsWith('.spec.ts')) {
                found.push({
                    name: relative(E2E_DIR, full).split(sep).join('/'),
                    source: readFileSync(full, 'utf-8'),
                });
            }
        }
    };

    walk(E2E_DIR);
    return found;
}

/**
 * The bodies of every `electron.launch(...)` call in a spec, as raw text.
 *
 * Deliberately looks at the CALL rather than at imports. An import-based check
 * grants a whole-file exemption, so a spec could import the isolated fixture
 * and still hand-roll an un-isolated launch inside a test body — and
 * `mcApp.ts` exports `ELECTRON_MAIN` precisely to make that easy.
 */
function launchCalls(source: string): string[] {
    const calls: string[] = [];
    const marker = /(?:_?electron|electron)\s*\.\s*launch\s*\(/g;

    for (const match of source.matchAll(marker)) {
        // Walk from the opening paren to its match so the whole options object
        // is captured however it is formatted.
        let depth = 0;
        let i = match.index! + match[0].length - 1;
        const start = i;
        for (; i < source.length; i++) {
            if (source[i] === '(') depth++;
            else if (source[i] === ')') {
                depth--;
                if (depth === 0) break;
            }
        }
        calls.push(source.slice(start, i + 1));
    }
    return calls;
}

/** A launch is isolated when its own args carry the throwaway-profile switch. */
function launchIsIsolated(call: string): boolean {
    return /userDataArg\(/.test(call) || /--user-data-dir/.test(call);
}

describe('E2E state isolation', () => {
    const all = specs();
    const byName = new Map(all.map(s => [s.name, s]));

    it('is actually scanning the E2E suite', () => {
        expect(all.length).toBeGreaterThanOrEqual(10);
    });

    it('has both isolation helpers and the leak check in place', () => {
        expect(existsSync(MC_HELPER), 'e2e/helpers/mcApp.ts is missing').toBe(true);
        expect(existsSync(ISOLATION_HELPER), 'e2e/helpers/userDataDir.ts is missing').toBe(true);
        expect(existsSync(LEAK_CHECK), 'e2e/global-profile-leak-check.ts is missing').toBe(true);
    });

    it('launches every spec against a throwaway profile, or names it as an exception', () => {
        const offenders: string[] = [];

        for (const spec of all) {
            if (NEEDS_REAL_PROFILE.includes(spec.name)) continue;
            const unisolated = launchCalls(spec.source).filter(c => !launchIsIsolated(c));
            if (unisolated.length > 0) {
                offenders.push(`  e2e/${spec.name} — ${unisolated.length} un-isolated electron.launch call(s)`);
            }
        }

        expect(
            offenders,
            `E2E spec(s) launch the app against your REAL userData directory.\n\n` +
            `That is the app you actually use: a spec that writes state changes it for real — a\n` +
            `suspended privilege, a moved mission time, a minted token, an overlay stuck open for\n` +
            `an hour — and joins the household's real remote-control room.\n\n` +
            `Fix: use \`mcTest\` from './helpers/mcApp' (it owns the whole lifecycle), or pass\n` +
            `\`userDataArg(dir)\` into the launch args and \`removeUserData(dir)\` in teardown.\n` +
            `If the spec genuinely needs real Google credentials, add it to NEEDS_REAL_PROFILE in\n` +
            `this file — that is a deliberate, reviewable edit.\n\n${offenders.join('\n')}`
        ).toEqual([]);
    });

    it('keeps the real-profile exception list honest', () => {
        const stale = NEEDS_REAL_PROFILE.filter(name => !byName.has(name));
        expect(
            stale,
            `NEEDS_REAL_PROFILE names spec(s) that no longer exist — delete these entries:\n  ${stale.join('\n  ')}`
        ).toEqual([]);

        const needless = NEEDS_REAL_PROFILE.filter(name => {
            const spec = byName.get(name);
            if (!spec) return false;
            const calls = launchCalls(spec.source);
            // Listed but already isolated (or launching nothing) — lock the win in.
            return calls.length > 0 && calls.every(launchIsIsolated);
        });

        expect(
            needless,
            `Nice — spec(s) on the exception list now isolate every launch. Remove them from\n` +
            `NEEDS_REAL_PROFILE so the list cannot regrow:\n  ${needless.join('\n  ')}`
        ).toEqual([]);
    });

    it('does not let the un-isolated set grow', () => {
        // A tripwire, not a quality bar. Shrinking this number is the goal;
        // raising it has to be a deliberate edit with a reason.
        expect(
            NEEDS_REAL_PROFILE.length,
            `${NEEDS_REAL_PROFILE.length} spec(s) still run against the real profile. Mocking\n` +
            `\`auth:check\` the way week-display-customization.spec.ts does is what removes them.`
        ).toBeLessThanOrEqual(8);
    });

    it('makes the throwaway profile per launch, not per worker', () => {
        // A worker-scoped fixture would reuse one profile across tests inside a
        // worker, quietly reintroducing the cross-test state sharing this whole
        // mechanism exists to remove.
        const helper = readFileSync(MC_HELPER, 'utf-8');
        expect(helper).toMatch(/createIsolatedUserData\(\)/);
        expect(
            helper,
            'the mcApp fixture must stay test-scoped — a worker-scoped one shares state between tests'
        ).not.toMatch(/scope:\s*'worker'/);
    });

    it('never lets teardown cleanup fail a green test', () => {
        // Windows can hold a lock on the profile briefly after exit. A leaked
        // temp directory is acceptable; a teardown that throws is not, because
        // it skips whatever came after it — and in this suite that means an
        // un-closed Electron keeping the real profile's single-instance lock.
        const isolation = readFileSync(ISOLATION_HELPER, 'utf-8');
        const remove = isolation.slice(isolation.indexOf('export function removeUserData'));
        expect(remove).toMatch(/try\s*\{/);
        expect(remove, 'rmSync must retry — Windows releases the profile lock late').toMatch(/maxRetries/);
    });

    it('restores config.json in every real-profile spec that saves settings', () => {
        // The calendar's half of the shared state. `weekStartDay` is the sharp
        // edge: several calendar specs assert on dates derived from it, so
        // whatever the last run left behind decides whether they pass.
        const SAVE_MARKERS = ['save-settings-button', 'settings:save'];

        const unprotected = all
            .filter(s => NEEDS_REAL_PROFILE.includes(s.name))
            .filter(s => SAVE_MARKERS.some(m => s.source.includes(m)))
            .filter(s => !/restoreConfig\(/.test(s.source))
            .map(s => `  e2e/${s.name}`);

        expect(
            unprotected,
            `Real-profile spec(s) save settings without restoring config.json.\n\n` +
            `Preferred fix: isolate the launch. If the spec needs real Google credentials, call\n` +
            `snapshotConfig(app) after launch and restoreConfig(snapshot) in afterEach — AFTER\n` +
            `closing the app (e2e/helpers/appConfig.ts explains why).\n\n${unprotected.join('\n')}`
        ).toEqual([]);
    });

    it('closes the app before restoring config, never the other way round', () => {
        // Restoring first meant any throw from the restore skipped close(), and
        // the orphaned Electron kept the real profile's single-instance lock —
        // so every later spec quit at startup and hung to its 60s timeout. One
        // teardown error turned into a red suite.
        for (const spec of all) {
            if (!/restoreConfig\(/.test(spec.source)) continue;
            const closeAt = spec.source.search(/\w*[Aa]pp\??\.close\(\)/);
            const restoreAt = spec.source.search(/restoreConfig\(/);
            if (closeAt === -1) continue;
            expect(
                closeAt,
                `e2e/${spec.name} calls restoreConfig before closing the app. Close first — an ` +
                `orphaned Electron holds the real profile's single-instance lock and every later ` +
                `spec then times out at firstWindow().`
            ).toBeLessThan(restoreAt);
        }
    });
});
