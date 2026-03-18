// ============================================================
// Mission Control — MCSettingsOverlay component tests
// Covers: open/close state, default values rendered from store,
//         draft edits, save dispatches SET_SETTINGS, cancel discards.
// ============================================================

import React, { useState } from 'react';
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import '@testing-library/jest-dom';
import { MCStoreProvider, useMCState } from '../store/useMCStore.tsx';
import { MCSettingsOverlay } from './MCSettingsOverlay';
import { DEFAULT_SETTINGS } from '../types';

// ── Framer Motion mock ───────────────────────────────────────────────────────
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

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Controlled wrapper so we can toggle `open` from outside */
function ControlledOverlay() {
    const [open, setOpen] = useState(false);
    return (
        <MCStoreProvider>
            <button data-testid="open-btn" onClick={() => setOpen(true)}>Open</button>
            <MCSettingsOverlay open={open} onClose={() => setOpen(false)} />
        </MCStoreProvider>
    );
}

function openPanel() {
    return act(async () => { fireEvent.click(screen.getByTestId('open-btn')); });
}

function renderAndOpen() {
    render(<ControlledOverlay />);
    return openPanel();
}

beforeEach(() => { vi.clearAllMocks(); localStorage.clear(); });
afterEach(() => { cleanup(); localStorage.clear(); });

// ── Visibility ────────────────────────────────────────────────────────────────

describe('MCSettingsOverlay — visibility', () => {
    it('panel is NOT visible when open=false', () => {
        render(
            <MCStoreProvider>
                <MCSettingsOverlay open={false} onClose={vi.fn()} />
            </MCStoreProvider>,
        );
        expect(screen.queryByText('Settings')).not.toBeInTheDocument();
    });

    it('panel IS visible when open=true', async () => {
        await renderAndOpen();
        expect(screen.getByText('Settings')).toBeInTheDocument();
    });

    it('Cancel button closes the panel', async () => {
        await renderAndOpen();
        await act(async () => { fireEvent.click(screen.getByText(/Cancel/)); });
        expect(screen.queryByText('Settings')).not.toBeInTheDocument();
    });
});

// ── Default values rendered from store ────────────────────────────────────────

describe('MCSettingsOverlay — default values', () => {
    it('shows "Morning Mission" section header', async () => {
        await renderAndOpen();
        expect(screen.getByText('Morning Mission')).toBeInTheDocument();
    });

    it('shows "Evening Mission" section header', async () => {
        await renderAndOpen();
        expect(screen.getByText('Evening Mission')).toBeInTheDocument();
    });

    it('morning time input has the default startsAt value', async () => {
        await renderAndOpen();
        // The label text is "Auto-trigger at" and there are two inputs (morning + evening).
        // We verify the first input holds the default morning start.
        const inputs = screen.getAllByDisplayValue(DEFAULT_SETTINGS.morningStartsAt);
        expect(inputs.length).toBeGreaterThanOrEqual(1);
    });

    it('Save Settings button is visible', async () => {
        await renderAndOpen();
        expect(screen.getByTestId('mc-settings-save')).toBeInTheDocument();
    });

    it('shows the 10s dev chip', async () => {
        await renderAndOpen();
        expect(screen.getAllByText(/🔧 10s/).length).toBeGreaterThanOrEqual(1);
    });

    it('shows "Put on Cream" toggle', async () => {
        await renderAndOpen();
        await act(async () => { fireEvent.click(screen.getByText(/Missions Tasks/)); });
        expect(screen.getByText(/"Put on Cream"/)).toBeInTheDocument();
    });
});

// ── Duration chips ────────────────────────────────────────────────────────────

describe('MCSettingsOverlay — duration chips', () => {
    it('shows preset duration chips (5m, 30m, 1h)', async () => {
        await renderAndOpen();
        // There are two DurationStepper sections; chips appear in both.
        expect(screen.getAllByText('5m').length).toBeGreaterThanOrEqual(1);
        expect(screen.getAllByText('30m').length).toBeGreaterThanOrEqual(1);
        expect(screen.getAllByText('1h').length).toBeGreaterThanOrEqual(1);
    });
});

