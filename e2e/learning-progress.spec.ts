/**
 * Mission Control — Learning Progress E2E
 *
 * Smoke-tests the parent-facing Learning tab in the settings overlay:
 * open ⚙️ → 📈 Learning → the panel renders its empty state.
 *
 * The profile is a throwaway one (see helpers/userDataDir.ts), so "no practice
 * yet" is the only correct answer. This spec used to accept EITHER the empty
 * state or the charts header, because it ran against the developer's real
 * userData and could not know which it would get — an assertion that passes
 * whichever of two opposite things happens is barely an assertion. Isolation
 * is what makes it precise.
 *
 * In-game reading questions are DELIBERATELY not E2E-tested: reaching a
 * quiz requires spending a real game token, playing until a death/opt-in
 * trigger, and the engine's 40-60% reading/math mix makes which question
 * appears non-deterministic. That surface is covered by the QuizOverlay
 * and useQuizEngine unit suites instead.
 */

import { existsSync } from 'node:fs';
import { ELECTRON_MAIN, expect, mcTest as test } from './helpers/mcApp';

test.describe('Mission Control — Learning Progress tab', () => {
    test.skip(!existsSync(ELECTRON_MAIN), 'Electron build not present');

    test('settings → Learning shows the progress panel', async ({ mcPage: page }) => {
        await page.locator('[data-testid="mc-settings-btn"]').click();
        await expect(page.locator('[data-testid="mc-settings-panel"]')).toBeVisible();

        // The Learning tab is hold-to-open (600ms) so the kid can't tap into
        // it; `delay` keeps the button pressed long enough to fire the hold.
        await page.getByRole('button', { name: '📈 Learning' }).click({ delay: 900 });

        // Fresh profile — nothing has been practised, so this is deterministic.
        await expect(page.getByText('No practice yet')).toBeVisible();
    });
});
