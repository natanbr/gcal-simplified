import { test, expect, _electron as electron } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test.describe('Event Color Mapping', () => {
    test('should display events with Google Calendar colors and good contrast', async () => {
        const electronApp = await electron.launch({
            args: [path.join(__dirname, '../dist-electron/main.js')],
            timeout: 60000,
            env: { ...process.env, NODE_ENV: 'development' }
        });

        const window = await electronApp.firstWindow();
        await window.waitForLoadState('domcontentloaded');
        await window.waitForTimeout(3000);

        // Check for Login Screen
        const loginButton = window.locator('[data-testid="login-button"]');
        if (await loginButton.isVisible()) {
            console.log('User is on Login Screen. Skipping color tests as authentication is required.');
            await electronApp.close();
            return;
        }

        console.log('User is Authenticated. Testing event colors.');

        // Wait for calendar to load
        const calendarGrid = window.locator('[data-testid="calendar-grid"]');
        await expect(calendarGrid).toBeVisible({ timeout: 10000 });

        // Find event cards
        const eventCards = window.locator('[data-testid^="event-card-"]');
        const count = await eventCards.count();

        if (count === 0) {
            console.log('No events found in calendar. Skipping color tests.');
            await electronApp.close();
            return;
        }

        console.log(`Found ${count} event cards. Testing colors...`);

        // Test first few events for color classes
        for (let i = 0; i < Math.min(count, 5); i++) {
            const card = eventCards.nth(i);
            const classes = await card.getAttribute('class');

            console.log(`Event ${i} classes:`, classes);

            // Should have one of the color classes
            const hasColorClass =
                classes?.includes('bg-blue-') ||
                classes?.includes('bg-green-') ||
                classes?.includes('bg-purple-') ||
                classes?.includes('bg-pink-') ||
                classes?.includes('bg-yellow-') ||
                classes?.includes('bg-orange-') ||
                classes?.includes('bg-cyan-') ||
                classes?.includes('bg-gray-') ||
                classes?.includes('bg-red-') ||
                classes?.includes('bg-zinc-');

            expect(hasColorClass).toBe(true);

            // Check text contrast
            // Light backgrounds should have dark text
            if (classes?.includes('bg-yellow-') || classes?.includes('bg-gray-')) {
                expect(classes).toContain('text-black');
            }

            // Dark backgrounds should have white text
            if (classes?.includes('bg-blue-') ||
                classes?.includes('bg-green-') ||
                classes?.includes('bg-purple-') ||
                classes?.includes('bg-pink-') ||
                classes?.includes('bg-orange-') ||
                classes?.includes('bg-cyan-') ||
                classes?.includes('bg-red-') ||
                classes?.includes('bg-zinc-')) {
                expect(classes).toContain('text-white');
            }

            // Check border color matches background color family
            if (classes?.includes('bg-blue-')) {
                expect(classes).toContain('border-blue-');
            } else if (classes?.includes('bg-green-')) {
                expect(classes).toContain('border-green-');
            } else if (classes?.includes('bg-purple-')) {
                expect(classes).toContain('border-purple-');
            } else if (classes?.includes('bg-pink-')) {
                expect(classes).toContain('border-pink-');
            } else if (classes?.includes('bg-zinc-')) {
                expect(classes).toContain('border-zinc-');
            }
        }

        console.log('All color tests passed!');
        await electronApp.close();
    });
});
