// ============================================================
// Preload bridge — runtime behaviour of the channel whitelists
// ------------------------------------------------------------
// `preload_contract.test.ts` reads this file as text to catch drift against
// main.ts. That is a structural check — it never executes the guard. These
// tests actually load the module and call the exposed API, so the throw paths
// themselves are proven rather than assumed.
// ============================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
    contextBridge: { exposeInMainWorld: vi.fn() },
    ipcRenderer: {
        invoke: vi.fn().mockResolvedValue('ok'),
        on: vi.fn(),
        removeListener: vi.fn(),
    },
}));

vi.mock('electron', () => ({
    contextBridge: mocks.contextBridge,
    ipcRenderer: mocks.ipcRenderer,
}));

interface ExposedBridge {
    invoke: (channel: string, ...args: unknown[]) => Promise<unknown>;
    on: (channel: string, listener: (...args: unknown[]) => void) => () => void;
}

await import('./preload');

const [exposedName, bridge] = mocks.contextBridge.exposeInMainWorld.mock.calls[0] as [string, ExposedBridge];

describe('preload bridge', () => {
    beforeEach(() => {
        mocks.ipcRenderer.invoke.mockClear();
        mocks.ipcRenderer.on.mockClear();
        mocks.ipcRenderer.removeListener.mockClear();
    });

    it('exposes exactly one API onto the isolated world', () => {
        expect(mocks.contextBridge.exposeInMainWorld).toHaveBeenCalledTimes(1);
        expect(exposedName).toBe('ipcRenderer');
        expect(Object.keys(bridge).sort()).toEqual(['invoke', 'on']);
    });

    describe('invoke whitelist', () => {
        it('forwards a whitelisted channel', async () => {
            await bridge.invoke('auth:check');
            expect(mocks.ipcRenderer.invoke).toHaveBeenCalledWith('auth:check');
        });

        it('passes arguments through unchanged', async () => {
            await bridge.invoke('weather:get', 1.5, -3.25);
            expect(mocks.ipcRenderer.invoke).toHaveBeenCalledWith('weather:get', 1.5, -3.25);
        });

        it('THROWS on a non-whitelisted channel — never a silent no-op', () => {
            // A silent no-op would surface as a promise that never settles.
            expect(() => bridge.invoke('rm:everything')).toThrow(/Unauthorized channel/);
            expect(mocks.ipcRenderer.invoke).not.toHaveBeenCalled();
        });

        it('refuses a channel that only looks whitelisted', () => {
            // Guards against a substring/prefix match creeping into the check.
            expect(() => bridge.invoke('auth:check:evil')).toThrow(/Unauthorized channel/);
            expect(() => bridge.invoke('  auth:check')).toThrow(/Unauthorized channel/);
            expect(mocks.ipcRenderer.invoke).not.toHaveBeenCalled();
        });

        it('refuses a destructive audit channel — the trail is append-only', () => {
            for (const channel of ['audit:clear', 'audit:delete', 'audit:write']) {
                expect(() => bridge.invoke(channel)).toThrow(/Unauthorized channel/);
            }
        });
    });

    describe('on whitelist', () => {
        it('subscribes to a whitelisted channel and unwraps the event arg', () => {
            const listener = vi.fn();
            bridge.on('auth:success', listener);

            expect(mocks.ipcRenderer.on).toHaveBeenCalledWith('auth:success', expect.any(Function));

            // The renderer must receive the payload only — never Electron's
            // IpcRendererEvent, which exposes `sender` and the internal ports.
            const [, wrapped] = mocks.ipcRenderer.on.mock.calls[0];
            wrapped({ sender: 'INTERNAL' }, 'payload-one', 'payload-two');
            expect(listener).toHaveBeenCalledWith('payload-one', 'payload-two');
        });

        it('THROWS on a non-whitelisted channel', () => {
            expect(() => bridge.on('anything:goes', vi.fn())).toThrow(/Unauthorized channel/);
            expect(mocks.ipcRenderer.on).not.toHaveBeenCalled();
        });

        it('returns a working unsubscribe function', () => {
            const listener = vi.fn();
            const unsubscribe = bridge.on('system:resume', listener);

            expect(unsubscribe).toBeTypeOf('function');
            unsubscribe();
            expect(mocks.ipcRenderer.removeListener).toHaveBeenCalledWith('system:resume', expect.any(Function));
        });

        it('removes the same wrapper it registered', () => {
            bridge.on('remote-control:action', vi.fn());
            const registered = mocks.ipcRenderer.on.mock.calls[0][1];

            const unsubscribe = bridge.on('remote:status-changed', vi.fn());
            unsubscribe();

            const removed = mocks.ipcRenderer.removeListener.mock.calls[0][1];
            // The second subscription's wrapper must be removed, not the first's.
            expect(removed).not.toBe(registered);
        });
    });

    it('does not leak node or electron internals onto the bridge', () => {
        const surface = bridge as unknown as Record<string, unknown>;
        for (const forbidden of ['send', 'sendSync', 'postMessage', 'require', 'process']) {
            expect(surface[forbidden]).toBeUndefined();
        }
    });
});
