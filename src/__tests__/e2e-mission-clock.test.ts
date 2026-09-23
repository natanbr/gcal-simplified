// ============================================================
// e2e/helpers/missionClock.ts — the two decisions the E2E suite cannot see
// ------------------------------------------------------------
// An E2E run proves the app is clickable at 19:00. It cannot prove these,
// because on a normal machine they never happen:
//   * forgetMissionStartedSince: on a slow machine, inside a mission window,
//     the first document persists the mission IT started before launchApp
//     reads the real profile's fields. That mission must be recorded as not
//     running, or close() "restores" a test-started mission into the dev app.
//   * seedFailingState refuses any page not launched on a throwaway profile:
//     its window seed writes `settings`, which the real-profile restore does
//     not put back.
// ============================================================

import { describe, it, expect, vi } from 'vitest';
import type { Page } from '@playwright/test';
import {
    forgetMissionStartedSince,
    quietMissionClock,
    seedFailingState,
    type MissionSlice,
} from '../../e2e/helpers/missionClock';

const LAUNCHED_AT = Date.parse('2026-09-21T19:05:00.000-07:00');

function sliceWithEveningStartedAt(startedAt: string | undefined): MissionSlice {
    return {
        activeMission: 'evening',
        missions: [
            { phase: 'morning', startsAt: '06:00', endsAt: '06:30', active: false },
            { phase: 'evening', startsAt: '19:00', endsAt: '20:00', active: true, durationMins: 60, ...(startedAt ? { startedAt } : {}) },
        ],
        lastCompletedOrFailedMorningDate: '2026-09-21',
        lastCompletedOrFailedEveningDate: null,
    };
}

describe('forgetMissionStartedSince', () => {
    it('records a mission started after the launch as not running', () => {
        const slice = sliceWithEveningStartedAt(new Date(LAUNCHED_AT + 400).toISOString());
        const forgotten = forgetMissionStartedSince(slice, LAUNCHED_AT);

        expect(forgotten['activeMission']).toBe('none');
        const [morning, evening] = forgotten['missions'] as Array<Record<string, unknown>>;
        expect(evening['active']).toBe(false);
        expect(evening).not.toHaveProperty('startedAt');
        expect(evening).not.toHaveProperty('durationMins');
        expect(evening['startsAt']).toBe('19:00');
        expect(morning).toBe((slice['missions'] as unknown[])[0]);
        expect(forgotten['lastCompletedOrFailedMorningDate']).toBe('2026-09-21');
    });

    it('treats a start at the exact launch instant as started by the launch', () => {
        const forgotten = forgetMissionStartedSince(sliceWithEveningStartedAt(new Date(LAUNCHED_AT).toISOString()), LAUNCHED_AT);
        expect(forgotten['activeMission']).toBe('none');
    });

    it('keeps a mission that was already running before the launch', () => {
        const slice = sliceWithEveningStartedAt(new Date(LAUNCHED_AT - 1).toISOString());
        expect(forgetMissionStartedSince(slice, LAUNCHED_AT)).toBe(slice);
    });

    it('leaves the slice alone when nothing is running, or the start time is unknown', () => {
        const idle = { ...sliceWithEveningStartedAt(new Date(LAUNCHED_AT + 400).toISOString()), activeMission: 'none' };
        expect(forgetMissionStartedSince(idle, LAUNCHED_AT)).toBe(idle);

        const noStart = sliceWithEveningStartedAt(undefined);
        expect(forgetMissionStartedSince(noStart, LAUNCHED_AT)).toBe(noStart);
    });

    it('never mutates the slice it was given', () => {
        const slice = sliceWithEveningStartedAt(new Date(LAUNCHED_AT + 400).toISOString());
        const before = JSON.stringify(slice);
        forgetMissionStartedSince(slice, LAUNCHED_AT);
        expect(JSON.stringify(slice)).toBe(before);
    });
});

/** The Page members missionClock calls on the paths these tests reach. Method
 *  syntax keeps their parameters bivariant, so a real Page fits this shape and
 *  `fake as Page` is a plain downcast: the fake needs the members, not
 *  Playwright's generics. `locator` is deliberately absent — only
 *  simulateFailingClock uses it, behind E2E_SIMULATE_MISSION_WINDOW, which no
 *  unit test sets; a test that reaches it gets a loud TypeError, not a wrong pass. */
interface FakedPage {
    context(): object;
    url(): string;
    goto(url: string): Promise<unknown>;
    waitForURL(...args: unknown[]): Promise<unknown>;
    waitForFunction(...args: unknown[]): Promise<unknown>;
    evaluate(...args: unknown[]): Promise<unknown>;
}

/** Just enough of a Playwright Page for missionClock: every call resolves, and is recorded. */
function fakePage(): { page: Page; goto: ReturnType<typeof vi.fn> } {
    const context = {};
    const goto = vi.fn(async () => null);
    const fake: FakedPage = {
        context: () => context,
        url: () => 'file:///C:/app/dist/index.html?mc=1',
        goto,
        waitForURL: vi.fn(async () => undefined),
        waitForFunction: vi.fn(async () => undefined),
        evaluate: vi.fn(async () => ({})),
    };
    return { page: fake as Page, goto };
}

describe('seedFailingState', () => {
    it('refuses a page that was not launched on a throwaway profile, before touching it', async () => {
        const { page, goto } = fakePage();
        await expect(seedFailingState(page, 'mission-running')).rejects.toThrow(/throwaway profile/);
        expect(goto).not.toHaveBeenCalled();
    });

    it('refuses a real-profile launch (one quieted with `keep`)', async () => {
        const { page } = fakePage();
        await quietMissionClock(page, { launchedAt: LAUNCHED_AT, keep: () => undefined });
        await expect(seedFailingState(page, 'window-open-now')).rejects.toThrow(/throwaway profile/);
    });

    it('seeds a throwaway launch (one quieted without `keep`)', async () => {
        const { page, goto } = fakePage();
        await quietMissionClock(page, { launchedAt: LAUNCHED_AT });
        goto.mockClear();
        await expect(seedFailingState(page, 'window-open-now')).resolves.toBeUndefined();
        expect(goto).toHaveBeenCalledTimes(2); // to blank.html, then back to the app
    });
});
