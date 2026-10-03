// ============================================================
// The Remote tab draws its QR code from a fresh settings:get read, and only
// for a pairing made for signed messages.
// ------------------------------------------------------------
// It used to draw the QR from a copy of the pairing Mission Control kept in
// its saved state (that copy is gone since 2026-10-03: pairingCopy.test.tsx).
// When the first v2 start could not save the renewal (a locked settings file), a later retry
// renewed and joined a new room while the tab still showed the old room and
// the LEAKED v1 key under "Scan this QR code again". Now the tab reads
// settings:get when it is shown; settings:get hands out a room and key only
// for a pairing marked v2 (electron/settings-dialog.ts), and the tab checks
// the marker too. With none: no QR, and it says it is waiting to save one.
// The re-pairing notice still shows until the phone's first verified message.
// ============================================================

import React from 'react';
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import '@testing-library/jest-dom';
import { RemotePairingPanel, REPAIRED_NOTICE, NOT_PAIRED_TEXT } from './RemotePairingPanel';
import { MCStoreProvider } from '../store/MCStoreProvider';
import { MCSettingsOverlay } from './MCSettingsOverlay';
import { buildPairingUrl } from '../utils/pairingUrl';
import { REGENERATE_FAILED_MESSAGE, REGENERATE_FAILED_UNPAIRED_MESSAGE } from '../utils/regeneratePairing';
import { pairingBridge, settle, shownUrl, openRemoteTab, regenerateKeys } from './pairingTestKit';

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
const FRESH = { remoteRoomId: 'room-fresh', remoteKey: 'key-fresh', remotePairingVersion: 2 };
const REFUSED = { ok: false, reason: 'locked', code: 'EBUSY', file: 'C:\\settings-file.json' };
const bridge = pairingBridge();

beforeEach(() => {
    bridge.install();
    bridge.regenerate = () => Promise.resolve(REFUSED);
    localStorage.clear();
});

afterEach(() => {
    cleanup();
    delete window.ipcRenderer;
    localStorage.clear();
});

describe('RemotePairingPanel — the QR code', () => {
    it('shows exactly the pairing of the fresh read, with the notice while a renewal is unanswered', async () => {
        bridge.settings = { ...FRESH, remotePairingRenewedAt: RENEWED_AT };
        render(<RemotePairingPanel />);
        await settle();
        expect(bridge.invoke).toHaveBeenCalledWith('settings:get');
        expect(shownUrl()).toBe(buildPairingUrl('room-fresh', 'key-fresh'));
        expect(screen.getByText(REPAIRED_NOTICE)).toBeInTheDocument();
        expect(screen.getByText('Remote Control Pairing')).toBeInTheDocument();
        expect(screen.queryByText(NOT_PAIRED_TEXT)).not.toBeInTheDocument();
    });

    it('shows no notice when there is no pending renewal (or a malformed one)', async () => {
        for (const pending of [undefined, '', 42, 'not a date']) {
            bridge.settings = { ...FRESH, remotePairingRenewedAt: pending };
            render(<RemotePairingPanel />);
            await settle();
            expect(shownUrl()).toBe(buildPairingUrl('room-fresh', 'key-fresh'));
            expect(screen.queryByText(REPAIRED_NOTICE)).not.toBeInTheDocument();
            cleanup();
        }
    });

    it('shows no QR code for an unmarked pairing (the leaked v1 one) or none, and says it is waiting', async () => {
        for (const read of [{ remoteRoomId: 'room-v1', remoteKey: 'key-v1' }, { remoteRoomId: 'room-v1', remoteKey: 'key-v1', remotePairingVersion: 1 }, {}]) {
            bridge.settings = { ...read, remotePairingRenewedAt: RENEWED_AT };
            const { container } = render(<RemotePairingPanel />);
            await settle();
            expect(shownUrl()).toBeNull();
            expect(screen.getByText(NOT_PAIRED_TEXT)).toBeInTheDocument();
            // "Scan this QR code again" above no QR code would send the parent nowhere.
            expect(screen.queryByText(REPAIRED_NOTICE)).not.toBeInTheDocument();
            expect(container.innerHTML).not.toContain('key-v1');
            cleanup();
        }
    });

    it('shows no QR code, and leaves no unhandled rejection, when settings:get rejects', async () => {
        // settings:get throws while the settings file cannot be read (settings-dialog.ts).
        bridge.settingsError = new Error('Settings could not be loaded: the settings file is in use by another program (antivirus or a backup). Try again in a moment.');
        const unhandled = vi.fn();
        process.on('unhandledRejection', unhandled);
        try {
            render(<RemotePairingPanel />);
            await settle();
        } finally {
            process.off('unhandledRejection', unhandled);
        }
        expect(bridge.invoke).toHaveBeenCalledWith('settings:get');
        expect(screen.getByText('Remote Control Pairing')).toBeInTheDocument();
        expect(shownUrl()).toBeNull();
        expect(screen.getByText(NOT_PAIRED_TEXT)).toBeInTheDocument();
        expect(unhandled).not.toHaveBeenCalled();
    });

    it('renders without the bridge (no ipcRenderer): header, no QR code, no notice', () => {
        delete window.ipcRenderer;
        render(<RemotePairingPanel />);
        expect(screen.getByText('Remote Control Pairing')).toBeInTheDocument();
        expect(shownUrl()).toBeNull();
        expect(screen.queryByText(REPAIRED_NOTICE)).not.toBeInTheDocument();
    });
});

