import { test, expect, _electron as electron } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test.describe('Settings - Display & Power', () => {
    test('should allow configuring display and power settings', async () => {
        const electronApp = await electron.launch({
            args: [path.join(__dirname, '../dist-electron/main.js')],
            timeout: 60000,
            env: { ...process.env, NODE_ENV: 'development' }
        });

        const window = await electronApp.firstWindow();
        await window.waitForLoadState('domcontentloaded');

        // Wait for app stability
        await window.waitForTimeout(3000);

        // Check for Login Screen - skip if present
        if (await window.locator('[data-testid="login-button"]').isVisible()) {
            console.log('Skipping Settings test - Login required');
            await electronApp.close();
            return;
        }

        // Open Settings
        const settingsButton = window.locator('[data-testid="settings-button"]');
        await expect(settingsButton).toBeVisible();
        await settingsButton.click();

        // Check for Display & Power Section
        // We use the ID for the Configuration title to ensure modal is open
        await expect(window.locator('[data-testid="settings-modal-title"]')).toBeVisible();

        // Wait for settings data to load (loading overlay to disappear)
        await window.waitForTimeout(2000);

        // Settings are categorized. Display & Power is in the general tab.
        await window.getByText('General', { exact: true }).click();

        // Verify Sleep Schedule Section presence
        await expect(window.locator('[data-testid="sleep-schedule-section"]')).toBeVisible();

        // Check Theme Mode buttons
        await expect(window.locator('[data-testid="theme-auto-button"]')).toBeVisible();
        await expect(window.locator('[data-testid="theme-manual-button"]')).toBeVisible();

        // Check Sleep Schedule inputs
        await expect(window.locator('[data-testid="sleep-start-input"]')).toBeVisible();
        await expect(window.locator('[data-testid="sleep-end-input"]')).toBeVisible();

        // Toggle Theme to Manual
        await window.locator('[data-testid="theme-manual-button"]').click();

        // Verify Day Start/End inputs appear
        await expect(window.locator('[data-testid="manual-day-start-input"]')).toBeVisible();
        await expect(window.locator('[data-testid="manual-day-end-input"]')).toBeVisible();

        // Save
        await window.locator('[data-testid="save-settings-button"]').click();

        // Modal should close
        await expect(window.locator('[data-testid="settings-modal-title"]')).not.toBeVisible();

        await electronApp.close();
    });
});
