// ============================================================
// Power Policy — night-time screen blanking
// ------------------------------------------------------------
// Extracted from main.ts so the bootstrap file stays under the 300-line limit.
// Turns the monitor off once the machine has been idle for 5 minutes inside the
// configured sleep window.
// ============================================================

import { powerMonitor } from 'electron';
import { execFile } from 'node:child_process';
import { apiService } from './api';

const IDLE_SECONDS_BEFORE_BLANK = 300;
const CHECK_INTERVAL_MS = 60 * 1000;

function turnOffScreen(): void {
    console.log('Turning off screen due to sleep schedule inactivity...');

    if (process.platform === 'win32') {
        // SendMessage(HWND_BROADCAST, WM_SYSCOMMAND, SC_MONITORPOWER, 2)
        const psCommand = '(Add-Type -MemberDefinition "[DllImport(\'user32.dll\')] public static extern int SendMessage(int hWnd, int hMsg, int wParam, int lParam);" -Name "Win32SendMessage" -Namespace Win32Functions -PassThru)::SendMessage(0xffff, 0x0112, 0xF170, 2)';
        execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', psCommand], (error) => {
            if (error) console.error('Failed to turn off screen:', error);
        });
    } else if (process.platform === 'darwin') {
        execFile('pmset', ['displaysleepnow'], (error) => {
            if (error) console.error('Failed to turn off screen:', error);
        });
    } else if (process.platform === 'linux') {
        execFile('xset', ['dpms', 'force', 'off'], (error) => {
            if (error) console.error('Failed to turn off screen:', error);
        });
    }
}

function checkPowerPolicy(): void {
    try {
        const config = apiService.getSettings();
        if (config.sleepEnabled === false) return; // Explicit false check, default true

        const currentHour = new Date().getHours();
        const start = config.sleepStart ?? 22;
        const end = config.sleepEnd ?? 6;

        let inSleepWindow = false;
        if (start === end) {
            inSleepWindow = false; // Disabled when start == end
        } else if (start > end) {
            inSleepWindow = currentHour >= start || currentHour < end; // e.g. 22 → 6
        } else {
            inSleepWindow = currentHour >= start && currentHour < end; // e.g. 1 → 5
        }

        if (inSleepWindow && powerMonitor.getSystemIdleTime() >= IDLE_SECONDS_BEFORE_BLANK) {
            turnOffScreen();
        }
    } catch (e) {
        console.error('Error in power policy check:', e);
    }
}

export function startPowerPolicy(): NodeJS.Timeout {
    return setInterval(checkPowerPolicy, CHECK_INTERVAL_MS);
}
