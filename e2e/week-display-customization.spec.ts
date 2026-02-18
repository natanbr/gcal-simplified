import { test, _electron as electron, expect, type ElectronApplication, type Page } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { format, startOfWeek } from 'date-fns';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test.describe('Week Display Customization', () => {
    let electronApp: ElectronApplication;
    let window: Page;

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
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await electronApp.evaluate(async ({ app }: { app: any }) => {
            return app.whenReady();
        });

        window = await electronApp.firstWindow();
        await window.waitForLoadState('domcontentloaded');

        // Wait a bit for the app to initialize
        await window.waitForTimeout(2000);

        // Always mock IPC handlers for deterministic test behavior
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await electronApp.evaluate(({ ipcMain }: { ipcMain: any }) => {
            // Mock auth:check to return true
            ipcMain.removeHandler('auth:check');
            ipcMain.handle('auth:check', () => true);

            // Mock data handlers
            ipcMain.removeHandler('data:events');
            ipcMain.handle('data:events', () => []);

            ipcMain.removeHandler('data:tasks');
            ipcMain.handle('data:tasks', () => []);

            ipcMain.removeHandler('settings:get');
            let mockSettings = {
                calendarIds: [],
                taskListIds: [],
                weekStartDay: 'today'
            };
            ipcMain.handle('settings:get', () => mockSettings);

            ipcMain.removeHandler('settings:save');
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            ipcMain.handle('settings:save', (_: any, config: any) => {
                mockSettings = { ...mockSettings, ...config };
                return true;
            });

            ipcMain.removeHandler('data:calendars');
            ipcMain.handle('data:calendars', () => []);
            ipcMain.removeHandler('data:tasklists');
            ipcMain.handle('data:tasklists', () => []);
            ipcMain.removeHandler('weather:get');
            ipcMain.handle('weather:get', () => ({
                current: { temperature: 20, weatherCode: 0, windSpeed: 5 },
                daily: {
                    sunrise: [],
                    sunset: [],
                    weather_code: [0, 0, 0, 0, 0, 0, 0],
                    temperature_2m_max: [20, 21, 22, 23, 24, 23, 22],
                    temperature_2m_min: [10, 11, 12, 13, 14, 13, 12]
                }
            }));

            ipcMain.removeHandler('tides:get');
            ipcMain.handle('tides:get', () => null);
        });

        // Reload window to apply mocked handlers
        await window.reload();
        await window.waitForLoadState('domcontentloaded');

        // Wait for the calendar to load
        await window.waitForSelector('[data-testid="calendar-grid"]', { timeout: 30000 });
    });

    test.afterEach(async () => {
        if (electronApp) {
            await electronApp.close();
        }
    });

    const openSettings = async () => {
        const settingsButton = window.getByTestId('settings-button');
        await settingsButton.click();
        await window.waitForSelector('[data-testid="settings-modal-title"]');
        // Wait for settings data to load (loading overlay to disappear)
        // The RefreshCw spinner inside the modal has absolute positioning
        await window.waitForTimeout(500); // Brief wait for IPC calls to resolve
        // Ensure the week-start buttons are available before returning
        await window.getByTestId('week-start-today-button').waitFor({ state: 'attached', timeout: 10000 });
    };

    const saveSettings = async () => {
        const saveButton = window.getByTestId('save-settings-button');
        await saveButton.click();
        // Wait for modal to close
        await window.waitForSelector('[data-testid="settings-modal-title"]', { state: 'hidden' });
        // Wait for loading bar to disappear
        await window.locator('[data-testid="loading-bar"]').waitFor({ state: 'hidden', timeout: 30000 });
    };

    test('should allow switching between Today, Monday, and Sunday start days', async () => {
        const today = new Date();

        // 1. Verify "Today" mode (default)
        const firstDayHeaderNumber = window.locator('[data-testid="day-header-number"]').first();
        await expect(firstDayHeaderNumber).toHaveText(format(today, 'd'), { timeout: 10000 });

        // 2. Switch to "Monday" mode
        await openSettings();
        const mondayButton = window.getByTestId('week-start-monday-button');
        await mondayButton.scrollIntoViewIfNeeded();
        await mondayButton.click();
        await saveSettings();

        // Verify Monday of current week
        const expectedMonday = startOfWeek(today, { weekStartsOn: 1 });
        await expect(window.locator('[data-testid="day-header-number"]').first()).toHaveText(format(expectedMonday, 'd'));
        await expect(window.locator('[data-testid="day-header-name"]').first()).toHaveText(/Monday/i);

        // 3. Switch to "Sunday" mode
        await openSettings();
        const sundayButton = window.getByTestId('week-start-sunday-button');
        await sundayButton.scrollIntoViewIfNeeded();
        await sundayButton.click();
        await saveSettings();

        // Verify Sunday of current week
        const expectedSunday = startOfWeek(today, { weekStartsOn: 0 });
        await expect(window.locator('[data-testid="day-header-number"]').first()).toHaveText(format(expectedSunday, 'd'));
        await expect(window.locator('[data-testid="day-header-name"]').first()).toHaveText(/Sunday/i);

        // 4. Switch back to "Today" mode
        await openSettings();
        const todayModeButton = window.getByTestId('week-start-today-button');
        await todayModeButton.scrollIntoViewIfNeeded();
        await todayModeButton.click();
        await saveSettings();

        // Verify Today again
        await expect(window.locator('[data-testid="day-header-number"]').first()).toHaveText(format(today, 'd'));
    });
});
