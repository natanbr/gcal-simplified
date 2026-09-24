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
    it.each<[string, string]>([
        ['morning', DEFAULT_SETTINGS.morningStartsAt],
        ['evening', DEFAULT_SETTINGS.eveningStartsAt],
    ])('clearing the %s time disables Save and shows why', async (_phase, current) => {
        await renderAndOpen();
        await typeTime(current, '');

        expect(screen.getByTestId('mc-settings-save')).toBeDisabled();
        expect(screen.getByTestId('mc-settings-time-invalid')).toBeVisible();
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
