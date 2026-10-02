/**
 * Mission Control fits a 1920x1080 touchscreen at 100 %, 125 % and 150 % Windows scaling.
 *
 * The child plays fullscreen on a 1080p panel at 150 %, which the app sees as 1280x720 CSS px.
 * Release QA (v0.0.43, 3.13.1) found that size broken since at least v0.0.42: Space Rescue's
 * panel is one viewport tall with `overflow: hidden`, and a 432 px board stacked over a 224 px
 * tray needs about 860 px, so only the top ~40 % of each tray shape showed and the child
 * grabbed shapes he could barely see. On the main screen `.mc-root` is `overflow: hidden` too,
 * and column 3 cut the Privileges card with Phone Games below the screen edge.
 *
 * A jsdom test cannot see any of this: it has no layout. So each size launches the built app on
 * a throwaway profile with a forced device scale factor and a window of the matching size, and
 * measures what the browser actually laid out (journal 2026-09-07: never sum declared CSS).
 * "Visible" means the element's box clipped by the viewport and by every ancestor whose
 * overflow is not `visible`.
 */

import { expect } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';
import { launchApp, test } from './helpers/launchApp';
import { ELECTRON_MAIN, gotoMC, patchMCCollection, patchMCState, STORAGE_KEY } from './helpers/mcApp';
import { createIsolatedUserData, removeUserData, userDataArg } from './helpers/userDataDir';

/** A 1920x1080 panel at each Windows scaling, as CSS px. */
const SIZES = [
    { scale: 1, width: 1920, height: 1080 },
    { scale: 1.25, width: 1536, height: 864 },
    { scale: 1.5, width: 1280, height: 720 },
] as const;

/** Board and tray cells must keep their size: a finger has to hit them. */
const BOARD_CELL_PX = 48;
const TRAY_CELL_PX = 36;

interface Seen { label: string; visible: number }

/** Visible fraction of each element matching `selector` under `root`. */
async function visibility(page: Page, root: string, selector: string): Promise<Seen[]> {
    return page.evaluate(({ rootSel, sel }) => {
        const scope = document.querySelector(rootSel);
        if (!scope) throw new Error(`no ${rootSel}`);
        // An element with no box is not drawn at all, so it cannot be cut.
        const drawn = ([...scope.querySelectorAll(sel)] as HTMLElement[])
            .filter(el => el.getBoundingClientRect().width > 0 && el.getBoundingClientRect().height > 0);
        return drawn.map(el => {
            const r = el.getBoundingClientRect();
            let left = Math.max(r.left, 0), top = Math.max(r.top, 0);
            let right = Math.min(r.right, innerWidth), bottom = Math.min(r.bottom, innerHeight);
            for (let a = el.parentElement; a; a = a.parentElement) {
                const cs = getComputedStyle(a);
                if (cs.overflowX === 'visible' && cs.overflowY === 'visible') continue;
                const ar = a.getBoundingClientRect();
                left = Math.max(left, ar.left); top = Math.max(top, ar.top);
                right = Math.min(right, ar.right); bottom = Math.min(bottom, ar.bottom);
            }
            const area = r.width * r.height;
            const shown = area > 0 ? (Math.max(0, right - left) * Math.max(0, bottom - top)) / area : 0;
            const label = el.getAttribute('title') ?? el.getAttribute('data-testid') ?? (el.textContent ?? '').trim().slice(0, 20);
            // Sub-pixel rounding at 125 %/150 % is not a cut; a third of a pixel is.
            return { label, visible: shown > 0.995 ? 1 : Math.round(shown * 1000) / 1000 };
        });
    }, { rootSel: root, sel: selector });
}

const cut = (seen: Seen[]) => seen.filter(s => s.visible < 1);

/** Wait until the column-3 cards have slid in (Framer, `y: 10 → 0`) before measuring them. In the
 *  hidden window they hold the initial `translateY(10px)` for about 2 s, then jump into place, so a
 *  "has it stopped moving" check passes too early: wait for no transform on any ancestor instead. */
