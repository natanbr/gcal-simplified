/**
 * Mission Control fits a 1920x1080 touchscreen at 100 %, 125 % and 150 % Windows scaling.
 *
 * The child plays fullscreen on a 1080p panel at 150 %, which the app sees as 1280x720 CSS px.
 * Release QA (v0.0.43, 3.13.1) found that size broken since at least v0.0.42: every Mission
 * Control view is one screen tall with `overflow: hidden`, so what does not fit is cut, silently.
 * Space Rescue showed the top 13-41 % of each tray shape and the main view lost Phone Games.
 * The thresholds that decide each layout are measured and stated once, in
 * src/mission-control/styles/mc-short-screens.css; this spec checks their result at each size.
 *
 * A jsdom test cannot see any of this: it has no layout. So each size launches the built app on
 * a throwaway profile with a forced device scale factor and a window of the matching size, and
 * measures what the browser actually laid out (journal 2026-09-07: never sum declared CSS).
 * "Visible" means the element's box clipped by the viewport and by every ancestor whose
 * overflow is not `visible`.
 *
 * The clicks are dispatched rather than performed: the E2E window is never shown, and a hidden
 * window draws about two frames a second (measured; no switch changes it), so each actionability
 * wait and each pointer step costs a second or more. What is under test here is layout.
 */

import { expect } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';
import { test } from './helpers/launchApp';
import { gotoMC, launchMC, patchMCCollection, patchMCState, readMCField } from './helpers/mcApp';
import { createIsolatedUserData, removeUserData } from './helpers/userDataDir';

/** A 1920x1080 panel at each Windows scaling, as CSS px, and where Space Rescue's tray must be. */
const SIZES = [
    { scale: 1, width: 1920, height: 1080, tray: 'under' },
    { scale: 1.25, width: 1536, height: 864, tray: 'beside' },
    { scale: 1.5, width: 1280, height: 720, tray: 'beside' },
] as const;

/** Board cells, tray cells and numpad keys must stay finger-sized. */
const BOARD_CELL_PX = 48;
const TRAY_CELL_PX = 36;
const MIN_KEY_PX = 72;

const SETTLE = { timeout: 15_000, intervals: [100] };

interface Seen { label: string; visible: number }

/** Visible fraction of each drawn element matching `selector` under `root`. */
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
            const shown = (Math.max(0, right - left) * Math.max(0, bottom - top)) / (r.width * r.height);
            const label = el.getAttribute('title') ?? el.getAttribute('aria-label') ?? el.getAttribute('data-testid')
                ?? (el.textContent ?? '').trim().slice(0, 20);
            // Sub-pixel rounding at 125 %/150 % is not a cut; a third of a pixel is.
            return { label, visible: shown > 0.995 ? 1 : Math.round(shown * 1000) / 1000 };
        });
    }, { rootSel: root, sel: selector });
}

const cut = (seen: Seen[]) => seen.filter(s => s.visible < 1);

/**
 * Wait until nothing moves `selector`'s element: no transform on it or on any ancestor. Every
 * view here enters with a transform (the cards slide 10 px, Settings and the game panel spring,
 * the quiz card scales), and the hidden window holds the first frame for about 2 s, then jumps.
 * A "has it stopped moving" check passes during that hold, and a width check misses a translate.
 */
async function settled(page: Page, selector: string, what: string) {
    await expect.poll(() => page.evaluate((sel: string) => {
        const el = document.querySelector(sel);
        if (!el) return -1;
        let moving = 0;
        for (let a: Element | null = el; a; a = a.parentElement) {
            if (getComputedStyle(a).transform !== 'none') moving++;
        }
        return moving;
    }, selector), { ...SETTLE, message: `${what} settles` }).toBe(0);
}

/** The narrowest screen the beside layout fits (measured; the media query in mc-short-screens.css). */
const BESIDE_MIN_WIDTH = 1268;

async function resizeTo(app: ElectronApplication, width: number, height: number) {
    await app.evaluate(({ BrowserWindow }, [w, h]) => {
        BrowserWindow.getAllWindows()[0].setContentSize(w, h);
    }, [width, height] as const);
}

