// ============================================================
// The diagnostics folder writer (electron/diagnostics.ts).
//
// What this protects:
//   - It is off until the parent picks a folder in a native dialog in main; the
//     renderer never supplies a path, and nothing is written anywhere while off.
//   - It writes only <folder>/<host>/eligibility.ndjson and audit-log.ndjson, the
//     folder being a synced cloud folder: every trace line is rebuilt field by
//     field from an allowlist, so a planted pairing key or an unbounded string
//     never reaches it.
//   - OneDrive holding the file (EBUSY/EPERM/EACCES) is transient: a result, never
//     a throw, never a log line. A write failure never touches the audit log.
//   - The audit mirror holds exactly what AuditLog.append wrote.
// Real store and real audit log on temp folders; only electron is stubbed.
// ============================================================

import { describe, it, expect, vi, beforeEach, afterEach, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

type Handler = (...args: unknown[]) => Promise<unknown>;
const h = vi.hoisted(() => ({
    userData: '',
    handlers: new Map<string, Handler>(),
    showOpenDialog: vi.fn(),
}));

vi.mock('electron', () => ({
    app: { getPath: () => h.userData, getVersion: () => '9.9.9' },
    dialog: { showOpenDialog: h.showOpenDialog },
    ipcMain: { handle: (channel: string, handler: Handler) => h.handlers.set(channel, handler) },
    BrowserWindow: { fromWebContents: () => null },
}));

h.userData = fs.mkdtempSync(path.join(os.tmpdir(), 'diagnostics-userdata-'));
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'diagnostics-folders-'));
afterAll(() => {
    fs.rmSync(h.userData, { recursive: true, force: true });
    fs.rmSync(scratch, { recursive: true, force: true });
});

const { registerDiagnosticsIpc } = await import('./diagnostics');
const { auditLog } = await import('./audit-log');
const { store } = await import('./store');
registerDiagnosticsIpc();

const HOST = 'TEST-HOST';
const invoke = (channel: string, ...args: unknown[]): Promise<unknown> => {
    const handler = h.handlers.get(channel);
    if (!handler) throw new Error(`no handler for ${channel}`);
    return handler({ sender: {} }, ...args);
};

let folder = '';
let n = 0;
const realAppend = fs.appendFileSync;

/** Every file under `dir`, as POSIX paths relative to it, sorted. */
function filesUnder(dir: string, prefix = ''): string[] {
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => entry.isDirectory()
        ? filesUnder(path.join(dir, entry.name), `${prefix}${entry.name}/`)
        : [`${prefix}${entry.name}`]).sort();
}

const traceFile = () => path.join(folder, HOST, 'eligibility.ndjson');
const lines = (file: string): Record<string, unknown>[] => fs.readFileSync(file, 'utf-8').split('\n').filter(Boolean).map(line => JSON.parse(line));
const pick = (dir: string) => h.showOpenDialog.mockResolvedValueOnce({ canceled: false, filePaths: [dir] });
async function chooseFolder(dir = folder): Promise<unknown> {
    pick(dir);
    return invoke('diagnostics:choose-folder');
}

const TRACE = {
    event: 'plus-tap', caseId: 0, pickerOpened: true,
    nowIso: '2026-09-02T12:00:00.000Z', tzOffsetMins: 120, nowMins: 840, today: '2026-09-02',
    gameTokens: 1, rewardEnabled: true, moodWind: 0, activeMission: 'none',
    eveningStartsAt: '19:00', eveningStartMins: 1140, lastCompletedOrFailedMorningDate: '2026-09-02',
    economyLocked: false, windowOpen: true, pickerVisible: true, useEnabled: true,
};

beforeEach(() => {
    for (const name of fs.readdirSync(h.userData)) fs.rmSync(path.join(h.userData, name), { recursive: true, force: true });
    folder = path.join(scratch, `sync-${n++}`);
    fs.mkdirSync(folder);
    h.showOpenDialog.mockReset();
    vi.spyOn(os, 'hostname').mockReturnValue(HOST);
    for (const level of ['log', 'warn', 'error'] as const) vi.spyOn(console, level).mockImplementation(() => undefined);
});

afterEach(() => vi.restoreAllMocks());

