/**
 * Mission Control's wall clock must not decide whether the E2E suite passes.
 *
 * On 2026-09-21 the same commit passed 45 of 45 at 18:00 and failed 30 of 45
 * from 19:02: the scheduler starts the evening mission at 19:00, and
 * MissionOverlay — mounted on BOTH views — covered every spec that clicked
 * anything until it timed out. At 20:13 it still failed: the dev profile had
 * that mission running, resumed from an earlier launch.
 *
 * Each test puts a throwaway profile into one of those two states FOR REAL,
 * through the app, and asserts the overlay is up — so the precondition cannot
 * quietly fail to happen. Then it closes the app and launches the profile again
 * the way every spec does, and clicks something ordinary. The window is built
 * around "now", so this behaves the same at any time of day.
 *
 * What makes the second launch clickable is quietMissionClock in
 * helpers/missionClock.ts, run by every launch. Remove it and both tests fail
 * at the click, with the overlay intercepting the pointer — the suite's
 * failure, reproduced on demand.
 */

import { expect } from '@playwright/test';
import { existsSync } from 'node:fs';
import { test } from './helpers/launchApp';
import { ELECTRON_MAIN, launchMC, readMCField } from './helpers/mcApp';
import { seedFailingState, type FailingState } from './helpers/missionClock';
import { createIsolatedUserData, removeUserData } from './helpers/userDataDir';

const OVERLAY = '[data-testid="mc-mission-overlay"]';

/** Minutes left before local midnight. */
function minutesLeftToday(): number {
    const now = new Date();
    return 24 * 60 - (now.getHours() * 60 + now.getMinutes());
}

/** Launch, put the profile into the failing state, prove it took, close. */
async function leaveProfileIn(dir: string, state: FailingState): Promise<void> {
    const { app, page } = await launchMC(dir);
    try {
        await seedFailingState(page, state);
        await expect(page.locator(OVERLAY), 'precondition: the mission covers the screen').toBeVisible({ timeout: 10_000 });
        // The store persists 500ms after a change; closing sooner keeps the old blob.
        await expect.poll(() => readMCField(page, 'activeMission'), { timeout: 5_000 }).not.toBe('none');
    } finally {
        await app.close();
    }
}

/** Launch the way every spec does, and click something ordinary. */
async function expectClickable(dir: string): Promise<void> {
    const { app, page } = await launchMC(dir);
    try {
        await page.locator('[data-testid="mc-settings-btn"]').click({ timeout: 5_000 });
        await expect(page.locator('[data-testid="mc-settings-panel"]')).toBeVisible();
        await expect(page.locator(OVERLAY)).toBeHidden();
    } finally {
        await app.close();
    }
}

test.describe('E2E is independent of the mission clock', () => {
    test.skip(!existsSync(ELECTRON_MAIN), 'Electron build not present');

    let dir: string;
    test.beforeEach(() => { dir = createIsolatedUserData(); });
    test.afterEach(() => removeUserData(dir));

    test('a mission still running from an earlier launch does not cover the next one', async () => {
        await leaveProfileIn(dir, 'mission-running');
        await expectClickable(dir);
    });

    test('a mission window that contains "now" does not cover the app', async () => {
        // seedFailingState falls back to a running mission when no same-day
        // window fits, which would make this a copy of the test above.
        test.skip(minutesLeftToday() < 3, 'no same-day window fits in the last minutes before midnight');
        await leaveProfileIn(dir, 'window-open-now');
        await expectClickable(dir);
    });
});
