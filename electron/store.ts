import { app } from 'electron';
import path from 'node:path';
import fs from 'node:fs';

export interface UserConfig {
    calendarIds: string[];
    taskListIds: string[];
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
                return { calendarIds: ['primary'], taskListIds: [] };
            }
            const loaded = JSON.parse(fs.readFileSync(p, 'utf-8'));
            // Merge with defaults to ensure safety
            return {
                calendarIds: Array.isArray(loaded.calendarIds) ? loaded.calendarIds : ['primary'],
                taskListIds: Array.isArray(loaded.taskListIds) ? loaded.taskListIds : []
            };
        } catch (e) {
            console.error("Failed to read config", e);
            return { calendarIds: ['primary'], taskListIds: [] };
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