/** Where Space Rescue's tray is relative to the board, polled until the layout matches. */
async function expectTray(page: Page, where: 'under' | 'beside') {
    await expect.poll(() => page.evaluate(() => {
        const board = document.querySelector('[data-testid="blocks-grid"]')!.getBoundingClientRect();
        const trayBox = document.querySelector('.mc-blocks-tray')!.getBoundingClientRect();
        if (trayBox.top >= board.bottom) return 'under';
        if (trayBox.left >= board.right) return 'beside';
        return 'overlapping';
    }), { ...SETTLE, message: `the tray is ${where} the board` }).toBe(where);
}

/** Open Space Rescue the way the child does: a Quick Game goal, "Use!", the selector, "Play Game!". */
async function openSpaceRescue(page: Page) {
    // The quick-game window closes at the evening start (19:00 by default); this spec is about
    // layout, not that gate, so it must not depend on the time of day it runs.
    const settings = await readMCField<Record<string, unknown>>(page, 'settings');
    await patchMCState(page, { settings: { ...settings, eveningStartsAt: '23:59' } });
    await patchMCCollection(page, 'cases', 0, { status: 'active', reward: 'quick-game', tokenCount: 0, targetCount: 1 });
    await gotoMC(page);
    const use = page.locator('[aria-label="Play snake game"]');
    await expect(use, 'the Quick Game goal can be used').toBeEnabled();
    await use.dispatchEvent('click');
    await page.getByText('Space Rescue', { exact: true }).first().dispatchEvent('click');
    await page.getByText('Play Game! 🚀').dispatchEvent('click');
    await settled(page, '[data-testid="blocks-grid"]', 'the game panel');
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
    await page.mouse.move(1, 1); // off every hover target: a hovered key scales up
    return result;
}

/**
 * Open the rescue quiz on a math question. The engine (useQuizEngine) rolls reading or math
 * about half and half, and cancelling does not reroll: the same question comes back. So the
 * spec pins Math.random for the one click that generates the question (0.99 is above any
 * reading share, at most 0.6) and puts it back once the numpad is there.
 */
async function openNumericRescueQuiz(page: Page) {
    type Restorable = (() => number) & { restore?: () => void };
    await page.evaluate(() => {
        const real = Math.random;
        Math.random = Object.assign(() => 0.99, { restore: () => { Math.random = real; } });
    });
    try {
        await page.getByText('Solve Math', { exact: true }).dispatchEvent('click');
        await page.getByRole('button', { name: '✓', exact: true }).waitFor({ state: 'attached', timeout: 15_000 });
    } finally {
        await page.evaluate(() => (Math.random as Restorable).restore?.());
    }
}