describe('diagnostics — off until a folder is chosen', () => {
    it('reports off, writes nothing, and the audit log still works', async () => {
        expect(await invoke('diagnostics:status')).toEqual({ enabled: false });
        expect(await invoke('diagnostics:trace', TRACE)).toEqual({ ok: false, reason: 'off' });

        expect(auditLog.append([{ t: '2026-09-02T12:00:00.000Z', ev: 'A', src: 'local', msg: 'one' }])).toBe(1);

        expect(filesUnder(folder)).toEqual([]);
        expect(filesUnder(h.userData)).toEqual(['audit-log.ndjson']);
    });
});

describe('diagnostics:choose-folder — the folder comes from a native dialog in main', () => {
    it('stores the chosen directory through the store and turns the writer on', async () => {
        fs.writeFileSync(path.join(h.userData, 'config.json'), JSON.stringify({ calendarIds: ['cal-a'], remoteKey: 'k' }));

        const result = await chooseFolder();

        const status = { enabled: true, folder, hostFolder: path.join(folder, HOST) };
        expect(result).toEqual({ ok: true, status });
        expect(await invoke('diagnostics:status')).toEqual(status);
        expect(store.read()).toMatchObject({ kind: 'loaded', config: { diagnosticsDir: folder, calendarIds: ['cal-a'], remoteKey: 'k' } });
        expect(h.showOpenDialog).toHaveBeenCalledWith(expect.objectContaining({ properties: ['openDirectory'] }));
    });

    it('ignores anything the renderer sends: it picks no path and names no default', async () => {
        h.showOpenDialog.mockResolvedValueOnce({ canceled: true, filePaths: [] });

        expect(await invoke('diagnostics:choose-folder', folder, { defaultPath: folder })).toEqual({ ok: false, reason: 'cancelled' });

        expect(h.showOpenDialog.mock.calls[0]).toHaveLength(1);
        expect(JSON.stringify(h.showOpenDialog.mock.calls[0])).not.toContain('sync-');
        expect(await invoke('diagnostics:status')).toEqual({ enabled: false });
    });

    it.each([
        { what: 'a cancelled dialog', answer: () => ({ canceled: true, filePaths: [] }), reason: 'cancelled' },
        { what: 'no path', answer: () => ({ canceled: false, filePaths: [] }), reason: 'cancelled' },
        { what: 'a file, not a directory', answer: () => ({ canceled: false, filePaths: [makeFile()] }), reason: 'not-a-directory' },
        { what: 'a path that does not exist', answer: () => ({ canceled: false, filePaths: [path.join(folder, 'gone')] }), reason: 'not-a-directory' },
        { what: 'a relative path', answer: () => ({ canceled: false, filePaths: ['relative/dir'] }), reason: 'not-a-directory' },
    ])('refuses $what and stores nothing', async ({ answer, reason }) => {
        h.showOpenDialog.mockResolvedValueOnce(answer());

        expect(await invoke('diagnostics:choose-folder')).toEqual({ ok: false, reason });

        expect(await invoke('diagnostics:status')).toEqual({ enabled: false });
        expect(fs.existsSync(path.join(h.userData, 'config.json'))).toBe(false);
    });

    it('rejects with a plain message when the dialog fails, never the error object (ipcSafe)', async () => {
        h.showOpenDialog.mockRejectedValueOnce(Object.assign(new Error('C:\\Users\\someone\\secret'), { code: 'EIO', detail: { path: 'x' } }));

        await expect(invoke('diagnostics:choose-folder')).rejects.toThrow(/^Failed \(EIO\)$/);
    });
});

function makeFile(): string {
    const file = path.join(folder, 'a-file.txt');
    fs.writeFileSync(file, 'x');
    return file;
}

