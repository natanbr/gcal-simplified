// ============================================================
// Mission Control — MoodWindNotification colour-token guard
// ------------------------------------------------------------
// Bug (pre-existing): the toast paints a near-white card and colours its text
// with var(--mc-text) / var(--mc-text-muted). Those custom properties were
// declared ONLY inside `.mc-root` (styles/mc.css), but App.tsx renders
// <MoodWindNotification /> as a SIBLING of <MissionControl>, so the toast
// never has `.mc-root` as an ancestor on either view. The var() references
// were therefore invalid at computed-value time; `color` is an inherited
// property, so each line fell back to the inherited body colour — which on the
// Calendar in dark mode is near-white. Near-white text on a near-white card.
//
// ── WHAT THIS FILE CAN AND CANNOT PROVE ──────────────────────────────────────
// jsdom (28.0.0) was probed directly before this guard was written:
//
//   ✔ it DOES apply a matching stylesheet rule's custom properties to the
//     element itself — getComputedStyle(el).getPropertyValue('--mc-text')
//     returns the real declared value when `el` matches the selector, and the
//     empty string when it does not. That is a genuine cascade result, and it
//     is exactly the thing this bug is about: is the token in scope here?
//   ✘ it does NOT substitute var() into `color`. getComputedStyle(el).color
//     returns the literal string "var(--mc-text)" both inside and outside
//     `.mc-root`. A naive colour assertion therefore passes VACUOUSLY — it
//     cannot tell the fixed component from the broken one. This file never
//     asserts on `color`.
//   ✘ it does NOT inherit custom properties to descendants.
//
// So: the contrast numbers below are computed from real values (the token as
// resolved by jsdom's cascade against the real mc.css, and the card background
// parsed off the element the component actually rendered) with a real WCAG
// relative-luminance implementation. They are not decorative.
//
// What is NOT proven here, and was instead verified once by hand in Chromium:
// that a browser substitutes an in-scope custom property into `color` and
// inherits it to descendants. That is plain CSS var() semantics, not app
// logic. The structural assertions below pin the remaining links in the chain
// (the text elements do reference the tokens, and they are descendants of the
// token-scoped root).
// ============================================================

import React from 'react';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MCStoreProvider } from '../store/MCStoreProvider';
import { useMCDispatch } from '../store/useMCStore.tsx';
import { MoodWindNotification } from './MoodWindNotification';

const here = dirname(fileURLToPath(import.meta.url));
const mcCssPath = resolve(here, '..', 'styles', 'mc.css');
const missionControlPath = resolve(here, '..', 'MissionControl.tsx');
const appPath = resolve(here, '..', '..', 'App.tsx');

// ── Framer Motion mocked so AnimatePresence resolves synchronously ───────────
vi.mock('framer-motion', async () => {
    const actual = await vi.importActual<typeof import('framer-motion')>('framer-motion');
    return {
        ...actual,
        AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
        motion: new Proxy({}, {
            get: (_target, prop: string) => {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const tag = (React as any).forwardRef(
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    ({ children: c, ...props }: any, ref: any) =>
                        React.createElement(prop, { ...props, ref }, c)
                );
                return tag;
            },
        }),
    };
});

// ── WCAG 2.x relative luminance + contrast ratio ─────────────────────────────

type RGB = [number, number, number];

function parseColor(input: string): { rgb: RGB; alpha: number } {
    const value = input.trim();

    const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value);
    if (hex) {
        const digits = hex[1].length === 3
            ? hex[1].split('').map(d => d + d).join('')
            : hex[1];
        return {
            rgb: [
                parseInt(digits.slice(0, 2), 16),
                parseInt(digits.slice(2, 4), 16),
                parseInt(digits.slice(4, 6), 16),
            ],
            alpha: 1,
        };
    }

    const fn = /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,/\s]+([\d.]+))?\s*\)$/i.exec(value);
    if (fn) {
        return {
            rgb: [Number(fn[1]), Number(fn[2]), Number(fn[3])],
            alpha: fn[4] === undefined ? 1 : Number(fn[4]),
        };
    }

    throw new Error(`Cannot parse colour: ${JSON.stringify(input)}`);
}

