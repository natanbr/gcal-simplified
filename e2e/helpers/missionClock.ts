/**
 * Takes Mission Control's wall clock out of the E2E suite's hands.
 *
 * WHY
 * ---
 * The mission scheduler runs on the real clock, and MissionOverlay is mounted
 * on BOTH views, so whether a spec could click anything depended on the time of
 * day. On 2026-09-21 the same commit passed 45 of 45 at 18:00, failed 30 of 45
 * from 19:02 (the default 19:00 evening window) and 13 of 45 at 20:03 — by then
 * the dev profile had that mission running, resumed from an earlier launch.
 *
 * HOW
 * ---
 * `quietMissionClock` runs on every launch (launchApp.ts is the only way in)
 * before any spec code. It rewrites the persisted blob so that no mission is
 * running and today's morning and evening count as already concluded. The
 * scheduler's own "already ran today" check (useMissionScheduler.ts) then skips
 * any window that is open now or opens later today. Mission times and settings
 * are left as they were.
 *
 * The write happens on blank.html in the same window. Every file:// document
 * shares one localStorage, so the store is not mounted there and none of its
 * debounced 500ms persists can land on top of the write. Then the app loads
 * again and reads the quiet blob.
 *
 * Specs that TEST missions start one explicitly after launch (see
 * mission-control.spec.ts). Nothing here runs after the launch.
 *
 * WHAT A SPEC SEES CHANGED
 * ------------------------
 * Morning counts as concluded today, so the quick-game window
 * (`isQuickGameWindowOpen`, gameWindow.ts) is OPEN in every test until the
 * evening start. A spec that tests that gate must seed
 * `lastCompletedOrFailedMorningDate` itself.
 *
 * THE REAL PROFILE: WHAT IS PUT BACK, AND WHAT IS NOT
 * ---------------------------------------------------
 * launchApp reads MISSION_FIELDS before anything is written and writes them
 * back when the app closes. Its shared `test` closes every app a test
 * launched, so a spec that fails or times out restores too. The limits:
 *  - The first document loads inside electron.launch(): Playwright releases
 *    the app's `ready` before launch resolves, so it mounts before anything
 *    here runs. Inside a mission window it starts that mission. If its 500ms
 *    persist lands before the hop to blank.html (a slow machine), the fields
 *    read at launch contain it. A mission whose `startedAt` is at or after the
 *    launch is therefore recorded as NOT running and is not put back.
 *  - `missedMissionStreak` is not restored and does not need to be: only a
 *    mission timing out moves it. A quieted launch has nothing running, and a
 *    mission the launch started is not put back to time out later in the dev app.
 *  - The restore is written on blank.html with the store unmounted, so nothing
 *    broadcasts it. The phone's room keeps showing the quieted state (missions
 *    concluded, none running) until the dev app runs again. A broadcast from
 *    the first document cannot be recalled either.
 *  - The store mounts once more per launch than before (the reload after the
 *    hop), so the real audit trail gets one extra SESSION_START per launch, or
 *    two with E2E_SIMULATE_MISSION_WINDOW.
 *  - A run killed mid-test (Ctrl+C, crash) never reaches close(). The dev
 *    profile keeps "concluded today" until midnight, so that day's remaining
 *    missions do not start in the dev app.
 * Isolating the real-profile specs (mock `auth:check`) removes all of these.
 */

