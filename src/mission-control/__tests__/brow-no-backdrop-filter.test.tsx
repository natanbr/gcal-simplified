// ============================================================
// The status brow blurs nothing
// ------------------------------------------------------------
// The brow is a flex row above the stage: all it covers is .mc-root's still
// gradient, so a backdrop-filter on it (or on anything inside it) blurs a
// backdrop that never moves and shows the same bar. It still costs a second
// render pass on every frame in which anything in the brow changes (the clock
// each minute, the Remote dot's pulse): about a quarter of a frame's cost on
// the child's screen while that dot looped (2026-10-04, docs/performance.md).
//
// Renders Mission Control's main view and fails if the brow or any element in
// it carries a backdrop filter: from a stylesheet rule that matches it, a
// Tailwind `backdrop-*` class, or an inline style (a React `style` object
// included, which jsdom keeps out of the style attribute: see
// inlineBackdropFilter).
// ============================================================

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { initialState } from '../store/mcReducer';
import { MCContext } from '../store/useMCStore';
import { MissionControl } from '../MissionControl';
import { DragLayer } from '../components/DragLayer';
import { stylesheetsUnder } from './infiniteAnimations';

const here = dirname(fileURLToPath(import.meta.url));
const everyStylesheet = `${stylesheetsUnder(resolve(here, '..', 'styles'))}\n${readFileSync(resolve(here, '..', '..', 'index.css'), 'utf8')}`;

/** Selectors of every innermost style rule (inside @media too) that sets a backdrop filter. */
function backdropFilterSelectors(css: string): string[] {
    const found: string[] = [];
    for (const [, prelude, body] of css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
        if (/(?:^|;)\s*(?:-webkit-)?backdrop-filter\s*:(?!\s*none\s*(?:;|$))/i.test(body)) {
            found.push(...prelude.split(',').map(s => s.trim()).filter(Boolean));
        }
    }
    return found;
}

const TAILWIND_BACKDROP = /(?:^|\s)(?:[\w-]+:)*backdrop-(?!filter-none\b)[\w/[\].-]+/;
const describeElement = (el: Element) => `<${el.tagName.toLowerCase()} class="${el.getAttribute('class') ?? ''}">`;
const blurs = (value: string) => value.trim() !== '' && value.trim() !== 'none';

/**
 * The element's inline backdrop filter, however it was written. React writes
 * `style.backdropFilter = …` (camelCase), and jsdom's CSSStyleDeclaration does
 * not know backdrop-filter: it leaves it out of the style attribute and of
 * getPropertyValue, and keeps it only as an own property of the style object.
 * So all four are read; the React case below proves this jsdom still keeps it.
 */
function inlineBackdropFilter(el: Element): string {
    if (!(el instanceof HTMLElement)) return '';
    const own = (name: string): string => {
        const value: unknown = Object.getOwnPropertyDescriptor(el.style, name)?.value;
        return typeof value === 'string' ? value : '';
    };
    const attribute = el.getAttribute('style')?.match(/(?:^|;)\s*(?:-webkit-)?backdrop-filter\s*:\s*([^;]*)/i)?.[1] ?? '';
    return [own('backdropFilter'), own('WebkitBackdropFilter'), el.style.getPropertyValue('backdrop-filter'),
        el.style.getPropertyValue('-webkit-backdrop-filter'), attribute].find(blurs) ?? '';
}

/** Every element in `root`'s subtree, `root` included, that a backdrop filter would apply to. */
function blurredElements(root: Element, css: string): string[] {
    const elements = [root, ...root.querySelectorAll('*')];
    const found: string[] = [];
    for (const selector of backdropFilterSelectors(css)) {
        const host = selector.replace(/::?(?:before|after)\b/g, '').replace(/:(?:hover|focus-visible|focus-within|focus|active)\b/g, '');
        for (const el of elements) if (el.matches(host)) found.push(`rule "${selector}" on ${describeElement(el)}`);
    }
    for (const el of elements) {
        if (TAILWIND_BACKDROP.test(el.getAttribute('class') ?? '')) found.push(`Tailwind class on ${describeElement(el)}`);
        if (inlineBackdropFilter(el)) found.push(`inline style on ${describeElement(el)}`);
    }
    return found;
}

describe('blurredElements — what it sees', () => {
    afterEach(() => { document.body.innerHTML = ''; });

    it('sees a rule, a Tailwind class and an inline style, on the root and its children', () => {
        document.body.innerHTML = '<div class="bar"><button class="px-2 backdrop-blur-sm"></button><i style="backdrop-filter: blur(2px)"></i><b class="hover:backdrop-blur"></b></div>';
        const css = '.bar { background: white; -webkit-backdrop-filter: blur(8px); } @media (x) { .bar i { backdrop-filter: blur(1px) } }';
        expect(blurredElements(document.querySelector('.bar') as Element, css)).toHaveLength(5);
    });

    it('ignores `none`, commented-out rules and other blurs', () => {
        document.body.innerHTML = '<div class="bar"><i class="blur-sm backdrop-filter-none" style="backdrop-filter: none"></i></div>';
        const css = '/* .bar { backdrop-filter: blur(8px) } */ .bar { backdrop-filter: none; filter: blur(2px) }';
        expect(blurredElements(document.querySelector('.bar') as Element, css)).toEqual([]);
    });

    // Five of Mission Control's seven blurs are written this way. jsdom drops
    // them from the style attribute, which an earlier version of this test read.
    it('sees a React inline style, standard and -webkit-, and ignores `none`', () => {
        const { container } = render(
            <div className="bar">
                <span style={{ backdropFilter: 'blur(4px)' }} />
                <b style={{ WebkitBackdropFilter: 'blur(4px)' }} />
                <i style={{ backdropFilter: 'none' }} />
            </div>,
        );
        expect(blurredElements(container.querySelector('.bar') as Element, '')).toEqual([
            'inline style on <span class="">',
            'inline style on <b class="">',
        ]);
    });
});

describe('Mission Control status brow', () => {
    afterEach(() => { delete window.ipcRenderer; });

    it('has no backdrop filter on the brow or anything in it', async () => {
        window.ipcRenderer = {
            invoke: vi.fn(async (channel: string) => (channel === 'remote:get-status' ? true : null)),
            on: vi.fn(() => () => {}),
        };
        const { container } = render(
            <MCContext.Provider value={{ state: initialState, dispatch: vi.fn() }}>
                <DragLayer>
                    <MissionControl onBackToCalendar={() => {}} />
                </DragLayer>
            </MCContext.Provider>,
        );
        await waitFor(() => expect(screen.getByTestId('mc-remote-dot')).toHaveAttribute('data-status', 'online'));
        const brow = container.querySelector('.mc-brow');
        expect(brow, 'the brow is rendered').not.toBeNull();
        // The scan reaches the brow's children: Settings, Logs, the Remote dot.
        expect(brow?.querySelector('[data-testid="mc-settings-btn"]')).not.toBeNull();
        expect(brow?.querySelector('[title="Activity Log"]')).not.toBeNull();

        expect(blurredElements(brow as Element, everyStylesheet)).toEqual([]);
    });
});
