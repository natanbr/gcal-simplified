import { test, _electron as electron, expect } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { format, addDays, startOfWeek } from 'date-fns';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test.describe('Week Navigation', () => {
    let electronApp: any;
    let window: any;

    test.beforeEach(async () => {
        // Launch Electron app
        electronApp = await electron.launch({
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
        const loginButton = window.locator('button:has-text("Sign in with Google")');
        const isLoginVisible = await loginButton.isVisible().catch(() => false);
        if (isLoginVisible) {
            console.warn('Authentication required for E2E tests. Skipping...');
            test.skip();
        }

        // Wait for the calendar to load
        await window.waitForSelector('[data-testid="calendar-grid"]', { timeout: 30000 });
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
        const firstDayHeader = window.locator('.grid-cols-7 > div').first();
        await expect(firstDayHeader).toContainText(format(today, 'd'), { timeout: 10000 });
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
        const mondayOfThisWeek = startOfWeek(today, { weekStartsOn: 1 });
        const nextMonday = addDays(mondayOfThisWeek, 7);

        // Click next week button
        const nextWeekButton = window.getByTestId('next-week-button');
        await nextWeekButton.click();

        // Wait for update
        await waitForSync();

        // Check that the first day column now shows next Monday
        const firstDayHeader = window.locator('.grid-cols-7 > div').first();
        await expect(firstDayHeader).toContainText(format(nextMonday, 'd'), { timeout: 10000 });
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
        const firstDayHeader = window.locator('.grid-cols-7 > div').first();
        await expect(firstDayHeader).toContainText(format(today, 'd'), { timeout: 10000 });
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
        const mondayOfThisWeek = startOfWeek(today, { weekStartsOn: 1 });
        const nextMonday = addDays(mondayOfThisWeek, 7);
        const nextNextMonday = addDays(nextMonday, 7);

        const nextWeekButton = window.getByTestId('next-week-button');
        await nextWeekButton.click();
        await waitForSync();
        await nextWeekButton.click();
        await waitForSync();

        let firstDayHeader = window.locator('.grid-cols-7 > div').first();
        await expect(firstDayHeader).toContainText(format(nextNextMonday, 'd'));

        const prevWeekButton = window.getByTestId('prev-week-button');
        await prevWeekButton.click();
        await waitForSync();

        firstDayHeader = window.locator('.grid-cols-7 > div').first();
        await expect(firstDayHeader).toContainText(format(nextMonday, 'd'), { timeout: 10000 });
    });

    test('should not show weather forecast for future weeks', async () => {
        const nextWeekButton = window.getByTestId('next-week-button');
        await nextWeekButton.click();
        await waitForSync();

        const weatherContainer = window.locator('.grid-cols-7 > div .mt-2.scale-75');
        await expect(weatherContainer).not.toBeVisible();
    });

    test('should not highlight Monday in future weeks if today is not Monday', async () => {
        const today = new Date();
        const mondayOfThisWeek = startOfWeek(today, { weekStartsOn: 1 });
        const nextMonday = addDays(mondayOfThisWeek, 7);
        const nextMondayDay = format(nextMonday, 'd');

        // Navigate to next week
        const nextWeekButton = window.getByTestId('next-week-button');
        await nextWeekButton.click();
        await waitForSync();

        // Find Monday column (first column in next week view)
        const firstDayHeaderNumber = window.locator('.grid-cols-7 > div:first-child .text-3xl');
        await expect(firstDayHeaderNumber).toHaveText(nextMondayDay);

        // If it's not today, it should NOT have bg-family-cyan
        await expect(firstDayHeaderNumber).not.toHaveClass(/bg-family-cyan/);
    });
});
