/**
 * A change made just before the app closes is there at the next launch (2026-11-08).
 *
 * Mission Control saves its state (mc-state-v5) 500 ms after a change and sends
 * new log lines to the audit file 1 s after one. Closing the window, or the
 * auto-updater's quit before it installs, unmounts nothing, and both timers died
 * with the page: a coin added in the last half second was gone at the next
 * launch, and its line never reached audit-log.ndjson. Both are now written on
 * the page's `pagehide` (MCStoreProvider.tsx, useAuditTrail.ts).
 *
 * Each test adds a coin through the Bank admin popup, stops the app well inside
 * both debounces (it fails, rather than passes, when it could not), then
 * launches the SAME throwaway profile again and reads what was kept. The third
 * kills every app process, as the NSIS installer does about 2.5 s after
 * quitAndInstall, 100 ms after the window closed: after the page's pagehide,
 * before the app is done quitting (it asserts the kill landed). The app exits
 * by itself within 0.6 s, so the installer normally finds nothing to kill.
 *
 * Known limit (measured 2026-11-08): Chromium writes localStorage to disk in its
 * storage-service process, which commits the pagehide save as the page goes. A
 * kill of every process within about 10 ms of the window closing lost the coin
 * (0 of 4; its audit line was kept, appendFileSync in the main process); killed
 * 25-50 ms after the quit, 1 of 4 kept, from 40 ms 8 of 8.
 *
 * The app is stopped from its main process, never with Playwright's app.close():
 * with `screenshot: 'on'` (playwright.config.ts) that screenshots every page
 * before it quits, which kept the page alive ~2.8 s, long enough for both
 * debounces to run, so the test passed without the fix.
 */

import type { ElectronApplication, Page } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from './helpers/launchApp';
import { ELECTRON_MAIN, expect, launchMC, readMCField } from './helpers/mcApp';
import { createIsolatedUserData, removeUserData } from './helpers/userDataDir';

/** The log line of a coin added by hand (bankLog.ts). */
const ADDED = 'Manual tokens added';
/** Stop sooner than this after the tap, or the store's own 500 ms save may have run first. */
const MAX_TAP_TO_STOP_MS = 400;
const KILL = 'quit, then kill every app process just after the window closes';
/**
 * Clear of the storage service's commit (done ~40 ms after the quit, see the limit above) and
 * before the app's own exit (~150-600 ms after it). At 50 ms the margin over the commit was 20-30 ms.
 */
const KILL_AFTER_CLOSE_MS = 100;

type Stop = 'close the window' | 'quit' | typeof KILL;

const sleep = (ms: number) => new Promise<undefined>(resolve => setTimeout(() => resolve(undefined), ms));

/** Long-press the Bank header (a short tap opens the cheat trap) and press +1. Returns when +1 was tapped. */
async function addCoin(page: Page, before: number): Promise<number> {
    const bank = page.getByRole('button', { name: /Bank admin/i });
    await bank.dispatchEvent('pointerdown');
    await page.waitForTimeout(700);
    await bank.dispatchEvent('pointerup');
    const plus = page.locator('[data-testid="mc-bank-admin-popup"]').getByRole('button', { name: '+1' });
    // Stamped in the page as the click lands: click() first waits, seconds at times, for the popup to stop moving.
    const tapped = page.evaluate(() => new Promise<number>(resolve => {
        document.addEventListener('click', () => resolve(Date.now()), { once: true, capture: true });
    }));
    await plus.click();
    await expect(bank.locator('div').last(), 'the coin is on screen').toHaveText(String(before + 1));
    return tapped;
}

/** Audit-file lines for one coin added by hand that left `bank` coins in the bank. */
function auditedCoins(dir: string, bank: number): number {
    const file = join(dir, 'audit-log.ndjson');
    if (!existsSync(file)) return 0;
    return readFileSync(file, 'utf-8').split('\n').filter(Boolean)
        .map(line => JSON.parse(line) as { msg?: string; d?: number; bank?: number })
        .filter(e => e.msg === ADDED && e.d === 1 && e.bank === bank).length;
}

/** Every process of the app, the main one first, as the installer kills every one of them. Read just before the quit: a pid read earlier may belong to another program by then. */
function appPids(app: ElectronApplication): Promise<number[]> {
    return app.evaluate(({ app: electronApp }) =>
        [process.pid, ...electronApp.getAppMetrics().map(m => m.pid).filter(pid => pid !== process.pid)]);
}

