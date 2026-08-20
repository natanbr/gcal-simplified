/**
 * Shared Electron launch + state-isolation helpers for the Mission Control E2E specs.
 *
 * WHY THIS EXISTS
 * ---------------
 * Every Electron instance in this suite shares ONE userData directory — the real
 * one, belonging to the developer running the tests. That directory holds the
 * `mc-state-v5` localStorage blob the app actually lives in.
 *
 * The specs used to inject mission / privilege / bank state into it and never
 * put it back. A spec that activated a morning mission left
 * `activeMission: 'morning'` with a 60-minute duration behind, so the mission
 * overlay covered the UI for every spec that ran afterwards AND for the next
 * hour of real app usage. Another suspended the Knife privilege for a day.
 *
 * `mcTest` closes that: it snapshots the blob before the test can touch it and
 * restores it verbatim afterwards, including when the test fails — which is
 * precisely the case most likely to leave a mission running.
 *
 * This is a containment fix, not the ideal one. The proper fix is a per-launch
 * `userData` directory so the suite never sees real state at all; that needs a
 * seeded auth fixture for the calendar specs first. See docs/test-coverage-plan.md.
 */

import { test as base, _electron as electron, expect } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const ELECTRON_MAIN = path.join(__dirname, '../../dist-electron/main.js');
export const STORAGE_KEY = 'mc-state-v5';

/**
 * The renderer's persist effect is debounced at 500ms. Teardown has to outwait
 * it: a restore written while a debounce is still pending gets clobbered the
 * moment that debounce fires, which would silently defeat the whole mechanism.
 */
const PERSIST_DEBOUNCE_SETTLE_MS = 600;

/** A snapshot of the MC blob. `null` means the key did not exist. */
export type MCSnapshot = string | null;

/** Navigate the current window into Mission Control mode and let it settle. */
export async function gotoMC(page: Page): Promise<void> {
    // Electron loads a file:/// URL, so navigate relative to the current one
    // rather than constructing an absolute path.
    const base = page.url().split('?')[0];
    await page.goto(`${base}?mc=1`);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(2000);
}

/** Launch Electron and return the first window, already in MC mode. */
export async function launchMC(): Promise<{ app: ElectronApplication; page: Page }> {
    const app = await electron.launch({
        args: [ELECTRON_MAIN],
        timeout: 60_000,
        env: { ...process.env, NODE_ENV: 'development' },
    });
    const page = await app.firstWindow();
    await page.waitForLoadState('domcontentloaded');
    await gotoMC(page);
    return { app, page };
}

/** Read the MC blob exactly as stored, before the test mutates anything. */
export async function snapshotMCState(page: Page): Promise<MCSnapshot> {
    return page.evaluate((key: string) => localStorage.getItem(key), STORAGE_KEY);
}

/**
 * Put the developer's real state back. Absence is a state too — if the key did
 * not exist at snapshot time, restoring must REMOVE it, not write the string
 * "null" (which `JSON.parse` would happily turn into a null state object).
 */
export async function restoreMCState(page: Page, snapshot: MCSnapshot): Promise<void> {
    await page.waitForTimeout(PERSIST_DEBOUNCE_SETTLE_MS);
    await page.evaluate(
        ({ key, value }: { key: string; value: string | null }) => {
            if (value === null) localStorage.removeItem(key);
            else localStorage.setItem(key, value);
        },
        { key: STORAGE_KEY, value: snapshot },
    );
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
    id: string,
    patch: Record<string, unknown>,
): Promise<void> {
    await page.evaluate(
        ({ key, name, rowId, value }: { key: string; name: string; rowId: string; value: Record<string, unknown> }) => {
            const raw = localStorage.getItem(key);
            const state = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
            const rows = (state[name] ?? []) as Array<Record<string, unknown>>;
            state[name] = rows.map(r => (r['id'] === rowId ? { ...r, ...value } : r));
            localStorage.setItem(key, JSON.stringify(state));
        },
        { key: STORAGE_KEY, name: field, rowId: id, value: patch },
    );
}

/** True when the app is sitting on the Google login screen. */
export async function isLoginScreen(page: Page): Promise<boolean> {
    return page
        .locator('[data-testid="login-screen"]')
        .isVisible()
        .catch(() => false);
}

/**
 * `test` for Mission Control specs: launches the app in MC mode and guarantees
 * the developer's real state is put back, pass or fail.
 *
 * Usage: `mcTest('...', async ({ mcPage: page }) => { ... })` — do NOT call
 * `app.close()` in the body, the fixture owns the lifecycle.
 */
export const mcTest = base.extend<{ mcApp: ElectronApplication; mcPage: Page }>({
    // eslint-disable-next-line no-empty-pattern
    mcApp: async ({}, use) => {
        const { app, page } = await launchMC();
        const snapshot = await snapshotMCState(page);

        await use(app);

        if (!page.isClosed()) await restoreMCState(page, snapshot);
        await app.close();
    },

    mcPage: async ({ mcApp }, use) => {
        await use(await mcApp.firstWindow());
    },
});

export { expect };
