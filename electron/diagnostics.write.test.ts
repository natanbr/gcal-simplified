// ============================================================
// The diagnostics folder (electron/diagnostics.ts): how it writes.
//
// What this protects:
//   - No write blocks the main process: audit:append and diagnostics:trace only
//     queue a line, one serialized async queue writes it, a slow write holds the
//     queue (never the window), and a full queue drops the batch.
//   - Failures stay inside: EBUSY/EPERM/EACCES are silent, anything else is
//     logged once by its code, a folder that has gone is not re-created.
//   - It writes only <folder>/<host>/ and never through a link (a junction or a
//     symlink at the host folder, a file or its rotated generation).
//   - 4 MB per file, one older generation; ~30 trace lines a minute.
//   - The host folder name cannot climb out, and two machines cannot share one.
// ============================================================

import { describe, it, expect, vi, beforeEach, afterEach, afterAll } from 'vitest';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { filesUnder, invokeHandler, makeError, ndjson, TRACE, type Handler } from './diagnosticsTestKit';

const h = vi.hoisted(() => ({ userData: '', handlers: new Map<string, (...args: unknown[]) => Promise<unknown>>(), showOpenDialog: vi.fn() }));

vi.mock('electron', () => ({
    app: { getPath: () => h.userData, getVersion: () => '9.9.9' },
    dialog: { showOpenDialog: h.showOpenDialog },
    ipcMain: { handle: (channel: string, handler: Handler) => h.handlers.set(channel, handler) },
    BrowserWindow: { fromWebContents: () => null },
}));

h.userData = fs.mkdtempSync(path.join(os.tmpdir(), 'diagnostics-write-userdata-'));
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'diagnostics-write-folders-'));
afterAll(() => {
    fs.rmSync(h.userData, { recursive: true, force: true });
    fs.rmSync(scratch, { recursive: true, force: true });
});

const HOST = 'TEST-HOST';
const ENTRY = { t: '2026-09-02T12:00:00.000Z', ev: 'A', src: 'local', msg: 'one' };
let folder = '';
let n = 0;
let idle: () => Promise<void>;
let auditLog: typeof import('./audit-log').auditLog;

const invoke = (channel: string, ...args: unknown[]) => invokeHandler(h.handlers, channel, ...args);
const hostFolder = () => path.join(folder, HOST);
const traceFile = () => path.join(hostFolder(), 'eligibility.ndjson');
const mirrorFile = () => path.join(hostFolder(), 'audit-log.ndjson');
const under = (dir: string) => (p: unknown) => typeof p === 'string' && path.resolve(p).startsWith(path.resolve(dir));
async function chooseFolder(): Promise<void> {
    h.showOpenDialog.mockResolvedValueOnce({ canceled: false, filePaths: [folder] });
    await invoke('diagnostics:choose-folder');
}

const realAppend = fs.promises.appendFile;
/** Every appendFile under `dir` fails with `code`; elsewhere it writes. */
function failAppendsUnder(dir: string, code: string) {
    vi.spyOn(fs.promises, 'appendFile').mockImplementation((file, data, options) =>
        under(dir)(file) ? Promise.reject(makeError(code)) : realAppend(file, data, options));
}

beforeEach(async () => {
    for (const name of fs.readdirSync(h.userData)) fs.rmSync(path.join(h.userData, name), { recursive: true, force: true });
    folder = path.join(scratch, `sync-${n++}`);
    fs.mkdirSync(folder);
    h.showOpenDialog.mockReset();
    h.handlers.clear();
    vi.spyOn(os, 'hostname').mockReturnValue(HOST);
    for (const level of ['log', 'warn', 'error'] as const) vi.spyOn(console, level).mockImplementation(() => undefined);
    vi.resetModules();
    const diagnostics = await import('./diagnostics');
    diagnostics.registerDiagnosticsIpc();
    idle = diagnostics.diagnosticsIdle;
    ({ auditLog } = await import('./audit-log'));
});

afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
});

