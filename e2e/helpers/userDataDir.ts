/**
 * Per-launch `userData` isolation for the E2E suite.
 *
 * WHY
 * ---
 * Every Electron instance the suite starts used to share ONE userData
 * directory — the developer's own. That directory is not a detail; it is the
 * app's entire persistent identity:
 *
 *   Local Storage/    the Mission Control store (`mc-state-v5`) — bank tokens,
 *                     game tokens, missions, privileges, the activity log
 *   config.json       theme, sleep schedule, selected calendars, weekStartDay,
 *                     AND the Supabase remote-control room id + pairing key
 *   auth-store.json   the Google OAuth tokens
 *   audit-log.ndjson  the durable parent-facing audit trail
 *
 * So a test run wrote to the real bank, suspended real privileges, moved real
 * mission times, flipped the real theme — and, because the pairing keys live in
 * that same config, every launched instance joined the household's REAL remote
 * control room and broadcast test state to the phone on a 1s debounce. One spec
 * called `localStorage.clear()` outright.
 *
 * HOW
 * ---
 * Electron honours Chromium's `--user-data-dir` switch, so isolation needs no
 * production code change at all: point a launch at a fresh directory and every
 * one of the files above follows it. `remote-bridge` finds no pairing keys
 * there and generates its own, which puts the instance in a room of its own.
 *
 * This is elimination rather than containment: there is no real state present
 * to damage, so nothing has to be put back.
 *
 * WHAT IT COSTS
 * -------------
 * A fresh profile has no Google credentials, so a spec that needs a signed-in
 * calendar cannot use this until it mocks `auth:check` (as
 * week-display-customization.spec.ts does). Those specs stay on the shared
 * directory with snapshot/restore — see appConfig.ts.
 */

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * A private userData directory for one app launch. Pass the returned path to
 * `userDataArg()` and hand it to `removeUserData()` when the app has closed.
 */
export function createIsolatedUserData(): string {
    return mkdtempSync(join(tmpdir(), 'gcal-e2e-'));
}

/** The Chromium switch that redirects everything Electron persists. */
export function userDataArg(dir: string): string {
    return `--user-data-dir=${dir}`;
}

/**
 * Best-effort removal. Windows can hold a lock on the profile for a moment
 * after the process exits, hence the retries — but a leaked directory in the
 * OS temp folder is a far smaller problem than a teardown that throws and
 * fails an otherwise-green test, so failure is swallowed deliberately.
 */
export function removeUserData(dir: string): void {
    try {
        rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    } catch {
        console.warn(`[e2e] could not remove temp userData dir: ${dir}`);
    }
}
