// ============================================================
// A sign-out Google forced reaches the window (2026-10-04)
// ------------------------------------------------------------
// When Google refuses the refresh token, auth.ts clears the credentials and
// tells its signed-out listeners. main.ts must forward that to the renderer as
// `auth:signed-out`, or the calendar keeps showing an empty week until a
// relaunch. preload_contract.test.ts checks the channel is whitelisted.
// ============================================================

import { describe, it, expect, vi } from 'vitest';

const mocks = vi.hoisted(() => {
    const send = vi.fn();
    const BrowserWindow = vi.fn();
    BrowserWindow.prototype.loadURL = vi.fn();
    BrowserWindow.prototype.loadFile = vi.fn();
    BrowserWindow.prototype.maximize = vi.fn();
    BrowserWindow.prototype.webContents = { on: vi.fn(), send, setWindowOpenHandler: vi.fn() };
    return {
        send,
        BrowserWindow: Object.assign(BrowserWindow, { getAllWindows: vi.fn(() => []) }),
        onSignedOut: vi.fn(),
    };
});

vi.mock('electron', () => ({
    app: {
        whenReady: vi.fn().mockResolvedValue(undefined),
        on: vi.fn(),
        quit: vi.fn(),
        getVersion: vi.fn(() => '0.0.0'),
        requestSingleInstanceLock: vi.fn(() => true),
    },
    BrowserWindow: mocks.BrowserWindow,
    ipcMain: { handle: vi.fn(), on: vi.fn() },
    powerMonitor: { getSystemIdleTime: vi.fn(() => 0), on: vi.fn() },
    session: {
        defaultSession: {
            setPermissionRequestHandler: vi.fn(),
            setPermissionCheckHandler: vi.fn(),
            webRequest: { onHeadersReceived: vi.fn() },
        },
    },
}));
vi.mock('electron-updater', () => ({
    autoUpdater: { checkForUpdates: vi.fn().mockResolvedValue(null), on: vi.fn(), logger: {} },
}));
vi.mock('node:child_process', () => ({ execFile: vi.fn(), default: { execFile: vi.fn() } }));
vi.mock('./auth', () => ({
    authService: { startAuth: vi.fn(), logout: vi.fn(), isAuthenticated: vi.fn(), onSignedOut: mocks.onSignedOut },
}));
vi.mock('./api', () => ({ apiService: {} }));
vi.mock('./weather', () => ({ weatherService: {} }));
vi.mock('./remote-bridge', () => ({ remoteBridge: { init: vi.fn() } }));
vi.mock('./audit-log', () => ({ auditLog: {} }));

describe('main.ts forwards a forced sign-out', () => {
    it('sends auth:signed-out to the window when auth.ts reports one', async () => {
        await import('./main');
        await vi.waitFor(() => expect(mocks.onSignedOut).toHaveBeenCalledTimes(1));
        expect(mocks.send).not.toHaveBeenCalledWith('auth:signed-out');

        const [listener] = mocks.onSignedOut.mock.calls[0];
        listener();

        expect(mocks.send).toHaveBeenCalledWith('auth:signed-out');
    });
});