/** Flatten a translucent colour over an opaque backdrop. */
function composite(fg: { rgb: RGB; alpha: number }, backdrop: RGB): RGB {
    return fg.rgb.map((c, i) =>
        c * fg.alpha + backdrop[i] * (1 - fg.alpha)
    ) as RGB;
}

function relativeLuminance([r, g, b]: RGB): number {
    const channel = (raw: number) => {
        const c = raw / 255;
        return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrastRatio(a: RGB, b: RGB): number {
    const la = relativeLuminance(a);
    const lb = relativeLuminance(b);
    const [hi, lo] = la > lb ? [la, lb] : [lb, la];
    return (hi + 0.05) / (lo + 0.05);
}

/** Page background behind the toast, per theme (src/index.css + tailwind.config.js). */
const PAGE_BG: Record<'light' | 'dark', RGB> = {
    light: [255, 255, 255], // body → bg-white
    dark: [18, 18, 18],     // body → dark:bg-dark-bg (#121212)
};

// ── Harness ──────────────────────────────────────────────────────────────────

/**
 * Loads the REAL mc.css into the test document. In production the sheet is
 * always present: MissionControl.tsx imports it and App.tsx imports
 * MissionControl statically (asserted structurally at the bottom of this file),
 * so Vite emits it into the bundle regardless of which view is mounted.
 * Vitest does not process .css imports, hence the manual injection.
 */
function injectMcCss(): HTMLStyleElement {
    const style = document.createElement('style');
    style.textContent = readFileSync(mcCssPath, 'utf-8');
    document.head.appendChild(style);
    return style;
}

/** Flips moodWind, which is what makes the toast appear. */
function TriggerMood() {
    const dispatch = useMCDispatch();
    return (
        <button
            data-testid="trigger-mood"
            onClick={() => dispatch({ type: 'SET_MOOD_WIND', level: 1 })}
        >
            Trigger
        </button>
    );
}

/**
 * Renders the toast the way App.tsx does — a plain sibling tree with NO
 * `.mc-root` ancestor anywhere. That framing is the point of the test.
 */
async function showToast() {
    render(
        <MCStoreProvider>
            <TriggerMood />
            <MoodWindNotification />
        </MCStoreProvider>
    );
    await act(async () => { fireEvent.click(screen.getByTestId('trigger-mood')); });
    const toast = screen.getByTestId('mc-mood-wind-toast');
    expect(toast.closest('.mc-root')).toBeNull();
    return toast;
}

/** The token as the cascade actually resolves it ON the toast root. */
function resolvedToken(el: HTMLElement, name: string): string {
    return window.getComputedStyle(el).getPropertyValue(name).trim();
}

describe('MoodWindNotification — colour tokens resolve outside .mc-root', () => {
    let sheet: HTMLStyleElement;

    beforeEach(() => {
        vi.clearAllMocks();
        localStorage.clear();
        sheet = injectMcCss();
    });

    afterEach(() => {
        cleanup();
        sheet.remove();
        localStorage.clear();
    });

    // Sanity check on the harness itself. If jsdom ever stops applying
    // stylesheet custom properties, every assertion below would pass or fail
    // for the wrong reason — this makes that failure loud and specific.
    it('jsdom resolves mc.css custom properties on a matching element', () => {
        const probe = document.createElement('div');
        probe.className = 'mc-root';
        document.body.appendChild(probe);

        expect(
            resolvedToken(probe, '--mc-text'),
            'jsdom no longer applies mc.css custom properties from a stylesheet rule. ' +
            'Every token assertion in this file is now vacuous — fix the harness before trusting them.'
        ).not.toBe('');

        probe.remove();
    });

    it('resolves --mc-text on the toast root with no .mc-root ancestor', async () => {
        const toast = await showToast();

        expect(
            resolvedToken(toast, '--mc-text'),
            'The toast paints its text with var(--mc-text) but the property does not resolve ' +
            'where App.tsx mounts it (outside .mc-root). An unresolvable var() in an inherited ' +
            'property makes the text fall back to the inherited body colour — near-white on the ' +
            'Calendar in dark mode, against a near-white card.'
        ).not.toBe('');
    });

    it('gives the primary line real contrast against the card it renders on', async () => {
        const toast = await showToast();

        const card = parseColor(toast.style.background);
        const ink = parseColor(resolvedToken(toast, '--mc-text'));

        for (const theme of ['light', 'dark'] as const) {
            const surface = composite(card, PAGE_BG[theme]);
            const ratio = contrastRatio(ink.rgb, surface);

            expect(
                ratio,
                `--mc-text against the toast card on the ${theme} page is ${ratio.toFixed(2)}:1. ` +
                `The toast is a transient notification — if the headline is not readable it might ` +
                `as well not fire.`
            ).toBeGreaterThanOrEqual(4.5);
        }
    });

    it('keeps the eyebrow label above a bare visibility floor in both themes', async () => {
        const toast = await showToast();

        const card = parseColor(toast.style.background);
        const eyebrow = parseColor(resolvedToken(toast, '--mc-text-muted'));

        for (const theme of ['light', 'dark'] as const) {
            const surface = composite(card, PAGE_BG[theme]);
            const ratio = contrastRatio(eyebrow.rgb, surface);

            // Actual is ~3.37:1 (light) / ~3.03:1 (dark) with --mc-text-muted.
            // The floor is deliberately 2.5 and NOT a WCAG threshold: this is a
            // 10px 900-weight uppercase label, so AA would demand 4.5:1 and the
            // MC palette has no muted token that clears it. What this floor does
            // catch is the regression that mattered — the eyebrow reverting to
            // --mc-text-dim (~1.97:1) or losing the token entirely.
            expect(
                ratio,
                `--mc-text-muted against the toast card on the ${theme} page is ${ratio.toFixed(2)}:1, ` +
                `below the 2.5:1 visibility floor for the eyebrow label.`
            ).toBeGreaterThanOrEqual(2.5);
        }
    });

    // ── Structural links jsdom cannot execute ────────────────────────────────
    // jsdom neither substitutes var() into `color` nor inherits custom
    // properties to descendants, so these assert by reading the DOM the
    // component produced: the coloured text really is inside the token scope,
    // and really does reference the tokens measured above.

    it('colours its text from the tokens it scopes, on descendants of the scoped root', async () => {
        const toast = await showToast();

        // A `[style*="var(--mc-"]` attribute selector silently matches nothing
        // in jsdom's selector engine, so walk the descendants instead.
        const coloured = [...toast.querySelectorAll<HTMLElement>('*')]
            .filter(el => el.style.color.startsWith('var(--mc-'));
        const referenced = coloured.map(el => el.style.color);

        expect(referenced).toContain('var(--mc-text)');
        expect(referenced).toContain('var(--mc-text-muted)');

        for (const el of coloured) {
            expect(
                toast.contains(el) && el !== toast,
                'A token-coloured node escaped the element that scopes the tokens.'
            ).toBe(true);
        }
    });

    it('mc.css is in the document on every view, not only when Mission Control mounts', () => {
        const missionControl = readFileSync(missionControlPath, 'utf-8');
        const app = readFileSync(appPath, 'utf-8');

        expect(
            missionControl,
            'MissionControl.tsx no longer imports mc.css — the toast tokens have no stylesheet.'
        ).toMatch(/import\s+['"][^'"]*styles\/mc\.css['"]/);

        // A lazy()/dynamic import would defer the stylesheet, and the toast can
        // fire on the Calendar before Mission Control has ever been opened.
        expect(
            app,
            'App.tsx must import MissionControl statically. Made lazy, mc.css would not be in ' +
            'the document until the Mission Control view is first opened — and the toast fires ' +
            'on the Calendar.'
        ).toMatch(/^import\s+\{\s*MissionControl\s*\}\s+from\s+['"]\.\/mission-control\/MissionControl['"];?$/m);
    });
});
