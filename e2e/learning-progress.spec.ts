/**
 * Mission Control — Learning Progress E2E
 *
 * Smoke-tests the parent-facing Learning tab in the settings overlay:
 * open ⚙️ → 📈 Learning → the panel renders (its empty state on a fresh
 * profile, or the charts header on a played one — the suite runs against
 * the developer's real userData, so both are legitimate).
 *
 * In-game reading questions are DELIBERATELY not E2E-tested: reaching a
 * quiz requires spending a real game token, playing until a death/opt-in
 * trigger, and the engine's 40-60% reading/math mix makes which question
 * appears non-deterministic. That surface is covered by the QuizOverlay
 * and useQuizEngine unit suites instead.
 */

import { test, expect, _electron as electron } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ELECTRON_MAIN = path.join(__dirname, '../dist-electron/main.js');

test.describe('Mission Control — Learning Progress tab', () => {
    test.skip(!existsSync(ELECTRON_MAIN), 'Electron build not present');

    test('settings → Learning shows the progress panel', async () => {
        const app = await electron.launch({ args: [ELECTRON_MAIN] });
        const page = await app.firstWindow();

        await page.waitForLoadState('domcontentloaded');
        await page.waitForTimeout(2000);

        const loginVisible = await page.locator('[data-testid="login-screen"]').isVisible().catch(() => false);
        test.skip(loginVisible as boolean, 'Login required');

        const base = page.url().split('?')[0];
        await page.goto(`${base}?mc=1`);
        await page.waitForLoadState('domcontentloaded');
        await page.waitForTimeout(2000);

        await page.locator('[data-testid="mc-settings-btn"]').click();
        await expect(page.locator('[data-testid="mc-settings-panel"]')).toBeVisible();

        await page.getByRole('button', { name: '📈 Learning' }).click();

        // Fresh profile → empty state; played profile → the panel header.
        const emptyState = page.getByText('No practice yet');
        const header = page.getByText('📈 Learning Progress');
        await expect(emptyState.or(header).first()).toBeVisible();

        await app.close();
    });
});
