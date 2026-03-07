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
import { format, addMonths } from 'date-fns';

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
        const monthlyBtn = page.locator('[data-testid="monthly-view-toggle"]');
        await expect(monthlyBtn).toBeVisible({ timeout: 5000 });
        await monthlyBtn.click();
        await page.waitForTimeout(500);

        // A month grid should now be visible — look for 35 day cells (5 weeks × 7 days)
        const gridCells = page.locator('[data-testid^="month-day-"]');
        const count = await gridCells.count();
        // We expect either 35 or 42 cells depending on implementation
        expect(count).toBeGreaterThanOrEqual(28);

        // Month label should show current month
        const monthLabel = page.locator('[data-testid="month-label"]');
        await expect(monthLabel).toContainText(format(new Date(), 'MMMM'), { timeout: 3000 });

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
        await page.locator('[data-testid="monthly-view-toggle"]').click();
        await page.waitForTimeout(500);

        const today = new Date();
        const monthLabel = page.locator('[data-testid="month-label"]');

        // Capture the current month label
        const originalMonth = format(today, 'MMMM yyyy');
        await expect(monthLabel).toContainText(originalMonth, { timeout: 3000 });

        // Click next button (reused as next-month in month view)
        await page.locator('[data-testid="next-week-button"]').click();
        await page.waitForTimeout(300);

        // The label must show next month
        const nextMonth = format(addMonths(today, 1), 'MMMM yyyy');
        await expect(monthLabel).toContainText(nextMonth, { timeout: 3000 });

        // Click previous button to go back
        await page.locator('[data-testid="prev-week-button"]').click();
        await page.waitForTimeout(300);

        await expect(monthLabel).toContainText(originalMonth, { timeout: 3000 });

        await app.close();
    });

    test('monthly view: Today button returns to current month', async () => {
        const app = await electron.launch({ args: [ELECTRON_MAIN] });
        const page = await app.firstWindow();

        await page.waitForLoadState('domcontentloaded');
        await page.waitForTimeout(2000);

        const loginVisible = await page.locator('[data-testid="login-screen"]').isVisible().catch(() => false);
        test.skip(loginVisible as boolean, 'Login required');

        await page.locator('[data-testid="monthly-view-toggle"]').click();
        await page.waitForTimeout(500);

        const today = new Date();
        const currentMonthLabel = format(today, 'MMMM yyyy');
        const monthLabel = page.locator('[data-testid="month-label"]');

        // Navigate away (next → next)
        const nextBtn = page.locator('[data-testid="next-week-button"]');
        await nextBtn.click();
        await nextBtn.click();
        await page.waitForTimeout(300);

        // Today button — in month view the button says "Back To Today"
        const todayBtn = page.locator('[data-testid="today-button"]');
        await expect(todayBtn).toBeVisible({ timeout: 3000 });
        await todayBtn.click();
        await page.waitForTimeout(300);

        await expect(monthLabel).toContainText(currentMonthLabel, { timeout: 3000 });

        await app.close();
    });
});
