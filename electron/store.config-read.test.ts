// ============================================================
// config.json — "absent" is not "unreadable".
//
// What this protects: the settings file holds the user's calendar selection,
// task lists, power/theme settings and the phone pairing. `store.get()` used to
// return the same hard-coded defaults whether the file was missing (defaults
// are right) or present but unreadable (antivirus or a backup holding it:
// EBUSY/EPERM; truncated or non-object content). Every read-modify-write then
// wrote those defaults back over the real file, and the remote bridge did so
// automatically at startup.
//
// The contract pinned here:
//   read()   → 'loaded' | 'absent' (only on ENOENT) | 'unreadable' (anything
//              else — I/O error, bad JSON, empty file, JSON that is not a plain
//              object). The reason is an errno code or a fixed phrase, never
//              file content.
//   update() → re-reads at write time; 'unreadable' writes NOTHING and returns
//              false; otherwise writes { ...config, ...patch } and returns true.
//   get()    → for readers only; 'unreadable' reads as the defaults.
// And: no log line may carry the file's content (a JSON.parse SyntaxError
// quotes a snippet of it, which can be the pairing key).
//
// Real store, real disk: one temp userData dir per file, because store.ts
// memoizes the config path on first use. The I/O fault is a spy on the shared
// `fs` object that throws only for config.json; every locked case asserts the
// spy fired, so a store that stops going through fs.readFileSync fails loudly
// instead of passing vacuously.
// ============================================================

import { describe, it, expect, vi, beforeEach, afterEach, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { inspect } from 'node:util';
import { store } from './store';

const paths = vi.hoisted(() => ({ userData: '' }));
vi.mock('electron', () => ({ app: { getPath: () => paths.userData } }));

paths.userData = fs.mkdtempSync(path.join(os.tmpdir(), 'store-config-read-'));
afterAll(() => fs.rmSync(paths.userData, { recursive: true, force: true }));

const CONFIG = path.join(paths.userData, 'config.json');
/** Captured before any spy, so "after" bytes are read past the fault. */
const realRead = fs.readFileSync;

/** The defaults `get()` returns today for a missing file. */
const DEFAULTS = {
    calendarIds: ['primary'],
    taskListIds: [],
    themeMode: 'auto',
    manualDayStart: 7,
    manualDayEnd: 19,
    sleepEnabled: true,
    sleepStart: 22,
    sleepEnd: 6,
    weekStartDay: 'today',
};
const PAIRING = { remoteRoomId: 'room-new', remoteKey: 'key-new' };

const lock = { code: null as string | null, hits: 0 };

function lockedRead(...args: Parameters<typeof realRead>) {
    const [file] = args;
    if (lock.code && typeof file !== 'number' && path.resolve(String(file)) === path.resolve(CONFIG)) {
        lock.hits++;
        throw Object.assign(new Error(`${lock.code}: resource busy or locked, open '${String(file)}'`), { code: lock.code });
    }
    return realRead(...args);
}

const seed = (content: string) => fs.writeFileSync(CONFIG, content);
const bytes = () => realRead(CONFIG);
const onDisk = (): Record<string, unknown> => JSON.parse(realRead(CONFIG, 'utf-8'));

beforeEach(() => {
    fs.rmSync(CONFIG, { force: true });
    lock.code = null;
    lock.hits = 0;
    vi.spyOn(fs, 'readFileSync').mockImplementation(lockedRead as typeof fs.readFileSync);
});

afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(CONFIG, { force: true });
});

describe('store — a missing file is the only one that reads as the defaults', () => {
    it('reads an absent file as the defaults and writes defaults + patch', () => {
        const read = store.read();
        expect(read.kind).toBe('absent');
        if (read.kind !== 'absent') return;
        expect(read.config).toEqual(DEFAULTS);

        expect(store.update(PAIRING)).toBe(true);
        expect(onDisk()).toEqual({ ...DEFAULTS, ...PAIRING });
    });

    it('merges a patch into a loaded file and keeps every field it did not name', () => {
        seed(JSON.stringify({ calendarIds: ['cal-a', 'cal-b'], taskListIds: ['list-1'], sleepEnabled: false }));

        expect(store.read().kind).toBe('loaded');
        expect(store.update(PAIRING)).toBe(true);
        expect(onDisk()).toMatchObject({
            calendarIds: ['cal-a', 'cal-b'],
            taskListIds: ['list-1'],
            sleepEnabled: false,
            ...PAIRING,
        });
    });
});

