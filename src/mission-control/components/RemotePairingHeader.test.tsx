// ============================================================
// The Remote tab tells the parent when the pairing was renewed for them.
// ------------------------------------------------------------
// The first v2 start replaces a leaked v1 pairing by itself. The phone then
// sits in the old room and does nothing until its QR code is scanned again,
// and the only other trace is a main-process log line nobody sees in a
// packaged build. So the tab reads settings:get when it is shown and says so,
// for as long as remotePairingRenewedAt is set.
// ============================================================

import React from 'react';
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import '@testing-library/jest-dom';
import { RemotePairingHeader, REPAIRED_NOTICE } from './RemotePairingHeader';
import { MCStoreProvider } from '../store/MCStoreProvider';
import { MCSettingsOverlay } from './MCSettingsOverlay';

vi.mock('framer-motion', async () => {
    const actual = await vi.importActual<typeof import('framer-motion')>('framer-motion');
    return {
        ...actual,
        AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
        motion: new Proxy({} as Record<string, unknown>, {
            get: (_target, prop: string) =>
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                React.forwardRef(({ children: c, ...props }: any, ref: any) => React.createElement(prop, { ...props, ref }, c)),
        }),
    };
});

const RENEWED_AT = '2026-09-28T09:00:00.000Z';
let settings: Record<string, unknown> = {};
let settingsError: Error | null = null;
const invoke = vi.fn<NonNullable<Window['ipcRenderer']>['invoke']>((channel: string) => {
    if (channel !== 'settings:get') return Promise.resolve(undefined);
    return settingsError ? Promise.reject(settingsError) : Promise.resolve(settings);
});

/** Let the settings:get promise resolve and React commit what it set. */
const settle = () => act(async () => { await Promise.resolve(); });

beforeEach(() => {
    invoke.mockClear();
    settingsError = null;
    localStorage.clear();
    window.ipcRenderer = { invoke, on: vi.fn(() => vi.fn()) };
});

afterEach(() => {
    cleanup();
    delete window.ipcRenderer;
    localStorage.clear();
});

describe('RemotePairingHeader', () => {
    it('shows the re-pairing notice while an automatic renewal is unanswered', async () => {
        settings = { remoteRoomId: 'r', remoteKey: 'k', remotePairingRenewedAt: RENEWED_AT };
        render(<RemotePairingHeader />);
        expect(await screen.findByText(REPAIRED_NOTICE)).toBeInTheDocument();
        expect(screen.getByText('Remote Control Pairing')).toBeInTheDocument();
        expect(invoke).toHaveBeenCalledWith('settings:get');
    });

    it('shows no notice when there is no pending renewal (or a malformed one)', async () => {
        for (const pending of [undefined, '', 42, 'not a date']) {
            settings = { remoteRoomId: 'r', remoteKey: 'k', remotePairingRenewedAt: pending };
            render(<RemotePairingHeader />);
            await settle();
            expect(screen.queryByText(REPAIRED_NOTICE)).not.toBeInTheDocument();
            cleanup();
        }
    });

    it('shows the header without the notice, and leaves no unhandled rejection, when settings:get rejects', async () => {
        // settings:get throws while the settings file cannot be read (settings-dialog.ts).
        settingsError = new Error('Settings could not be loaded: the settings file is in use by another program (antivirus or a backup). Try again in a moment.');
        const unhandled = vi.fn();
        process.on('unhandledRejection', unhandled);
        try {
            render(<RemotePairingHeader />);
            await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
        } finally {
            process.off('unhandledRejection', unhandled);
        }
        expect(invoke).toHaveBeenCalledWith('settings:get');
        expect(screen.getByText('Remote Control Pairing')).toBeInTheDocument();
        expect(screen.queryByText(REPAIRED_NOTICE)).not.toBeInTheDocument();
        expect(unhandled).not.toHaveBeenCalled();
    });

    it('renders the header without the bridge (no ipcRenderer) and without the notice', () => {
        delete window.ipcRenderer;
        render(<RemotePairingHeader />);
        expect(screen.getByText('Remote Control Pairing')).toBeInTheDocument();
        expect(screen.queryByText(REPAIRED_NOTICE)).not.toBeInTheDocument();
    });
});

describe('MCSettingsOverlay — ⚙️ → 📱 Remote', () => {
    it('shows the notice on the Remote tab', async () => {
        settings = { remoteRoomId: 'r', remoteKey: 'k', remotePairingRenewedAt: RENEWED_AT };
        render(<MCStoreProvider><MCSettingsOverlay open onClose={vi.fn()} /></MCStoreProvider>);
        await settle();
        expect(screen.queryByText(REPAIRED_NOTICE)).not.toBeInTheDocument();

        await act(async () => { fireEvent.click(screen.getByText('📱 Remote')); });
        expect(await screen.findByText(REPAIRED_NOTICE)).toBeInTheDocument();
    });
});
