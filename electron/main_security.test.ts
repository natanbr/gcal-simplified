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
    setWindowOpenHandler: vi.fn(),
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

  // Session Mock
  const mockSession = {
    defaultSession: {
      setPermissionRequestHandler: vi.fn(),
      setPermissionCheckHandler: vi.fn(),
      webRequest: {
        onHeadersReceived: vi.fn()
      }
    }
  };

  return {
    mockBrowserWindow,
    mockApp,
    mockIpcMain,
    mockPowerMonitor,
    mockSession
  };
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

  it('should deny unauthorized window creation via setWindowOpenHandler', async () => {
    // Import main.ts to trigger the logic
    await import('./main');

    // Wait briefly for the promise resolution in main.ts
    await new Promise(resolve => setTimeout(resolve, 50));

    const mockWebContents = mocks.mockBrowserWindow.prototype.webContents;
    expect(mockWebContents.setWindowOpenHandler).toHaveBeenCalled();

    const handler = mockWebContents.setWindowOpenHandler.mock.calls[0][0];
    const result = handler({ url: 'https://malicious.com' });
    expect(result).toEqual({ action: 'deny' });
  });

  it('should register a Content-Security-Policy header callback that permits fonts.gstatic.com for img-src', async () => {
    // Import main.ts to trigger the logic
    await import('./main');

    // Wait briefly for the promise resolution in main.ts
    await new Promise(resolve => setTimeout(resolve, 50));

    expect(mocks.mockSession.defaultSession.webRequest.onHeadersReceived).toHaveBeenCalled();

    const handler = mocks.mockSession.defaultSession.webRequest.onHeadersReceived.mock.calls[0][0];

    // Simulate headers received callback
    const details = { responseHeaders: {} };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let returnedHeaders: any = null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    handler(details, (result: any) => {
      returnedHeaders = result.responseHeaders;
    });


    expect(returnedHeaders).toBeDefined();
    const csp = returnedHeaders['Content-Security-Policy'][0];

    // We expect the CSP to allow fonts.gstatic.com in img-src
    expect(csp).toContain("img-src");
    expect(csp).toContain("https://fonts.gstatic.com");

    // Ensure fonts.gstatic.com is specifically whitelisted inside the img-src directive
    const imgSrcMatch = csp.match(/img-src\s+([^;]+)/);
    expect(imgSrcMatch).not.toBeNull();
    expect(imgSrcMatch[1]).toContain("https://fonts.gstatic.com");
  });

  it('should enforce default-deny permissions', async () => {
    // Import main.ts to trigger the logic
    await import('./main');

    // Wait briefly for the promise resolution in main.ts
    await new Promise(resolve => setTimeout(resolve, 50));

    expect(mocks.mockSession.defaultSession.setPermissionRequestHandler).toHaveBeenCalled();
    expect(mocks.mockSession.defaultSession.setPermissionCheckHandler).toHaveBeenCalled();

    // Verify setPermissionRequestHandler denies
    const requestHandler = mocks.mockSession.defaultSession.setPermissionRequestHandler.mock.calls[0][0];
    const mockCallback = vi.fn();
    requestHandler({}, 'geolocation', mockCallback);
    expect(mockCallback).toHaveBeenCalledWith(false);

    // Verify setPermissionCheckHandler denies
    const checkHandler = mocks.mockSession.defaultSession.setPermissionCheckHandler.mock.calls[0][0];
    const checkResult = checkHandler({}, 'geolocation', 'https://example.com', {});
    expect(checkResult).toBe(false);
  });
});

