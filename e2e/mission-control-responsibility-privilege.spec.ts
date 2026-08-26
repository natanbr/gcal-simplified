/**
 * Mission Control E2E — Responsibility & Privilege flows
 *
 * Tests the responsibility progress tracking, completion, and claim flow,
 * as well as the privilege suspend / reinstate flow.
 * Launches the Electron app in ?mc=1 mode and injects localStorage state.
 *
 * State handling: `mcTest` gives each test a throwaway userData directory. Two
 * of these tests suspend a privilege for a full day through the real UI —
 * against the real profile the Knife would still be suspended in the parent's
 * app tomorrow.
 */

import type { Page } from '@playwright/test';
import { existsSync } from 'node:fs';
import {
    ELECTRON_MAIN,
    expect,
    gotoMC,
    mcTest as test,
    patchMCCollection,
} from './helpers/mcApp';

// ── Shared helpers ────────────────────────────────────────────────────────────

async function openPrivilegesSettings(page: Page): Promise<void> {
    const settingsBtn = page.locator('[data-testid="mc-settings-btn"]');
    await expect(settingsBtn).toBeVisible({ timeout: 5000 });
    await settingsBtn.click();
    await page.waitForTimeout(400);

    const privilegesTab = page.locator('[data-testid="mc-settings-panel"] button:has-text("Privileges")');
    await expect(privilegesTab).toBeVisible({ timeout: 5000 });
    await privilegesTab.click();
    await page.waitForTimeout(400);
}

/** Seed the recycling responsibility at a known point count, then reload. */
async function seedRecycling(page: Page, pointsEarned: number, completedAt: string | null = null): Promise<void> {
    await patchMCCollection(page, 'responsibilities', 'recycling', { pointsEarned, completedAt });
    await gotoMC(page);
}

/** Seed one privilege into a known status, then reload. */
async function seedPrivilege(
    page: Page,
    id: string,
    status: 'active' | 'suspended',
    suspendedUntil: string | null = null,
): Promise<void> {
    await patchMCCollection(page, 'privileges', id, { status, suspendedUntil });
    await gotoMC(page);
}

// ── Responsibility tests ──────────────────────────────────────────────────────

test.describe('Mission Control — Responsibility panel', () => {
    test.skip(!existsSync(ELECTRON_MAIN), 'Electron build not present');

    test('Recycling task displays correct initial progress', async ({ mcPage: page }) => {
        await seedRecycling(page, 0);

        // Ensure recycling card is visible and shows its starting state
        const recyclingHeader = page.locator('text=Recycling');
        await expect(recyclingHeader).toBeVisible({ timeout: 10_000 });

        // Initial progress: 2 ♻️ emojis should be visible (1 header icon + 1 button icon), no filled progress dots
        await expect(page.locator('text=♻️')).toHaveCount(2, { timeout: 5000 });
    });

    test('+1 point button increments recycling progress', async ({ mcPage: page }) => {
        await seedRecycling(page, 0);

        // Click the +1 button for recycling
        const addBtn = page.locator('[data-testid="mc-responsibility-add-recycling"]');
        await expect(addBtn).toBeVisible({ timeout: 10_000 });
        await addBtn.click();
        await page.waitForTimeout(500);

        // Progress should now have 3 ♻️ emojis (1 header icon + 1 button icon + 1 filled progress dot)
        await expect(page.locator('text=♻️')).toHaveCount(3, { timeout: 5000 });
    });

    test('Completing recycling (3 points) shows DONE badge and Claim button', async ({ mcPage: page }) => {
        // Seed state: recycling at 2 points so one tap completes it
        await seedRecycling(page, 2);

        // Tap the +1 button to push it to 3
        const addBtn = page.locator('[data-testid="mc-responsibility-add-recycling"]');
        await expect(addBtn).toBeVisible({ timeout: 10_000 });
        await addBtn.click();
        await page.waitForTimeout(600);

        // DONE badge should appear
        await expect(page.locator('text=DONE ✓')).toBeVisible({ timeout: 5000 });

        // Claim button should appear
        await expect(page.locator('[data-testid="mc-responsibility-claim-recycling"]')).toBeVisible({ timeout: 5000 });
    });

    test('Claim & Start Over resets recycling to 0 points', async ({ mcPage: page }) => {
        // Seed state: recycling fully completed
        await seedRecycling(page, 3, new Date().toISOString());

        // Claim button should be visible
        const claimBtn = page.locator('[data-testid="mc-responsibility-claim-recycling"]');
        await expect(claimBtn).toBeVisible({ timeout: 10_000 });
        await claimBtn.click();
        await page.waitForTimeout(600);

        // After claim, progress resets — +1 button returns
        await expect(page.locator('[data-testid="mc-responsibility-add-recycling"]')).toBeVisible({ timeout: 5000 });

        // Claim button is gone
        await expect(claimBtn).not.toBeVisible({ timeout: 5000 });
    });

    test('Activity task has a consolidated button with all sport icons', async ({ mcPage: page }) => {
        const activityBtn = page.locator('[data-testid="mc-responsibility-add-activity"]');
        await expect(activityBtn).toBeVisible({ timeout: 10_000 });

        // Verify it contains the 4 icons (grid)
        await expect(activityBtn.locator('text=🛼')).toBeVisible();
        await expect(activityBtn.locator('text=⛸️')).toBeVisible();
        await expect(activityBtn.locator('text=🏊')).toBeVisible();
        await expect(activityBtn.locator('text=🥋')).toBeVisible();
    });

});

