// ============================================================
// Mission Control — every Settings field shows where keyboard focus is
// ------------------------------------------------------------
// The adult tabs through Settings with a keyboard. The Schedule select and the
// reward-cost number field carried an inline `outline: 'none'` with nothing in
// its place, so focus on them was invisible. An inline outline beats any
// stylesheet rule, :focus-visible included, so every field must carry the
// `mc-field` class and no inline outline. This walks every sidebar tab and
// checks all of them, so a new field or tab that forgets the class fails here.
// jsdom does not match :focus-visible, hence the ring is read from mc.css.
// Real Framer Motion (no mock): the cream section's clip is decided by its
// animation, and a mock would hide exactly that.
// (Separate file: MCSettingsOverlay.test.tsx is near 300.)
// ============================================================

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MCStoreProvider } from '../store/MCStoreProvider';
import { STORAGE_KEY } from '../store/useMCStore';
import { MCSettingsOverlay } from './MCSettingsOverlay';

// Comments stripped: a comment right above a rule would otherwise become part of its selector text.
const mcCss = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '..', 'styles', 'mc.css'), 'utf-8')
    .replace(/\/\*[\s\S]*?\*\//g, '');

/** The declarations of the first rule whose selector list contains `selector`. */
function declarationsOf(selector: string): string | null {
    for (const [, selectors, body] of mcCss.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
        if (selectors.split(',').some(s => s.trim() === selector)) return body;
    }
    return null;
}

const wait = (ms: number) => act(async () => { await new Promise(resolve => setTimeout(resolve, ms)); });

/** Longer than the Learning tab's hold-to-open (600 ms). */
const HOLD_MS = 650;

/** Opens one sidebar tab: a click, or a hold for the hold-to-open tab (either is a no-op on the other kind). */
async function openTab(tab: HTMLElement) {
    fireEvent.click(tab);
    fireEvent.pointerDown(tab);
    await wait(HOLD_MS);
    fireEvent.pointerUp(tab);
    await wait(0); // the Remote tab draws its pairing URL once settings:get answers
}

/** The sidebar's tab buttons, found from the first tab's container. */
const sidebarTabs = () => Array.from(screen.getByText('🕒 Missions Time').parentElement!.querySelectorAll('button'));

/** Every form field on every tab, labelled by tab and type for the failure message. */
async function fieldsOnEveryTab(): Promise<{ where: string; el: HTMLElement }[]> {
    const found: { where: string; el: HTMLElement }[] = [];
    const tabs = sidebarTabs();
    expect(tabs.length, 'sidebar tabs').toBeGreaterThanOrEqual(6);
    for (const tab of tabs) {
        await openTab(tab);
        for (const el of document.querySelectorAll<HTMLElement>('input, select, textarea')) {
            found.push({ where: `${tab.textContent} › ${el.tagName.toLowerCase()}[${el.getAttribute('type') ?? ''}]`, el });
        }
    }
    return found;
}

/** The cream section's animated wrapper: the Schedule select's nearest ancestor that sets overflow. */
const creamWrapper = () => screen.getByDisplayValue('Evening Only').closest<HTMLElement>('div[style*="overflow"]')!;

beforeEach(() => {
    // Seed the fields that only render when enabled: the cream task's Schedule
    // select, and the Remote tab's pairing URL (read from the main process, v2 only).
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ settings: { creamTaskEnabled: true } }));
    const pairing = { remoteRoomId: 'room-test', remoteKey: 'key-test', remotePairingVersion: 2 };
    window.ipcRenderer = {
        invoke: vi.fn((channel: string) => Promise.resolve(channel === 'settings:get' ? pairing : undefined)),
        on: vi.fn(() => vi.fn()),
    };
});
afterEach(() => { cleanup(); localStorage.clear(); delete window.ipcRenderer; });

describe('MCSettingsOverlay — every field shows keyboard focus', () => {
    it('every field on every tab carries the class the focus rule targets, and no inline outline to override it', async () => {
        render(<MCStoreProvider><MCSettingsOverlay open onClose={() => {}} /></MCStoreProvider>);
        const fields = await fieldsOnEveryTab();
        const kinds = new Set(fields.map(f => f.where));

        // The walk reached the two fields that had the defect, and the pairing URL.
        expect([...kinds]).toEqual(expect.arrayContaining([
            '🧴 Missions Tasks › select[]',
            '🎁 Rewards › input[number]',
            '📱 Remote › input[text]',
        ]));
        expect(fields.filter(f => !f.el.classList.contains('mc-field')).map(f => f.where)).toEqual([]);
        // Any inline outline property (outline, outlineStyle, outlineWidth…) beats the stylesheet.
        expect(fields.filter(f => /outline/i.test(f.el.getAttribute('style') ?? '')).map(f => f.where)).toEqual([]);
    }, 15_000);

    it('mc.css draws a :focus-visible ring from an --mc-* token, with a fallback outside the MC token scope', () => {
        const ring = declarationsOf('.mc-field:focus-visible');

        expect(ring, '.mc-field:focus-visible rule').not.toBeNull();
        expect(ring).toMatch(/outline:\s*\d+px solid var\(--mc-[\w-]+,\s*[\w-]+\)/);
        expect(ring).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    });
});

describe('MCSettingsOverlay — the cream section does not clip the Schedule select\'s ring once open', () => {
    // The ring reaches 4px past the select, which sits flush in this section.
    // It must clip while its height animates, and stop clipping once it is open.
    const CREAM_TOGGLE = () => screen.getByText('"Put on Cream"').parentElement!.querySelector('button')!;
    const SETTLE_MS = 1000;

    it('stops clipping after it opens with the cream toggle', async () => {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ settings: { creamTaskEnabled: false } }));
        render(<MCStoreProvider><MCSettingsOverlay open onClose={() => {}} /></MCStoreProvider>);
        await act(async () => { fireEvent.click(screen.getByText('🧴 Missions Tasks')); });
        await act(async () => { fireEvent.click(CREAM_TOGGLE()); });
        await wait(SETTLE_MS);

        expect(creamWrapper().style.overflow).toBe('visible');
    });

    it('stops clipping after it opens again when the tab is re-entered', async () => {
        render(<MCStoreProvider><MCSettingsOverlay open onClose={() => {}} /></MCStoreProvider>);
        for (const tab of ['🧴 Missions Tasks', '🎁 Rewards', '🧴 Missions Tasks']) {
            await act(async () => { fireEvent.click(screen.getByText(tab)); });
        }
        await wait(SETTLE_MS);

        expect(creamWrapper().style.overflow).toBe('visible');
    });
});
