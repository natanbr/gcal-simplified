import { expect, type ElectronApplication, type Page } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { addWeeks, format, startOfWeek } from 'date-fns';
import { launchApp, test } from './helpers/launchApp';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * The date the grid's first column shows at a given week offset.
 *
 * Mirrors docs/requirements.md, "Week Start": `weekStartDay: 'today'` anchors the
 * initial view on today, and every navigated week starts on Monday. Built from
 * date-fns primitives rather than by importing `getWeekStartDate`, deliberately — a
 * test that asks the code under test to compute its own expectation agrees with that
 * code no matter what it does.
 *
 * Weekday-independent by construction. The expectations this replaced were
 * `today + 7 * offset`, which matches the real behaviour only when the suite runs on a
 * Monday, so these specs were red on six days out of seven from 1f3c771 onwards.
 */
const expectedWeekStart = (today: Date, weekOffset: number): Date =>
    weekOffset === 0 ? today : addWeeks(startOfWeek(today, { weekStartsOn: 1 }), weekOffset);

const expectedFirstDayNumber = (today: Date, weekOffset: number): string =>
    format(expectedWeekStart(today, weekOffset), 'd');

test.describe('Week Navigation', () => {
    let electronApp: ElectronApplication;
    let window: Page;

    test.beforeEach(async () => {
        // Launch Electron app
        electronApp = await launchApp({
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

        window = await electronApp.firstWindow();
        await window.waitForLoadState('domcontentloaded');

        // Check if we are at login screen
        const loginButton = window.locator('[data-testid="login-button"]');
        const isLoginVisible = await loginButton.isVisible().catch(() => false);
        if (isLoginVisible) {
            console.warn('Authentication required for E2E tests. Skipping...');
            test.skip();
        }

        // Wait for the calendar to load
        await window.waitForSelector('[data-testid="calendar-grid"]', { timeout: 30000 });

        // This spec launches against the developer's real userData directory (it is on
        // NEEDS_REAL_PROFILE in src/__tests__/e2e-state-isolation.test.ts), so weekStartDay
        // is whatever the app is configured with. Every assertion below assumes 'today'.
        // Say so out loud instead of failing later as an unexplained date mismatch.
        // Asked of the app itself (store.get and its fallbacks), not re-parsed from
        // config.json, so the check cannot drift from what the calendar actually uses.
        const settings = await window.evaluate(() => globalThis.window.ipcRenderer?.invoke('settings:get'));
        const weekStartDay =
            typeof settings === 'object' && settings !== null && 'weekStartDay' in settings
                ? settings.weekStartDay
                : undefined;
        expect(weekStartDay, 'week-navigation.spec.ts assumes the profile uses weekStartDay=today')
            .toBe('today');
    });

    test.afterEach(async () => {
        if (electronApp) {
            await electronApp.close();
        }
    });

    const waitForSync = async () => {
        // Wait for the loading spinner to appear if it's going to, then wait for it to disappear
        // But since it might be too fast, we'll just wait for it to NOT be visible
        await window.locator('svg.animate-spin').waitFor({ state: 'hidden', timeout: 30000 });
    };

    test('should display current week by default (starting today)', async () => {
        const today = new Date();
        // Check that the first day column shows Today
        const firstDayHeader = window.locator('[data-testid="day-header-number"]').first();
        await expect(firstDayHeader).toHaveText(expectedFirstDayNumber(today, 0), { timeout: 10000 });
    });

    test('should show next week button', async () => {
        const nextWeekButton = window.getByTestId('next-week-button');
        await expect(nextWeekButton).toBeVisible();
    });

    test('should show previous week button', async () => {
        const prevWeekButton = window.getByTestId('prev-week-button');
        await expect(prevWeekButton).toBeVisible();
    });

    test('should show current week label by default', async () => {
        const todayButton = window.getByTestId('today-button');
        await expect(todayButton).toContainText(/current week/i);
    });

    test('should navigate to next week when next week button is clicked', async () => {
        const today = new Date();

        const nextWeekButton = window.getByTestId('next-week-button');
        await nextWeekButton.click();
        await waitForSync();

        // Navigated weeks are Monday-anchored whatever weekday today is, so this
        // asserts the same rule seven days a week.
        const firstDayHeader = window.locator('[data-testid="day-header-number"]').first();
        await expect(firstDayHeader).toHaveText(expectedFirstDayNumber(today, 1), { timeout: 10000 });
        await expect(window.locator('[data-testid="day-header-name"]').first()).toHaveText(/monday/i);
    });

    test('should navigate back to current week when today button is clicked', async () => {
        const today = new Date();

        // Navigate to next week first
        const nextWeekButton = window.getByTestId('next-week-button');
        await nextWeekButton.click();
        await waitForSync();

        // Click back to today button
        const todayButton = window.getByTestId('today-button');
        await expect(todayButton).toContainText(/back to today/i);
        await todayButton.click();
        await waitForSync();

        // Check that we're back to current week (starting with today)
        const firstDayHeader = window.locator('[data-testid="day-header-number"]').first();
        await expect(firstDayHeader).toHaveText(expectedFirstDayNumber(today, 0), { timeout: 10000 });
    });

    test('should disable previous week button when at current week', async () => {
        const prevWeekButton = window.getByTestId('prev-week-button');
        await expect(prevWeekButton).toBeDisabled();
    });

    test('should enable previous week button when navigated to future week', async () => {
        const nextWeekButton = window.getByTestId('next-week-button');
        await nextWeekButton.click();
        await waitForSync();

        const prevWeekButton = window.getByTestId('prev-week-button');
        await expect(prevWeekButton).toBeEnabled();
    });

    test('should navigate back one week when previous week button is clicked', async () => {
        const today = new Date();

        const nextWeekButton = window.getByTestId('next-week-button');
        await nextWeekButton.click();
        await waitForSync();
        await nextWeekButton.click();
        await waitForSync();

        let firstDayHeader = window.locator('[data-testid="day-header-number"]').first();
        await expect(firstDayHeader).toHaveText(expectedFirstDayNumber(today, 2));

        const prevWeekButton = window.getByTestId('prev-week-button');
        await prevWeekButton.click();
        await waitForSync();

        firstDayHeader = window.locator('[data-testid="day-header-number"]').first();
        await expect(firstDayHeader).toHaveText(expectedFirstDayNumber(today, 1), { timeout: 10000 });
    });

    // Since a6d448c the app fetches a 16-day forecast, so next week's day
    // headers intentionally DO show weather when data covers them.
    test('should keep showing weather forecast for next week (16-day forecast window)', async () => {
        const weatherContainers = window.locator('[data-testid="weather-forecast-container"]');

        // Weather loads asynchronously after the grid — give it a moment
        await weatherContainers.first().waitFor({ state: 'visible', timeout: 15000 }).catch(() => {});

        // Only meaningful if weather data loaded for the current week
        const currentWeekCount = await weatherContainers.count();
        test.skip(currentWeekCount === 0, 'Weather data unavailable — nothing to verify');

        const nextWeekButton = window.getByTestId('next-week-button');
        await nextWeekButton.click();
        await waitForSync();

        // Next week is within the 16-day forecast range, so headers still show weather
        await expect(weatherContainers.first()).toBeVisible();
    });

    // Was "should not highlight Monday in future weeks if today is not Monday", a title from
    // the rolling-window era: under the Monday anchor the first column of a future week IS
    // Monday, so the old name asserted against the requirement. The old body could not fail
    // on its own either — `day-header-number` never carries a `bg-*` class (today is marked
    // with `text-family-cyan`), so `not.toHaveClass(/bg-family-cyan/)` was vacuously true and
    // only the date assertion above it ever went red.
    test('should not mark any day in a future week as today', async () => {
        const today = new Date();
        const dayNumbers = window.locator('[data-testid="day-header-number"]');

        // Positive control: the current week's first column is today and wears the marker.
        // Without this, the negated check below could pass against a renamed class forever.
        await expect(dayNumbers.first()).toHaveClass(/text-family-cyan/);

        const nextWeekButton = window.getByTestId('next-week-button');
        await nextWeekButton.click();
        await waitForSync();

        await expect(dayNumbers.first()).toHaveText(expectedFirstDayNumber(today, 1));
        await expect(dayNumbers).toHaveCount(7);

        // A Monday-anchored future week begins strictly after today from every weekday,
        // so no column in it may wear the today colour.
        for (let i = 0; i < 7; i++) {
            await expect(dayNumbers.nth(i)).not.toHaveClass(/text-family-cyan/);
        }
    });
});
