import { app, BrowserWindow, ipcMain, powerMonitor, session } from 'electron'
import 'dotenv/config'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { autoUpdater } from 'electron-updater'
import { authService } from './auth'
import { apiService } from './api'
import { weatherService } from './weather'
import { remoteBridge } from './remote-bridge'
import { auditLog } from './audit-log'
import { startPowerPolicy } from './power-policy'
import { acquireSingleInstanceLock } from './single-instance'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// The built directory structure
//
// ├─┬─┬ dist
// │ │ └── index.html
// │ │
// │ ├─┬ dist-electron
// │ │ ├── main.js
// │ │ └── preload.mjs
// │
process.env.APP_ROOT = path.join(__dirname, '..')

// 🚧 Use ['ENV_NAME'] avoid vite:define plugin - Vite@2.x
export const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']
export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron')
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL ? path.join(process.env.APP_ROOT, 'public') : RENDERER_DIST

let win: BrowserWindow | null

/**
 * Offscreen mode for the E2E suite. Electron cannot run truly headless on
 * Windows, but an unshown window still loads, renders and is fully drivable
 * over CDP — which is all Playwright needs. Without this, a suite run throws a
 * fullscreen window in the developer's face once per test (44 times).
 * Set E2E_HEADLESS=1 to enable; unset, behaviour is unchanged.
 */
const HEADLESS = process.env.E2E_HEADLESS === '1'


// Single instance enforcement runs before anything else — see
// electron/single-instance.ts for why it is load-bearing. The `headless` flag
// lets the running instance tell an E2E launch from a real one.
if (acquireSingleInstanceLock({ headless: HEADLESS })) {
  app.on('window-all-closed', handleAllWindowsClosed)
  app.on('activate', handleActivate)
  app.whenReady().then(bootstrap)
}

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
function handleAllWindowsClosed(): void {
  if (process.platform !== 'darwin') {
    app.quit()
    win = null
  }
}

function handleActivate(): void {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
}

function createWindow() {
  win = new BrowserWindow({
    icon: path.join(process.env.VITE_PUBLIC, 'electron-vite.svg'),
    fullscreen: !HEADLESS,
    show: !HEADLESS,
    // An unshown window keeps its configured size, so give it a desktop-sized
    // viewport — otherwise layout-dependent assertions run against 800x600.
    ...(HEADLESS ? { width: 1920, height: 1080 } : {}),
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  // Maximize window for better visibility
  if (!HEADLESS) win.maximize()

  // 🛡️ Sentinel: Prevent unauthorized window creation
  win.webContents.setWindowOpenHandler(() => {
    return { action: 'deny' }
  })

  // Test active push message to Renderer-process.
  win.webContents.on('did-finish-load', () => {
    win?.webContents.send('main-process-message', (new Date).toLocaleString())
  })

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL)
  } else {
    win.loadFile(path.join(RENDERER_DIST, 'index.html'))
  }
}