describe('diagnostics — nothing blocks the main process', () => {
    it('touches the folder only through fs.promises: no synchronous call on the write path', async () => {
        await chooseFolder();
        const spies = {
            appendFileSync: vi.spyOn(fs, 'appendFileSync'), statSync: vi.spyOn(fs, 'statSync'), lstatSync: vi.spyOn(fs, 'lstatSync'),
            existsSync: vi.spyOn(fs, 'existsSync'), mkdirSync: vi.spyOn(fs, 'mkdirSync'), renameSync: vi.spyOn(fs, 'renameSync'),
            rmSync: vi.spyOn(fs, 'rmSync'), writeFileSync: vi.spyOn(fs, 'writeFileSync'),
        };

        await invoke('diagnostics:trace', TRACE);
        auditLog.append([ENTRY]);
        await idle();

        const touched = [
            ...spies.appendFileSync.mock.calls, ...spies.statSync.mock.calls, ...spies.lstatSync.mock.calls, ...spies.existsSync.mock.calls,
            ...spies.mkdirSync.mock.calls, ...spies.renameSync.mock.calls, ...spies.rmSync.mock.calls, ...spies.writeFileSync.mock.calls,
        ].map(([p]) => p);
        expect(touched.filter(under(folder))).toEqual([]);
        expect(filesUnder(folder)).toEqual([`${HOST}/audit-log.ndjson`, `${HOST}/eligibility.ndjson`]);
    });

    it('a write that hangs holds neither audit:append nor the trace, and a full queue drops the batch', async () => {
        await chooseFolder();
        let release: () => void = () => undefined;
        const hung = new Promise<void>(resolve => { release = resolve; });
        vi.spyOn(fs.promises, 'appendFile').mockImplementationOnce(() => hung).mockImplementation(realAppend);

        expect(await invoke('diagnostics:trace', TRACE)).toEqual({ ok: true }); // the write that hangs
        const appended = Array.from({ length: 40 }, (_, i) => auditLog.append([{ ...ENTRY, msg: `m${i}` }]));

        expect(appended.every(count => count === 1)).toBe(true);
        expect(auditLog.read(100)).toHaveLength(40);

        release();
        await idle();
        expect(ndjson(mirrorFile())).toHaveLength(32); // 32 waited behind the hung write; 8 were dropped
    });
});

describe('diagnostics — failures stay inside', () => {
    it.each(['EBUSY', 'EPERM', 'EACCES'])('drops a line refused with %s (OneDrive holding the file), silently, and writes the next', async code => {
        await chooseFolder();
        failAppendsUnder(folder, code);

        expect(await invoke('diagnostics:trace', TRACE)).toEqual({ ok: true });
        await idle();
        vi.mocked(fs.promises.appendFile).mockImplementation(realAppend);
        await invoke('diagnostics:trace', { ...TRACE, caseId: 2 });
        await idle();

        expect(console.error).not.toHaveBeenCalled();
        expect(ndjson(traceFile()).map(line => line.caseId)).toEqual([2]);
    });

    it('logs any other failure once, by its code only', async () => {
        await chooseFolder();
        failAppendsUnder(folder, 'ENOSPC');

        await invoke('diagnostics:trace', TRACE);
        await invoke('diagnostics:trace', TRACE);
        await idle();

        expect(console.error).toHaveBeenCalledTimes(1);
        expect(String(vi.mocked(console.error).mock.calls[0])).toContain('ENOSPC');
        expect(String(vi.mocked(console.error).mock.calls[0])).not.toContain(folder);
    });

    it('does not re-create a chosen folder that has gone (a drive no longer there)', async () => {
        await chooseFolder();
        fs.rmSync(folder, { recursive: true });

        await invoke('diagnostics:trace', TRACE);
        auditLog.append([ENTRY]);
        await idle();

        expect(fs.existsSync(folder)).toBe(false);
        expect(auditLog.read()).toHaveLength(1);
    });

    it('a mirror failure never breaks the audit append', async () => {
        await chooseFolder();
        failAppendsUnder(folder, 'ENOSPC');

        expect(auditLog.append([{ ...ENTRY, msg: 'kept' }])).toBe(1);
        await idle();

        expect(auditLog.read()).toEqual([expect.objectContaining({ msg: 'kept' })]);
    });
});

describe('diagnostics — never through a link', () => {
    it('refuses a host folder that is a junction to somewhere else', async ({ skip }) => {
        await chooseFolder();
        const elsewhere = path.join(scratch, `elsewhere-${n}`);
        fs.mkdirSync(elsewhere);
        try {
            fs.symlinkSync(elsewhere, hostFolder(), 'junction');
        } catch {
            skip(); // this machine cannot make one
        }

        await invoke('diagnostics:trace', TRACE);
        auditLog.append([ENTRY]);
        await idle();

        expect(filesUnder(elsewhere)).toEqual([]);
        expect(console.error).toHaveBeenCalledTimes(1);
    });

    function linkAt(target: string) {
        const realLstat = fs.promises.lstat;
        vi.spyOn(fs.promises, 'lstat').mockImplementation(async (p, options) => {
            const stats = await realLstat(p, options);
            if (path.resolve(String(p)) === path.resolve(target)) Object.assign(stats, { isSymbolicLink: () => true });
            return stats;
        });
    }

    it('refuses a file that is a link', async () => {
        await chooseFolder();
        fs.mkdirSync(hostFolder());
        fs.writeFileSync(traceFile(), '');
        linkAt(traceFile());
        const append = vi.spyOn(fs.promises, 'appendFile');

        await invoke('diagnostics:trace', TRACE);
        await idle();

        expect(append.mock.calls.filter(([p]) => under(folder)(p))).toEqual([]);
        expect(fs.readFileSync(traceFile(), 'utf-8')).toBe('');
    });

    it('never removes or renames over a rotated generation that is a link', async () => {
        await chooseFolder();
        fs.mkdirSync(hostFolder());
        fs.writeFileSync(traceFile(), Buffer.alloc(4 * 1024 * 1024, 'a'));
        fs.writeFileSync(`${traceFile()}.1`, 'target of the link');
        linkAt(`${traceFile()}.1`);
        const rm = vi.spyOn(fs.promises, 'rm');
        const rename = vi.spyOn(fs.promises, 'rename');

        await invoke('diagnostics:trace', TRACE);
        await idle();

        expect(rm).not.toHaveBeenCalled();
        expect(rename).not.toHaveBeenCalled();
        expect(fs.readFileSync(`${traceFile()}.1`, 'utf-8')).toBe('target of the link');
        expect(fs.statSync(traceFile()).size).toBe(4 * 1024 * 1024);
    });
});

