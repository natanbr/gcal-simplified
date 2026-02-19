import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => {
  // Browser Window Mock
  const mockBrowserWindow = vi.fn();
  mockBrowserWindow.prototype.loadURL = vi.fn();
  mockBrowserWindow.prototype.loadFile = vi.fn();
  mockBrowserWindow.prototype.maximize = vi.fn();
  mockBrowserWindow.prototype.webContents = {
    on: vi.fn(),
    send: vi.fn(),
  };
  // Static method
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (mockBrowserWindow as any).getAllWindows = vi.fn().mockReturnValue([]);

  // App Mock
  const mockApp = {
    whenReady: vi.fn().mockResolvedValue(undefined),
    on: vi.fn(),
    quit: vi.fn(),
    getVersion: vi.fn().mockReturnValue('0.0.0'),
  };

  // IPC Main Mock
  const mockIpcMain = {
    handle: vi.fn(),
    on: vi.fn(),
  };

  // Power Monitor Mock
  const mockPowerMonitor = {
    getSystemIdleTime: vi.fn().mockReturnValue(0)
  };

  return {
    mockBrowserWindow,
    mockApp,
    mockIpcMain,
    mockPowerMonitor
  };
});

vi.mock('electron', () => ({
  app: mocks.mockApp,
  BrowserWindow: mocks.mockBrowserWindow,
  ipcMain: mocks.mockIpcMain,
  powerMonitor: mocks.mockPowerMonitor,
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
  exec: vi.fn(),
  default: { exec: vi.fn() },
}));

// Mock local modules to prevent side effects (like electron-store initialization)
vi.mock('./auth', () => ({
  authService: {
    startAuth: vi.fn(),
    logout: vi.fn(),
    isAuthenticated: vi.fn(),
  }
}));

vi.mock('./api', () => ({
  apiService: {
    getEvents: vi.fn(),
    getSettings: vi.fn().mockReturnValue({}),
    saveSettings: vi.fn(),
    getCalendars: vi.fn(),
    getTaskLists: vi.fn(),
    getTasks: vi.fn(),
  }
}));

vi.mock('./weather', () => ({
  weatherService: {
    getWeather: vi.fn(),
    getTides: vi.fn(),
  }
}));

describe('Main Process Security Configuration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('should create BrowserWindow with secure webPreferences', async () => {
    // Import main.ts to trigger the logic
    await import('./main');

    // Wait briefly for the promise resolution in main.ts
    await new Promise(resolve => setTimeout(resolve, 50));

    // Verify BrowserWindow was created
    expect(mocks.mockBrowserWindow).toHaveBeenCalled();

    // Check the configuration passed to the constructor
    const config = mocks.mockBrowserWindow.mock.calls[0][0];

    expect(config).toBeDefined();
    expect(config.webPreferences).toBeDefined();

    // Security Assertions
    expect(config.webPreferences.contextIsolation).toBe(true);
    expect(config.webPreferences.nodeIntegration).toBe(false);
    expect(config.webPreferences.sandbox).toBe(true);
  });
});
