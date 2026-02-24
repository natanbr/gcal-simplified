/**
 * Mission Control E2E Tests
 *
 * Tests the Mission Overlay and Scheduler features.
 * Launches the Electron app, navigates to ?mc=1, then
 * injects localStorage state to trigger mission overlays
 * without waiting for real clock windows.
 */

import { test, expect, _electron as electron } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Page } from '@playwright/test';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ELECTRON_MAIN = path.join(__dirname, '../dist-electron/main.js');
const STORAGE_KEY = 'mc-state-v2';

/**
 * Helper: Navigate the Electron window to MC mode and wait for it to settle.
 */
async function gotoMC(page: Page): Promise<void> {
    // Use goto with a hash to navigate within the same Electron session.
    // Electron loads file:/// so we need to grab the current URL and append ?mc=1.
    const currentUrl = page.url();
    const base = currentUrl.split('?')[0];
    await page.goto(`${base}?mc=1`);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(2000);
}

/**
 * Helper: Inject a morning mission active state into localStorage.
 * Sets the mission time window to surround the current real time so
 * useMissionScheduler confirms it active on its first tick.
 */
async function injectActiveMission(page: Page, phase: 'morning' | 'evening' = 'morning'): Promise<void> {
    await page.evaluate(
        ({ key, targetPhase }: { key: string; targetPhase: string }) => {
            const raw = localStorage.getItem(key);
            const state = raw ? JSON.parse(raw) as Record<string, unknown> : {};

            // ±1-hour window around the current real time
            const now = new Date();
            const pad = (n: number) => String(n).padStart(2, '0');
            const startH = new Date(now.getTime() - 60 * 60 * 1000);
            const endH = new Date(now.getTime() + 60 * 60 * 1000);
            const startsAt = `${pad(startH.getHours())}:${pad(startH.getMinutes())}`;
            const endsAt = `${pad(endH.getHours())}:${pad(endH.getMinutes())}`;

            state['activeMission'] = targetPhase;

            interface MissionRecord {
                phase: string;
                active: boolean;
                startsAt: string;
                endsAt: string;
                tasks: Array<Record<string, unknown>>;
            }

            const missions = (state['missions'] ?? []) as MissionRecord[];
            state['missions'] = missions.map(m =>
                m.phase === targetPhase
                    ? { ...m, active: true, startsAt, endsAt, tasks: m.tasks.map(t => ({ ...t, completed: false, locked: false })) }
                    : { ...m, active: false },
            );

            localStorage.setItem(key, JSON.stringify(state));
        },
        { key: STORAGE_KEY, targetPhase: phase },
    );
}

// ── Tests ──────────────────────────────────────────────────────────────────────