describe('diagnostics — size and rate', () => {
    it('rotates a file at 4 MB, keeping one previous generation', async () => {
        await chooseFolder();
        fs.mkdirSync(hostFolder());
        fs.writeFileSync(traceFile(), Buffer.alloc(4 * 1024 * 1024, 'a'));
        fs.writeFileSync(`${traceFile()}.1`, 'oldest generation');

        await invoke('diagnostics:trace', TRACE);
        await idle();

        expect(fs.statSync(`${traceFile()}.1`).size).toBe(4 * 1024 * 1024);
        expect(ndjson(traceFile())).toHaveLength(1);
    });

    it('does not rotate below the cap', async () => {
        await chooseFolder();
        await invoke('diagnostics:trace', TRACE);
        await invoke('diagnostics:trace', TRACE);
        await idle();

        expect(ndjson(traceFile())).toHaveLength(2);
        expect(fs.existsSync(`${traceFile()}.1`)).toBe(false);
    });

    it('takes about 30 trace lines a minute, and says how many it dropped when it takes the next', async () => {
        vi.useFakeTimers({ toFake: ['Date'] });
        vi.setSystemTime(new Date('2026-09-02T12:00:00.000Z'));
        await chooseFolder();

        const answers = [];
        for (let i = 0; i < 35; i++) answers.push(await invoke('diagnostics:trace', { ...TRACE, caseId: i }));
        expect(answers.filter(a => JSON.stringify(a) === '{"ok":true}')).toHaveLength(30);
        expect(answers.slice(30)).toEqual(Array(5).fill({ ok: false, reason: 'rate-limited' }));

        vi.setSystemTime(new Date('2026-09-02T12:01:00.000Z'));
        expect(await invoke('diagnostics:trace', { ...TRACE, caseId: 99 })).toEqual({ ok: true });
        await idle();

        const written = ndjson(traceFile());
        expect(written).toHaveLength(32);
        expect(written[30]).toMatchObject({ event: 'dropped', count: 5, host: HOST, appVersion: '9.9.9' });
        expect(written[31]).toMatchObject({ caseId: 99 });
    });

    it('does not rate-limit the audit mirror', async () => {
        await chooseFolder();
        for (let i = 0; i < 31; i++) auditLog.append([{ ...ENTRY, msg: `m${i}` }]);
        await idle();

        expect(ndjson(mirrorFile())).toHaveLength(31);
    });
});

describe('diagnostics — the host folder name', () => {
    const hash = (raw: string) => createHash('sha256').update(raw).digest('hex').slice(0, 8);

    it('keeps a plain name as it is', async () => {
        await chooseFolder();
        expect(await invoke('diagnostics:status')).toMatchObject({ hostFolder: path.join(folder, HOST) });
    });

    it('cannot climb out, and adds a short hash of the real name when it had to change it', async () => {
        const raw = '..\\evil/../name with spaces';
        vi.mocked(os.hostname).mockReturnValue(raw);
        await chooseFolder();

        await invoke('diagnostics:trace', { ...TRACE, file: '../../escape.ndjson' });
        auditLog.append([ENTRY]);
        await idle();

        const name = `___evil____name_with_spaces-${hash(raw)}`;
        expect(filesUnder(folder)).toEqual([`${name}/audit-log.ndjson`, `${name}/eligibility.ndjson`]);
        expect(filesUnder(scratch).filter(file => file.includes('escape'))).toEqual([]);
    });

    it('gives two machines whose names sanitize alike two folders', async () => {
        await chooseFolder();
        vi.mocked(os.hostname).mockReturnValue('kids.pc');
        const first = await invoke('diagnostics:status');
        vi.mocked(os.hostname).mockReturnValue('kids pc');
        const second = await invoke('diagnostics:status');

        expect(first).not.toEqual(second);
    });
});
