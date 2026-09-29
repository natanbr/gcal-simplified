/**
 * Mission Control — Settings E2E Tests
 *
 * Smoke-tests the MCSettingsOverlay:
 * open via the ⚙️ button, change a time, save, and verify persistence.
 *
 * State handling: `mcTest` gives each test a throwaway userData directory. The
 * save test genuinely rewrites `morningStartsAt` to 07:15 — against the real
 * profile that silently moved the parent's morning mission time, which is why
 * these specs no longer see it.
 */

import { existsSync } from 'node:fs';
import type { Locator, Page } from '@playwright/test';
import {
    ELECTRON_MAIN,
    expect,
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
        // Gear button in the MC top bar
        const settingsBtn = page.locator('[data-testid="mc-settings-btn"]');
        await expect(settingsBtn).toBeVisible({ timeout: 5000 });

        // Open
        await settingsBtn.click();
        await expect(page.locator('[data-testid="mc-settings-save"]')).toBeVisible({ timeout: 2000 });
    });

    test('settings panel shows Morning and Evening Mission sections', async ({ mcPage: page }) => {
        await page.locator('[data-testid="mc-settings-btn"]').click();

        await expect(page.getByText('Morning Mission')).toBeVisible({ timeout: 2000 });
        await expect(page.getByText('Evening Mission')).toBeVisible();
    });

    test('settings panel can be cancelled — store unchanged', async ({ mcPage: page }) => {
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

    test('a Tab onto a Settings field draws the violet focus ring', async ({ mcPage: page }, testInfo) => {
        // jsdom cannot match :focus-visible, so the unit tests only read the
        // .mc-field rule; this is the check that Chromium actually draws it.
        const ring = (field: Locator) => field.evaluate(el => {
            const s = getComputedStyle(el);
            return `${s.outlineStyle} ${s.outlineColor}`;
        });
        const VIOLET = 'solid rgb(109, 84, 200)'; // --mc-focus-ring → --mc-chart-violet #6d54c8
        // The ring reaches 4px past the field (2px offset + 2px width); an
        // overflow-clipping ancestor closer than that cuts it off.
        const clippedBy = (field: Locator) => field.evaluate(el => {
            const f = el.getBoundingClientRect();
            const cuts: string[] = [];
            for (let a = el.parentElement; a; a = a.parentElement) {
                if (getComputedStyle(a).overflow === 'visible') continue;
                const c = a.getBoundingClientRect();
                if (f.left - c.left < 4 || c.right - f.right < 4 || f.top - c.top < 4 || c.bottom - f.bottom < 4) {
                    cuts.push(`${a.tagName} overflow ${getComputedStyle(a).overflow}`);
                }
            }
            return cuts;
        });
        const shot = async (name: string, field: Locator) => {
            await field.scrollIntoViewIfNeeded();
            const box = await field.boundingBox();
            if (!box) throw new Error(`${name}: field has no box`);
            const clip = { x: box.x - 40, y: box.y - 40, width: box.width + 80, height: box.height + 80 };
            await testInfo.attach(name, { body: await page.screenshot({ clip }), contentType: 'image/png' });
        };
        await page.locator('[data-testid="mc-settings-btn"]').click();

        // Schedule select: rendered once the cream task is on; Tab from its toggle reaches it.
        await page.getByText('🧴 Missions Tasks').click();
        const creamToggle = page.getByText('"Put on Cream"').locator('xpath=..').locator('button');
        await creamToggle.click();
        await creamToggle.press('Tab');
        const schedule = page.locator('select.mc-field');
        await expect(schedule).toBeFocused();
        expect(await ring(schedule)).toBe(VIOLET);
        // The section clips while its open animation runs, by design, and a
        // hidden E2E window never runs that animation, so this needs E2E_HEADED=1.
        if (process.env.E2E_HEADED === '1') await expect.poll(() => clippedBy(schedule)).toEqual([]);
        await shot('schedule-select-focus', schedule);

        // Reward cost: Tab from the first row (its cost field, then its toggle) to the second cost.
        await page.getByText('🎁 Rewards').click();
        const costs = page.locator('input[type="number"].mc-field');
        await costs.first().press('Tab');
        await page.keyboard.press('Tab');
        await expect(costs.nth(1)).toBeFocused();
        expect(await ring(costs.nth(1))).toBe(VIOLET);
        expect(await clippedBy(costs.nth(1))).toEqual([]);
        await shot('reward-cost-focus', costs.nth(1));
    });
});
