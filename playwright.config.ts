import { defineConfig } from '@playwright/test';

export default defineConfig({
    testDir: './e2e',
    fullyParallel: true,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 2 : 0,
    // Each test launches a real fullscreen Electron instance and they all share
    // the same userData (config.json, localStorage). Parallel instances race on
    // that shared state (settings-power even writes it), causing phantom
    // failures — so run the Electron suite one app at a time.
    workers: 1,
    reporter: 'html',
    timeout: 60000,
    use: {
        trace: 'on-first-retry',
        screenshot: 'on',
        video: 'on-first-retry',
    },
    projects: [
        {
            name: 'electron',
            testMatch: '**/*.spec.ts',
        },
    ],
});
