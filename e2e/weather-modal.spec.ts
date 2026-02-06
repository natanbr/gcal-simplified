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
        const loginButton = window.locator('button:has-text("Sign in with Google")');
        const isLoginVisible = await loginButton.isVisible().catch(() => false);
        console.log('Login button visible:', isLoginVisible);

        if (isLoginVisible) {
            await electronApp.close();
            throw new Error('Authentication required for E2E tests.');
        }

        // --- Weather Drawer Test ---
        // --- Weather Drawer Test ---
        console.log('Looking for Weather button (Temperature)...');
        // Button now shows "XX°C", so we look for matching pattern or icon
        const weatherBtn = window.locator('button', { hasText: /°C/ }).first();
        await test.expect(weatherBtn).toBeVisible({ timeout: 30000 });
        console.log('Clicking Weather button...');
        await weatherBtn.click();

        console.log('Waiting for Weather Forecast drawer...');
        const weatherTitle = window.locator('text=Weather Forecast');
        await test.expect(weatherTitle).toBeVisible({ timeout: 15000 });
        console.log('Weather Drawer Title Found/Visible');

        // Check content
        const hourlyText = window.locator('text=Hourly Forecast');
        await test.expect(hourlyText).toBeVisible();

        console.log('Closing Weather Drawer...');
        // Close Weather Drawer (click X button)
        await window.locator('button:has(svg.lucide-x)').first().click();
        await test.expect(weatherTitle).not.toBeVisible();

        // --- Tides Drawer Test ---
        console.log('Looking for Tides button...');
        const tidesBtn = window.locator('button:has-text("Tides")');
        await test.expect(tidesBtn).toBeVisible();
        console.log('Clicking Tides...');
        await tidesBtn.click();

        console.log('Waiting for Marine Conditions drawer...');
        const tidesTitle = window.locator('text=Marine Conditions');
        await test.expect(tidesTitle).toBeVisible();

        // Check content (Verdict, Swell, etc)
        await test.expect(window.locator('text=Verdict')).toBeVisible();
        await test.expect(window.locator('text=Swell')).toBeVisible();

        console.log('Closing Tides Drawer...');
        // Close Tides Drawer
        await window.locator('button:has(svg.lucide-x)').last().click();

        await electronApp.close();
    });
});
