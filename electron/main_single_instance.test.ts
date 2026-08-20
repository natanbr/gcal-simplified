// ============================================================
// Guard: only ONE instance of the app may ever run.
//
// Two instances share the same userData directory, which means they share
// `localStorage` (the Mission Control store, key `mc-state-v5`) and the same
// Supabase remote-control room. The result is last-writer-wins clobbering:
// token counts flip back and forth, activity-log history is eaten, missions
// fire twice, and the remote sees two conflicting states.
// ============================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => {
  const mockBrowserWindow = vi.fn();
  mockBrowserWindow.prototype.loadURL = vi.fn();
  mockBrowserWindow.prototype.loadFile = vi.fn();
  mockBrowserWindow.prototype.maximize = vi.fn();
  mockBrowserWindow.prototype.restore = vi.fn();
  mockBrowserWindow.prototype.focus = vi.fn();
  mockBrowserWindow.prototype.show = vi.fn();
  mockBrowserWindow.prototype.isMinimized = vi.fn().mockReturnValue(false);
  mockBrowserWindow.prototype.webContents = {
    on: vi.fn(),
    send: vi.fn(),
    setWindowOpenHandler: vi.fn(),
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (mockBrowserWindow as any).getAllWindows = vi.fn().mockReturnValue([]);

  const mockApp = {
    whenReady: vi.fn().mockResolvedValue(undefined),
    on: vi.fn(),
    quit: vi.fn(),
    exit: vi.fn(),
    getVersion: vi.fn().mockReturnValue('0.0.0'),
    requestSingleInstanceLock: vi.fn().mockReturnValue(true),
  };

  const mockIpcMain = { handle: vi.fn(), on: vi.fn() };
  const mockPowerMonitor = { getSystemIdleTime: vi.fn().mockReturnValue(0), on: vi.fn() };
  const mockSession = {
    defaultSession: {
      setPermissionRequestHandler: vi.fn(),
      setPermissionCheckHandler: vi.fn(),
      webRequest: { onHeadersReceived: vi.fn() },
    },
  };

  return { mockBrowserWindow, mockApp, mockIpcMain, mockPowerMonitor, mockSession };
});

vi.mock('electron', () => ({
  app: mocks.mockApp,
  BrowserWindow: mocks.mockBrowserWindow,
  ipcMain: mocks.mockIpcMain,
  powerMonitor: mocks.mockPowerMonitor,
  session: mocks.mockSession,
}));

vi.mock('electron-updater', () => ({
  autoUpdater: {
    checkForUpdates: vi.fn().mockResolvedValue(null),
    downloadUpdate: vi.fn(),
    quitAndInstall: vi.fn(),
    on: vi.fn(),
    logger: {},
  },
}));

vi.mock('node:child_process', () => ({
  execFile: vi.fn(),
  default: { execFile: vi.fn() },
}));

vi.mock('./auth', () => ({
  authService: { startAuth: vi.fn(), logout: vi.fn(), isAuthenticated: vi.fn() },
}));

vi.mock('./api', () => ({
  apiService: {
    getEvents: vi.fn(),
    getSettings: vi.fn().mockReturnValue({}),
    saveSettings: vi.fn(),
    getCalendars: vi.fn(),
    getTaskLists: vi.fn(),
    getTasks: vi.fn(),
  },
}));

vi.mock('./weather', () => ({ weatherService: { getWeather: vi.fn() } }));

vi.mock('./remote-bridge', () => ({
  remoteBridge: {
    init: vi.fn(),
    regenerateKeys: vi.fn(),
    broadcastState: vi.fn(),
    getStatus: vi.fn(),
    destroy: vi.fn(),
  },
}));

vi.mock('./audit-log', () => ({
  auditLog: { append: vi.fn(), read: vi.fn().mockReturnValue([]) },
}));

describe('Single instance enforcement', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    mocks.mockApp.requestSingleInstanceLock.mockReturnValue(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (mocks.mockBrowserWindow as any).getAllWindows.mockReturnValue([]);
  });

  it('acquires the single-instance lock before doing anything else', async () => {
    await import('./main');
    await new Promise(resolve => setTimeout(resolve, 50));

    expect(mocks.mockApp.requestSingleInstanceLock).toHaveBeenCalled();
  });

  it('quits immediately and creates NO window when the lock is already held', async () => {
    mocks.mockApp.requestSingleInstanceLock.mockReturnValue(false);

    await import('./main');
    await new Promise(resolve => setTimeout(resolve, 50));

    expect(mocks.mockApp.quit).toHaveBeenCalled();
    expect(mocks.mockBrowserWindow).not.toHaveBeenCalled();
  });

  it('registers a second-instance handler that focuses the existing window', async () => {
    await import('./main');
    await new Promise(resolve => setTimeout(resolve, 50));

    const registration = mocks.mockApp.on.mock.calls.find(([event]) => event === 'second-instance');
    expect(registration, 'app.on("second-instance") was never registered').toBeDefined();

    const existingWindow = {
      isMinimized: vi.fn().mockReturnValue(true),
      restore: vi.fn(),
      focus: vi.fn(),
      show: vi.fn(),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (mocks.mockBrowserWindow as any).getAllWindows.mockReturnValue([existingWindow]);

    registration![1]();

    expect(existingWindow.restore).toHaveBeenCalled();
    expect(existingWindow.focus).toHaveBeenCalled();
  });
});