test.describe('Mission Control', () => {

    test('live clock is visible and formatted correctly', async () => {
        const app = await electron.launch({
            args: [ELECTRON_MAIN],
            timeout: 60_000,
            env: { ...process.env, NODE_ENV: 'development' },
        });
        const page = await app.firstWindow();
        await page.waitForLoadState('domcontentloaded');

        await gotoMC(page);

        const clock = page.locator('[data-testid="mc-clock"]');
        await expect(clock).toBeVisible({ timeout: 10_000 });

        const text = (await clock.textContent()) ?? '';
        // Matches "10:34" or "10:34 AM" formats
        expect(text.trim()).toMatch(/^\d{1,2}:\d{2}/);

        await app.close();
    });

    test('mission overlay slides in when mission is activated', async () => {
        const app = await electron.launch({
            args: [ELECTRON_MAIN],
            timeout: 60_000,
            env: { ...process.env, NODE_ENV: 'development' },
        });
        const page = await app.firstWindow();
        await page.waitForLoadState('domcontentloaded');

        // First navigate to MC so localStorage is in the right origin
        await gotoMC(page);

        // Inject state then reload so the store picks it up fresh
        await injectActiveMission(page, 'morning');
        await page.reload();
        await page.waitForLoadState('domcontentloaded');
        await page.waitForTimeout(2500);

        // Overlay should be visible
        const overlay = page.locator('[data-testid="mc-mission-overlay"]');
        await expect(overlay).toBeVisible({ timeout: 10_000 });

        // Title should read "Morning Mission"
        const title = page.locator('[data-testid="mc-mission-title"]');
        await expect(title).toHaveText('Morning Mission', { timeout: 5000 });

        // Progress bar present
        await expect(page.locator('[data-testid="mc-progress-bar"]')).toBeVisible();

        // At least one task card
        const taskCards = page.locator('[data-testid^="mc-task-card-"]');
        expect(await taskCards.count()).toBeGreaterThan(0);

        await app.close();
    });

    test('tapping a task card marks it complete', async () => {
        const app = await electron.launch({
            args: [ELECTRON_MAIN],
            timeout: 60_000,
            env: { ...process.env, NODE_ENV: 'development' },
        });
        const page = await app.firstWindow();
        await page.waitForLoadState('domcontentloaded');

        await gotoMC(page);
        await injectActiveMission(page, 'morning');
        await page.reload();
        await page.waitForLoadState('domcontentloaded');
        await page.waitForTimeout(2500);

        const overlay = page.locator('[data-testid="mc-mission-overlay"]');
        await expect(overlay).toBeVisible({ timeout: 10_000 });

        // Click the first incomplete task card
        const firstCard = page.locator('[data-testid^="mc-task-card-"]').first();
        await firstCard.click();

        // Allow completion flash animation to finish
        await page.waitForTimeout(800);

        // After completion the label span should have line-through decoration
        const labelDecoration = await firstCard.locator('span').nth(1).evaluate(
            (el: Element) => (el as HTMLElement).style.textDecoration,
        );
        expect(labelDecoration).toContain('line-through');

        await app.close();
    });

    test('minimize button hides overlay and pill appears', async () => {
        const app = await electron.launch({
            args: [ELECTRON_MAIN],
            timeout: 60_000,
            env: { ...process.env, NODE_ENV: 'development' },
        });
        const page = await app.firstWindow();
        await page.waitForLoadState('domcontentloaded');

        await gotoMC(page);
        await injectActiveMission(page, 'morning');
        await page.reload();
        await page.waitForLoadState('domcontentloaded');
        await page.waitForTimeout(2500);

        const overlay = page.locator('[data-testid="mc-mission-overlay"]');
        await expect(overlay).toBeVisible({ timeout: 10_000 });

        // Minimize
        await page.locator('[data-testid="mc-minimize-btn"]').click();
        await expect(overlay).not.toBeVisible({ timeout: 5000 });

        // Pill should appear
        const pill = page.locator('[data-testid="mc-mission-pill"]');
        await expect(pill).toBeVisible({ timeout: 5000 });

        // Click pill re-opens overlay
        await pill.click();
        await expect(overlay).toBeVisible({ timeout: 5000 });

        await app.close();
    });

    test('Use! button permanently removes tokens from bank (CONSUME_CASE)', async () => {
        const app = await electron.launch({
            args: [ELECTRON_MAIN],
            timeout: 60_000,
            env: { ...process.env, NODE_ENV: 'development' },
        });
        const page = await app.firstWindow();
        await page.waitForLoadState('domcontentloaded');
        await gotoMC(page);

        // Set up state: 5 bank tokens, first case fully filled (tokenCount == targetCount == 2)
        // so the 'Use!' button is shown instead of 'All'
        await page.evaluate(({ key }: { key: string }) => {
            const STORAGE_KEY = key;
            const raw = localStorage.getItem(STORAGE_KEY);
            const state = raw ? JSON.parse(raw) as Record<string, unknown> : {};

            state['bankCount'] = 5;
            state['cases'] = [
                { id: 0, status: 'active', reward: 'show', tokenCount: 2, targetCount: 2 },
                { id: 1, status: 'empty', reward: null, tokenCount: 0, targetCount: 5 },
                { id: 2, status: 'empty', reward: null, tokenCount: 0, targetCount: 5 },
            ];
            localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        }, { key: STORAGE_KEY });

        // Reload so the injected state is picked up
        await gotoMC(page);
        await page.waitForTimeout(1500);

        // Click the Use! button on the completed goal
        const useBtn = page.locator('[aria-label="Use this reward"]').first();
        await expect(useBtn).toBeVisible({ timeout: 8_000 });
        await useBtn.click();
        await page.waitForTimeout(800);

        // Case should be reset to empty (Use! button gone)
        await expect(useBtn).not.toBeVisible({ timeout: 5_000 });

        // Bank count must STILL be 5 — tokens were consumed, not refunded
        const bankCount = await page.evaluate(({ key }: { key: string }) => {
            const raw = localStorage.getItem(key);
            if (!raw) return null;
            const state = JSON.parse(raw) as Record<string, unknown>;
            return state['bankCount'];
        }, { key: STORAGE_KEY });

        expect(bankCount).toBe(5); // unchanged — tokens permanently spent

        await app.close();
    });

});
