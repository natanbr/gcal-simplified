import { defineConfig } from '@playwright/test';

// Run the Electron windows offscreen by default. Every spec launches a real app
// and passes `{...process.env}` through to `electron.launch`, so setting this
// here reaches all of them without touching a single spec file. Electron cannot
// be truly headless on Windows, but an unshown window still loads, renders and
// is fully drivable over CDP — while no longer stealing focus 44 times in a row.
// Set E2E_HEADED=1 to watch the run instead.
//
// --headed/--ui/--debug (and PWDEBUG) only affect Playwright's browser
// fixtures, not manual `electron.launch` — without this check the pre-existing
// `npm run test:headed` / `test:debug` / `test:ui` scripts silently ran with a
// hidden app window, which reads as a hung suite.
const wantsHeaded =
    process.env.E2E_HEADED ||
    process.env.PWDEBUG ||
    ['--headed', '--ui', '--debug'].some(flag => process.argv.includes(flag));
if (!wantsHeaded) {
    process.env.E2E_HEADLESS = '1';
}

export default defineConfig({
    testDir: './e2e',
    // Fails the run if an isolated launch left its throwaway profile behind.
    // The source-text guard in src/__tests__/e2e-state-isolation.test.ts cannot
    // see that — it only proves the cleanup is *written*, not that it ran.
    globalSetup: './e2e/global-profile-leak-check.ts',
    fullyParallel: true,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 2 : 0,
    // The Mission Control specs and week-display-customization now get a
    // throwaway userData directory each (e2e/helpers/userDataDir.ts) and no
    // longer race — but the 8 calendar specs still share the real profile, and
    // parallel instances contend on the single-instance lock and clobber
    // config.json. Until those are isolated too, one app at a time.
    workers: 1,
    // `open: 'never'` matters as much as the offscreen windows above: the html
    // reporter's default is 'on-failure', so any red run launches a browser at
    // the report — which is the OTHER thing that pops up mid-work. Read it with
    // `npx playwright show-report` when you actually want it.
    reporter: [['html', { open: 'never' }]],
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
