/**
 * Shared Electron launch helpers for the Mission Control E2E specs.
 *
 * WHY THIS EXISTS
 * ---------------
 * These specs used to run against the developer's real userData directory and
 * write to it: one left `activeMission: 'morning'` with a 60-minute duration
 * behind, so the mission overlay covered the UI for every spec that ran
 * afterwards AND for the next hour of real app usage; another suspended the
 * Knife privilege for a day; another minted a token into the real bank.
 *
 * `mcTest` now gives each launch its own throwaway userData directory (see
 * userDataDir.ts), so there is no real state present to damage and nothing to
 * put back. Mission Control is reachable at `?mc=1` without signing in — the
 * route sits outside the calendar's auth gate in App.tsx — so a fresh profile
 * costs these specs nothing.
 *
 * A fresh profile also means fresh Supabase pairing keys, so a test instance no
 * longer joins the household's real remote-control room.
 *
 * Each test therefore starts from `initialState`, except that launchApp has
 * already marked today's missions as run so the wall clock cannot start one (see
 * missionClock.ts). One visible consequence: with the morning concluded, the
 * quick-game window (`isQuickGameWindowOpen`) is OPEN until the evening start.
 * A spec that tests that gate must seed `lastCompletedOrFailedMorningDate`
 * itself. Seed what the test needs with `patchMCState` / `patchMCCollection` and
 * reload; do not assume anything carries over from a previous test or from the
 * developer's own app.
 */

import { expect } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchApp, test as base } from './launchApp';
import { STORAGE_KEY } from './missionClock';
import { createIsolatedUserData, removeUserData, userDataArg } from './userDataDir';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const ELECTRON_MAIN = path.join(__dirname, '../../dist-electron/main.js');
export { STORAGE_KEY };

/** Navigate the current window into Mission Control mode and let it settle. */
export async function gotoMC(page: Page): Promise<void> {
    // Electron loads a file:/// URL, so navigate relative to the current one
    // rather than constructing an absolute path.
    const base = page.url().split('?')[0];
    await page.goto(`${base}?mc=1`);
    await page.waitForLoadState('domcontentloaded');
    // Deterministic readiness beats a fixed sleep: 2s per launch across a
    // sequential suite was ~1min of dead time, and a hard sleep also hides
    // slow-boot regressions instead of failing on them.
    await page.locator('.mc-root').waitFor({ state: 'visible', timeout: 15_000 });
    // Seeding helpers edit the persisted blob in place; on a fresh profile it
    // only exists after the store's first debounced (500ms) persist. Seeding
    // before that patched an EMPTY blob — missions: [] — and the test then
    // asserted against half-default state. Wait for the real condition.
    await page.waitForFunction(
        (key: string) => localStorage.getItem(key) !== null,
        STORAGE_KEY,
        { timeout: 15_000 },
    );
}

/**
 * Launch Electron against an isolated profile and return the first window,
 * already in MC mode. The caller owns `userDataDir` and must remove it after
 * closing the app — `mcTest` does both.
 */
export async function launchMC(userDataDir: string): Promise<{ app: ElectronApplication; page: Page }> {
    const app = await launchApp({
        args: [ELECTRON_MAIN, userDataArg(userDataDir)],
        timeout: 60_000,
        env: { ...process.env, NODE_ENV: 'development' },
    });
    try {
        const page = await app.firstWindow();
        await page.waitForLoadState('domcontentloaded');
        await gotoMC(page);
        return { app, page };
    } catch (err) {
        // A rejection after a successful launch must not orphan the live
        // process: the caller never receives `app`, so its finally-block
        // close() is a no-op and the throwaway profile stays locked (EBUSY)
        // — the exact leak the fixture exists to prevent.
        await app.close().catch(() => { /* already dead is fine */ });
        throw err;
    }
}

/**
 * Read one top-level field out of the persisted blob. Sugar over the
 * `page.evaluate` boilerplate the specs repeat.
 */
