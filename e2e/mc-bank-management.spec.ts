/**
 * Mission Control — Bank Management E2E Tests
 *
 * Smoke-tests the GlobalBank admin popup:
 * open the popup, add/remove coins, and close.
 *
 * State handling: `mcTest` snapshots and restores the real `mc-state-v5` blob
 * around each test. The "+1" test mints a real token into the real bank — the
 * kind of unexplained balance change that is very hard to account for later.
 */

import { existsSync } from 'node:fs';
import { ELECTRON_MAIN, expect, isLoginScreen, mcTest as test } from './helpers/mcApp';

test.describe('Mission Control — Bank Management', () => {
    test.skip(!existsSync(ELECTRON_MAIN), 'Electron build not present');

    test('bank popup can be opened by clicking The Bank header', async ({ mcPage: page }) => {
        test.skip(await isLoginScreen(page), 'Login required');

        // The bank header button
        const bankHeader = page.getByRole('button', { name: /Bank admin/i });
        await expect(bankHeader).toBeVisible({ timeout: 5000 });

        // Admin popup should initially be hidden
        await expect(page.getByText(/Bank Admin/i)).not.toBeVisible();

        // Open
        await bankHeader.click();
        await expect(page.getByText(/Bank Admin/i)).toBeVisible({ timeout: 2000 });
    });

    test('bank popup shows +1, +2, −1 coin control buttons', async ({ mcPage: page }) => {
        test.skip(await isLoginScreen(page), 'Login required');

        await page.getByRole('button', { name: /Bank admin/i }).click();
        const popup = page.locator('[data-testid="mc-bank-admin-popup"]');
        await expect(popup.getByRole('button', { name: '+1' })).toBeVisible({ timeout: 2000 });
        await expect(popup.getByRole('button', { name: '+2' })).toBeVisible();
        await expect(popup.getByRole('button', { name: '−1' })).toBeVisible();
    });

    test('clicking +1 increments the bank count display', async ({ mcPage: page }) => {
        test.skip(await isLoginScreen(page), 'Login required');

        // Get initial count (the badge inside the header)
        const bankHeader = page.getByRole('button', { name: /Bank admin/i });

        // Long press to open the real admin popup (bypass trapMode)
        await bankHeader.dispatchEvent('pointerdown');
        await page.waitForTimeout(700);
        await bankHeader.dispatchEvent('pointerup');

        // Read current count from the badge (visible in the header)
        const countBadge = bankHeader.locator('div').last();
        const initialText = await countBadge.textContent();
        const initialCount = parseInt(initialText ?? '0', 10);

        // Click +1
        await page.locator('[data-testid="mc-bank-admin-popup"]').getByRole('button', { name: '+1' }).click();
        await page.waitForTimeout(300);

        const newText = await countBadge.textContent();
        const newCount = parseInt(newText ?? '0', 10);
        expect(newCount).toBe(initialCount + 1);
    });

    test('bank popup can be closed with the close button', async ({ mcPage: page }) => {
        test.skip(await isLoginScreen(page), 'Login required');

        await page.getByRole('button', { name: /Bank admin/i }).click();
        await expect(page.getByText(/Bank Admin/i)).toBeVisible({ timeout: 2000 });

        // Close
        await page.getByText(/close/i).click();
        await page.waitForTimeout(300);
        await expect(page.getByText(/Bank Admin/i)).not.toBeVisible();
    });
});