describe('RemotePairingPanel — Regenerate Keys', () => {
    it('shows the new pairing when it was saved', async () => {
        bridge.settings = FRESH;
        bridge.regenerate = () => Promise.resolve({ ok: true, roomId: 'room-new', remoteKey: 'key-new' });
        render(<RemotePairingPanel />);
        await settle();
        await regenerateKeys();
        expect(shownUrl()).toBe(buildPairingUrl('room-new', 'key-new'));
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('keeps the QR code and says it still works when a refused save leaves a v2 pairing', async () => {
        bridge.settings = FRESH;
        render(<RemotePairingPanel />);
        await settle();
        await regenerateKeys();
        expect(screen.getByRole('alert')).toHaveTextContent(REGENERATE_FAILED_MESSAGE);
        expect(shownUrl()).toBe(buildPairingUrl('room-fresh', 'key-fresh'));
    });

    it('says remote control stays offline when no v2 pairing exists and the save is refused', async () => {
        bridge.settings = { remoteRoomId: 'room-v1', remoteKey: 'key-v1' };
        render(<RemotePairingPanel />);
        await settle();
        await regenerateKeys();
        expect(screen.getByRole('alert')).toHaveTextContent(REGENERATE_FAILED_UNPAIRED_MESSAGE);
        expect(shownUrl()).toBeNull();
    });
});

describe('MCSettingsOverlay — ⚙️ → 📱 Remote', () => {
    it('shows the notice on the Remote tab', async () => {
        bridge.settings = { ...FRESH, remotePairingRenewedAt: RENEWED_AT };
        render(<MCStoreProvider><MCSettingsOverlay open onClose={vi.fn()} /></MCStoreProvider>);
        await settle();
        expect(screen.queryByText(REPAIRED_NOTICE)).not.toBeInTheDocument();

        await act(async () => { fireEvent.click(screen.getByText('📱 Remote')); });
        expect(await screen.findByText(REPAIRED_NOTICE)).toBeInTheDocument();
    });

    it('draws the v2 pairing of the fresh read', async () => {
        bridge.settings = FRESH;
        await openRemoteTab();
        expect(shownUrl()).toBe(buildPairingUrl('room-fresh', 'key-fresh'));
    });

    it('draws no QR code for an unmarked (v1) pairing, only the waiting text', async () => {
        bridge.settings = { remoteRoomId: 'room-v1', remoteKey: 'key-v1' };
        await openRemoteTab();
        expect(shownUrl()).toBeNull();
        expect(screen.getByText(NOT_PAIRED_TEXT)).toBeInTheDocument();
        expect(document.body.innerHTML).not.toContain('key-v1');
    });
});