function registerIpcHandlers(): void {
  ipcMain.handle('auth:login', async () => {
    if (win) {
      await authService.startAuth();
      win.webContents.send('auth:success');
      return true;
    }
    return false;
  });

  ipcMain.handle('auth:logout', () => {
    authService.logout();
    return true;
  });

  ipcMain.handle('auth:check', () => {
    return authService.isAuthenticated();
  });

  // Data Handlers
  ipcMain.handle('data:events', async (_, timeMin?: string, timeMax?: string) => {
    let start: Date;
    let end: Date;

    if (timeMin && timeMax) {
      // 🛡️ Sentinel: Validate IPC boundary inputs to prevent RangeError crashes downstream
      if (typeof timeMin !== 'string' || typeof timeMax !== 'string') {
        throw new Error('timeMin and timeMax must be strings');
      }

      const parsedStart = new Date(timeMin);
      const parsedEnd = new Date(timeMax);

      if (isNaN(parsedStart.getTime()) || isNaN(parsedEnd.getTime())) {
        throw new Error('Invalid date strings provided for timeMin or timeMax');
      }

      start = parsedStart;
      end = parsedEnd;
    } else {
      // Default: Fetch next 10 days starting from the beginning of today
      start = new Date();
      start.setHours(0, 0, 0, 0);
      end = new Date();
      end.setDate(start.getDate() + 10);
    }

    return await apiService.getEvents(start, end);
  });

  ipcMain.handle('data:tasks', async () => apiService.getTasks());

  // Settings
  ipcMain.handle('settings:get', () => apiService.getSettings());
  ipcMain.handle('settings:save', (_, config) => apiService.saveSettings(config));

  // Data Lists (for Settings UI)
  ipcMain.handle('data:calendars', () => apiService.getCalendars());
  ipcMain.handle('data:tasklists', () => apiService.getTaskLists());

  // Remote control
  ipcMain.handle('remote:regenerate', () => remoteBridge.regenerateKeys());
  ipcMain.handle('remote:sync-state', (_, state) => remoteBridge.broadcastState(state));
  ipcMain.handle('remote:get-status', () => remoteBridge.getStatus());

  // Durable audit trail. Append-only by design - there is deliberately no
  // 'audit:clear' channel, so the in-app CLEAR button cannot erase this record.
  ipcMain.handle('audit:append', (_, entries) => auditLog.append(entries));
  ipcMain.handle('audit:read', (_, limit?: number) => auditLog.read(typeof limit === 'number' ? limit : 500));

  // Weather
  ipcMain.handle('weather:get', async (_, lat?: number, lng?: number) => {
    return await weatherService.getWeather(lat, lng);
  });

  // Update Handlers
  ipcMain.handle('update:check', () => {
    console.log('Manual update check triggered');
    return autoUpdater.checkForUpdates();
  });

  ipcMain.handle('update:download', () => {
    console.log('Update download triggered');
    return autoUpdater.downloadUpdate();
  });

  ipcMain.handle('update:install', () => {
    console.log('Update installation triggered');
    return autoUpdater.quitAndInstall();
  });

  ipcMain.handle('app:info', () => ({ version: app.getVersion() }));
}

function registerAutoUpdater(): void {
  autoUpdater.autoDownload = false;
  autoUpdater.logger = console;

  autoUpdater.on('update-available', (info) => {
    console.log('Update available:', info.version);
    win?.webContents.send('update:available', info);
  });

  autoUpdater.on('update-not-available', (info) => {
    console.log('Update not available:', info.version);
    win?.webContents.send('update:not-available', info);
  });

  autoUpdater.on('download-progress', (progressObj) => {
    console.log(`Download progress: ${progressObj.percent}%`);
    win?.webContents.send('update:download-progress', progressObj);
  });

  autoUpdater.on('update-downloaded', (info) => {
    console.log('Update downloaded:', info.version);
    win?.webContents.send('update:downloaded', info);
  });

  autoUpdater.on('error', (err) => {
    console.error('Update error:', err);
    win?.webContents.send('update:error', err);
  });

  setTimeout(() => {
    console.log('Initial update check');
    autoUpdater.checkForUpdates().catch(err => console.error('Initial update check failed:', err));
  }, 5000);

  setInterval(() => {
    console.log('Periodic update check');
    autoUpdater.checkForUpdates().catch(err => console.error('Periodic update check failed:', err));
  }, 4 * 60 * 60 * 1000);
}

function bootstrap(): void {
  // Set up Content Security Policy
  const csp = VITE_DEV_SERVER_URL
    ? "default-src 'self' 'unsafe-inline' data:; script-src 'self' 'unsafe-eval' 'unsafe-inline'; connect-src 'self' ws: http: https:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: https://fonts.gstatic.com;"
    : "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: https://fonts.gstatic.com; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none';";

  // 🛡️ Sentinel: Enforce default-deny permissions for all device resources
  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(false);
  });
  session.defaultSession.setPermissionCheckHandler(() => false);

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [csp],
      },
    });
  });

  createWindow()
  remoteBridge.init()

  // Sleep/resume is why "missions start at the wrong time": a setTimeout armed
  // for 07:00 does not survive a suspend intact - it fires late (or instantly)
  // on resume. Tell the renderer so it can re-arm its schedule against the real
  // wall clock instead of trusting a timer that slept through the night.
  powerMonitor.on('resume', () => {
    console.log('[Main] System resumed - notifying renderer to re-arm schedules.');
    BrowserWindow.getAllWindows().forEach(w => w.webContents.send('system:resume'));
  });

  registerIpcHandlers()
  startPowerPolicy()
  registerAutoUpdater()
}