// ── Privilege suspension tests ────────────────────────────────────────────────

test.describe('Mission Control — Privilege suspension', () => {
    test.skip(!existsSync(ELECTRON_MAIN), 'Electron build not present');

    test('privilege cards are visible', async ({ mcPage: page }) => {
        // The knife card renders with the 🔪 emoji
        const knifeCard = page.locator('button[title="Knife"]');
        await expect(knifeCard).toBeVisible({ timeout: 10_000 });
    });

    test('clicking a privilege card opens the suspend popup', async ({ mcPage: page }) => {
        // Open privileges tab in settings
        await openPrivilegesSettings(page);

        // Target the Knife card inside the settings panel specifically
        const knifeCard = page.locator('[data-testid="mc-settings-panel"] button[title="Knife"]');
        await expect(knifeCard).toBeVisible({ timeout: 10_000 });
        await knifeCard.click();
        await page.waitForTimeout(400);

        // The popup header and suspend options should be visible
        await expect(page.locator('text=Suspend for:')).toBeVisible({ timeout: 5000 });
        await expect(page.locator('text=🚫 1 Day')).toBeVisible({ timeout: 5000 });
    });

    test('suspending a privilege shows the countdown badge', async ({ mcPage: page }) => {
        // First reinstate (ensure fresh active state)
        await seedPrivilege(page, 'knife', 'active');

        // Open privileges tab in settings
        await openPrivilegesSettings(page);

        const knifeCard = page.locator('[data-testid="mc-settings-panel"] button[title="Knife"]');
        await expect(knifeCard).toBeVisible({ timeout: 10_000 });
        await knifeCard.click();
        await page.waitForTimeout(300);

        // Pick 1 Day
        await page.locator('text=🚫 1 Day').click();
        await page.waitForTimeout(500);

        // Close settings
        await page.locator('text=Cancel ✕').click();
        await page.waitForTimeout(500);

        // Countdown badge should appear on the dashboard card
        await expect(page.locator('text=/\\d+[hd] left/').first()).toBeVisible({ timeout: 5000 });
    });

    test('reinstating a suspended privilege removes the countdown badge', async ({ mcPage: page }) => {
        // Seed it as already suspended
        await seedPrivilege(page, 'knife', 'suspended', new Date(Date.now() + 24 * 3600 * 1000).toISOString());

        // Countdown badge visible on the dashboard card initially
        await expect(page.locator('text=/\\d+[hd] left/').first()).toBeVisible({ timeout: 10_000 });

        // Open privileges tab in settings
        await openPrivilegesSettings(page);

        // Open popup inside settings and reinstate
        const knifeCard = page.locator('[data-testid="mc-settings-panel"] button[title="Knife"]');
        await knifeCard.click();
        await page.waitForTimeout(300);
        await page.locator('text=✅ Reinstate').click();
        await page.waitForTimeout(500);

        // Close settings
        await page.locator('text=Cancel ✕').click();
        await page.waitForTimeout(500);

        // Countdown badge gone on the dashboard card
        await expect(page.locator('text=/\\d+[hd] left/').first()).not.toBeVisible({ timeout: 5000 });
    });

    test('suspending Phone Games blocks selection of the Game goal', async ({ mcPage: page }) => {
        // 1. Ensure phone-games is active initially
        await seedPrivilege(page, 'phone-games', 'active');

        // 2. Open settings and suspend Phone Games
        await openPrivilegesSettings(page);

        const phoneGamesCard = page.locator('[data-testid="mc-settings-panel"] button[title="Phone Games"]');
        await expect(phoneGamesCard).toBeVisible({ timeout: 10_000 });
        await phoneGamesCard.click();
        await page.waitForTimeout(300);

        // 3. Suspend for 1 Day
        await page.locator('text=🚫 1 Day').click();
        await page.waitForTimeout(500);

        // 4. Close settings
        await page.locator('text=Cancel ✕').click();
        await page.waitForTimeout(500);

        // 5. Try to click "Add Goal" on an empty pedestal
        const addGoalBtn = page.locator('button[aria-label="Add a new goal"]').first();
        await expect(addGoalBtn).toBeVisible({ timeout: 5000 });
        await addGoalBtn.click();
        await page.waitForTimeout(500);

        // 6. Verify the "Game" option is NOT visible in the picker, but others are
        await expect(page.locator('text=Pick a Goal')).toBeVisible();

        // Find buttons under the Picker to ensure we don't accidentally match another element
        const gameButton = page.locator('button', { hasText: /^Game$/ });
        await expect(gameButton).not.toBeVisible();
        await expect(page.locator('button', { hasText: 'Short Show' })).toBeVisible();
    });

});
