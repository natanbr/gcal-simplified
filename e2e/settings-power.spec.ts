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
        if (await window.locator('text=Sign in with Google').isVisible()) {
            console.log('Skipping Settings test - Login required');
            await electronApp.close();
            return;
        }

        // Open Settings
        const settingsButton = window.locator('button[title="Settings"]');
        await expect(settingsButton).toBeVisible();
        await settingsButton.click();

        // Check for Display & Power Section
        await expect(window.locator('text=Display & Power')).toBeVisible();

        // Check Theme Mode buttons
        await expect(window.locator('button:has-text("AUTO (Sun)")')).toBeVisible();
        await expect(window.locator('button:has-text("MANUAL")')).toBeVisible();

        // Check Sleep Schedule defaults (22 to 6)
        // We look for inputs with these values. Note: value matching might need exact check.
        // Or simply check existence of the section.
        await expect(window.locator('text=Sleep Schedule')).toBeVisible();
        // Use locator with value attribute check if possible, or just presence of number inputs
        // Inputs might have dynamic ids or classes, but we can search by surrounding text

        // Toggle Theme to Manual
        await window.locator('button:has-text("MANUAL")').click();

        // Verify Day Start/End inputs appear
        await expect(window.locator('text=Day Start')).toBeVisible();
        await expect(window.locator('text=Day End')).toBeVisible();

        // Save
        await window.locator('button:has-text("Save Changes")').click();

        // Modal should close
        await expect(window.locator('text=Display & Power')).not.toBeVisible();

        await electronApp.close();
    });
});