export async function readMCField<T = unknown>(page: Page, field: string): Promise<T | null> {
    return page.evaluate(
        ({ key, name }: { key: string; name: string }) => {
            const raw = localStorage.getItem(key);
            if (!raw) return null;
            return (JSON.parse(raw) as Record<string, unknown>)[name] ?? null;
        },
        { key: STORAGE_KEY, name: field },
    ) as Promise<T | null>;
}

/** Merge a partial state into the persisted blob without disturbing the rest. */
export async function patchMCState(page: Page, patch: Record<string, unknown>): Promise<void> {
    await page.evaluate(
        ({ key, value }: { key: string; value: Record<string, unknown> }) => {
            const raw = localStorage.getItem(key);
            const state = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
            localStorage.setItem(key, JSON.stringify({ ...state, ...value }));
        },
        { key: STORAGE_KEY, value: patch },
    );
}

/**
 * Rewrite the entries of one array-valued top-level field, patching only the
 * rows whose `id` matches. Covers responsibilities, privileges and cases, which
 * every MC spec seeds the same way.
 */
export async function patchMCCollection(
    page: Page,
    field: 'responsibilities' | 'privileges' | 'cases',
    id: string | number,
    patch: Record<string, unknown>,
): Promise<void> {
    const matched = await page.evaluate(
        ({ key, name, rowId, value }: { key: string; name: string; rowId: string | number; value: Record<string, unknown> }) => {
            const raw = localStorage.getItem(key);
            const state = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
            const rows = (state[name] ?? []) as Array<Record<string, unknown>>;
            // Compared as strings on purpose: responsibility and privilege ids
            // are strings, but DisplayCase.id is a NUMBER, so a strict `===`
            // against a string parameter silently matched nothing and the seed
            // was dropped without a word — the test then asserted against
            // unseeded default state.
            let hits = 0;
            state[name] = rows.map(r => {
                if (String(r['id']) !== String(rowId)) return r;
                hits++;
                return { ...r, ...value };
            });
            localStorage.setItem(key, JSON.stringify(state));
            return hits;
        },
        { key: STORAGE_KEY, name: field, rowId: id, value: patch },
    );

    // Seeding nothing is never what the caller meant, and silence here is how a
    // mis-typed id turns into a confusing assertion failure three lines later.
    if (matched === 0) {
        throw new Error(`patchMCCollection: no row with id "${id}" in "${field}" — nothing was seeded`);
    }
}

/**
 * `test` for Mission Control specs: launches the app in MC mode against a
 * throwaway userData directory and removes it afterwards, pass or fail.
 *
 * Usage: `mcTest('...', async ({ mcPage: page }) => { ... })` — do NOT call
 * `app.close()` in the body, the fixture owns the lifecycle.
 */
export const mcTest = base.extend<{ mcApp: ElectronApplication; mcPage: Page }>({
    // eslint-disable-next-line no-empty-pattern
    mcApp: async ({}, use) => {
        const userDataDir = createIsolatedUserData();

        // Everything after the directory exists goes inside the try, INCLUDING
        // the launch. `launchMC` can fail three ways — electron.launch timing
        // out, a stale dist-electron build, gotoMC's navigation timing out —
        // and each of those happens after the profile is on disk. Creating it
        // outside the try leaked a full Chromium profile, and a live Electron
        // process, on every failed launch.
        let app: ElectronApplication | undefined;
        try {
            ({ app } = await launchMC(userDataDir));
            await use(app);
        } finally {
            // Nested, so a rejecting close() cannot skip the removal. close()
            // rejects when the app already died or hangs — exactly the runs
            // that leaked before.
            try {
                await app?.close();
            } finally {
                removeUserData(userDataDir);
            }
        }
    },

    mcPage: async ({ mcApp }, use) => {
        await use(await mcApp.firstWindow());
    },
});

export { expect };
