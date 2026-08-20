import { defineConfig } from '@playwright/test';

// Run the Electron windows offscreen by default. Every spec launches a real app
// and passes `{...process.env}` through to `electron.launch`, so setting this
// here reaches all of them without touching a single spec file. Electron cannot
// be truly headless on Windows, but an unshown window still loads, renders and
// is fully drivable over CDP — while no longer stealing focus 44 times in a row.
// Set E2E_HEADED=1 to watch the run instead.
if (!process.env.E2E_HEADED) {
    process.env.E2E_HEADLESS = '1';
}

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
