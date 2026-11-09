// ============================================================
// A change made just before the app closes is saved (2026-11-08)
// ------------------------------------------------------------
// The provider saves mc-state-v5 500 ms after the last change. Closing the
// window, or a quit (the auto-updater's quitAndInstall included), unmounts
// nothing, and the pending timer dies with the page: a coin or a mission change
// made in the last half second was gone at the next launch. The page's
// `pagehide` now writes a pending save at once.
//
// Each test mounts the real provider and changes the store through its own
// dispatch, the way a tap does. e2e/mc-save-on-close.spec.ts is the real-Electron
// half: jsdom cannot show that Chromium fires pagehide on a quit.
// ============================================================

import { useEffect, useRef, type ReactNode } from 'react';
import { render, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach, type MockInstance } from 'vitest';
import { MCStoreProvider } from './MCStoreProvider';
import { STORAGE_KEY, useMCDispatch, useMCState } from './useMCStore';
import type { MCAction, MCState } from '../types';

const invoke = vi.fn<(channel: string, payload?: unknown) => Promise<unknown>>((channel: string) => {
    if (channel === 'app:info') return Promise.resolve({ version: 'test' });
    if (channel === 'settings:get') return Promise.resolve({});
    return Promise.resolve(undefined);
});

let dispatch: (a: MCAction) => void = () => {};
function Probe() {
    dispatch = useMCDispatch();
    return null;
}

/**
 * Fires pagehide from its own passive effect when the bank changes. A child's
 * effects run before its parent's, so this is a pagehide that lands after React
 * committed a change and before the provider's effects ran: a change from a
 * timer, IPC or the phone, then a quit in the same frame.
 */
function HideOnBankChange() {
    const { bankCount } = useMCState();
    const first = useRef(bankCount);
    useEffect(() => {
        if (bankCount !== first.current) window.dispatchEvent(new Event('pagehide'));
    }, [bankCount]);
    return null;
}

let setItem: MockInstance<Storage['setItem']>;
/** How many times mc-state-v5 has been written. */
const saves = () => setItem.mock.calls.filter(([key]) => key === STORAGE_KEY).length;
const saved = (): MCState => JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as MCState;

const advance = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });
const addCoin = () => act(() => { dispatch({ type: 'ADD_TOKENS', amount: 1, source: 'manual' }); });
const pageHide = () => act(() => { window.dispatchEvent(new Event('pagehide')); });

/** Mount the store and let its first save (the loaded state) land. */
async function launch(extra: ReactNode = null) {
    const view = render(<MCStoreProvider><Probe />{extra}</MCStoreProvider>);
    await advance(1500);
    return view;
}

/** Errors a pagehide listener threw: jsdom reports them on window, it does not rethrow them. */
function listenerErrors(): { errors: unknown[]; stop: () => void } {
    const errors: unknown[] = [];
    const onError = (e: ErrorEvent) => { errors.push(e.error); e.preventDefault(); };
    window.addEventListener('error', onError);
    return { errors, stop: () => window.removeEventListener('error', onError) };
}

beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-08T10:00:00.000Z'));
    localStorage.clear();
    invoke.mockClear();
    window.ipcRenderer = { invoke, on: vi.fn(() => vi.fn()) };
    setItem = vi.spyOn(Storage.prototype, 'setItem');
});

afterEach(() => {
    setItem.mockRestore();
    vi.useRealTimers();
    delete window.ipcRenderer;
    localStorage.clear();
});

describe('a change still waiting to be saved when the page goes away', () => {
    it('is written at once, the latest of several changes (happy path)', async () => {
        await launch();
        const before = saved().bankCount;

        addCoin();
        await advance(100);
        addCoin();
        await advance(100);
        expect(saved().bankCount, 'precondition: the debounced save has not run yet').toBe(before);
        pageHide();

        expect(saved().bankCount).toBe(before + 2);
        expect(saved().activityLogs[0]?.message).toBe('Manual tokens added');
    });

    it('is written when the pagehide lands before the provider\'s effects ran (the frame after a commit)', async () => {
        await launch(<HideOnBankChange />);
        const before = saved().bankCount;

        addCoin();

        expect(saved().bankCount).toBe(before + 1);
    });

    it('is not written a second time when the debounce would have fired (negative)', async () => {
        await launch();
        const savesBefore = saves();

        addCoin();
        pageHide();
        expect(saves()).toBe(savesBefore + 1);

        await advance(2000);
        expect(saves()).toBe(savesBefore + 1);
    });

    it('a pagehide with nothing waiting writes nothing (negative)', async () => {
        await launch();
        const savesBefore = saves();

        pageHide();

        expect(saves()).toBe(savesBefore);
    });

    it('a full storage (quota) does not throw out of the pagehide handler (negative)', async () => {
        await launch();
        addCoin();
        setItem.mockImplementation(() => { throw new DOMException('full', 'QuotaExceededError'); });
        const { errors, stop } = listenerErrors();
        const savesBefore = saves();

        pageHide();
        stop();

        expect(saves(), 'the pagehide tried the save').toBe(savesBefore + 1);
        expect(errors).toEqual([]);
    });

    it('stops listening when the provider unmounts: a pagehide after it writes nothing (negative)', async () => {
        const { unmount } = await launch();
        addCoin(); // a save is waiting...
        unmount(); // ...and the provider goes before it ran
        const savesBefore = saves();

        pageHide();

        expect(saves()).toBe(savesBefore);
    });

    it('changes after a pagehide are debounced, and a second pagehide saves at once (lifecycle: the page came back)', async () => {
        await launch();
        const before = saved().bankCount;
        addCoin();
        pageHide();
        expect(saved().bankCount).toBe(before + 1);

        addCoin();
        await advance(400);
        expect(saved().bankCount, 'saved before the debounce ran out').toBe(before + 1);
        await advance(200);
        expect(saved().bankCount).toBe(before + 2);

        addCoin();
        pageHide();
        expect(saved().bankCount, 'the second pagehide saved at once').toBe(before + 3);
    });
});
