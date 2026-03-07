/**
 * Mission Control — Bank Management E2E Tests
 *
 * Smoke-tests the GlobalBank admin popup:
 * open the popup, add/remove coins, and close.
 */

import { test, expect, _electron as electron } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import type { Page } from '@playwright/test';


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ELECTRON_MAIN = path.join(__dirname, '../dist-electron/main.js');

async function gotoMC(page: Page): Promise<void> {
    const currentUrl = page.url();
    const base = currentUrl.split('?')[0];
    await page.goto(`${base}?mc=1`);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(2000);
}

test.describe('Mission Control — Bank Management', () => {
    test.skip(!existsSync(ELECTRON_MAIN), 'Electron build not present');


    test('bank popup can be opened by clicking The Bank header', async () => {
        const app = await electron.launch({ args: [ELECTRON_MAIN] });
        const page = await app.firstWindow();

        await page.waitForLoadState('domcontentloaded');
        await page.waitForTimeout(2000);

        const loginVisible = await page.locator('[data-testid="login-screen"]').isVisible().catch(() => false);
        test.skip(loginVisible as boolean, 'Login required');

        await gotoMC(page);

        // The bank header button
        const bankHeader = page.getByRole('button', { name: /Bank admin/i });
        await expect(bankHeader).toBeVisible({ timeout: 5000 });

        // Admin popup should initially be hidden
        await expect(page.getByText(/Bank Admin/i)).not.toBeVisible();

        // Open
        await bankHeader.click();
        await expect(page.getByText(/Bank Admin/i)).toBeVisible({ timeout: 2000 });

        await app.close();
    });

    test('bank popup shows +1, +2, −1 coin control buttons', async () => {
        const app = await electron.launch({ args: [ELECTRON_MAIN] });
        const page = await app.firstWindow();

        await page.waitForLoadState('domcontentloaded');
        await page.waitForTimeout(2000);

        const loginVisible = await page.locator('[data-testid="login-screen"]').isVisible().catch(() => false);
        test.skip(loginVisible as boolean, 'Login required');

        await gotoMC(page);

        await page.getByRole('button', { name: /Bank admin/i }).click();
        await expect(page.getByText('+1')).toBeVisible({ timeout: 2000 });
        await expect(page.getByText('+2')).toBeVisible();
        await expect(page.getByText('−1')).toBeVisible();

        await app.close();
    });

    test('clicking +1 increments the bank count display', async () => {
        const app = await electron.launch({ args: [ELECTRON_MAIN] });
        const page = await app.firstWindow();

        await page.waitForLoadState('domcontentloaded');
        await page.waitForTimeout(2000);

        const loginVisible = await page.locator('[data-testid="login-screen"]').isVisible().catch(() => false);
        test.skip(loginVisible as boolean, 'Login required');

        await gotoMC(page);

        // Get initial count (the badge inside the header)
        const bankHeader = page.getByRole('button', { name: /Bank admin/i });
        await bankHeader.click();

        // Read current count from the badge (visible in the header)
        const countBadge = bankHeader.locator('div').last();
        const initialText = await countBadge.textContent();
        const initialCount = parseInt(initialText ?? '0', 10);

        // Click +1
        await page.getByText('+1').first().click();
        await page.waitForTimeout(300);

        const newText = await countBadge.textContent();
        const newCount = parseInt(newText ?? '0', 10);
        expect(newCount).toBe(initialCount + 1);

        await app.close();
    });

    test('bank popup can be closed with the close button', async () => {
        const app = await electron.launch({ args: [ELECTRON_MAIN] });
        const page = await app.firstWindow();

        await page.waitForLoadState('domcontentloaded');
        await page.waitForTimeout(2000);

        const loginVisible = await page.locator('[data-testid="login-screen"]').isVisible().catch(() => false);
        test.skip(loginVisible as boolean, 'Login required');

        await gotoMC(page);

        await page.getByRole('button', { name: /Bank admin/i }).click();
        await expect(page.getByText(/Bank Admin/i)).toBeVisible({ timeout: 2000 });

        // Close
        await page.getByText(/close/i).click();
        await page.waitForTimeout(300);
        await expect(page.getByText(/Bank Admin/i)).not.toBeVisible();

        await app.close();
    });
});
