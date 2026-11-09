// ============================================================
// The diagnostics folder (main process)
// ------------------------------------------------------------
// The production laptop is not the developer's. Once, every quick-game rule
// looked true there and 🐍 was still missing from the goal picker, and nothing
// recorded why. When the parent picks a folder (one a cloud service syncs to the
// developer's machine), this writes two files into <folder>/<this computer>/:
//   eligibility.ndjson  every input the picker gate used, each time it was used
//                       (a "+" tap, a session start, a mission end);
//   audit-log.ndjson    a copy of every line the audit trail wrote.
//
// The folder leaves the machine, so: it is chosen only in a native dialog here
// (the window never names a path), every trace line is rebuilt field by field
// from the allowlist below (never a spread of what the window sent), and the
// file names are fixed. Failures are results, never throws; OneDrive holding a
// file (EBUSY/EPERM/EACCES) is transient and silent; nothing here can break the
// audit trail it mirrors. See CLAUDE.md → "The diagnostics folder has one writer".
// ============================================================

import { app, BrowserWindow, dialog, ipcMain, type IpcMainInvokeEvent, type OpenDialogOptions } from 'electron';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { auditLog, type AuditEntry } from './audit-log';
import { errorSummary, ipcSafe } from './log-safe';
import { store, type StoreFailure } from './store';

const TRACE_FILE = 'eligibility.ndjson';
const AUDIT_MIRROR_FILE = 'audit-log.ndjson';
/** Like the audit log: one previous generation, so at most ~8 MB per file name. */
const MAX_FILE_BYTES = 4 * 1024 * 1024;
const MAX_STRING_LEN = 80;
const LOCKED_CODES = new Set(['EBUSY', 'EPERM', 'EACCES']);

export type DiagnosticsStatus = { enabled: false } | { enabled: true; folder: string; hostFolder: string };

export type DiagnosticsWrite =
    | { ok: true }
    /** off: no folder chosen · invalid: not a trace line · missing: the folder is gone
     *  (a cloud drive unmounted; it is never re-created) · locked: another program holds the file */
    | { ok: false; reason: 'off' | 'invalid' | 'missing' | 'locked' | 'write-failed'; code?: string };

export type FolderChange =
    | { ok: true; status: DiagnosticsStatus }
    | { ok: false; reason: 'cancelled' | 'not-a-directory' | StoreFailure['reason'] };

// ── The trace line: a fixed allowlist, each field rebuilt by type ─────────────
const TRACE_EVENTS = new Set(['plus-tap', 'session-start', 'mission-end']);
const STRING_FIELDS = ['nowIso', 'today', 'activeMission', 'endedMission', 'eveningStartsAt'] as const;
const NUMBER_FIELDS = ['caseId', 'tzOffsetMins', 'nowMins', 'gameTokens', 'moodWind'] as const;
const BOOLEAN_FIELDS = ['pickerOpened', 'rewardEnabled', 'economyLocked', 'windowOpen', 'pickerVisible', 'useEnabled'] as const;
/** Null is an answer here: the gate read an unreadable time or no concluded morning. */
const NULLABLE_FIELDS = { eveningStartMins: 'number', lastCompletedOrFailedMorningDate: 'string' } as const;

type TraceValue = string | number | boolean | null;

function clampString(value: unknown): string | undefined {
    return typeof value === 'string' ? value.slice(0, MAX_STRING_LEN) : undefined;
}

function finiteNumber(value: unknown): number | undefined {
    return typeof value === 'number' && Number.isFinite(value) ? Math.round(value * 100) / 100 : undefined;
}

function rebuild(kind: 'string' | 'number' | 'boolean', value: unknown): TraceValue | undefined {
    if (kind === 'string') return clampString(value);
    if (kind === 'number') return finiteNumber(value);
    return typeof value === 'boolean' ? value : undefined;
}

/** An own property only: a key on the prototype is not something the window sent. */
function own(source: object, key: string): unknown {
    return Object.hasOwn(source, key) ? Reflect.get(source, key) : undefined;
}

/** Rebuilds an untrusted window payload into a known-shape line, or null when it is not one. */
function traceLine(raw: unknown): Record<string, TraceValue> | null {
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
    const event = own(raw, 'event');
    if (typeof event !== 'string' || !TRACE_EVENTS.has(event)) return null;

    // Written here, never taken from the window.
    const line: Record<string, TraceValue> = { t: new Date().toISOString(), event, host: hostFolderName(), appVersion: app.getVersion() };
    const set = (key: string, value: TraceValue | undefined) => { if (value !== undefined) line[key] = value; };
    for (const key of STRING_FIELDS) set(key, rebuild('string', own(raw, key)));
    for (const key of NUMBER_FIELDS) set(key, rebuild('number', own(raw, key)));
    for (const key of BOOLEAN_FIELDS) set(key, rebuild('boolean', own(raw, key)));
    for (const [key, kind] of Object.entries(NULLABLE_FIELDS)) {
        const value = own(raw, key);
        set(key, value === null ? null : rebuild(kind, value));
    }
    return line;
}

