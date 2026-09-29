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
    /** 2 = generated for signed messages (protocol v2). Absent = a v1 pairing,
     *  whose key was broadcast in plain text: init() renews it once. */
    remotePairingVersion?: number;
}


/** Why nothing was written. `file` is the full path, for the message the user reads. */
export interface StoreFailure {
    ok: false;
    /** locked: another program holds the file (EBUSY/EPERM/EACCES) · unreadable: any other read error · write-failed: disk, permissions */
    reason: 'locked' | 'unreadable' | 'write-failed';
    code?: string;
    file: string;
}

export type WriteResult = { ok: true } | StoreFailure;

/** What a read of config.json found. Only 'absent' means the defaults are the truth. */
export type ConfigRead =
    /** `raw` is the object on disk: update() merges onto it, so keys this build does not know survive. */
    | { kind: 'loaded'; config: UserConfig; raw: Record<string, unknown> }
    /** No file — or content that can never parse, which was first moved aside to config.json.corrupt-<time>. */
    | { kind: 'absent'; config: UserConfig }
    /** The read itself failed. Usually antivirus or a backup holding the file: transient, so nothing moves. */
    | { kind: 'unreadable'; failure: StoreFailure };

/** Errors that mean "another program has the file right now" — worth waiting for, never worth quarantining. */
const LOCKED_CODES = new Set(['EBUSY', 'EPERM', 'EACCES']);
/** Waits between rename attempts. This runs on the main thread and blocks every window: keep the sum small. */
const RENAME_RETRY_MS = [20, 40, 80];

let configPath = '';

/** A hand-edited config.json must not hand a number or an object to createHmac
 *  (it throws on every message): anything else reads as absent, and the remote
 *  bridge then generates a fresh pairing. */
function nonEmptyString(value: unknown): string | undefined {
    return typeof value === 'string' && value !== '' ? value : undefined;
}

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

function failure(reason: StoreFailure['reason'], code: string | undefined, file: string): StoreFailure {
    return code ? { ok: false, reason, code, file } : { ok: false, reason, file };
}

/** Readers call get() on every fetch, broadcast and power check: a persisting problem logs once, not once a read. */
let reportedProblem: string | null = null;

function unreadable(e: unknown, file: string): ConfigRead {
    const code = errorCode(e);
    if (reportedProblem !== code) {
        reportedProblem = code ?? 'no error code';
        // The code only: a JSON.parse message quotes the file, and the file holds the pairing key.
        console.error(`[store] config.json could not be read (${reportedProblem}); nothing will be written to it until it can.`);
    }
    return { kind: 'unreadable', failure: failure(code && LOCKED_CODES.has(code) ? 'locked' : 'unreadable', code, file) };
}

/** Content that will never parse is moved aside: refusing it would leave the app on defaults for good,
 *  and writing over it would lose the bytes. A rename that is refused means the file is in use. */
function quarantine(file: string, what: string): ConfigRead {
    const aside = `${file}.corrupt-${new Date().toISOString().replace(/[:.]/g, '-')}`;
    try {
        fs.renameSync(file, aside);
    } catch (e) {
        return unreadable(e, file);
    }
    reportedProblem = null;
    console.error(`[store] config.json ${what}: moved it to ${aside} and started again from the defaults (the phone must scan the QR code again).`);
    return { kind: 'absent', config: defaults() };
}

function readConfig(): ConfigRead {
    const file = getPath();
    let text: string;
    try {
        text = fs.readFileSync(file, 'utf-8');
    } catch (e) {
        // ENOENT, not existsSync: existsSync also answers false for a file it may not access.
        if (errorCode(e) !== 'ENOENT') return unreadable(e, file);
        reportedProblem = null;
        return { kind: 'absent', config: defaults() };
    }
    // PowerShell 5.1's Set-Content -Encoding UTF8 writes a BOM, so a hand repair produces one.
    if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
    let loaded;
    try {
        loaded = JSON.parse(text);
    } catch {
        return quarantine(file, text.trim() === '' ? 'is empty' : 'is not valid JSON');
    }
    if (typeof loaded !== 'object' || loaded === null || Array.isArray(loaded)) {
        return quarantine(file, 'is not a JSON object');
    }
    reportedProblem = null;
    // Merge with defaults to ensure safety. Every field is listed, so a new UserConfig field is a tsc error here.
    return {
        kind: 'loaded',
        raw: loaded,
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
            remoteRoomId: nonEmptyString(loaded.remoteRoomId),
            remoteKey: nonEmptyString(loaded.remoteKey),
            remotePairingVersion: typeof loaded.remotePairingVersion === 'number' ? loaded.remotePairingVersion : undefined,
        } satisfies Record<keyof UserConfig, unknown>,
    };
}

function sleepSync(ms: number): void {
    try {
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
    } catch {
        // No SharedArrayBuffer here: retry at once rather than turn a lock into a throw out of update().
    }
}

function writeFailed(e: unknown, file: string, temp: string): StoreFailure {
    try {
        fs.rmSync(temp, { force: true });
    } catch {
        // A leftover temp file is harmless: config.json is intact and the next write replaces it.
    }
    const code = errorCode(e);
    console.error(`[store] config.json could not be written (${code ?? 'no error code'}).`);
    return failure(code && LOCKED_CODES.has(code) ? 'locked' : 'write-failed', code, file);
}

/** Temp file + rename: a crash mid-write leaves the old file whole, where writeFileSync would
 *  have truncated it first. Antivirus often holds a file it just saw written, so the rename is
 *  retried briefly before the write is reported as locked. */
function writeAtomically(file: string, text: string): WriteResult {
    const temp = `${file}.tmp`;
    try {
        fs.writeFileSync(temp, text);
    } catch (e) {
        return writeFailed(e, file, temp);
    }
    for (let attempt = 0; ; attempt++) {
        try {
            fs.renameSync(temp, file);
            return { ok: true };
        } catch (e) {
            const code = errorCode(e);
            if (!code || !LOCKED_CODES.has(code) || attempt >= RENAME_RETRY_MS.length) return writeFailed(e, file, temp);
            sleepSync(RENAME_RETRY_MS[attempt]);
        }
    }
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

    /** The only writer. Re-reads the file first, writes nothing over one it cannot read,
     *  and merges the patch onto the file as it is on disk. */
    update(patch: Partial<UserConfig>): WriteResult {
        const current = readConfig();
        if (current.kind === 'unreadable') return current.failure;
        const onDisk = current.kind === 'loaded' ? current.raw : current.config;
        return writeAtomically(getPath(), JSON.stringify({ ...onDisk, ...patch }, null, 2));
    }
};