async function mainViewSettled(page: Page) {
    await expect.poll(() => page.evaluate(() => {
        let moved = 0;
        for (let a = document.querySelector('button[title="Phone Games"]'); a; a = a.parentElement) {
            if (getComputedStyle(a).transform !== 'none') moved++;
        }
        return moved;
    }), { message: 'the main view settles' }).toBe(0);
}

async function launchAt(dir: string, scale: number, width: number, height: number) {
    const app = await launchApp({
        args: [ELECTRON_MAIN, userDataArg(dir), `--force-device-scale-factor=${scale}`],
        timeout: 60_000,
        env: { ...process.env, NODE_ENV: 'development' },
    });
    const page = await app.firstWindow();
    await app.evaluate(({ BrowserWindow }, size) => {
        BrowserWindow.getAllWindows()[0].setContentSize(size[0], size[1]);
    }, [width, height] as [number, number]);
    await gotoMC(page);
    return { app, page };
}

/**
 * Open Space Rescue the way the child does: a Quick Game goal, "Use!", the selector, "Play Game!".
 * The clicks are dispatched rather than performed: the E2E window is never shown, and a hidden
 * window draws about two frames a second (measured; no switch changes it), so each actionability
 * wait and each pointer step costs a second or more. What is under test here is layout.
 */
async function openSpaceRescue(page: Page) {
    // The quick-game window closes at the evening start (19:00 by default); this spec is about
    // layout, not that gate, so it must not depend on the time of day it runs.
    await page.evaluate((key: string) => {
        const state = JSON.parse(localStorage.getItem(key) ?? '{}') as { settings?: Record<string, unknown> };
        localStorage.setItem(key, JSON.stringify({ ...state, settings: { ...state.settings, eveningStartsAt: '23:59' } }));
    }, STORAGE_KEY);
    await patchMCCollection(page, 'cases', 0, { status: 'active', reward: 'quick-game', tokenCount: 0, targetCount: 1 });
    await gotoMC(page);
    const use = page.locator('[aria-label="Play snake game"]');
    await expect(use, 'the Quick Game goal can be used').toBeEnabled();
    await use.dispatchEvent('click');
    await page.getByText('Space Rescue', { exact: true }).first().dispatchEvent('click');
    await page.getByText('Play Game! 🚀').dispatchEvent('click');
    await page.locator('[data-testid="blocks-grid"]').waitFor({ state: 'visible' });
    // The panel springs in from scale 0.9; measure once the board is drawn at its layout size.
    await expect.poll(() => page.evaluate(() => {
        const grid = document.querySelector<HTMLElement>('[data-testid="blocks-grid"]');
        return grid ? Math.abs(grid.getBoundingClientRect().width - grid.offsetWidth) : Infinity;
    }), { message: 'the game panel settles' }).toBeLessThan(0.5);
}

/**
 * Mid-drag, every ghost cell must sit exactly on the board cell it names. The ghost is an overlay
 * that reproduces the board's box model, and it lands on the cells only while its wrapper
 * shrink-wraps the board (BlocksCanvas.tsx); a layout that stretches that wrapper moves every
 * ghost, and so every drop, off the cells (go/no-go rule G10).
 */
async function ghostOffsetMidDrag(page: Page): Promise<{ ghostCells: number; maxOffsetPx: number }> {
    const shape = page.locator('[data-testid="draggable-shape"]').first();
    const from = await shape.locator('div').first().boundingBox();
    const target = await page.locator('[data-cell-index="3-3"]').boundingBox();
    if (!from || !target) throw new Error('no tray shape or board cell to drag between');
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps: 2 });
    const result = await page.evaluate(() => {
        const overlay = document.querySelector('[data-testid="projection-overlay"]');
        let maxOffsetPx = 0;
        const ghosts = overlay ? ([...overlay.children] as HTMLElement[]) : [];
        for (const ghost of ghosts) {
            const r = Number(ghost.style.gridRowStart) - 1, c = Number(ghost.style.gridColumnStart) - 1;
            const a = ghost.getBoundingClientRect();
            const b = document.querySelector(`[data-cell-index="${r}-${c}"]`)!.getBoundingClientRect();
            maxOffsetPx = Math.max(maxOffsetPx, Math.abs(a.left - b.left), Math.abs(a.top - b.top),
                Math.abs(a.right - b.right), Math.abs(a.bottom - b.bottom));
        }
        return { ghostCells: ghosts.length, maxOffsetPx };
    });
    await page.mouse.up();
    return result;
}