// ── Save dispatches SET_SETTINGS ──────────────────────────────────────────────

describe('MCSettingsOverlay — save', () => {
    /** Helper that reads current store settings from a mounted spy component */
    function StateReader({ onState }: { onState: (s: ReturnType<typeof useMCState>) => void }) {
        const state = useMCState();
        React.useEffect(() => { onState(state); }, [state, onState]);
        return null;
    }

    it('clicking Save dispatches SET_SETTINGS and closes the panel', async () => {
        let capturedPhase: string | undefined;

        function TestRig() {
            const [open, setOpen] = useState(false);
            return (
                <MCStoreProvider>
                    <StateReader onState={s => { capturedPhase = s.settings.morningStartsAt; }} />
                    <button data-testid="open-btn" onClick={() => setOpen(true)}>Open</button>
                    <MCSettingsOverlay open={open} onClose={() => setOpen(false)} />
                </MCStoreProvider>
            );
        }

        render(<TestRig />);
        await openPanel();

        // Change the morning time input
        const timeInputs = screen.getAllByDisplayValue(DEFAULT_SETTINGS.morningStartsAt);
        await act(async () => {
            fireEvent.change(timeInputs[0], { target: { value: '07:30' } });
        });

        // Save
        await act(async () => {
            fireEvent.click(screen.getByTestId('mc-settings-save'));
        });

        // Panel should close
        expect(screen.queryByText('Settings')).not.toBeInTheDocument();
        // Store should have the new start time
        expect(capturedPhase).toBe('07:30');
    });

    it('clicking Save dispatches SET_SETTINGS for cream task toggles', async () => {
        let capturedEnabled: boolean | undefined;

        function TestRig() {
            const [open, setOpen] = useState(false);
            return (
                <MCStoreProvider>
                    <StateReader onState={s => { capturedEnabled = s.settings.creamTaskEnabled; }} />
                    <button data-testid="open-btn" onClick={() => setOpen(true)}>Open</button>
                    <MCSettingsOverlay open={open} onClose={() => setOpen(false)} />
                </MCStoreProvider>
            );
        }

        render(<TestRig />);
        await openPanel();

        await act(async () => { fireEvent.click(screen.getByText(/Missions Tasks/)); });

        // The default state is creamTaskEnabled = false. Find the toggle button.
        // It's the button closest to "Put on Cream" text.
        const creamText = screen.getByText(/"Put on Cream"/);
        const creamContainer = creamText.parentElement!;
        const toggleBtn = creamContainer.querySelector('button')!;
        
        await act(async () => {
            fireEvent.click(toggleBtn);
            // also verify that the slider appears by finding "Days Required"
        });
        
        expect(screen.getByText(/Days Required/)).toBeInTheDocument();

        // Save
        await act(async () => {
            fireEvent.click(screen.getByTestId('mc-settings-save'));
        });

        expect(capturedEnabled).toBe(true);
    });

    it('clicking Cancel does NOT update the store', async () => {
        let capturedPhase: string | undefined;

        function TestRig() {
            const [open, setOpen] = useState(false);
            return (
                <MCStoreProvider>
                    <StateReader onState={s => { capturedPhase = s.settings.morningStartsAt; }} />
                    <button data-testid="open-btn" onClick={() => setOpen(true)}>Open</button>
                    <MCSettingsOverlay open={open} onClose={() => setOpen(false)} />
                </MCStoreProvider>
            );
        }

        render(<TestRig />);
        await openPanel();

        // Change the morning time input
        const timeInputs = screen.getAllByDisplayValue(DEFAULT_SETTINGS.morningStartsAt);
        await act(async () => {
            fireEvent.change(timeInputs[0], { target: { value: '07:30' } });
        });

        // Cancel — store must remain unchanged
        await act(async () => {
            fireEvent.click(screen.getByText(/Cancel/));
        });

        expect(capturedPhase).toBe(DEFAULT_SETTINGS.morningStartsAt);
    });
});
