import { test, _electron as electron } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test.describe('Weather & Tides Drawers Test', () => {
    test('should display weather and tides drawers', async () => {
        // Launch Electron app - use the main.js from dist-electron
        const electronApp = await electron.launch({
            args: [path.join(__dirname, '../dist-electron/main.js')],
            timeout: 60000,
            env: {
                ...process.env,
                NODE_ENV: 'development'
            }
        });

        // Wait for the app to be ready
        await electronApp.evaluate(async ({ app }) => {
            return app.whenReady();
        });

        const window = await electronApp.firstWindow();
        await window.waitForLoadState('domcontentloaded');
        await window.waitForTimeout(5000); // Increased wait for data

        // Check auth
        console.log('Checking authentication...');
        const loginButton = window.locator('[data-testid="login-button"]');
        const isLoginVisible = await loginButton.isVisible().catch(() => false);
        console.log('Login button visible:', isLoginVisible);

        if (isLoginVisible) {
            await electronApp.close();
            throw new Error('Authentication required for E2E tests.');
        }

        // --- Weather Drawer Test ---
        // --- Weather Drawer Test ---
        console.log('Looking for Weather button (Temperature)...');
        const weatherBtn = window.locator('[data-testid="weather-button"]');
        await test.expect(weatherBtn).toBeVisible({ timeout: 30000 });
        console.log('Clicking Weather button...');
        await weatherBtn.click();

        console.log('Waiting for Weather Forecast drawer...');
        const weatherTitle = window.locator('[data-testid="drawer-title"]', { hasText: 'Weather Forecast' });
        await test.expect(weatherTitle).toBeVisible({ timeout: 15000 });
        console.log('Weather Drawer Title Found/Visible');

        // Check content
        const hourlyText = window.locator('[data-testid="hourly-forecast-section"]');
        await test.expect(hourlyText).toBeVisible();

        console.log('Closing Weather Drawer...');
        // Close Weather Drawer (click X button)
        await window.locator('[data-testid="close-drawer-button"]').click();
        await test.expect(weatherTitle).not.toBeVisible();

        // --- Tides Drawer Test ---
        console.log('Looking for Tides button...');
        const tidesBtn = window.locator('[data-testid="tides-button"]');
        await test.expect(tidesBtn).toBeVisible();
        console.log('Clicking Tides...');
        await tidesBtn.click();

        console.log('Waiting for Marine Conditions drawer...');
        const tidesTitle = window.locator('[data-testid="drawer-title"]', { hasText: 'Marine Conditions' });
        await test.expect(tidesTitle).toBeVisible();

        // Check content (Diver's Guide which contains Verdict/Conditions info)
        await test.expect(window.locator('[data-testid="tides-guide"]')).toBeVisible();
        // Check for Swell in the events table headers
        await test.expect(window.locator('[data-testid="tides-events-table"]')).toContainText('Swell');

        console.log('Closing Tides Drawer...');
        // Close Tides Drawer
        await window.locator('[data-testid="close-drawer-button"]').click();

        await electronApp.close();
    });
});