for (const { scale, width, height, tray } of SIZES) {
    test(`Mission Control and Space Rescue fit ${width}x${height} at ${scale * 100} %`, async () => {
        test.setTimeout(120_000);
        const dir = createIsolatedUserData();
        let app: ElectronApplication | undefined;
        try {
            let page: Page;
            ({ app, page } = await launchMC(dir, {
                args: [`--force-device-scale-factor=${scale}`],
                contentSize: [width, height],
            }));
            expect(await page.evaluate(() => [innerWidth, innerHeight])).toEqual([
                expect.closeTo(width, -1), expect.closeTo(height, -1),
            ]);

            // ── Main view: every control on screen, Privileges with Phone Games ──
            await settled(page, 'button[title="Phone Games"]', 'the main view');
            expect.soft(cut(await visibility(page, '.mc-root', 'button')), 'main-view controls cut off').toEqual([]);
            const privileges = await visibility(page, '.mc-root', 'button[title="Phone Games"], button[title="Knife"]');
            expect(privileges.map(p => p.label)).toEqual(['Knife', 'Phone Games']);
            expect.soft(cut(privileges), 'Privileges card cut off').toEqual([]);

            // ── Settings: the dialog opens with its Save button on screen (the reload below closes it) ──
            await page.locator('[data-testid="mc-settings-btn"]').dispatchEvent('click');
            await settled(page, '[data-testid="mc-settings-save"]', 'the Settings dialog');
            expect.soft(cut(await visibility(page, 'body', '[data-testid="mc-settings-save"]')), 'Settings Save cut off').toEqual([]);

            // ── Space Rescue: the whole board, every tray shape, every button, the expected layout ──
            await openSpaceRescue(page);
            const game = '[data-testid="blocks-game-panel"]';
            expect.soft(cut(await visibility(page, game, '[data-testid="blocks-grid"]')), 'board cut off').toEqual([]);
            const shapes = await visibility(page, game, '[data-testid="draggable-shape"]');
            expect(shapes.length, 'three tray shapes dealt').toBeGreaterThanOrEqual(3);
            expect.soft(cut(shapes), 'tray shapes cut off').toEqual([]);
            expect.soft(cut(await visibility(page, game, 'button')), 'game controls cut off').toEqual([]);

            await expectTray(page, tray);
            if (tray === 'beside') {
                // The beside row needs a minimum width (mc-short-screens.css); under it a short
                // screen keeps the stack it always had, rather than clipping the row. 10 px under:
                // a window size rounds to whole device pixels (1267 at 150 % came out as 1268).
                await resizeTo(app, BESIDE_MIN_WIDTH - 10, height);
                await expect.poll(() => page.evaluate(() => innerWidth), SETTLE).toBeLessThan(BESIDE_MIN_WIDTH);
                await expectTray(page, 'under');
                await resizeTo(app, width, height);
                await expectTray(page, 'beside');
            }

            const cells = await page.evaluate(() => ({
                board: document.querySelector('[data-cell-index="0-0"]')!.getBoundingClientRect().width,
                tray: ([...document.querySelectorAll('.mc-blocks-tray [data-testid="draggable-shape"]')] as HTMLElement[])
                    .map(s => (s.firstElementChild as HTMLElement).getBoundingClientRect().width),
            }));
            expect(cells.board, 'board cells keep their size').toBeCloseTo(BOARD_CELL_PX, 0);
            expect(cells.tray, 'three tray shapes').toHaveLength(3);
            for (const w of cells.tray) expect(w, 'tray cells keep their size').toBeCloseTo(TRAY_CELL_PX, 0);
            await page.screenshot({ path: test.info().outputPath(`space-rescue-${width}x${height}.png`) });

            const ghost = await ghostOffsetMidDrag(page);
            expect(ghost.ghostCells, 'a ghost is shown mid-drag').toBeGreaterThan(0);
            expect(ghost.maxOffsetPx, 'ghost cells sit on the board cells').toBeLessThanOrEqual(0.5);

            // ── The rescue math quiz: every numpad key whole, and finger-sized ──
            await openNumericRescueQuiz(page);
            await settled(page, '[aria-label="Cancel"]', 'the quiz card');
            const keys = await visibility(page, game, 'button');
            expect.soft(cut(keys), 'quiz keys cut off').toEqual([]);
            const keyWidths = await page.evaluate(() => [...document.querySelectorAll('button')]
                .filter(b => /^[0-9⌫✓]$/.test((b.textContent ?? '').trim()))
                .map(b => b.getBoundingClientRect().width));
            expect(keyWidths, 'twelve numpad keys').toHaveLength(12);
            for (const w of keyWidths) expect(w, 'numpad keys stay finger-sized').toBeGreaterThanOrEqual(MIN_KEY_PX - 0.5);
            await page.screenshot({ path: test.info().outputPath(`rescue-quiz-${width}x${height}.png`) });

            // ── The tallest column 3: both tasks done and the shield broken ──
            await page.keyboard.press('Escape'); // the quiz
            await page.keyboard.press('Escape'); // the game
            await page.locator('[data-testid="blocks-grid"]').waitFor({ state: 'detached', timeout: 15_000 });
            // The store persists 500 ms after a change; seed only once the game's end has landed.
            await expect.poll(() => readMCField(page, 'snakeGameActive'), SETTLE).toBe(false);
            const done = new Date().toISOString();
            for (const id of ['recycling', 'activity']) {
                await patchMCCollection(page, 'responsibilities', id, { pointsEarned: 3, completedAt: done });
            }
            await patchMCState(page, { missedMissionStreak: 6 });
            await gotoMC(page);
            await expect(page.getByText('Bank locked — finish your next mission')).toBeVisible();
            await settled(page, 'button[title="Phone Games"]', 'the main view');
            expect.soft(cut(await visibility(page, '.mc-root', '[role="status"], button')), 'cut off with tasks done and the shield broken').toEqual([]);
        } finally {
            try {
                await app?.close();
            } finally {
                removeUserData(dir);
            }
        }
    });
}
