/**
 * Settings — Display & Power E2E Test
 *
 * State handling: this spec genuinely saves settings — it switches the theme to
 * Manual and clicks Save, which writes the real `config.json` in the shared
 * userData directory. `themeMode: "manual"` sat in the developer's config for
 * months because of it. The snapshot/restore below puts the file back, pass or
 * fail. See e2e/helpers/appConfig.ts.
 */

import { test, expect, _electron as electron } from '@playwright/test';
import type { ElectronApplication } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { restoreConfig, snapshotConfig, type ConfigSnapshot } from './helpers/appConfig';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test.describe('Settings - Display & Power', () => {
    let electronApp: ElectronApplication;
    let config: ConfigSnapshot;

    test.beforeEach(async () => {
        electronApp = await electron.launch({
            args: [path.join(__dirname, '../dist-electron/main.js')],
            timeout: 60000,
            env: { ...process.env, NODE_ENV: 'development' }
        });
        config = await snapshotConfig(electronApp);
    });

    test.afterEach(async () => {
        // Runs on failure too — a test that dies after Save is exactly the one
        // that would otherwise leave the theme flipped.
        if (electronApp) {
            await restoreConfig(electronApp, config);
            await electronApp.close();
        }
    });

    test('should allow configuring display and power settings', async () => {
        const window = await electronApp.firstWindow();
        await window.waitForLoadState('domcontentloaded');

        // Wait for app stability
        await window.waitForTimeout(3000);

        // Check for Login Screen - skip if present
        if (await window.locator('[data-testid="login-button"]').isVisible()) {
            test.skip(true, 'Login required');
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

        // Save — this writes the real config.json; afterEach puts it back.
        await window.locator('[data-testid="save-settings-button"]').click();

        // Modal should close
        await expect(window.locator('[data-testid="settings-modal-title"]')).not.toBeVisible();
    });
});
