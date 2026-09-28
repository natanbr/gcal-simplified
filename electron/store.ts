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

    // Remote Control
    remoteRoomId?: string;
    remoteKey?: string;
}

/** What a read of config.json found. Only 'absent' means the defaults are the truth. */
export type ConfigRead =
    | { kind: 'loaded'; config: UserConfig }
    | { kind: 'absent'; config: UserConfig }
    /** Locked (EBUSY/EPERM — antivirus, a backup), half-written, or not a JSON object.
     *  `reason` is an errno code or a fixed phrase, never the file's content. */
    | { kind: 'unreadable'; reason: string };

let configPath = '';

function getPath() {
    if (!configPath) {
        configPath = path.join(app.getPath('userData'), 'config.json');
    }
    return configPath;
}

function defaults(): UserConfig {
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

function errorCode(e: unknown): string | undefined {
    return typeof e === 'object' && e !== null && 'code' in e && typeof e.code === 'string' ? e.code : undefined;
}

function unreadable(reason: string): ConfigRead {
    // The reason only: a JSON.parse message quotes the file, and the file holds the pairing key.
    console.error(`[store] config.json could not be read (${reason}); nothing will be written to it.`);
    return { kind: 'unreadable', reason };
}

function readConfig(): ConfigRead {
    let raw: string;
    try {
        raw = fs.readFileSync(getPath(), 'utf-8');
    } catch (e) {
        // ENOENT, not existsSync: existsSync also answers false for a file it may not access.
        const code = errorCode(e);
        return code === 'ENOENT' ? { kind: 'absent', config: defaults() } : unreadable(code ?? 'read failed');
    }
    let loaded;
    try {
        loaded = JSON.parse(raw);
    } catch {
        return unreadable('not valid JSON');
    }
    if (typeof loaded !== 'object' || loaded === null || Array.isArray(loaded)) {
        return unreadable('not a JSON object');
    }
    // Merge with defaults to ensure safety
    return {
        kind: 'loaded',
        config: {
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
            weekStartDay: loaded.weekStartDay || 'today',
            remoteRoomId: loaded.remoteRoomId,
            remoteKey: loaded.remoteKey
        },
    };
}

export const store = {
    /** For readers only. An unreadable file reads as the defaults, so never write
     *  back what this returns — that is how a locked file became the defaults. */
    get(): UserConfig {
        const result = readConfig();
        return result.kind === 'unreadable' ? defaults() : result.config;
    },

    /** A fresh read that says whether the file was loaded, absent or unreadable. */
    read: readConfig,

    /** The only writer. Re-reads the file first and writes nothing over one it
     *  cannot read. False when nothing was written. */
    update(patch: Partial<UserConfig>): boolean {
        const current = readConfig();
        if (current.kind === 'unreadable') return false;
        try {
            fs.writeFileSync(getPath(), JSON.stringify({ ...current.config, ...patch }, null, 2));
            return true;
        } catch (e) {
            console.error(`[store] config.json could not be written (${errorCode(e) ?? 'write failed'}).`);
            return false;
        }
    }
};
