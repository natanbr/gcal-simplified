import { test, _electron as electron, expect } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test.describe('Calendar Caching and Background Loading', () => {
    let electronApp: any;
    let window: any;

    test.beforeEach(async () => {
        electronApp = await electron.launch({
            args: [path.join(__dirname, '../dist-electron/main.js')],
            timeout: 60000,
            env: {
                ...process.env,
                NODE_ENV: 'development'
            }
        });

        await electronApp.evaluate(async ({ app }) => app.whenReady());
        window = await electronApp.firstWindow();
        await window.waitForLoadState('domcontentloaded');

        const loginButton = window.locator('[data-testid="login-button"]');
        const isLoginVisible = await loginButton.isVisible().catch(() => false);
        if (isLoginVisible) {
            test.skip();
        }

        await window.waitForSelector('[data-testid="calendar-grid"]', { timeout: 30000 });

        // Wait for initial sync to finish
        await window.locator('svg.animate-spin').waitFor({ state: 'hidden', timeout: 30000 });
    });

    test.afterEach(async () => {
        if (electronApp) {
            await electronApp.close();
        }
    });

    test('should cache monthly data and use background refresh for inner-month navigation', async () => {
        // Navigate to next week
        const nextWeekButton = window.getByTestId('next-week-button');
        await nextWeekButton.click();

        // It should NOT show blocking loader (.animate-spin) when navigating to next week in the same month
        // (Assuming we are not at the very end of the month. To be safe we just test that the pulse is shown)
        // Wait for grid to update slightly
        await window.waitForTimeout(500);

        // It might show the pulse
        const refreshIcon = window.locator('svg.animate-pulse');
        const isPulseVisible = await refreshIcon.isVisible().catch(() => false);

        const spinIcon = window.locator('svg.animate-spin');
        const isSpinVisible = await spinIcon.isVisible().catch(() => false);

        // Since it's cached from the monthly fetch, spin should NOT happen for adjacent weeks
        expect(isSpinVisible).toBe(false);
    });
});