describe('diagnostics:trace — one allowlisted line under <folder>/<host>/', () => {
    it('writes only the two fixed files inside the host folder', async () => {
        vi.mocked(os.hostname).mockReturnValue('..\\evil/../name with spaces');
        await chooseFolder();

        expect(await invoke('diagnostics:trace', { ...TRACE, file: '../../escape.ndjson' })).toEqual({ ok: true });
        auditLog.append([{ t: '2026-09-02T12:00:00.000Z', ev: 'A', src: 'local', msg: 'one' }]);

        expect(filesUnder(folder)).toEqual(['___evil____name_with_spaces/audit-log.ndjson', '___evil____name_with_spaces/eligibility.ndjson']);
        expect(filesUnder(scratch).filter(file => file.includes('escape'))).toEqual([]);
    });

    it('rebuilds the line field by field: unknown keys dropped, a planted pairing key included', async () => {
        await chooseFolder();

        await invoke('diagnostics:trace', { ...TRACE, remoteKey: 'SECRET-KEY', remoteRoomId: 'ROOM', settings: { remoteKey: 'SECRET-2' }, host: 'forged', appVersion: '0.0.0', t: 'forged' });

        const text = fs.readFileSync(traceFile(), 'utf-8');
        expect(text).not.toMatch(/SECRET|ROOM|forged|remote/);
        const [line] = lines(traceFile());
        expect(Object.keys(line).sort()).toEqual([...Object.keys(TRACE), 't', 'host', 'appVersion'].sort());
        expect(line).toMatchObject({ ...TRACE, host: HOST, appVersion: '9.9.9' });
        expect(new Date(String(line.t)).toISOString()).toBe(line.t);
    });

    it('keeps only finite numbers and real booleans, and null where the gate read null', async () => {
        await chooseFolder();

        await invoke('diagnostics:trace', {
            ...TRACE, gameTokens: Number.NaN, moodWind: Number.POSITIVE_INFINITY, caseId: '2', nowMins: null,
            windowOpen: 'true', pickerVisible: 1, eveningStartMins: null, lastCompletedOrFailedMorningDate: null, activeMission: 7,
        });

        const [line] = lines(traceFile());
        for (const dropped of ['gameTokens', 'moodWind', 'caseId', 'nowMins', 'windowOpen', 'pickerVisible', 'activeMission']) expect(line).not.toHaveProperty(dropped);
        expect(line).toMatchObject({ eveningStartMins: null, lastCompletedOrFailedMorningDate: null, useEnabled: true });
    });

    it('clamps every string', async () => {
        await chooseFolder();

        await invoke('diagnostics:trace', { ...TRACE, eveningStartsAt: 'x'.repeat(100_000), today: 'y'.repeat(5000) });

        const [line] = lines(traceFile());
        expect(String(line.eveningStartsAt).length).toBeLessThanOrEqual(80);
        expect(String(line.today).length).toBeLessThanOrEqual(80);
        expect(fs.statSync(traceFile()).size).toBeLessThan(2000);
    });

    it.each([
        { what: 'an unknown event', payload: { ...TRACE, event: 'exfiltrate' } },
        { what: 'no event', payload: { gameTokens: 1 } },
        { what: 'null', payload: null },
        { what: 'an array', payload: [TRACE] },
        { what: 'a string', payload: JSON.stringify(TRACE) },
    ])('writes nothing for $what', async ({ payload }) => {
        await chooseFolder();

        expect(await invoke('diagnostics:trace', payload)).toEqual({ ok: false, reason: 'invalid' });
        expect(fs.existsSync(traceFile())).toBe(false);
    });
});

describe('diagnostics — failures are results', () => {
    function failAppendsUnder(dir: string, code: string) {
        vi.spyOn(fs, 'appendFileSync').mockImplementation(((...args: Parameters<typeof realAppend>) => {
            if (typeof args[0] === 'string' && path.resolve(args[0]).startsWith(path.resolve(dir))) {
                throw Object.assign(new Error(`${code}: resource busy or locked, open '${args[0]}'`), { code });
            }
            return realAppend(...args);
        }) as typeof fs.appendFileSync);
    }

    it.each(['EBUSY', 'EPERM', 'EACCES'])('swallows %s (OneDrive holding the file): a result, no log line', async code => {
        await chooseFolder();
        failAppendsUnder(folder, code);

        expect(await invoke('diagnostics:trace', TRACE)).toEqual({ ok: false, reason: 'locked', code });
        expect(console.error).not.toHaveBeenCalled();
    });

    it('reports any other failure once, by its code only, and still resolves', async () => {
        await chooseFolder();
        failAppendsUnder(folder, 'ENOSPC');

        expect(await invoke('diagnostics:trace', TRACE)).toEqual({ ok: false, reason: 'write-failed', code: 'ENOSPC' });
        expect(await invoke('diagnostics:trace', TRACE)).toEqual({ ok: false, reason: 'write-failed', code: 'ENOSPC' });
        expect(console.error).toHaveBeenCalledTimes(1);
        expect(String(vi.mocked(console.error).mock.calls[0])).not.toContain(folder);
    });

    it('does not re-create a chosen folder that has gone (a cloud folder unmounted)', async () => {
        await chooseFolder();
        fs.rmSync(folder, { recursive: true });

        expect(await invoke('diagnostics:trace', TRACE)).toEqual({ ok: false, reason: 'missing', code: 'ENOENT' });
        expect(fs.existsSync(folder)).toBe(false);
    });

    it('a mirror failure never breaks the audit append', async () => {
        await chooseFolder();
        failAppendsUnder(folder, 'ENOSPC');

        expect(auditLog.append([{ t: '2026-09-02T12:00:00.000Z', ev: 'A', src: 'local', msg: 'kept' }])).toBe(1);

        expect(auditLog.read()).toEqual([expect.objectContaining({ msg: 'kept' })]);
    });
});