/**
 * Stop the app from its main process and wait for it to exit; for KILL, kill it just after its window
 * closed. Fails, rather than passes, when the stop comes too long after the tap to prove anything.
 */
async function stopApp(app: ElectronApplication, page: Page, how: Stop, tapped: number): Promise<void> {
    const proc = app.process();
    const pids = how === KILL ? await appPids(app) : [];
    const sinceTap = Date.now() - tapped;
    console.info(`[e2e] stopping the app ${sinceTap} ms after the tap`);
    expect(sinceTap, `too slow to prove anything: ${sinceTap} ms from the tap to the stop, so the 500 ms save may have run first`)
        .toBeLessThan(MAX_TAP_TO_STOP_MS);
    const asked = Date.now();
    const exit = new Promise<{ ms: number; code: number | null }>(resolve =>
        proc.once('exit', code => resolve({ ms: Date.now() - asked, code })));
    const windowClosed = new Promise<number>(resolve => page.once('close', () => resolve(Date.now() - asked)));
    // Not awaited: the quit may cut the reply, and the clock runs from `asked`.
    void app.evaluate(({ app: electronApp, BrowserWindow }, closeWindow) => {
        if (closeWindow) BrowserWindow.getAllWindows()[0]?.close();
        else electronApp.quit();
    }, how === 'close the window').catch(() => { /* the process is going away */ });

    if (how === KILL) {
        const closedAfter = await Promise.race([windowClosed, sleep(10_000)]);
        expect(closedAfter, 'the window closed').toBeDefined();
        await sleep(KILL_AFTER_CLOSE_MS);
        for (const pid of pids) {
            try { process.kill(pid, 'SIGKILL'); } catch { /* already gone */ }
        }
        const killedAfter = Date.now() - asked;
        const { ms, code } = await exit;
        console.info(`[e2e] ${how}: window closed ${closedAfter} ms, killed ${killedAfter} ms, exited ${ms} ms after the quit (exit code ${code})`);
        expect(code, 'the kill landed while the app was still shutting down: an exit by itself is code 0').not.toBe(0);
    } else {
        const exited = await Promise.race([exit, sleep(30_000)]);
        if (!exited) throw new Error(`the app did not exit within 30 s of "${how}"`);
        console.info(`[e2e] ${how}: the app exited ${exited.ms} ms after it was asked (exit code ${exited.code})`);
    }
    await app.close(); // the process is gone; this lets Playwright and launchApp let go of it
}

/** Launch, add a coin, stop the app at once, relaunch the same profile and check what was kept. */
async function expectCoinKept(how: Stop): Promise<void> {
    const dir = createIsolatedUserData();
    let app: ElectronApplication | undefined;
    try {
        let page: Page;
        ({ app, page } = await launchMC(dir));
        const before = (await readMCField<number>(page, 'bankCount')) ?? 0;
        const tapped = await addCoin(page, before);
        expect(await readMCField<number>(page, 'bankCount'), 'precondition: the save is still waiting on its 500 ms debounce').toBe(before);
        await stopApp(app, page, how, tapped);
        expect.soft(auditedCoins(dir, before + 1), 'the coin\'s log line is in the audit file').toBe(1);

        ({ app, page } = await launchMC(dir));
        expect(await readMCField<number>(page, 'bankCount'), 'the coin is still in the bank').toBe(before + 1);
        const logs = (await readMCField<Array<{ message: string }>>(page, 'activityLogs')) ?? [];
        expect(logs[0]?.message, 'and its line is the newest in the in-app log').toBe(ADDED);
        await app.close();
        expect(auditedCoins(dir, before + 1), 'the relaunch did not write the line again').toBe(1);
    } finally {
        try {
            await app?.close();
        } finally {
            removeUserData(dir);
        }
    }
}

test.describe('Mission Control — a change made just before closing is kept', () => {
    test.skip(!existsSync(ELECTRON_MAIN), 'Electron build not present');
    test.setTimeout(120_000);

    test('closing the window at once keeps the coin and its audit line', async () => {
        await expectCoinKept('close the window');
    });

    test('a quit at once (the updater\'s quitAndInstall quits first) keeps them', async () => {
        await expectCoinKept('quit');
    });

    test('a kill of every process while the app is still quitting (the installer kills the app) keeps them', async () => {
        await expectCoinKept(KILL);
    });
});
