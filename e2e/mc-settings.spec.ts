/**
 * Mission Control — Settings E2E Tests
 *
 * Smoke-tests the MCSettingsOverlay:
 * open via the ⚙️ button, change a time, save, and verify persistence.
 *
 * State handling: `mcTest` snapshots and restores the real `mc-state-v5` blob
 * around each test. The save test genuinely rewrites `morningStartsAt` to 07:15
 * — without the restore, running the suite silently moves the parent's real
 * morning mission time.
 */

import { existsSync } from 'node:fs';
import type { Page } from '@playwright/test';
import {
    ELECTRON_MAIN,
    expect,
    isLoginScreen,
    mcTest as test,
    readMCField,
} from './helpers/mcApp';

/** Read one field out of the persisted `settings` object. */
async function readSetting(page: Page, name: string): Promise<unknown> {
    const settings = await readMCField<Record<string, unknown>>(page, 'settings');
    return settings?.[name] ?? null;
}

test.describe('Mission Control — Settings Overlay', () => {
    test.skip(!existsSync(ELECTRON_MAIN), 'Electron build not present');

    test('settings panel opens via the ⚙️ button', async ({ mcPage: page }) => {
        test.skip(await isLoginScreen(page), 'Login required');

        // Gear button in the MC top bar
        const settingsBtn = page.locator('[data-testid="mc-settings-btn"]');
        await expect(settingsBtn).toBeVisible({ timeout: 5000 });

        // Open
        await settingsBtn.click();
        await expect(page.locator('[data-testid="mc-settings-save"]')).toBeVisible({ timeout: 2000 });
    });

    test('settings panel shows Morning and Evening Mission sections', async ({ mcPage: page }) => {
        test.skip(await isLoginScreen(page), 'Login required');

        await page.locator('[data-testid="mc-settings-btn"]').click();

        await expect(page.getByText('Morning Mission')).toBeVisible({ timeout: 2000 });
        await expect(page.getByText('Evening Mission')).toBeVisible();
    });

    test('settings panel can be cancelled — store unchanged', async ({ mcPage: page }) => {
        test.skip(await isLoginScreen(page), 'Login required');

        // Read the initial stored settings
        const before = await readSetting(page, 'morningStartsAt');

        // Open settings
        await page.locator('[data-testid="mc-settings-btn"]').click();
        await page.waitForTimeout(200);

        // Cancel without saving
        await page.getByText(/Cancel/i).click();
        await page.waitForTimeout(300);

        // Settings panel should be gone
        await expect(page.getByText('Morning Mission')).not.toBeVisible();

        // Store should be unchanged
        expect(await readSetting(page, 'morningStartsAt')).toBe(before);
    });

    test('Save Settings button persists changes to localStorage', async ({ mcPage: page }) => {
        test.skip(await isLoginScreen(page), 'Login required');

        // Open settings
        await page.locator('[data-testid="mc-settings-btn"]').click();
        await page.waitForTimeout(200);

        // Find the morning time input and change it
        const timeInputs = page.locator('input[type="time"]');
        await expect(timeInputs.first()).toBeVisible({ timeout: 3000 });
        await timeInputs.first().fill('07:15');

        // Save
        await page.getByTestId('mc-settings-save').click();
        await page.waitForTimeout(500);

        // Panel must close
        await expect(page.getByText('Morning Mission')).not.toBeVisible();

        // localStorage must reflect the new value
        expect(await readSetting(page, 'morningStartsAt')).toBe('07:15');
    });
});
