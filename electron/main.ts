import { app, BrowserWindow, ipcMain, powerMonitor } from 'electron'
import { exec } from 'node:child_process'
import 'dotenv/config'
// import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { autoUpdater } from 'electron-updater'
import { authService } from './auth'
import { apiService } from './api'
import { weatherService } from './weather'

// const require = createRequire(import.meta.url)
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

function createWindow() {
  win = new BrowserWindow({
    icon: path.join(process.env.VITE_PUBLIC, 'electron-vite.svg'),
    fullscreen: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
    },
  })

  // Maximize window for better visibility
  win.maximize()

  // Test active push message to Renderer-process.
  win.webContents.on('did-finish-load', () => {
    win?.webContents.send('main-process-message', (new Date).toLocaleString())
  })

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL)
  } else {
    // win.loadFile('dist/index.html')
    win.loadFile(path.join(RENDERER_DIST, 'index.html'))
  }
}

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
    win = null
  }
})

app.on('activate', () => {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})

app.whenReady().then(() => {
  createWindow()

  // IPC Handlers
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
      start = new Date(timeMin);
      end = new Date(timeMax);
    } else {
      // Default: Fetch next 10 days starting from the beginning of today
      start = new Date();
      start.setHours(0, 0, 0, 0);
      end = new Date();
      end.setDate(start.getDate() + 10);
    }

    return await apiService.getEvents(start, end);
  });

  // Settings
  ipcMain.handle('settings:get', () => apiService.getSettings());
  ipcMain.handle('settings:save', (_, config) => apiService.saveSettings(config));

  // Data Lists (for Settings UI)
  ipcMain.handle('data:calendars', () => apiService.getCalendars());
  ipcMain.handle('data:tasklists', () => apiService.getTaskLists());

  // Data Handlers (Updated)


  ipcMain.handle('data:tasks', async () => {
    return await apiService.getTasks();
  });

  // Weather & Tides
  ipcMain.handle('weather:get', async (_, lat?: number, lng?: number) => {
    return await weatherService.getWeather(lat, lng);
  });

  ipcMain.handle('tides:get', async (_, tideStation?: string, currentStation?: string, lat?: number, lng?: number) => {
    return await weatherService.getTides(tideStation, currentStation, lat, lng);
  });

  // Update Handlers
  ipcMain.handle('update:check', () => {
    return autoUpdater.checkForUpdates();
  });

  ipcMain.handle('update:download', () => {
    return autoUpdater.downloadUpdate();
  });

  ipcMain.handle('update:install', () => {
    return autoUpdater.quitAndInstall();
  });

  // Power Management Loop
  setInterval(checkPowerPolicy, 60 * 1000); // Check every minute

  // Auto Updater
  autoUpdater.autoDownload = false;

  autoUpdater.on('update-available', (info) => {
    win?.webContents.send('update:available', info);
  });

  autoUpdater.on('update-not-available', (info) => {
    win?.webContents.send('update:not-available', info);
  });

  autoUpdater.on('download-progress', (progressObj) => {
    win?.webContents.send('update:download-progress', progressObj);
  });

  autoUpdater.on('update-downloaded', (info) => {
    win?.webContents.send('update:downloaded', info);
  });

  autoUpdater.on('error', (err) => {
    win?.webContents.send('update:error', err);
  });

  // Initial Check
  setTimeout(() => {
    autoUpdater.checkForUpdates().catch(err => console.log('Update check failed:', err));
  }, 5000);
})

// Power Management Logic
function turnOffScreen() {
    // Prevent repeated firing if likely already off (simple debounce by relying on interval)
    console.log('Turning off screen due to sleep schedule inactivity...');

    if (process.platform === 'win32') {
        // PowerShell command to turn off monitor via SendMessage(HWND_BROADCAST, WM_SYSCOMMAND, SC_MONITORPOWER, 2)
        const psCommand = '(Add-Type -MemberDefinition "[DllImport(\'user32.dll\')] public static extern int SendMessage(int hWnd, int hMsg, int wParam, int lParam);" -Name "Win32SendMessage" -Namespace Win32Functions -PassThru)::SendMessage(0xffff, 0x0112, 0xF170, 2)';
        exec(`powershell -command "${psCommand}"`, (error) => {
             if (error) console.error('Failed to turn off screen:', error);
        });
    } else if (process.platform === 'darwin') {
        exec('pmset displaysleepnow');
    } else if (process.platform === 'linux') {
        exec('xset dpms force off');
    }
}

function checkPowerPolicy() {
    try {
        const config = apiService.getSettings();
        if (config.sleepEnabled === false) return; // Explicit false check, default true

        const now = new Date();
        const currentHour = now.getHours();

        const start = config.sleepStart ?? 22;
        const end = config.sleepEnd ?? 6;

        let inSleepWindow = false;
        if (start === end) {
            inSleepWindow = false; // Disable if start == end
        } else if (start > end) {
            // e.g. 22 to 6: 22, 23, 0, 1, 2, 3, 4, 5
            inSleepWindow = currentHour >= start || currentHour < end;
        } else {
            // e.g. 1 to 5
            inSleepWindow = currentHour >= start && currentHour < end;
        }

        if (inSleepWindow) {
            const idleTime = powerMonitor.getSystemIdleTime(); // seconds
            // 5 minutes = 300 seconds
            if (idleTime >= 300) {
                 turnOffScreen();
            }
        }
    } catch (e) {
        console.error("Error in power policy check:", e);
    }
}
