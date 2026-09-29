// ============================================================
// Mission Control — every Settings field shows where keyboard focus is
// ------------------------------------------------------------
// The adult tabs through Settings with a keyboard. The Schedule select and the
// reward-cost number field carried an inline `outline: 'none'` with nothing in
// its place, so focus on them was invisible. An inline outline beats any
// stylesheet rule, :focus-visible included, so every field must carry the
// `mc-field` class and no inline outline. This walks every tab that has fields
// and checks all of them, so a new field that forgets the class fails here.
// jsdom does not match :focus-visible, hence the ring is read from mc.css.
// (Separate file: MCSettingsOverlay.test.tsx is near 300.)
// ============================================================

import React from 'react';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MCStoreProvider } from '../store/MCStoreProvider';
import { MCSettingsOverlay } from './MCSettingsOverlay';

// Same Framer Motion mock as MCSettingsOverlay.test.tsx (vi.mock is per file).
vi.mock('framer-motion', async () => {
    const actual = await vi.importActual<typeof import('framer-motion')>('framer-motion');
    return {
        ...actual,
        AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
        motion: new Proxy({} as Record<string, unknown>, {
            get: (_target, prop: string) => {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                return React.forwardRef(({ children: c, ...props }: any, ref: any) =>
                    React.createElement(prop as string, { ...props, ref }, c)
                );
            },
        }),
    };
});

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

/** Tabs with form fields. Learning (hold-to-open) and Privileges have none. */
const TABS_WITH_FIELDS = ['🕒 Missions Time', '🧴 Missions Tasks', '🎁 Rewards', '📱 Remote'];

/** Every form field on each tab, labelled by tab and type for the failure message. */
async function fieldsOnEveryTab(): Promise<{ where: string; el: HTMLElement }[]> {
    const found: { where: string; el: HTMLElement }[] = [];
    for (const tab of TABS_WITH_FIELDS) {
        await act(async () => { fireEvent.click(screen.getByText(tab)); });
        // The Remote tab draws its pairing URL once settings:get answers.
        await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
        for (const el of document.querySelectorAll<HTMLElement>('input, select, textarea')) {
            found.push({ where: `${tab} › ${el.tagName.toLowerCase()}[${el.getAttribute('type') ?? ''}]`, el });
        }
    }
    return found;
}

beforeEach(() => {
    // Seed the fields that only render when enabled: the cream task's Schedule
    // select, and the Remote tab's pairing URL (read from the main process, v2 only).
    localStorage.setItem('mc-state-v5', JSON.stringify({ settings: { creamTaskEnabled: true } }));
    const pairing = { remoteRoomId: 'room-test', remoteKey: 'key-test', remotePairingVersion: 2 };
    window.ipcRenderer = {
        invoke: vi.fn((channel: string) => Promise.resolve(channel === 'settings:get' ? pairing : undefined)),
        on: vi.fn(() => vi.fn()),
    };
});
afterEach(() => { cleanup(); localStorage.clear(); delete window.ipcRenderer; });

describe('MCSettingsOverlay — every field shows keyboard focus', () => {
    it('every field carries the class the focus rule targets, and no inline outline to override it', async () => {
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
        expect(fields.filter(f => f.el.style.outline !== '').map(f => f.where)).toEqual([]);
    });

    it('mc.css draws a :focus-visible ring from an --mc-* token, and hides it only for a pointer focus', () => {
        const ring = declarationsOf('.mc-field:focus-visible');

        expect(ring, '.mc-field:focus-visible rule').not.toBeNull();
        expect(ring).toMatch(/outline:\s*\d+px solid var\(--mc-[\w-]+\)/);
        expect(ring).not.toMatch(/#[0-9a-f]{3,8}\b/i);
        expect(declarationsOf('.mc-field:focus:not(:focus-visible)')).toMatch(/outline:\s*none/);
    });
});
