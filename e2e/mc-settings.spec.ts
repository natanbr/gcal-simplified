/**
 * Mission Control — Settings E2E Tests
 *
 * Smoke-tests the MCSettingsOverlay:
 * open via the ⚙️ button, change a time, save, and verify persistence.
 */

import { test, expect, _electron as electron } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import type { Page } from '@playwright/test';


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ELECTRON_MAIN = path.join(__dirname, '../dist-electron/main.js');
const STORAGE_KEY = 'mc-state-v2';

async function gotoMC(page: Page): Promise<void> {
    const currentUrl = page.url();
    const base = currentUrl.split('?')[0];
    await page.goto(`${base}?mc=1`);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(2000);
}

test.describe('Mission Control — Settings Overlay', () => {
    test.skip(!existsSync(ELECTRON_MAIN), 'Electron build not present');


    test('settings panel opens via the ⚙️ button', async () => {
        const app = await electron.launch({ args: [ELECTRON_MAIN] });
        const page = await app.firstWindow();

        await page.waitForLoadState('domcontentloaded');
        await page.waitForTimeout(2000);

        const loginVisible = await page.locator('[data-testid="login-screen"]').isVisible().catch(() => false);
        test.skip(loginVisible as boolean, 'Login required');

        await gotoMC(page);

        // Gear button in the MC top bar
        const settingsBtn = page.getByRole('button', { name: /settings/i }).first();
        await expect(settingsBtn).toBeVisible({ timeout: 5000 });

        // Panel is initially hidden
        await expect(page.getByText('Settings')).not.toBeVisible();

        // Open
        await settingsBtn.click();
        await expect(page.getByText('Settings')).toBeVisible({ timeout: 2000 });

        await app.close();
    });

    test('settings panel shows Morning and Evening Mission sections', async () => {
        const app = await electron.launch({ args: [ELECTRON_MAIN] });
        const page = await app.firstWindow();

        await page.waitForLoadState('domcontentloaded');
        await page.waitForTimeout(2000);

        const loginVisible = await page.locator('[data-testid="login-screen"]').isVisible().catch(() => false);
        test.skip(loginVisible as boolean, 'Login required');

        await gotoMC(page);

        await page.getByRole('button', { name: /settings/i }).first().click();

        await expect(page.getByText('Morning Mission')).toBeVisible({ timeout: 2000 });
        await expect(page.getByText('Evening Mission')).toBeVisible();

        await app.close();
    });

    test('settings panel can be cancelled — store unchanged', async () => {
        const app = await electron.launch({ args: [ELECTRON_MAIN] });
        const page = await app.firstWindow();

        await page.waitForLoadState('domcontentloaded');
        await page.waitForTimeout(2000);

        const loginVisible = await page.locator('[data-testid="login-screen"]').isVisible().catch(() => false);
        test.skip(loginVisible as boolean, 'Login required');

        await gotoMC(page);

        // Read the initial stored settings
        const before = await page.evaluate((key: string) => {
            const raw = localStorage.getItem(key);
            if (!raw) return null;
            const state = JSON.parse(raw) as Record<string, unknown>;
            return (state.settings as Record<string, unknown>)?.morningStartsAt ?? null;
        }, STORAGE_KEY);

        // Open settings
        await page.getByRole('button', { name: /settings/i }).first().click();
        await page.waitForTimeout(200);

        // Cancel without saving
        await page.getByText(/Cancel/i).click();
        await page.waitForTimeout(300);

        // Settings panel should be gone
        await expect(page.getByText('Morning Mission')).not.toBeVisible();

        // Store should be unchanged
        const after = await page.evaluate((key: string) => {
            const raw = localStorage.getItem(key);
            if (!raw) return null;
            const state = JSON.parse(raw) as Record<string, unknown>;
            return (state.settings as Record<string, unknown>)?.morningStartsAt ?? null;
        }, STORAGE_KEY);

        expect(after).toBe(before);

        await app.close();
    });

    test('Save Settings button persists changes to localStorage', async () => {
        const app = await electron.launch({ args: [ELECTRON_MAIN] });
        const page = await app.firstWindow();

        await page.waitForLoadState('domcontentloaded');
        await page.waitForTimeout(2000);

        const loginVisible = await page.locator('[data-testid="login-screen"]').isVisible().catch(() => false);
        test.skip(loginVisible as boolean, 'Login required');

        await gotoMC(page);

        // Open settings
        await page.getByRole('button', { name: /settings/i }).first().click();
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
        const saved = await page.evaluate((key: string) => {
            const raw = localStorage.getItem(key);
            if (!raw) return null;
            const state = JSON.parse(raw) as Record<string, unknown>;
            return (state.settings as Record<string, unknown>)?.morningStartsAt ?? null;
        }, STORAGE_KEY);

        expect(saved).toBe('07:15');

        await app.close();
    });
});
