/**
 * Monthly View E2E Tests
 *
 * Smoke-tests the monthly calendar view: toggle to monthly,
 * navigate months, verify grid renders, and return to week view.
 */

import { test, expect, _electron as electron } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ELECTRON_MAIN = path.join(__dirname, '../dist-electron/main.js');


test.describe('Monthly View', () => {
    test.skip(!existsSync(ELECTRON_MAIN), 'Electron build not present');


    test('can switch to monthly view and see the grid', async () => {
        const app = await electron.launch({ args: [ELECTRON_MAIN] });
        const page = await app.firstWindow();

        await page.waitForLoadState('domcontentloaded');
        await page.waitForTimeout(2000);

        // Skip if login is required
        const loginVisible = await page.locator('[data-testid="login-screen"]').isVisible().catch(() => false);
        test.skip(loginVisible as boolean, 'Login required — skipping monthly-view test');

        // Find and click the Monthly view toggle button
        const monthlyBtn = page.getByRole('button', { name: /month/i });
        await expect(monthlyBtn).toBeVisible({ timeout: 5000 });
        await monthlyBtn.click();
        await page.waitForTimeout(500);

        // A month grid should now be visible — look for 35 day cells (5 weeks × 7 days)
        const gridCells = page.locator('[data-testid^="month-day-"]');
        const count = await gridCells.count();
        // We expect either 35 or 42 cells depending on implementation
        expect(count).toBeGreaterThanOrEqual(28);

        // Month label should be visible
        const monthLabel = page.locator('[data-testid="month-label"]');
        await expect(monthLabel).toBeVisible({ timeout: 3000 });

        await app.close();
    });

    test('monthly view: navigate to next month and back', async () => {
        const app = await electron.launch({ args: [ELECTRON_MAIN] });
        const page = await app.firstWindow();

        await page.waitForLoadState('domcontentloaded');
        await page.waitForTimeout(2000);

        const loginVisible = await page.locator('[data-testid="login-screen"]').isVisible().catch(() => false);
        test.skip(loginVisible as boolean, 'Login required — skipping monthly-view test');

        // Switch to monthly view
        await page.getByRole('button', { name: /month/i }).click();
        await page.waitForTimeout(500);

        // Capture the current month label
        const monthLabel = page.locator('[data-testid="month-label"]');
        const originalLabel = await monthLabel.textContent();

        // Click next-month button
        const nextBtn = page.locator('[data-testid="month-next-btn"]');
        await expect(nextBtn).toBeVisible({ timeout: 3000 });
        await nextBtn.click();
        await page.waitForTimeout(300);

        // The label must have changed
        const nextLabel = await monthLabel.textContent();
        expect(nextLabel).not.toBe(originalLabel);

        // Click previous-month button to go back
        const prevBtn = page.locator('[data-testid="month-prev-btn"]');
        await prevBtn.click();
        await page.waitForTimeout(300);

        const restoredLabel = await monthLabel.textContent();
        expect(restoredLabel).toBe(originalLabel);

        await app.close();
    });

    test('monthly view: Today button returns to current month', async () => {
        const app = await electron.launch({ args: [ELECTRON_MAIN] });
        const page = await app.firstWindow();

        await page.waitForLoadState('domcontentloaded');
        await page.waitForTimeout(2000);

        const loginVisible = await page.locator('[data-testid="login-screen"]').isVisible().catch(() => false);
        test.skip(loginVisible as boolean, 'Login required');

        await page.getByRole('button', { name: /month/i }).click();
        await page.waitForTimeout(500);

        const monthLabel = page.locator('[data-testid="month-label"]');
        const currentLabel = await monthLabel.textContent();

        // Navigate away (next → next)
        const nextBtn = page.locator('[data-testid="month-next-btn"]');
        await nextBtn.click();
        await nextBtn.click();
        await page.waitForTimeout(300);

        // Today button
        const todayBtn = page.getByRole('button', { name: /today/i });
        await expect(todayBtn).toBeVisible({ timeout: 3000 });
        await todayBtn.click();
        await page.waitForTimeout(300);

        const restoredLabel = await monthLabel.textContent();
        expect(restoredLabel).toBe(currentLabel);

        await app.close();
    });
});