// ── Where the files go ────────────────────────────────────────────────────────
/** This computer's folder name: letters, digits, _ and - only, so it can never climb out of the folder. */
function hostFolderName(): string {
    return os.hostname().replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 64) || 'unknown-host';
}

function isDirectory(folder: string): boolean {
    try {
        return path.isAbsolute(folder) && fs.statSync(folder).isDirectory();
    } catch {
        return false;
    }
}

/** Read fresh at each use, never at import. A file another program holds reads as off for that write. */
function chosenFolder(): string | undefined {
    const config = store.read();
    if (config.kind === 'unreadable') return undefined;
    const folder = config.config.diagnosticsDir;
    return folder && path.isAbsolute(folder) ? folder : undefined;
}

function status(): DiagnosticsStatus {
    const folder = chosenFolder();
    return folder ? { enabled: true, folder, hostFolder: path.join(folder, hostFolderName()) } : { enabled: false };
}

function errorCode(e: unknown): string | undefined {
    const code = typeof e === 'object' && e !== null ? Reflect.get(e, 'code') : undefined;
    return typeof code === 'string' ? code : undefined;
}

/** A persisting failure logs once, not once a write. */
const reported = new Set<string>();

function failed(e: unknown): DiagnosticsWrite {
    const code = errorCode(e);
    if (code && LOCKED_CODES.has(code)) return { ok: false, reason: 'locked', code };
    if (code === 'ENOENT') return { ok: false, reason: 'missing', code };
    const summary = errorSummary(e);
    if (!reported.has(summary)) {
        reported.add(summary);
        console.error(`[diagnostics] Could not write to the diagnostics folder (${summary}).`);
    }
    return code ? { ok: false, reason: 'write-failed', code } : { ok: false, reason: 'write-failed' };
}

function rotateIfNeeded(file: string): void {
    try {
        if (!fs.existsSync(file) || fs.statSync(file).size < MAX_FILE_BYTES) return;
        fs.rmSync(`${file}.1`, { force: true });
        fs.renameSync(file, `${file}.1`);
    } catch {
        // A held file rotates on a later write; this one is appended as it is, like the audit log.
    }
}

/** The only write into the folder. The folder itself must exist: only the host folder is created. */
function append(folder: string, name: typeof TRACE_FILE | typeof AUDIT_MIRROR_FILE, text: string): DiagnosticsWrite {
    const hostFolder = path.join(folder, hostFolderName());
    const file = path.join(hostFolder, name);
    try {
        if (!fs.statSync(folder).isDirectory()) return { ok: false, reason: 'missing' };
        if (!fs.existsSync(hostFolder)) fs.mkdirSync(hostFolder);
        rotateIfNeeded(file);
        fs.appendFileSync(file, text, 'utf-8');
    } catch (e) {
        return failed(e);
    }
    reported.clear();
    return { ok: true };
}

function trace(raw: unknown): DiagnosticsWrite {
    const folder = chosenFolder();
    if (!folder) return { ok: false, reason: 'off' };
    const line = traceLine(raw);
    return line ? append(folder, TRACE_FILE, `${JSON.stringify(line)}\n`) : { ok: false, reason: 'invalid' };
}

/** The audit trail's lines as AuditLog.append wrote them (already rebuilt by its sanitize). */
function mirrorAudit(entries: readonly AuditEntry[]): void {
    const folder = chosenFolder();
    if (folder && entries.length > 0) append(folder, AUDIT_MIRROR_FILE, entries.map(entry => `${JSON.stringify(entry)}\n`).join(''));
}

// ── Choosing and clearing the folder ──────────────────────────────────────────
async function chooseFolder(parent: BrowserWindow | null): Promise<FolderChange> {
    const options: OpenDialogOptions = { title: 'Choose a folder for diagnostics', properties: ['openDirectory'] };
    const picked = parent ? await dialog.showOpenDialog(parent, options) : await dialog.showOpenDialog(options);
    if (picked.canceled || picked.filePaths.length !== 1) return { ok: false, reason: 'cancelled' };
    const folder = picked.filePaths[0];
    if (!isDirectory(folder)) return { ok: false, reason: 'not-a-directory' };
    const saved = store.update({ diagnosticsDir: folder });
    return saved.ok ? { ok: true, status: status() } : { ok: false, reason: saved.reason };
}

function disable(): FolderChange {
    // undefined is left out by JSON.stringify: the field is removed from the file.
    const saved = store.update({ diagnosticsDir: undefined });
    return saved.ok ? { ok: true, status: status() } : { ok: false, reason: saved.reason };
}

/** Called once from main.ts. Every handler ignores what the window sends but the trace payload. */
export function registerDiagnosticsIpc(): void {
    auditLog.onAppended(mirrorAudit);
    ipcMain.handle('diagnostics:trace', ipcSafe((_event: IpcMainInvokeEvent, payload: unknown) => trace(payload)));
    ipcMain.handle('diagnostics:status', ipcSafe(() => status()));
    ipcMain.handle('diagnostics:choose-folder', ipcSafe((event: IpcMainInvokeEvent) => chooseFolder(BrowserWindow.fromWebContents(event.sender))));
    ipcMain.handle('diagnostics:disable', ipcSafe(() => disable()));
}