describe('diagnostics — the audit mirror and rotation', () => {
    it('mirrors exactly what AuditLog.append wrote, after its sanitize', async () => {
        await chooseFolder();

        auditLog.append([
            { t: '2026-09-02T12:00:00.000Z', ev: 'ADD_TOKENS', src: 'local', msg: 'ok', d: 2, bank: 5, remoteKey: 'SECRET' },
            { ev: '', msg: 'refused: no event' },
            { t: 'garbage', ev: 'B', src: 'forged', msg: 'm'.repeat(1000) },
        ]);
        auditLog.append([{ t: '2026-09-02T12:01:00.000Z', ev: 'C', src: 'remote', msg: 'second batch' }]);

        const mirror = fs.readFileSync(path.join(folder, HOST, 'audit-log.ndjson'), 'utf-8');
        expect(mirror).toBe(fs.readFileSync(auditLog.filePath(), 'utf-8'));
        expect(mirror.split('\n').filter(Boolean)).toHaveLength(3);
        expect(mirror).not.toContain('SECRET');
    });

    it('rotates a file at 4 MB, keeping one previous generation', async () => {
        await chooseFolder();
        fs.mkdirSync(path.join(folder, HOST), { recursive: true });
        fs.writeFileSync(traceFile(), Buffer.alloc(4 * 1024 * 1024, 'a'));
        fs.writeFileSync(`${traceFile()}.1`, 'oldest generation');

        await invoke('diagnostics:trace', TRACE);

        expect(fs.statSync(`${traceFile()}.1`).size).toBe(4 * 1024 * 1024);
        expect(lines(traceFile())).toHaveLength(1);
    });

    it('does not rotate below the cap', async () => {
        await chooseFolder();
        await invoke('diagnostics:trace', TRACE);
        await invoke('diagnostics:trace', TRACE);

        expect(lines(traceFile())).toHaveLength(2);
        expect(fs.existsSync(`${traceFile()}.1`)).toBe(false);
    });
});

describe('diagnostics:disable', () => {
    it('turns the writer off and removes the folder from the config, leaving written files alone', async () => {
        await chooseFolder();
        await invoke('diagnostics:trace', TRACE);

        expect(await invoke('diagnostics:disable')).toEqual({ ok: true, status: { enabled: false } });

        expect(await invoke('diagnostics:status')).toEqual({ enabled: false });
        expect(await invoke('diagnostics:trace', TRACE)).toEqual({ ok: false, reason: 'off' });
        expect(JSON.parse(fs.readFileSync(path.join(h.userData, 'config.json'), 'utf-8'))).not.toHaveProperty('diagnosticsDir');
        expect(lines(traceFile())).toHaveLength(1);
    });

    it('reads a hand-edited relative folder as off', async () => {
        fs.writeFileSync(path.join(h.userData, 'config.json'), JSON.stringify({ diagnosticsDir: 'relative/dir' }));

        expect(await invoke('diagnostics:status')).toEqual({ enabled: false });
        expect(await invoke('diagnostics:trace', TRACE)).toEqual({ ok: false, reason: 'off' });
    });
});
