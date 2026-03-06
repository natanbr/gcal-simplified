/**
 * Mission Control E2E — Responsibility & Privilege flows
 *
 * Tests the responsibility progress tracking, completion, and claim flow,
 * as well as the privilege suspend / reinstate flow.
 * Launches the Electron app in ?mc=1 mode and injects localStorage state.
 */

import { test, expect, _electron as electron } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Page } from '@playwright/test';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ELECTRON_MAIN = path.join(__dirname, '../dist-electron/main.js');
const STORAGE_KEY = 'mc-state-v2';

// ── Shared helpers ────────────────────────────────────────────────────────────

async function gotoMC(page: Page): Promise<void> {
    const currentUrl = page.url();
    const base = currentUrl.split('?')[0];
    await page.goto(`${base}?mc=1`);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(2000);
}

/**
 * Launch Electron, navigate to MC and return the page.
 * Caller is responsible for closing the app.
 */
async function launchMC() {
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

// ── Responsibility tests ──────────────────────────────────────────────────────

test.describe('Mission Control — Responsibility panel', () => {

    test('Recycling task displays correct initial progress', async () => {
        const { app, page } = await launchMC();

        // Ensure recycling card is visible and shows its starting state
        const recyclingHeader = page.locator('text=Recycling');
        await expect(recyclingHeader).toBeVisible({ timeout: 10_000 });

        // Initial progress label should be 0 / 3
        const progressLabel = page.locator('text=0 / 3 completed').first();
        await expect(progressLabel).toBeVisible({ timeout: 5000 });

        await app.close();
    });

    test('+1 point button increments recycling progress', async () => {
        const { app, page } = await launchMC();

        // Reset state to fresh (0 points) via localStorage, then reload
        await page.evaluate(({ key }: { key: string }) => {
            const raw = localStorage.getItem(key);
            const state = raw ? JSON.parse(raw) as Record<string, unknown> : {};
            const responsibilities = (state['responsibilities'] ?? []) as Array<Record<string, unknown>>;
            state['responsibilities'] = responsibilities.map((r) =>
                r['id'] === 'recycling' ? { ...r, pointsEarned: 0, completedAt: null } : r,
            );
            localStorage.setItem(key, JSON.stringify(state));
        }, { key: STORAGE_KEY });

        await gotoMC(page);

        // Click the +1 button for recycling
        const addBtn = page.locator('[data-testid="mc-responsibility-add-recycling"]');
        await expect(addBtn).toBeVisible({ timeout: 10_000 });
        await addBtn.click();
        await page.waitForTimeout(500);

        // Progress should now read 1 / 3
        await expect(page.locator('text=1 / 3 completed')).toBeVisible({ timeout: 5000 });

        await app.close();
    });

    test('Completing recycling (3 points) shows DONE badge and Claim button', async () => {
        const { app, page } = await launchMC();

        // Seed state: recycling at 2 points so one tap completes it
        await page.evaluate(({ key }: { key: string }) => {
            const raw = localStorage.getItem(key);
            const state = raw ? JSON.parse(raw) as Record<string, unknown> : {};
            const responsibilities = (state['responsibilities'] ?? []) as Array<Record<string, unknown>>;
            state['responsibilities'] = responsibilities.map((r) =>
                r['id'] === 'recycling' ? { ...r, pointsEarned: 2, completedAt: null } : r,
            );
            localStorage.setItem(key, JSON.stringify(state));
        }, { key: STORAGE_KEY });

        await gotoMC(page);

        // Tap the +1 button to push it to 3
        const addBtn = page.locator('[data-testid="mc-responsibility-add-recycling"]');
        await expect(addBtn).toBeVisible({ timeout: 10_000 });
        await addBtn.click();
        await page.waitForTimeout(600);

        // DONE badge should appear
        await expect(page.locator('text=DONE ✓')).toBeVisible({ timeout: 5000 });

        // Claim button should appear
        await expect(page.locator('[data-testid="mc-responsibility-claim-recycling"]')).toBeVisible({ timeout: 5000 });

        await app.close();
    });

    test('Claim & Start Over resets recycling to 0 points', async () => {
        const { app, page } = await launchMC();

        // Seed state: recycling fully completed
        await page.evaluate(({ key }: { key: string }) => {
            const raw = localStorage.getItem(key);
            const state = raw ? JSON.parse(raw) as Record<string, unknown> : {};
            const responsibilities = (state['responsibilities'] ?? []) as Array<Record<string, unknown>>;
            state['responsibilities'] = responsibilities.map((r) =>
                r['id'] === 'recycling'
                    ? { ...r, pointsEarned: 3, completedAt: new Date().toISOString() }
                    : r,
            );
            localStorage.setItem(key, JSON.stringify(state));
        }, { key: STORAGE_KEY });

        await gotoMC(page);

        // Claim button should be visible
        const claimBtn = page.locator('[data-testid="mc-responsibility-claim-recycling"]');
        await expect(claimBtn).toBeVisible({ timeout: 10_000 });
        await claimBtn.click();
        await page.waitForTimeout(600);

        // After claim, progress resets — +1 button returns
        await expect(page.locator('[data-testid="mc-responsibility-add-recycling"]')).toBeVisible({ timeout: 5000 });

        // Claim button is gone
        await expect(claimBtn).not.toBeVisible({ timeout: 5000 });

        await app.close();
    });

    test('Activity task has sport-specific buttons (Skating, Swimming, Karate)', async () => {
        const { app, page } = await launchMC();

        await expect(page.locator('[data-testid="mc-responsibility-activity-activity-skating"]')).toBeVisible({ timeout: 10_000 });
        await expect(page.locator('[data-testid="mc-responsibility-activity-activity-swimming"]')).toBeVisible({ timeout: 5000 });
        await expect(page.locator('[data-testid="mc-responsibility-activity-activity-karate"]')).toBeVisible({ timeout: 5000 });

        await app.close();
    });

});

// ── Privilege suspension tests ────────────────────────────────────────────────

test.describe('Mission Control — Privilege suspension', () => {

    test('privilege cards are visible', async () => {
        const { app, page } = await launchMC();

        // The knife card renders with the 🔪 emoji
        const knifeCard = page.locator('button[title="Knife"]');
        await expect(knifeCard).toBeVisible({ timeout: 10_000 });

        await app.close();
    });

    test('clicking a privilege card opens the suspend popup', async () => {
        const { app, page } = await launchMC();

        const knifeCard = page.locator('button[title="Knife"]');
        await expect(knifeCard).toBeVisible({ timeout: 10_000 });
        await knifeCard.click();
        await page.waitForTimeout(400);

        // The popup header and suspend options should be visible
        await expect(page.locator('text=Suspend for:')).toBeVisible({ timeout: 5000 });
        await expect(page.locator('text=🚫 1 Day')).toBeVisible({ timeout: 5000 });

        await app.close();
    });

    test('suspending a privilege shows the countdown badge', async () => {
        const { app, page } = await launchMC();

        // First reinstate (ensure fresh active state)
        await page.evaluate(({ key }: { key: string }) => {
            const raw = localStorage.getItem(key);
            const state = raw ? JSON.parse(raw) as Record<string, unknown> : {};
            const privs = (state['privileges'] ?? []) as Array<Record<string, unknown>>;
            state['privileges'] = privs.map((p) =>
                p['id'] === 'knife' ? { ...p, status: 'active', suspendedUntil: null } : p,
            );
            localStorage.setItem(key, JSON.stringify(state));
        }, { key: STORAGE_KEY });

        await gotoMC(page);

        const knifeCard = page.locator('button[title="Knife"]');
        await expect(knifeCard).toBeVisible({ timeout: 10_000 });
        await knifeCard.click();
        await page.waitForTimeout(300);

        // Pick 1 Day
        await page.locator('text=🚫 1 Day').click();
        await page.waitForTimeout(500);

        // Popup closed — countdown badge should appear on the card
        await expect(page.locator('text=/\\d+[hd] left/')).toBeVisible({ timeout: 5000 });

        await app.close();
    });

    test('reinstating a suspended privilege removes the countdown badge', async () => {
        const { app, page } = await launchMC();

        // Seed it as already suspended
        await page.evaluate(({ key }: { key: string }) => {
            const raw = localStorage.getItem(key);
            const state = raw ? JSON.parse(raw) as Record<string, unknown> : {};
            const privs = (state['privileges'] ?? []) as Array<Record<string, unknown>>;
            state['privileges'] = privs.map((p) =>
                p['id'] === 'knife'
                    ? { ...p, status: 'suspended', suspendedUntil: new Date(Date.now() + 24 * 3600 * 1000).toISOString() }
                    : p,
            );
            localStorage.setItem(key, JSON.stringify(state));
        }, { key: STORAGE_KEY });

        await gotoMC(page);

        // Countdown badge visible
        await expect(page.locator('text=/\\d+[hd] left/')).toBeVisible({ timeout: 10_000 });

        // Open popup and reinstate
        const knifeCard = page.locator('button[title="Knife"]');
        await knifeCard.click();
        await page.waitForTimeout(300);
        await page.locator('text=✅ Reinstate').click();
        await page.waitForTimeout(500);

        // Countdown badge gone
        await expect(page.locator('text=/\\d+[hd] left/')).not.toBeVisible({ timeout: 5000 });

        await app.close();
    });

});