describe('store — a present but unreadable file is never written over', () => {
    const BAD_CONTENT: Array<[string, string]> = [
        ['truncated JSON', '{"calendarIds": ["cal-a"], "remoteKey": "sec'],
        ['an empty file', ''],
        ['null', 'null'],
        ['an array', '[]'],
        ['a number', '42'],
        ['a string', '"x"'],
    ];

    it.each(BAD_CONTENT)('treats %s as unreadable: get() gives defaults, update() refuses', (_label, content) => {
        seed(content);
        const before = bytes();

        const read = store.read();
        expect(read.kind).toBe('unreadable');
        if (read.kind === 'unreadable') expect(read.reason).toMatch(/\S/);
        expect(store.get()).toEqual(DEFAULTS);
        expect(store.update(PAIRING)).toBe(false);
        expect(bytes().equals(before), 'config.json was rewritten').toBe(true);
    });

    it.each(['EBUSY', 'EPERM'])('treats a %s read error as unreadable and leaves the bytes alone', (code) => {
        seed(JSON.stringify({ calendarIds: ['cal-a'], ...PAIRING }));
        const before = bytes();
        lock.code = code;

        const read = store.read();
        expect(lock.hits, 'the fs fault never fired — the case proves nothing').toBeGreaterThan(0);
        expect(read).toEqual({ kind: 'unreadable', reason: code });
        expect(store.get()).toEqual(DEFAULTS);
        expect(store.update({ calendarIds: ['clobber'] })).toBe(false);
        expect(bytes().equals(before), 'config.json was rewritten').toBe(true);
    });

    it('reports a failed write as not written, so no caller acts on a pairing that was never saved', () => {
        seed(JSON.stringify({ calendarIds: ['cal-a'] }));
        const before = bytes();
        const realWrite = fs.writeFileSync;
        let writeHits = 0;
        vi.spyOn(fs, 'writeFileSync').mockImplementation((...args: Parameters<typeof realWrite>) => {
            if (typeof args[0] !== 'number' && path.resolve(String(args[0])) === path.resolve(CONFIG)) {
                writeHits++;
                throw Object.assign(new Error('EPERM: operation not permitted'), { code: 'EPERM' });
            }
            realWrite(...args);
        });

        expect(store.update(PAIRING)).toBe(false);
        expect(writeHits, 'the write fault never fired — the case proves nothing').toBeGreaterThan(0);
        expect(bytes().equals(before)).toBe(true);
    });

    it('logs nothing that quotes the file, not even a JSON.parse error message', () => {
        // V8 quotes only ~10 characters from the bad token, so a longer secret
        // would never appear whole and this case would pass on a leaking store.
        const SECRET = 'SECRET42';
        const content = `{"remoteKey": ${SECRET}}`;
        expect(() => JSON.parse(content), 'the fixture no longer provokes a quoting message').toThrow(SECRET);
        seed(content);

        const spies = (['log', 'info', 'warn', 'error', 'debug'] as const)
            .map(level => vi.spyOn(console, level).mockImplementation(() => undefined));
        const leaked = () => spies.flatMap(spy => spy.mock.calls.flat()).map(arg =>
            arg instanceof Error ? `${arg.message}\n${arg.stack ?? ''}\n${inspect(arg)}` : typeof arg === 'string' ? arg : inspect(arg, { depth: 6 }),
        ).filter(line => line.includes(SECRET));

        store.get();
        expect(leaked(), 'a log line quotes config.json').toEqual([]);

        store.update({ calendarIds: ['cal-a'] });
        expect(leaked(), 'a log line quotes config.json').toEqual([]);

        const read = store.read();
        expect(read.kind).toBe('unreadable');
        if (read.kind === 'unreadable') expect(read.reason).not.toContain(SECRET);
    });
});

describe('store — lifecycle: the lock lifts', () => {
    it('reads fresh on every call, so the file loads once the lock is gone', () => {
        seed(JSON.stringify({ calendarIds: ['cal-a'], taskListIds: ['list-1'], sleepEnabled: false }));
        lock.code = 'EBUSY';
        expect(store.read().kind).toBe('unreadable');
        expect(lock.hits).toBeGreaterThan(0);

        lock.code = null;
        const read = store.read();
        expect(read.kind).toBe('loaded');
        if (read.kind === 'loaded') expect(read.config).toMatchObject({ calendarIds: ['cal-a'], taskListIds: ['list-1'], sleepEnabled: false });

        expect(store.update(PAIRING)).toBe(true);
        expect(onDisk()).toMatchObject({ calendarIds: ['cal-a'], ...PAIRING });
    });
});
