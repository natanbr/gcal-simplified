// ============================================================
// Test kit: the remote pairing IPC and the Remote-tab harness
// ------------------------------------------------------------
// A fake Electron bridge whose settings:get and remote:regenerate answers a
// test sets, and the steps to reach ⚙️ → 📱 Remote inside the real store.
// RemotePairingPanel.test.tsx, MCSettingsOverlay.test.tsx and
// pairingCopy.test.tsx each built their own copy of this. Test support only:
// it is listed in TEST_SUPPORT (src/__tests__/test-kit-boundary.test.ts), so
// no production module may import it. It mocks nothing: a suite that needs
// framer-motion mocked does that itself.
// ============================================================

import { act, fireEvent, render, screen } from '@testing-library/react';
import { vi, type Mock } from 'vitest';
import { MCStoreProvider } from '../store/MCStoreProvider';
import { MCSettingsOverlay } from './MCSettingsOverlay';

type Invoke = NonNullable<Window['ipcRenderer']>['invoke'];

/** The answers of the fake bridge. Every other channel resolves undefined. */
export interface PairingBridge {
    /** What settings:get resolves to, unless `settingsError` is set (a locked settings file). */
    settings: unknown;
    settingsError: Error | null;
    /** What remote:regenerate answers. */
    regenerate: () => Promise<unknown>;
    readonly invoke: Mock<Invoke>;
    /** Empty answers again, the call log cleared, and this bridge set as window.ipcRenderer. */
    install(): void;
}

export function pairingBridge(): PairingBridge {
    const bridge: PairingBridge = {
        settings: {},
        settingsError: null,
        regenerate: () => Promise.resolve(undefined),
        invoke: vi.fn<Invoke>((channel: string) => {
            if (channel === 'remote:regenerate') return bridge.regenerate();
            if (channel !== 'settings:get') return Promise.resolve(undefined);
            return bridge.settingsError ? Promise.reject(bridge.settingsError) : Promise.resolve(bridge.settings);
        }),
        install() {
            bridge.settings = {};
            bridge.settingsError = null;
            bridge.regenerate = () => Promise.resolve(undefined);
            bridge.invoke.mockClear();
            window.ipcRenderer = { invoke: bridge.invoke, on: vi.fn(() => vi.fn()) };
        },
    };
    return bridge;
}

/** Let the pending IPC answers resolve and React commit what they set, under real or fake timers. */
export function settle(): Promise<void> {
    return act(async () => {
        if (vi.isFakeTimers()) await vi.advanceTimersByTimeAsync(0);
        else await new Promise(resolve => setTimeout(resolve, 0));
    });
}

/** The pairing URL the Remote tab shows (the QR code's content), or null when it shows none. */
export function shownUrl(): string | null {
    return (screen.queryByTitle('Click to copy URL') as HTMLInputElement | null)?.value ?? null;
}

/** Mission Control Settings, open inside the real store, on the 📱 Remote tab. */
export async function openRemoteTab(): Promise<void> {
    render(<MCStoreProvider><MCSettingsOverlay open onClose={vi.fn()} /></MCStoreProvider>);
    await settle();
    await act(async () => { fireEvent.click(screen.getByText('📱 Remote')); });
    await settle();
}

export async function regenerateKeys(): Promise<void> {
    await act(async () => { fireEvent.click(screen.getByText(/Regenerate Keys/)); });
}
