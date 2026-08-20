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

/** The renderer's save round-trip has to land before the file is put back. */
const SAVE_SETTLE_MS = 400;

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
 */
export async function restoreConfig(app: ElectronApplication, snapshot: ConfigSnapshot): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, SAVE_SETTLE_MS));
    const { file, contents } = snapshot;
    if (contents === null) {
        if (existsSync(file)) rmSync(file);
    } else {
        writeFileSync(file, contents, 'utf-8');
    }
}
