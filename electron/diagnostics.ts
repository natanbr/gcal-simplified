// ============================================================
// The diagnostics folder (main process)
// ------------------------------------------------------------
// The production laptop is not the developer's. Once, every quick-game rule
// looked true there and 🐍 was still missing from the goal picker, and nothing
// recorded why. When the parent picks a folder (one a cloud service syncs to the
// developer's machine), this writes two files into <folder>/<this computer>/:
//   eligibility.ndjson  every input the picker gate used (diagnostics-trace.ts
//                       rebuilds each line from its allowlist);
//   audit-log.ndjson    a copy of every line the audit trail wrote.
//
// The folder leaves the machine, so it is chosen only in a native dialog here
// (the window never names a path; a network share is refused), and the file
// names are fixed. Nothing here may stop the main process: the folder is kept
// in memory after one read (a held settings file is tried again after 5 s, not
// at every line), and one serialized async queue does every write, so
// audit:append and diagnostics:trace only queue a line. A write that hangs holds
// the queue, never the window, and a full queue drops the batch. It never writes
// through a link. Failures stay here: EBUSY/EPERM/EACCES (OneDrive holding the
// file) are silent, the rest are logged once by their code.
// Only the UNC forms of a network path are refused: a mapped drive letter (Z:)
// cannot be told from a local disk, so a write there may hang, which holds the
// queue (serial-queue.ts), never the main thread.
// See CLAUDE.md → "The diagnostics folder has one writer".
// ============================================================

import { app, BrowserWindow, dialog, ipcMain, type IpcMainInvokeEvent, type OpenDialogOptions } from 'electron';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { auditLog, type AuditEntry } from './audit-log';
import { droppedLine, TraceBudget, traceLine, type TraceStamp } from './diagnostics-trace';
import { errorSummary, ipcSafe } from './log-safe';
import { serialQueue } from './serial-queue';
import { store, type StoreFailure } from './store';

const TRACE_FILE = 'eligibility.ndjson';
const AUDIT_MIRROR_FILE = 'audit-log.ndjson';
type FileName = typeof TRACE_FILE | typeof AUDIT_MIRROR_FILE;
/** Like the audit log: one previous generation, so at most ~8 MB per file name. */
const MAX_FILE_BYTES = 4 * 1024 * 1024;
/** Batches waiting behind the write in progress; beyond this a batch is dropped. */
const MAX_WAITING = 32;
const LOCKED_CODES = new Set(['EBUSY', 'EPERM', 'EACCES']);

export type DiagnosticsStatus = { enabled: false } | { enabled: true; folder: string; hostFolder: string };

/** What a trace got: queued (written later, or dropped there), or why not. */
export type TraceQueued = { ok: true } | { ok: false; reason: 'off' | 'invalid' | 'rate-limited' | 'queue-full' };

export type FolderChange =
    | { ok: true; status: DiagnosticsStatus }
    | { ok: false; reason: 'cancelled' | 'network-path' | 'not-a-directory' | StoreFailure['reason'] };

// ── The folder: read once, then kept here. Only chooseFolder and disable change it. ──
/** undefined: not read yet; null: off. */
let folderInUse: string | null | undefined;
/** A settings file another program holds is read again after this, not at every line: each read
 *  is synchronous, on the main thread. Clock-based, no timer: the next line after it reads. */
const HELD_CONFIG_RETRY_MS = 5000;
let heldConfigRetryAt = 0;

/** \\server\share, \\?\UNC\…, //server: a write there holds for the network's timeout. */
function isNetworkPath(folder: string): boolean {
    return /^[\\/]{2}/.test(folder);
}

function chosenFolder(): string | null {
    if (folderInUse === undefined) {
        const wait = heldConfigRetryAt - Date.now();
        if (wait > 0 && wait <= HELD_CONFIG_RETRY_MS) return null; // a clock set back does not stretch the wait
        const config = store.read();
        if (config.kind === 'unreadable') {
            heldConfigRetryAt = Date.now() + HELD_CONFIG_RETRY_MS; // held right now: off until then
            return null;
        }
        const saved = config.config.diagnosticsDir;
        folderInUse = saved && path.isAbsolute(saved) && !isNetworkPath(saved) ? saved : null;
    }
    return folderInUse;
}

/** This computer's folder name: letters, digits, _ and - only, so it can never climb out. A name the
 *  sanitizing changed gets a short hash of the real one, so two machines cannot share a folder. */
function hostFolderName(): string {
    const raw = os.hostname();
    const safe = raw.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 64) || 'unknown-host';
    return safe === raw ? safe : `${safe}-${createHash('sha256').update(raw).digest('hex').slice(0, 8)}`;
}

function status(): DiagnosticsStatus {
    const chosen = chosenFolder();
    return chosen ? { enabled: true, folder: chosen, hostFolder: path.join(chosen, hostFolderName()) } : { enabled: false };
}

// ── The write queue: one write at a time, all async, never awaited by a caller ──
interface Job { name: FileName; text: string }
type Written = { ok: true } | { ok: false; reason: 'missing' | 'link' | 'locked' | 'write-failed'; code?: string };

function errorCode(e: unknown): string | undefined {
    const code = typeof e === 'object' && e !== null ? Reflect.get(e, 'code') : undefined;
    return typeof code === 'string' ? code : undefined;
}

/** A link counts as a link whatever it points at: a junction reads as one too. */
async function lstatOrNull(target: string): Promise<fs.Stats | null> {
    try {
        return await fs.promises.lstat(target);
    } catch (e) {
        if (errorCode(e) === 'ENOENT') return null;
        throw e;
    }
}

/** The one write into the folder. The folder must exist (only the host folder is created), and
 *  neither the host folder, the file nor its rotated generation may be a link. */
