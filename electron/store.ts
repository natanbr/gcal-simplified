import { app } from 'electron';
import path from 'node:path';
import fs from 'node:fs';

export interface UserConfig {
    calendarIds: string[];
    taskListIds: string[];
    activeHoursStart?: number; // 0-23
    activeHoursEnd?: number;   // 0-23

    // Theme & Power Settings
    themeMode?: 'auto' | 'manual';
    manualDayStart?: number; // 0-23
    manualDayEnd?: number;   // 0-23
    sleepEnabled?: boolean;
    sleepStart?: number;     // 0-23
    sleepEnd?: number;       // 0-23

    weekStartDay?: 'sunday' | 'monday' | 'today';
}

let configPath = '';

function getPath() {
    if (!configPath) {
        configPath = path.join(app.getPath('userData'), 'config.json');
    }
    return configPath;
}

export const store = {
    get(): UserConfig {
        try {
            const p = getPath();
            if (!fs.existsSync(p)) {
                // Default to primary calendar if no config exists
                return {
                    calendarIds: ['primary'],
                    taskListIds: [],
                    themeMode: 'auto',
                    manualDayStart: 7,
                    manualDayEnd: 19,
                    sleepEnabled: true,
                    sleepStart: 22,
                    sleepEnd: 6,
                    weekStartDay: 'today'
                };
            }
            const loaded = JSON.parse(fs.readFileSync(p, 'utf-8'));
            // Merge with defaults to ensure safety
            return {
                calendarIds: Array.isArray(loaded.calendarIds) ? loaded.calendarIds : ['primary'],
                taskListIds: Array.isArray(loaded.taskListIds) ? loaded.taskListIds : [],
                activeHoursStart: loaded.activeHoursStart,
                activeHoursEnd: loaded.activeHoursEnd,
                themeMode: loaded.themeMode || 'auto',
                manualDayStart: loaded.manualDayStart ?? 7,
                manualDayEnd: loaded.manualDayEnd ?? 19,
                sleepEnabled: loaded.sleepEnabled ?? true,
                sleepStart: loaded.sleepStart ?? 22,
                sleepEnd: loaded.sleepEnd ?? 6,
                weekStartDay: loaded.weekStartDay || 'today'
            };
        } catch (e) {
            console.error("Failed to read config", e);
            return {
                calendarIds: ['primary'],
                taskListIds: [],
                themeMode: 'auto',
                manualDayStart: 7,
                manualDayEnd: 19,
                sleepEnabled: true,
                sleepStart: 22,
                sleepEnd: 6,
                weekStartDay: 'today'
            };
        }
    },
    set(config: UserConfig) {
        try {
            const p = getPath();
            fs.writeFileSync(p, JSON.stringify(config, null, 2));
        } catch (e) {
            console.error("Failed to write config", e);
        }
    }
};