for (const { scale, width, height } of SIZES) {
    test(`Mission Control and Space Rescue fit ${width}x${height} at ${scale * 100} %`, async () => {
        const dir = createIsolatedUserData();
        let app: ElectronApplication | undefined;
        try {
            let page: Page;
            ({ app, page } = await launchAt(dir, scale, width, height));
            expect(await page.evaluate(() => [innerWidth, innerHeight])).toEqual([
                expect.closeTo(width, -1), expect.closeTo(height, -1),
            ]);

            // ── Main view: every control on screen, Privileges with Phone Games ──
            await mainViewSettled(page);
            expect.soft(cut(await visibility(page, '.mc-root', 'button')), 'main-view controls cut off').toEqual([]);
            const privileges = await visibility(page, '.mc-root', 'button[title="Phone Games"], button[title="Knife"]');
            expect(privileges.map(p => p.label)).toEqual(['Knife', 'Phone Games']);
            expect.soft(cut(privileges), 'Privileges card cut off').toEqual([]);

            // ── Settings: the dialog opens with its Save button on screen (the reload below closes it) ──
            await page.locator('[data-testid="mc-settings-btn"]').dispatchEvent('click');
            await page.locator('[data-testid="mc-settings-save"]').waitFor({ state: 'visible' });
            expect.soft(cut(await visibility(page, 'body', '[data-testid="mc-settings-save"]')), 'Settings Save cut off').toEqual([]);

            // ── Space Rescue: the whole board, every tray shape, every button ──
            await openSpaceRescue(page);
            expect.soft(cut(await visibility(page, '.mc-root', '[data-testid="blocks-grid"]')), 'board cut off').toEqual([]);
            const shapes = await visibility(page, '.mc-root', '[data-testid="draggable-shape"]');
            expect(shapes.length, 'three tray shapes dealt').toBeGreaterThanOrEqual(3);
            expect.soft(cut(shapes), 'tray shapes cut off').toEqual([]);
            expect.soft(cut(await visibility(page, '[data-testid="blocks-game-panel"]', 'button')), 'game controls cut off').toEqual([]);

            const cells = await page.evaluate(() => ({
                board: document.querySelector('[data-cell-index="0-0"]')!.getBoundingClientRect().width,
                tray: ([...document.querySelectorAll('[data-testid="draggable-shape"]')] as HTMLElement[])
                    .map(s => (s.firstElementChild as HTMLElement).getBoundingClientRect().width)
                    .filter(w => w > 30),
            }));
            expect(cells.board, 'board cells keep their size').toBeCloseTo(BOARD_CELL_PX, 0);
            expect(cells.tray, 'tray cells keep their size').toEqual([TRAY_CELL_PX, TRAY_CELL_PX, TRAY_CELL_PX]);

            const ghost = await ghostOffsetMidDrag(page);
            expect(ghost.ghostCells, 'a ghost is shown mid-drag').toBeGreaterThan(0);
            expect(ghost.maxOffsetPx, 'ghost cells sit on the board cells').toBeLessThanOrEqual(0.5);

            await page.screenshot({ path: test.info().outputPath(`space-rescue-${width}x${height}.png`) });

            // ── The tallest column 3: a broken shield adds its "Bank locked" row ──
            await page.keyboard.press('Escape');
            await page.locator('[data-testid="blocks-grid"]').waitFor({ state: 'detached' });
            await page.waitForTimeout(1000); // the store persists 500 ms after a change; let that land first
            await patchMCState(page, { missedMissionStreak: 6 });
            await gotoMC(page);
            await expect(page.getByText('Bank locked — finish your next mission')).toBeVisible();
            await mainViewSettled(page);
            expect.soft(cut(await visibility(page, '.mc-root', '[role="status"], button')), 'cut off with the shield broken').toEqual([]);
        } finally {
            try {
                await app?.close();
            } finally {
                removeUserData(dir);
            }
        }
    });
}