async function write(folder: string, { name, text }: Job): Promise<Written> {
    const hostFolder = path.join(folder, hostFolderName());
    const file = path.join(hostFolder, name);
    try {
        if (!(await fs.promises.stat(folder)).isDirectory()) return { ok: false, reason: 'missing' };
        const host = await lstatOrNull(hostFolder);
        if (host?.isSymbolicLink()) return { ok: false, reason: 'link' };
        if (!host) await fs.promises.mkdir(hostFolder);
        const current = await lstatOrNull(file);
        if (current?.isSymbolicLink()) return { ok: false, reason: 'link' };
        if (current && current.size >= MAX_FILE_BYTES) {
            const previous = await lstatOrNull(`${file}.1`);
            if (previous?.isSymbolicLink()) return { ok: false, reason: 'link' };
            if (previous) await fs.promises.rm(`${file}.1`);
            await fs.promises.rename(file, `${file}.1`);
        }
        await fs.promises.appendFile(file, text, 'utf-8');
        return { ok: true };
    } catch (e) {
        const code = errorCode(e);
        if (code && LOCKED_CODES.has(code)) return { ok: false, reason: 'locked', code };
        if (code === 'ENOENT') return { ok: false, reason: 'missing', code };
        return code ? { ok: false, reason: 'write-failed', code } : { ok: false, reason: 'write-failed' };
    }
}

/** A persisting problem logs once, not once a write; a write that lands clears it. */
const reported = new Set<string>();

function report(written: Written): void {
    if (written.ok) {
        reported.clear();
        return;
    }
    if (written.reason !== 'link' && written.reason !== 'write-failed') return; // transient: held, or a drive not there
    const what = `${written.reason}${written.code ? ` ${written.code}` : ''}`;
    if (reported.has(what)) return;
    reported.add(what);
    console.error(`[diagnostics] A line was not written to the diagnostics folder (${what}).`);
}

const writes = serialQueue(MAX_WAITING, e => console.error(`[diagnostics] A write stopped (${errorSummary(e)}).`));

function enqueue(job: Job): boolean {
    return writes.add(async () => {
        const target = chosenFolder(); // turned off meanwhile: dropped
        if (target) report(await write(target, job));
    });
}

/** Resolves once the queued writes are done. Nothing in the app waits on it: the tests do. */
export function diagnosticsIdle(): Promise<void> {
    return writes.idle();
}

// ── What the window and the audit trail hand in ───────────────────────────────
const budget = new TraceBudget();

function trace(raw: unknown): TraceQueued {
    if (!chosenFolder()) return { ok: false, reason: 'off' };
    const stamp: TraceStamp = { t: new Date().toISOString(), host: hostFolderName(), appVersion: app.getVersion() };
    const line = traceLine(raw, stamp);
    if (!line) return { ok: false, reason: 'invalid' };
    const taken = budget.take(Date.now());
    if (!taken.ok) return { ok: false, reason: 'rate-limited' };
    const dropped = taken.dropped > 0 ? `${JSON.stringify(droppedLine(taken.dropped, stamp))}\n` : '';
    return enqueue({ name: TRACE_FILE, text: `${dropped}${JSON.stringify(line)}\n` }) ? { ok: true } : { ok: false, reason: 'queue-full' };
}

/** The audit trail's lines as AuditLog.append wrote them (already rebuilt by its sanitize). */
function mirrorAudit(entries: readonly AuditEntry[]): void {
    if (chosenFolder() && entries.length > 0) enqueue({ name: AUDIT_MIRROR_FILE, text: entries.map(entry => `${JSON.stringify(entry)}\n`).join('') });
}

// ── Choosing and clearing the folder ──────────────────────────────────────────
async function chooseFolder(parent: BrowserWindow | null): Promise<FolderChange> {
    const options: OpenDialogOptions = { title: 'Choose a folder for diagnostics', properties: ['openDirectory'] };
    const picked = parent ? await dialog.showOpenDialog(parent, options) : await dialog.showOpenDialog(options);
    if (picked.canceled || picked.filePaths.length !== 1) return { ok: false, reason: 'cancelled' };
    const folder = picked.filePaths[0];
    // Before any look at it: even a stat of a share that is away holds for the network's timeout.
    if (isNetworkPath(folder)) return { ok: false, reason: 'network-path' };
    const isFolder = path.isAbsolute(folder) && await fs.promises.stat(folder).then(s => s.isDirectory(), () => false);
    if (!isFolder) return { ok: false, reason: 'not-a-directory' };
    const saved = store.update({ diagnosticsDir: folder });
    if (!saved.ok) return { ok: false, reason: saved.reason };
    folderInUse = folder;
    return { ok: true, status: status() };
}

function disable(): FolderChange {
    // undefined is left out by JSON.stringify: the field is removed from the file.
    const saved = store.update({ diagnosticsDir: undefined });
    if (!saved.ok) return { ok: false, reason: saved.reason };
    folderInUse = null;
    return { ok: true, status: status() };
}

/** Called once from main.ts. Every handler ignores what the window sends but the trace payload. */
export function registerDiagnosticsIpc(): void {
    auditLog.onAppended(mirrorAudit);
    ipcMain.handle('diagnostics:trace', ipcSafe((_event: IpcMainInvokeEvent, payload: unknown) => trace(payload)));
    ipcMain.handle('diagnostics:status', ipcSafe(() => status()));
    ipcMain.handle('diagnostics:choose-folder', ipcSafe((event: IpcMainInvokeEvent) => chooseFolder(BrowserWindow.fromWebContents(event.sender))));
    ipcMain.handle('diagnostics:disable', ipcSafe(() => disable()));
}