import type { BrowserContext, Page } from '@playwright/test';
import { appendFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const STORAGE_KEY = 'mc-state-v5';
const BLANK_URL = pathToFileURL(path.join(__dirname, 'blank.html')).href;
const OVERLAY = '[data-testid="mc-mission-overlay"]';

/**
 * The only fields of the blob this module writes. The chokepoint guard checks
 * that each one is still declared on MCState: after a rename, writing the old
 * name would do nothing and the suite would depend on the clock again.
 */
export const MISSION_FIELDS = [
    'activeMission',
    'missions',
    'lastCompletedOrFailedMorningDate',
    'lastCompletedOrFailedEveningDate',
] as const;

/** Those fields as they were at launch. A key absent from the blob is absent here too. */
export type MissionSlice = Record<string, unknown>;

/** The two states that broke the suite on 2026-09-21. */
export type FailingState = 'mission-running' | 'window-open-now';

type SliceArgs = { key: string; fields: readonly string[] };

function readSliceInPage({ key, fields }: SliceArgs): MissionSlice {
    const state = JSON.parse(localStorage.getItem(key) ?? '{}') as Record<string, unknown>;
    const slice: MissionSlice = {};
    for (const field of fields) if (field in state) slice[field] = state[field];
    return slice;
}

function restoreSliceInPage({ key, fields, slice }: SliceArgs & { slice: MissionSlice }): void {
    const state = JSON.parse(localStorage.getItem(key) ?? '{}') as Record<string, unknown>;
    for (const field of fields) {
        if (field in slice) state[field] = slice[field];
        else delete state[field];
    }
    localStorage.setItem(key, JSON.stringify(state));
}

function quietBlobInPage(key: string): void {
    const state = JSON.parse(localStorage.getItem(key) ?? '{}') as Record<string, unknown>;
    // Same format as getLocalDateString in behaviorSync.ts: the LOCAL date,
    // which is what the scheduler compares against.
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const today = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const missions = Array.isArray(state['missions']) ? state['missions'] as Array<Record<string, unknown>> : [];

    state['activeMission'] = 'none';
    state['missions'] = missions.map(m => ({ ...m, active: false, startedAt: undefined, durationMins: undefined }));
    state['lastCompletedOrFailedMorningDate'] = today;
    state['lastCompletedOrFailedEveningDate'] = today;
    localStorage.setItem(key, JSON.stringify(state));
}

function seedInPage({ key, kind }: { key: string; kind: FailingState }): void {
    const state = JSON.parse(localStorage.getItem(key) ?? '{}') as Record<string, unknown>;
    const missions = (state['missions'] ?? []) as Array<Record<string, unknown>>;
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const hhmm = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
    // The scheduler never treats a window that wraps past midnight as open, so
    // the window must end today. In the last minutes before midnight none fits.
    const minutesLeft = 24 * 60 - (now.getHours() * 60 + now.getMinutes());

    if (kind === 'mission-running' || minutesLeft < 3) {
        state['activeMission'] = 'evening';
        state['missions'] = missions.map(m => m['phase'] === 'evening'
            ? { ...m, active: true, startedAt: now.toISOString(), durationMins: 60 }
            : { ...m, active: false });
    } else {
        const minutes = Math.min(30, minutesLeft - 1);
        const startsAt = hhmm(now);
        const endsAt = hhmm(new Date(now.getTime() + minutes * 60_000));
        // The scheduler reads missions[].startsAt/endsAt, but SET_SETTINGS
        // re-derives them from settings, and the store dispatches it at mount
        // when the profile has remote pairing keys. Write both, or the window
        // is gone a moment after the app loads.
        state['activeMission'] = 'none';
        state['lastCompletedOrFailedMorningDate'] = null;
        state['lastCompletedOrFailedEveningDate'] = null;
        state['settings'] = { ...(state['settings'] as object), eveningStartsAt: startsAt, eveningDurationMins: minutes };
        state['missions'] = missions.map(m => m['phase'] === 'evening'
            ? { ...m, startsAt, endsAt, active: false, startedAt: undefined, durationMins: undefined }
            : { ...m, active: false });
    }
    localStorage.setItem(key, JSON.stringify(state));
}

const sliceArgs: SliceArgs = { key: STORAGE_KEY, fields: MISSION_FIELDS };

/** Apps quieted without `keep`: throwaway profiles, the only ones seedFailingState may write to. */
const throwawayContexts = new WeakSet<BrowserContext>();

/**
 * A mission this launch started itself is not how the profile was: record it as
 * not running, so the restore does not put a test-started mission back. The
 * running mission's previous `startedAt` is gone, overwritten by the start; a
 * mission that is not running needs none.
 */
export function forgetMissionStartedSince(slice: MissionSlice, launchedAt: number): MissionSlice {
    const missions = Array.isArray(slice['missions']) ? slice['missions'] as Array<Record<string, unknown>> : [];
    const running = missions.find(m => m['phase'] === slice['activeMission']);
    const startedAt = typeof running?.['startedAt'] === 'string' ? Date.parse(running['startedAt']) : Number.NaN;
    if (!running || !(startedAt >= launchedAt)) return slice;

    return {
        ...slice,
        activeMission: 'none',
        missions: missions.map(m => {
            if (m !== running) return m;
            const stopped: Record<string, unknown> = { ...m, active: false };
            delete stopped['startedAt'];
            delete stopped['durationMins'];
            return stopped;
        }),
    };
}

/**
 * Make the just-launched app safe to click, whatever the time. `launchedAt` is
 * Date.now() taken before electron.launch. `keep` is for the real profile: it
 * receives the mission fields as they were BEFORE anything is written, so the
 * caller can put them back even if a later step fails.
 */
export async function quietMissionClock(
    page: Page,
    { launchedAt, keep }: { launchedAt: number; keep?: (before: MissionSlice) => void },
): Promise<void> {
    // Wait for the first document to be the app, and for the store's first
    // persist on a fresh profile. Without the blob there is nothing to rewrite.
    await page.waitForURL(url => url.protocol === 'file:', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction((key: string) => localStorage.getItem(key) !== null, STORAGE_KEY, { timeout: 15_000 });
    const appUrl = page.url();

    await page.goto(BLANK_URL);
    if (keep) keep(forgetMissionStartedSince(await page.evaluate(readSliceInPage, sliceArgs), launchedAt));
    else throwawayContexts.add(page.context());

    if (process.env['E2E_SIMULATE_MISSION_WINDOW'] === '1') {
        await simulateFailingClock(page, appUrl, keep ? 'mission-running' : 'window-open-now');
    }

    await page.evaluate(quietBlobInPage, STORAGE_KEY);
    await page.goto(appUrl);
}

/**
 * E2E_SIMULATE_MISSION_WINDOW=1 puts every launch into a failing state first,
 * so a whole run proves the suite survives it at any hour. It asserts the
 * mission overlay really appeared, or the run would prove nothing. Throwaway
 * profiles get an evening window containing "now" (the 19:00 failure). The
 * real profile gets a running mission (the 20:13 failure), because that stays
 * inside the fields restored on close.
 */
async function simulateFailingClock(page: Page, appUrl: string, kind: FailingState): Promise<void> {
    await page.evaluate(seedInPage, { key: STORAGE_KEY, kind });
    await page.goto(appUrl);
    await page.locator(OVERLAY).waitFor({ state: 'visible', timeout: 15_000 });
    // Said out loud: a silent switch cannot be told apart from one that never fired.
    console.info(`[e2e] E2E_SIMULATE_MISSION_WINDOW: ${kind} reproduced, mission overlay up; quieting it`);
    await page.goto(BLANK_URL);
}

/**
 * Put a THROWAWAY profile into a failing state for a regression test. Writes
 * on blank.html so the store cannot persist over the seed, then reloads the
 * app. Refuses any other page: the window seed writes `settings`, which is
 * outside the fields restored on the real profile.
 */
export async function seedFailingState(page: Page, kind: FailingState): Promise<void> {
    if (!throwawayContexts.has(page.context())) {
        throw new Error(
            'seedFailingState only writes to a throwaway profile launched through launchApp ' +
            '(a --user-data-dir launch, e.g. mcTest / launchMC). This page is not one.',
        );
    }
    const appUrl = page.url();
    await page.goto(BLANK_URL);
    await page.evaluate(seedInPage, { key: STORAGE_KEY, kind });
    await page.goto(appUrl);
}

/**
 * Put the real profile's mission fields back. Leaves the page on blank.html,
 * with the store unmounted, so nothing can write after this. Call it right
 * before closing the app. E2E_MISSION_RESTORE_LOG=<file> appends a
 * before/after record per launch, as proof for a run.
 */
export async function restoreMissionSlice(page: Page, before: MissionSlice): Promise<void> {
    await page.goto(BLANK_URL);
    await page.evaluate(restoreSliceInPage, { ...sliceArgs, slice: before });
    const after = await page.evaluate(readSliceInPage, sliceArgs);
    const restored = JSON.stringify(after) === JSON.stringify(before);
    if (!restored) console.warn('[e2e] dev profile mission fields differ after restore', { before, after });

    const log = process.env['E2E_MISSION_RESTORE_LOG'];
    if (log) appendFileSync(log, `${JSON.stringify({ t: new Date().toISOString(), restored, before, after })}\n`);
}
