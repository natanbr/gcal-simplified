/**
 * The ONE place the E2E suite starts Electron.
 *
 * Every launch goes through here: the mcTest fixture, launchMC, and each spec
 * that manages its own app. That is what guarantees no launch skips
 * quietMissionClock (missionClock.ts), which is why the suite passes at 19:00.
 * src/__tests__/e2e-launch-chokepoint.test.ts fails if anything else under e2e/
 * reaches for Playwright's Electron launcher.
 *
 * Options go straight through to Playwright. Whether the launch uses a
 * throwaway profile is read the same way the isolation guard reads it: a
 * `--user-data-dir=` switch in `args`. Without one the app runs on the
 * developer's real profile, and the mission fields quietMissionClock rewrote
 * are put back when the app closes.
 *
 * Specs take `test` from here (or `mcTest` from mcApp.ts, built on it), never
 * from '@playwright/test'. Its teardown closes every app launched during the
 * test that is still open. A real-profile spec that fails or times out before
 * its own close() therefore still restores the profile. The guard enforces
 * that import.
 *
 * One app per test, launched in the test or its beforeEach. The guard forbids
 * beforeAll/afterAll: Playwright runs beforeAll before this per-test fixture
 * exists, so the first test's teardown would close an app shared that way.
 * `auto: 'all-hooks-included'` is no fix; it tears down after each beforeAll.
 */

import { test as base, _electron as electron } from '@playwright/test';
import type { ElectronApplication } from '@playwright/test';
import { quietMissionClock, restoreMissionSlice, type MissionSlice } from './missionClock';

export type LaunchOptions = NonNullable<Parameters<typeof electron.launch>[0]>;

/** Apps launched in this worker and not yet closed. */
const openApps = new Set<ElectronApplication>();

export async function launchApp(options: LaunchOptions): Promise<ElectronApplication> {
    // Taken BEFORE the launch: a mission started at or after it was started by
    // this launch, and is not part of the profile's state to put back.
    const launchedAt = Date.now();
    const app = await electron.launch(options);
    const isolated = (options.args ?? []).some(arg => arg.startsWith('--user-data-dir='));
    let before: MissionSlice | undefined;
    trackClose(app, () => before);
    try {
        const page = await app.firstWindow();
        await quietMissionClock(page, { launchedAt, keep: isolated ? undefined : slice => { before = slice; } });
        return app;
    } catch (err) {
        // The caller never receives `app`, so it cannot close it. A live
        // Electron would hold the real profile's single-instance lock (every
        // later spec then times out at firstWindow) or keep the throwaway
        // profile locked (EBUSY). On the real profile this close() also
        // restores: `before` is set before quietMissionClock writes anything.
        await app.close().catch(() => { /* already dead is fine */ });
        throw err;
    }
}

/**
 * Wrap close() so that it puts the real profile's mission fields back before
 * the app exits, and so the shared `test` can see which apps are still open.
 * Idempotent, and a failed restore never stops the close.
 */
function trackClose(app: ElectronApplication, snapshot: () => MissionSlice | undefined): void {
    const close = app.close.bind(app);
    let closing: Promise<void> | undefined;
    openApps.add(app);
    app.close = () => (closing ??= (async () => {
        try {
            const before = snapshot();
            const page = app.windows()[0];
            if (before && page) await restoreMissionSlice(page, before);
            else if (before) console.warn('[e2e] the app has no window left, so the dev profile mission fields were NOT restored');
        } catch (err) {
            console.warn('[e2e] could not restore the dev profile mission fields:', err);
        } finally {
            openApps.delete(app);
            await close();
        }
    })());
}

/**
 * `test` for every spec. The auto fixture closes whatever a test launched and
 * left open: after afterEach hooks, and also when the test failed or timed out.
 */
export const test = base.extend<{ closeLaunchedApps: void }>({
    closeLaunchedApps: [
        // eslint-disable-next-line no-empty-pattern
        async ({}, use) => {
            await use();
            for (const app of [...openApps]) {
                await app.close().catch(err => console.warn('[e2e] could not close an app the test left open:', err));
            }
        },
        { auto: true },
    ],
});
