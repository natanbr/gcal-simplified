// ============================================================
// The diagnostics folder (electron/diagnostics.ts): choosing it, and what a line holds.
//
// What this protects:
//   - It is off until the parent picks a folder in a native dialog in main; the
//     window never supplies a path, a network path is refused (a write there can
//     hold for the SMB timeout), and nothing is written anywhere while off.
//   - The folder is read once and kept in main: a write never reads config.json.
//   - Every trace line is rebuilt field by field from an allowlist, so a planted
//     pairing key or an unbounded string never reaches the synced folder.
//   - The audit mirror holds exactly what AuditLog.append wrote.
// The write queue, failures, links and the rate limit: diagnostics.write.test.ts.
// Real store and real audit log on temp folders; only electron is stubbed, and
// every case starts from freshly imported modules (the folder is cached).
// ============================================================

import { describe, it, expect, vi, beforeEach, afterEach, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { filesUnder, invokeHandler, ndjson, TRACE, type Handler } from './diagnosticsTestKit';

const h = vi.hoisted(() => ({ userData: '', handlers: new Map<string, (...args: unknown[]) => Promise<unknown>>(), showOpenDialog: vi.fn() }));

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

const HOST = 'TEST-HOST';
const CONFIG = path.join(h.userData, 'config.json');
let folder = '';
let n = 0;
let idle: () => Promise<void>;
let auditLog: typeof import('./audit-log').auditLog;

const invoke = (channel: string, ...args: unknown[]) => invokeHandler(h.handlers, channel, ...args);
const traceFile = () => path.join(folder, HOST, 'eligibility.ndjson');
async function chooseFolder(dir = folder): Promise<unknown> {
    h.showOpenDialog.mockResolvedValueOnce({ canceled: false, filePaths: [dir] });
    return invoke('diagnostics:choose-folder');
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

describe('diagnostics — off until a folder is chosen', () => {
    it('reports off, writes nothing, and the audit log still works', async () => {
        expect(await invoke('diagnostics:status')).toEqual({ enabled: false });
        expect(await invoke('diagnostics:trace', TRACE)).toEqual({ ok: false, reason: 'off' });

        expect(auditLog.append([{ t: '2026-09-02T12:00:00.000Z', ev: 'A', src: 'local', msg: 'one' }])).toBe(1);
        await idle();

        expect(filesUnder(folder)).toEqual([]);
        expect(filesUnder(h.userData)).toEqual(['audit-log.ndjson']);
    });
});

describe('diagnostics:choose-folder — the folder comes from a native dialog in main', () => {
    it('stores the chosen directory through the store and turns the writer on', async () => {
        fs.writeFileSync(CONFIG, JSON.stringify({ calendarIds: ['cal-a'], remoteKey: 'k' }));

        const result = await chooseFolder();

        const status = { enabled: true, folder, hostFolder: path.join(folder, HOST) };
        expect(result).toEqual({ ok: true, status });
        expect(await invoke('diagnostics:status')).toEqual(status);
        expect(JSON.parse(fs.readFileSync(CONFIG, 'utf-8'))).toMatchObject({ diagnosticsDir: folder, calendarIds: ['cal-a'], remoteKey: 'k' });
        expect(h.showOpenDialog).toHaveBeenCalledWith(expect.objectContaining({ properties: ['openDirectory'] }));
    });

    it('ignores anything the window sends: it picks no path and names no default', async () => {
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
        { what: 'a network share', answer: () => ({ canceled: false, filePaths: ['\\\\nas\\family\\diag'] }), reason: 'network-path' },
        { what: 'a long-form network share', answer: () => ({ canceled: false, filePaths: ['\\\\?\\UNC\\nas\\family\\diag'] }), reason: 'network-path' },
        { what: 'a share written with forward slashes', answer: () => ({ canceled: false, filePaths: ['//nas/family/diag'] }), reason: 'network-path' },
    ])('refuses $what and stores nothing', async ({ answer, reason }) => {
        h.showOpenDialog.mockResolvedValueOnce(answer());

        expect(await invoke('diagnostics:choose-folder')).toEqual({ ok: false, reason });

        expect(await invoke('diagnostics:status')).toEqual({ enabled: false });
        expect(fs.existsSync(CONFIG)).toBe(false);
    });

    it('never touches a network path, not even to look at it', async () => {
        const stat = vi.spyOn(fs.promises, 'stat');
        const statSync = vi.spyOn(fs, 'statSync');

        await chooseFolder('\\\\nas\\family\\diag');

        const touched = [...stat.mock.calls, ...statSync.mock.calls].map(([p]) => String(p)).filter(p => p.includes('nas'));
        expect(touched).toEqual([]);
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

describe('diagnostics — the folder is read once and kept in main', () => {
    it('reads config.json once, however many lines are written', async () => {
        fs.writeFileSync(CONFIG, JSON.stringify({ diagnosticsDir: folder }));
        const read = vi.spyOn(fs, 'readFileSync');
        const configReads = () => read.mock.calls.filter(([p]) => typeof p === 'string' && path.resolve(p) === path.resolve(CONFIG)).length;

        for (let i = 0; i < 5; i++) await invoke('diagnostics:trace', TRACE);
        for (let i = 0; i < 5; i++) auditLog.append([{ t: '2026-09-02T12:00:00.000Z', ev: 'A', src: 'local', msg: `m${i}` }]);
        await invoke('diagnostics:status');
        await idle();

        expect(configReads()).toBe(1);
        expect(ndjson(traceFile())).toHaveLength(5);
    });

    it('keeps what choose-folder and disable decided, whatever the file says later', async () => {
        await chooseFolder();
        fs.writeFileSync(CONFIG, JSON.stringify({ diagnosticsDir: path.join(scratch, 'elsewhere') }));
        expect(await invoke('diagnostics:status')).toMatchObject({ enabled: true, folder });

        await invoke('diagnostics:disable');
        fs.writeFileSync(CONFIG, JSON.stringify({ diagnosticsDir: folder }));
        expect(await invoke('diagnostics:status')).toEqual({ enabled: false });
    });

    // Antivirus or a backup holding config.json: each line would read it again, synchronously, on the main thread.
    it('reads a held config.json again only after a few seconds, not at every line', async () => {
        vi.useFakeTimers({ toFake: ['Date'] });
        vi.setSystemTime(new Date('2026-09-02T12:00:00.000Z'));
        fs.writeFileSync(CONFIG, JSON.stringify({ diagnosticsDir: folder }));
        const realRead = fs.readFileSync;
        let held = true;
        const isConfig = (p: unknown) => typeof p === 'string' && path.resolve(p) === path.resolve(CONFIG);
        const read = vi.spyOn(fs, 'readFileSync').mockImplementation(((...args: Parameters<typeof realRead>) => {
            if (held && isConfig(args[0])) throw Object.assign(new Error('EBUSY: resource busy or locked'), { code: 'EBUSY' });
            return realRead(...args);
        }) as typeof fs.readFileSync);
        const configReads = () => read.mock.calls.filter(([p]) => isConfig(p)).length;

        for (let i = 0; i < 5; i++) expect(await invoke('diagnostics:trace', TRACE)).toEqual({ ok: false, reason: 'off' });
        for (let i = 0; i < 5; i++) auditLog.append([{ t: '2026-09-02T12:00:00.000Z', ev: 'A', src: 'local', msg: `m${i}` }]);
        expect(await invoke('diagnostics:status')).toEqual({ enabled: false });
        expect(configReads()).toBe(1);

        held = false;
        vi.setSystemTime(new Date('2026-09-02T12:00:04.000Z'));
        expect(await invoke('diagnostics:trace', TRACE)).toEqual({ ok: false, reason: 'off' }); // still waiting
        expect(configReads()).toBe(1);
        vi.setSystemTime(new Date('2026-09-02T12:00:05.000Z'));
        expect(await invoke('diagnostics:trace', TRACE)).toEqual({ ok: true });
        await idle();

        expect(configReads()).toBe(2);
        expect(ndjson(traceFile())).toHaveLength(1);
    });

    it.each([
        { what: 'a relative folder', saved: 'relative/dir' },
        { what: 'a network share', saved: '\\\\nas\\family\\diag' },
    ])('reads a hand-edited $what as off', async ({ saved }) => {
        fs.writeFileSync(CONFIG, JSON.stringify({ diagnosticsDir: saved }));

        expect(await invoke('diagnostics:status')).toEqual({ enabled: false });
        expect(await invoke('diagnostics:trace', TRACE)).toEqual({ ok: false, reason: 'off' });
    });
});

describe('diagnostics:trace — one allowlisted line', () => {
    it('rebuilds the line field by field: unknown keys dropped, a planted pairing key included', async () => {
        await chooseFolder();

        expect(await invoke('diagnostics:trace', { ...TRACE, remoteKey: 'SECRET-KEY', remoteRoomId: 'ROOM', settings: { remoteKey: 'SECRET-2' }, host: 'forged', appVersion: '0.0.0', t: 'forged' }))
            .toEqual({ ok: true });
        await idle();

        const text = fs.readFileSync(traceFile(), 'utf-8');
        expect(text).not.toMatch(/SECRET|ROOM|forged|remote/);
        const [line] = ndjson(traceFile());
        expect(Object.keys(line).sort()).toEqual([...Object.keys(TRACE), 't', 'host', 'appVersion'].sort());
        expect(line).toMatchObject({ ...TRACE, host: HOST, appVersion: '9.9.9' });
        expect(new Date(String(line.t)).toISOString()).toBe(line.t);
    });

    it('keeps only finite numbers and real booleans, and null where the gate read null', async () => {
        await chooseFolder();

        await invoke('diagnostics:trace', {
            ...TRACE, gameTokens: Number.NaN, moodWind: Number.POSITIVE_INFINITY, caseId: '2', nowMins: null, tzOffsetMins: 1e307,
            windowOpen: 'true', pickerVisible: 1, eveningStartMins: null, lastCompletedOrFailedMorningDate: null, activeMission: 7,
        });
        await idle();

        const [line] = ndjson(traceFile());
        // tzOffsetMins 1e307 is finite, but rounding it to 2 decimals is not: it would be written as null.
        for (const dropped of ['gameTokens', 'moodWind', 'caseId', 'nowMins', 'tzOffsetMins', 'windowOpen', 'pickerVisible', 'activeMission']) expect(line).not.toHaveProperty(dropped);
        expect(line).toMatchObject({ eveningStartMins: null, lastCompletedOrFailedMorningDate: null, useEnabled: true });
    });

    it('clamps every string, and keeps the listed rewards a short list of short strings', async () => {
        await chooseFolder();

        await invoke('diagnostics:trace', {
            ...TRACE, eveningStartsAt: 'x'.repeat(100_000), cause: 'c'.repeat(500),
            shownRewards: ['quick-game', 42, { id: 'x' }, 'r'.repeat(500), ...Array.from({ length: 100 }, (_, i) => `id-${i}`)],
        });
        await idle();

        const [line] = ndjson(traceFile());
        expect(String(line.eveningStartsAt).length).toBeLessThanOrEqual(80);
        expect(String(line.cause).length).toBeLessThanOrEqual(80);
        const shown = line.shownRewards;
        if (!Array.isArray(shown)) throw new Error('shownRewards was dropped');
        expect(shown.length).toBeLessThanOrEqual(16);
        expect(shown.slice(0, 2)).toEqual(['quick-game', 'r'.repeat(32)]);
        expect(shown.every(id => typeof id === 'string' && id.length <= 32)).toBe(true);
        expect(fs.statSync(traceFile()).size).toBeLessThan(2000);
    });

    it('drops a shownRewards that is not a list', async () => {
        await chooseFolder();

        await invoke('diagnostics:trace', { ...TRACE, shownRewards: 'quick-game' });
        await idle();

        expect(ndjson(traceFile())[0]).not.toHaveProperty('shownRewards');
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
        await idle();
        expect(fs.existsSync(traceFile())).toBe(false);
    });
});

describe('diagnostics — the audit mirror', () => {
    it('mirrors exactly what AuditLog.append wrote, after its sanitize', async () => {
        await chooseFolder();

        auditLog.append([
            { t: '2026-09-02T12:00:00.000Z', ev: 'ADD_TOKENS', src: 'local', msg: 'ok', d: 2, bank: 5, remoteKey: 'SECRET' },
            { ev: '', msg: 'refused: no event' },
            { t: 'garbage', ev: 'B', src: 'forged', msg: 'm'.repeat(1000) },
        ]);
        auditLog.append([{ t: '2026-09-02T12:01:00.000Z', ev: 'C', src: 'remote', msg: 'second batch' }]);
        await idle();

        const mirror = fs.readFileSync(path.join(folder, HOST, 'audit-log.ndjson'), 'utf-8');
        expect(mirror).toBe(fs.readFileSync(auditLog.filePath(), 'utf-8'));
        expect(mirror.split('\n').filter(Boolean)).toHaveLength(3);
        expect(mirror).not.toContain('SECRET');
    });
});

describe('diagnostics:disable', () => {
    it('turns the writer off and removes the folder from the config, leaving written files alone', async () => {
        await chooseFolder();
        await invoke('diagnostics:trace', TRACE);
        await idle();

        expect(await invoke('diagnostics:disable')).toEqual({ ok: true, status: { enabled: false } });

        expect(await invoke('diagnostics:status')).toEqual({ enabled: false });
        expect(await invoke('diagnostics:trace', TRACE)).toEqual({ ok: false, reason: 'off' });
        expect(JSON.parse(fs.readFileSync(CONFIG, 'utf-8'))).not.toHaveProperty('diagnosticsDir');
        expect(ndjson(traceFile())).toHaveLength(1);
    });
});
