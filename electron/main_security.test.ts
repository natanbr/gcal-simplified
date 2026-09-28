import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => {
  // Browser Window Mock
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
  // Static method
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (mockBrowserWindow as any).getAllWindows = vi.fn().mockReturnValue([]);

  // App Mock
  const mockApp = {
    whenReady: vi.fn().mockResolvedValue(undefined),
    on: vi.fn(),
    quit: vi.fn(),
    getVersion: vi.fn().mockReturnValue('0.0.0'),
    requestSingleInstanceLock: vi.fn().mockReturnValue(true),
  };

  // IPC Main Mock
  const mockIpcMain = {
    handle: vi.fn(),
    on: vi.fn(),
  };

  // Power Monitor Mock
  const mockPowerMonitor = {
    getSystemIdleTime: vi.fn().mockReturnValue(0),
    on: vi.fn(),
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
  execFile: vi.fn(),
  default: { execFile: vi.fn() },
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

vi.mock('./remote-bridge', () => ({
  remoteBridge: {
    init: vi.fn(),
    regenerateKeys: vi.fn(),
    broadcastState: vi.fn(),
    getStatus: vi.fn(),
    destroy: vi.fn(),
  }
}));

vi.mock('./audit-log', () => ({
  auditLog: { append: vi.fn(), read: vi.fn().mockReturnValue([]) }
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


// ── data:events: only a plain { strict: true } opts in to strict mode ─────────
// The third argument crosses the IPC boundary from the renderer. Strict mode
// turns every swallowed failure into a thrown one, so anything that is not
// exactly a plain object with its OWN `strict: true` must leave the calendar
// view's forgiving behaviour in place.
describe('data:events — the strict flag at the IPC boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  async function dataEventsHandler() {
    await import('./main');
    await new Promise(resolve => setTimeout(resolve, 50));
    const { apiService } = await import('./api');
    const call = mocks.mockIpcMain.handle.mock.calls.find(([channel]) => channel === 'data:events');
    if (!call) throw new Error('data:events was never registered');
    const handler = call[1] as (event: unknown, ...args: unknown[]) => Promise<unknown>;
    return { handler, getEvents: vi.mocked(apiService.getEvents) };
  }

  const MIN = new Date(2026, 8, 27).toISOString();
  const MAX = new Date(2026, 9, 13).toISOString();

  it('a plain { strict: true } asks the API for strict mode', async () => {
    const { handler, getEvents } = await dataEventsHandler();
    await handler({}, MIN, MAX, { strict: true });
    expect(getEvents).toHaveBeenCalledWith(new Date(MIN), new Date(MAX), { strict: true });
  });

  it('no third argument keeps the calendar view\'s forgiving call', async () => {
    const { handler, getEvents } = await dataEventsHandler();
    await handler({}, MIN, MAX);
    expect(getEvents).toHaveBeenCalledWith(new Date(MIN), new Date(MAX), { strict: false });
  });

  it.each<[string, unknown]>([
    ['true', true],
    ['the string "strict"', 'strict'],
    ['{ strict: "true" }', { strict: 'true' }],
    ['{ strict: 1 }', { strict: 1 }],
    ['[true]', [true]],
    ['null', null],
  ])('garbage from the renderer (%s) is NOT strict', async (_label, options) => {
    const { handler, getEvents } = await dataEventsHandler();
    await handler({}, MIN, MAX, options);
    expect(getEvents).toHaveBeenCalledWith(new Date(MIN), new Date(MAX), { strict: false });
  });

  // Cannot arrive over real IPC: the structured clone drops prototypes, so the
  // renderer can only ever send a plain object. These pin the handler's own
  // check (defence in depth), in case it is ever called from inside the main
  // process or the transport changes.
  const inherited: unknown = Object.create({ strict: true });
  it.each<[string, unknown]>([
    ['a strict flag inherited from the prototype', inherited],
    ['a class instance', new (class { strict = true })()],
  ])('defence in depth, handler level: %s is NOT strict', async (_label, options) => {
    const { handler, getEvents } = await dataEventsHandler();
    await handler({}, MIN, MAX, options);
    expect(getEvents).toHaveBeenCalledWith(new Date(MIN), new Date(MAX), { strict: false });
  });
});
