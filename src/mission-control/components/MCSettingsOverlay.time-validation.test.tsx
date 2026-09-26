// ============================================================
// Mission Control — MCSettingsOverlay refuses to save a cleared mission time
// ------------------------------------------------------------
// Clearing an "Auto-trigger at" field gives ''. Save used to dispatch it
// unvalidated, and the scheduler then logged "mission skipped" every second.
// While a draft time is invalid, Save is disabled and a hint says why; a valid
// time re-enables it. (Separate file: MCSettingsOverlay.test.tsx is near 300.)
// ============================================================

import React, { useState } from 'react';
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import '@testing-library/jest-dom';
import { MCStoreProvider } from '../store/MCStoreProvider';
import { useMCState } from '../store/useMCStore.tsx';
import { MCSettingsOverlay } from './MCSettingsOverlay';
import { DEFAULT_SETTINGS } from '../types';
import type { MCSettings } from '../types';

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

const stored: { settings: MCSettings | null } = { settings: null };

function StateReader() {
    const state = useMCState();
    React.useEffect(() => { stored.settings = state.settings; }, [state]);
    return null;
}

function TestRig() {
    const [open, setOpen] = useState(false);
    return (
        <MCStoreProvider>
            <StateReader />
            <button data-testid="open-btn" onClick={() => setOpen(true)}>Open</button>
            <MCSettingsOverlay open={open} onClose={() => setOpen(false)} />
        </MCStoreProvider>
    );
}

async function renderAndOpen() {
    render(<TestRig />);
    await act(async () => { fireEvent.click(screen.getByTestId('open-btn')); });
}

/** The "Auto-trigger at" time input currently showing `value` (Missions Time tab, the default). */
async function typeTime(currentValue: string, next: string) {
    const input = screen.getAllByDisplayValue(currentValue).find(el => el.getAttribute('type') === 'time');
    if (!input) throw new Error(`no time input showing ${currentValue}`);
    await act(async () => { fireEvent.change(input, { target: { value: next } }); });
}

async function clickSave() {
    await act(async () => { fireEvent.click(screen.getByTestId('mc-settings-save')); });
}

beforeEach(() => { localStorage.clear(); stored.settings = null; });
afterEach(() => { cleanup(); localStorage.clear(); });

describe('MCSettingsOverlay — an invalid auto-trigger time cannot be saved', () => {
    it.each<[string, string, string]>([
        ['morning', DEFAULT_SETTINGS.morningStartsAt, 'Evening'],
        ['evening', DEFAULT_SETTINGS.eveningStartsAt, 'Morning'],
    ])('clearing the %s time disables Save and shows why', async (phase, current, other) => {
        await renderAndOpen();
        await typeTime(current, '');

        expect(screen.getByTestId('mc-settings-save')).toBeDisabled();
        const hint = screen.getByTestId('mc-settings-time-invalid');
        expect(hint).toBeVisible();
        // Names the empty field and its tab: the footer is visible from every tab.
        expect(hint).toHaveTextContent(new RegExp(`${phase} auto-trigger time`, 'i'));
        expect(hint).toHaveTextContent('Missions Time');
        expect(hint).not.toHaveTextContent(other);
        const empty = screen.getAllByDisplayValue('').find(el => el.getAttribute('type') === 'time');
        expect(empty).toHaveAttribute('aria-invalid', 'true');
    });

    it('clearing both times names both', async () => {
        await renderAndOpen();
        await typeTime(DEFAULT_SETTINGS.morningStartsAt, '');
        await typeTime(DEFAULT_SETTINGS.eveningStartsAt, '');

        expect(screen.getByTestId('mc-settings-time-invalid')).toHaveTextContent('Morning and Evening auto-trigger times');
    });

    it('clicking Save with a cleared time stores nothing and keeps the panel open', async () => {
        await renderAndOpen();
        await typeTime(DEFAULT_SETTINGS.morningStartsAt, '');

        await clickSave();

        expect(stored.settings?.morningStartsAt, 'the store took the cleared time').toBe(DEFAULT_SETTINGS.morningStartsAt);
        expect(screen.getByText('Settings'), 'the panel closed as if it saved').toBeInTheDocument();
    });

    it('typing a valid time again re-enables Save, hides the hint, and saves it', async () => {
        await renderAndOpen();
        await typeTime(DEFAULT_SETTINGS.morningStartsAt, '');
        expect(screen.getByTestId('mc-settings-save'), 'precondition: Save refused while cleared').toBeDisabled();

        // Re-query: the motion mock builds a new component per access, so each
        // render remounts the panel and the first input element is detached.
        await typeTime('', '06:30');
        expect(screen.getByTestId('mc-settings-save')).toBeEnabled();
        expect(screen.queryByTestId('mc-settings-time-invalid')).not.toBeInTheDocument();

        await clickSave();
        expect(stored.settings?.morningStartsAt).toBe('06:30');
    });
});

// The duration slider went down to 0 while the smallest chip is 5 min. A 0 is
// refused by SET_SETTINGS (a 0-minute mission times out the moment it starts),
// so Save would close the panel and silently keep the old duration.
describe('MCSettingsOverlay — the duration slider cannot reach 0', () => {
    it('every duration slider starts at 5 minutes', async () => {
        await renderAndOpen();
        const sliders = screen.getAllByRole('slider').filter(el => el.getAttribute('max') === '120');

        expect(sliders.length, 'precondition: the morning and evening duration sliders').toBe(2);
        for (const slider of sliders) expect(slider).toHaveAttribute('min', '5');
    });
});
