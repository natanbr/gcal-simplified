/**
 * Snapshot / restore for the calendar app's `config.json`.
 *
 * The second shared-state vector in this suite. `mc-state-v5` (see mcApp.ts) is
 * Mission Control's; this is the calendar's — theme mode, sleep schedule,
 * selected calendars, `weekStartDay`, and the remote-control pairing keys, all
 * in one electron-store file in the same real userData directory.
 *
 * settings-power.spec.ts opens Settings, switches the theme to Manual and hits
 * Save. That is a real write to the real file, and it is why the developer's
 * config has sat on `themeMode: "manual"` — nothing ever put it back.
 *
 * `weekStartDay` is the sharpest edge: several calendar specs assert on dates
 * derived from it, so whatever the last run left behind decides whether they
 * pass. That is the mechanism behind "the E2E suite is non-deterministic".
 *
 * The main process is asked only for the userData PATH; the file itself is read
 * and written from the Playwright process. Two reasons: `app.evaluate` runs its
 * callback through eval, where dynamic `import()` throws ("A dynamic import
 * callback was not specified"), and the file has to be readable after the app
 * has closed. Going through IPC would be worse still — specs mock
 * `settings:get` / `settings:save`, so a snapshot taken that way would capture
 * the mock rather than the file.
 */

import type { ElectronApplication } from '@playwright/test';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/** Raw file contents. `null` means config.json did not exist. */
export type ConfigSnapshot = { file: string; contents: string | null };

async function configPath(app: ElectronApplication): Promise<string> {
    const userData = await app.evaluate(({ app: electronApp }) => electronApp.getPath('userData'));
    return join(userData, 'config.json');
}

export async function snapshotConfig(app: ElectronApplication): Promise<ConfigSnapshot> {
    const file = await configPath(app);
    return { file, contents: existsSync(file) ? readFileSync(file, 'utf-8') : null };
}

/**
 * Put the file back exactly as it was. As with the MC blob, absence is a state:
 * a missing config.json means "defaults", and writing "null" over it would not
 * be the same thing.
 *
 * Takes no `ElectronApplication` on purpose. It used to, purely for symmetry
 * with `snapshotConfig` — it never read the handle, the path travels inside the
 * snapshot — and that dead parameter is what made callers restore while the app
 * was still running, racing electron-store (which rewrites the whole file from
 * its in-memory copy on any `set`). CLOSE THE APP FIRST, then call this: after
 * the process is gone nothing can write, and no settle-sleep is needed.
 *
 * Never throws. A teardown that throws skips whatever came after it, and in
 * this suite that means an un-closed Electron keeping the single-instance lock
 * on the real profile — which makes every later spec time out at
 * `firstWindow()`. One failed restore must not cascade into a red suite.
 */
export function restoreConfig(snapshot: ConfigSnapshot | undefined): void {
    // `undefined` when the matching snapshotConfig failed in beforeEach. That
    // is a real path: app.evaluate rejects if the app is already quitting (for
    // instance because the developer has the real app open and it lost the
    // single-instance lock).
    if (!snapshot) {
        console.warn('[e2e] no config snapshot to restore — snapshotConfig did not complete');
        return;
    }

    const { file, contents } = snapshot;
    try {
        if (contents === null) {
            // `force` covers the TOCTOU gap between the old existsSync and the
            // delete; the retries cover Windows still holding the file open.
            rmSync(file, { force: true, maxRetries: 5, retryDelay: 200 });
        } else {
            writeFileSync(file, contents, 'utf-8');
        }
    } catch (err) {
        console.warn(`[e2e] could not restore ${file}:`, err);
    }
}
