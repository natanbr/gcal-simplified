import { test, expect, _electron as electron } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test.describe('Dashboard Requirements', () => {
    test('should verify core dashboard elements', async () => {
        const electronApp = await electron.launch({
            args: [path.join(__dirname, '../dist-electron/main.js')],
            timeout: 60000,
            env: { ...process.env, NODE_ENV: 'development' }
        });

        const window = await electronApp.firstWindow();
        await window.waitForLoadState('domcontentloaded');
        await window.waitForTimeout(3000);

        // Check for Login Screen
        const loginButton = window.locator('button:has-text("Sign in with Google")');
        if (await loginButton.isVisible()) {
            console.log('User is on Login Screen. Verifying Login Screen Requirements.');

            // Verify Button
            await expect(loginButton).toBeEnabled();

            // Cannot proceed to Dashboard without manual login
            console.log('Skipping Dashboard checks as user is not authenticated.');
            await electronApp.close();
            return;
        }

        // Dashboard Verification
        console.log('User is Authenticated. Verifying Dashboard.');

        // 1. Verify 7 Day Headers
        // Look for 7 day number containers
        const dayHeaders = window.locator('.grid-cols-7 .text-4xl.font-black');
        await expect(dayHeaders).toHaveCount(7);

        // 2. Verify Hourly Grid (Standard Active Hours usually imply sidebar labels)
        const hourLabels = window.locator('.w-12 .text-zinc-500');
        // Just verify we have some hour labels
        expect(await hourLabels.count()).toBeGreaterThan(0);

        // 3. Verify Tasks Drawer Toggle
        const tasksButton = window.locator('button:has(.lucide-list-todo)'); // Based on ListTodo icon check
        await expect(tasksButton).toBeVisible();
        await tasksButton.click();

        // Verify Drawer Opens
        const tasksTitle = window.locator('text=Tasks (');
        await expect(tasksTitle).toBeVisible();

        // Close Drawer
        // The drawer has a specific structure. We can target the button inside the drawer header.
        // Or simply use the second X button if we are sure, but better to be safe.
        // Targeting the button inside the "Tasks" header container.
        const closeTasks = window.locator('h2:has-text("Tasks")').locator('..').locator('button');
        await closeTasks.click();
        await expect(tasksTitle).not.toBeVisible();

        await electronApp.close();
    });
});
