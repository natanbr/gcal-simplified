// ============================================================
// main.ts and the Google sign-in (2026-10-04)
// ------------------------------------------------------------
// - When Google refuses the refresh token, auth.ts clears the credentials and
//   tells its signed-out listeners. main.ts must forward that to the renderer
//   as `auth:signed-out`, or the calendar keeps showing an empty week until a
//   relaunch. preload_contract.test.ts checks the channel is whitelisted.
// - auth:check reads a token file that another program holds for a moment
//   (antivirus, a backup) again before it answers, so the window gets an
//   answer instead of an error it would show as "Sign in with Google".
// ============================================================

import { describe, it, expect, vi, afterEach } from 'vitest';
import { format, inspect } from 'node:util';

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
        handle: vi.fn(),
        isAuthenticated: vi.fn(),
        startAuth: vi.fn(),
        logout: vi.fn(),
        api: { getEvents: vi.fn(), getTasks: vi.fn(), getCalendars: vi.fn(), getTaskLists: vi.fn() },
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
    ipcMain: { handle: mocks.handle, on: vi.fn() },
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
    authService: { startAuth: mocks.startAuth, logout: mocks.logout, isAuthenticated: mocks.isAuthenticated, onSignedOut: mocks.onSignedOut },
}));
vi.mock('./api', () => ({ apiService: mocks.api }));
vi.mock('./weather', () => ({ weatherService: {} }));
vi.mock('./remote-bridge', () => ({ remoteBridge: { init: vi.fn() } }));
vi.mock('./audit-log', () => ({ auditLog: {} }));

await import('./main');
await vi.waitFor(() => expect(mocks.onSignedOut).toHaveBeenCalledTimes(1));

const held = (code: string) => Object.assign(new Error(`${code}: resource busy or locked`), { code });

function handlerFor(channel: string): (...args: unknown[]) => Promise<unknown> {
    const registered = mocks.handle.mock.calls.find(([name]) => name === channel);
    if (!registered) throw new Error(`main.ts registered no ${channel} handler`);
    const [, handler] = registered;
    return async (...args) => handler({}, ...args); // ipcMain.handle turns a throw into a rejection the same way
}
const authCheck = () => () => handlerFor('auth:check')();

/** A gaxios error as a failed refresh leaves it: the request body, refresh token included, in its config. */
const SEED = 'SEEDED-REFRESH-TOKEN-0123';
const googleError = () => Object.assign(new Error('request to https://oauth2.googleapis.com/token failed'), {
    name: 'GaxiosError',
    status: 503,
    config: { url: 'https://oauth2.googleapis.com/token', method: 'POST', data: new URLSearchParams({ refresh_token: SEED, grant_type: 'refresh_token' }) },
    response: { status: 503, data: { error: 'backend_error' } },
});

describe('main.ts and the Google sign-in', () => {
    afterEach(() => {
        vi.useRealTimers();
        mocks.isAuthenticated.mockReset();
    });

    it('sends auth:signed-out to the window when auth.ts reports one', () => {
        expect(mocks.send).not.toHaveBeenCalledWith('auth:signed-out');

        const [listener] = mocks.onSignedOut.mock.calls[0];
        listener();

        expect(mocks.send).toHaveBeenCalledWith('auth:signed-out');
    });

    it('auth:check reads a held token file again and answers', async () => {
        vi.useFakeTimers();
        mocks.isAuthenticated
            .mockImplementationOnce(() => { throw held('EBUSY'); })
            .mockImplementationOnce(() => { throw held('EPERM'); })
            .mockReturnValue(true);

        const answer = authCheck()();
        await vi.runAllTimersAsync();

        await expect(answer).resolves.toBe(true);
        expect(mocks.isAuthenticated).toHaveBeenCalledTimes(3);
    });

    it('auth:check answers any other failure at once', async () => {
        mocks.isAuthenticated.mockImplementation(() => { throw new Error('Google credentials were requested before the app is ready'); });

        await expect(authCheck()()).rejects.toThrow('before the app is ready');
        expect(mocks.isAuthenticated).toHaveBeenCalledTimes(1);
    });
});

describe('no data: or auth: handler lets a Google error reach Electron\'s log', () => {
    // Electron 40 logs every rejected ipcMain.handle as
    // console.error(`Error occurred in handler for '${channel}':`, err), at Node's print depth.
    const CHANNELS = mocks.handle.mock.calls.map(([channel]) => String(channel)).filter(channel => /^(data|auth):/.test(channel));

    afterEach(() => {
        for (const service of [mocks.startAuth, mocks.logout, mocks.isAuthenticated, ...Object.values(mocks.api)]) service.mockReset();
    });

    it('covers every data: and auth: handler main.ts registers', () => {
        expect(CHANNELS).toEqual(expect.arrayContaining(['auth:login', 'auth:logout', 'auth:check', 'data:events', 'data:tasks', 'data:calendars', 'data:tasklists']));
    });

    it.each(CHANNELS)('%s', async channel => {
        for (const service of [mocks.startAuth, mocks.isAuthenticated, mocks.logout, ...Object.values(mocks.api)]) {
            service.mockImplementation(() => { throw googleError(); });
        }

        const rejection = await handlerFor(channel)().then(() => { throw new Error('expected a rejection'); }, (error: unknown) => error);

        expect(format(`Error occurred in handler for '%s':`, channel, rejection)).not.toContain(SEED);
        expect(inspect(rejection, { depth: null, showHidden: true })).not.toContain(SEED);
        expect(String(rejection)).toContain('status 503'); // what failed still reaches the window
    });

    it('an error of our own reaches the window as it is', async () => {
        await expect(handlerFor('data:events')(42, 'x')).rejects.toThrow('timeMin and timeMax must be strings');
    });
});
