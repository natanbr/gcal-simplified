// ============================================================
// config.json reads — "absent", "locked" and "will never parse" are different.
//
// What this protects: the settings file holds the user's calendar selection,
// task lists, power/theme settings and the phone pairing. `store.get()` used to
// return the same defaults for a missing file and for one it could not read,
// and every read-modify-write then saved those defaults over the real file.
//
// The contract pinned here:
//   read() → 'loaded'     the file parsed to an object (a leading BOM is fine:
//                          PowerShell 5.1's `Set-Content -Encoding UTF8` writes
//                          one, so the documented hand repair produces it);
//            'absent'     no file (ENOENT) — or content that can never parse
//                          (truncated, empty, NUL-filled, not an object), which
//                          is MOVED ASIDE to config.json.corrupt-<time> first,
//                          so the bytes survive and the app recovers by itself;
//            'unreadable' the read itself failed (EBUSY/EPERM/EACCES from
//                          antivirus or a backup): transient, so the file is
//                          left exactly where it is. A quarantine whose rename
//                          fails is 'unreadable' too.
//   No log line carries file content, and a persisting problem logs once.
//
// Real store, real disk: one temp userData dir per file, because store.ts
// memoizes the config path on first use. Faults are spies on the shared `fs`
// object that throw only for config.json; each case asserts its fault fired.
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
const realRead = fs.readFileSync;
const realRename = fs.renameSync;

const DEFAULTS = {
    calendarIds: ['primary'], taskListIds: [], themeMode: 'auto', manualDayStart: 7, manualDayEnd: 19,
    sleepEnabled: true, sleepStart: 22, sleepEnd: 6, weekStartDay: 'today',
};
const PAIRING = { remoteRoomId: 'room-new', remoteKey: 'key-new' };

const fault = { readCode: null as string | null, readHits: 0, renameCode: null as string | null, renameHits: 0 };
const isConfig = (file: unknown) => typeof file !== 'number' && path.resolve(String(file)) === path.resolve(CONFIG);
const fsError = (code: string) => Object.assign(new Error(`${code}: operation failed`), { code });

const seed = (content: string | Buffer) => fs.writeFileSync(CONFIG, content);
const bytes = () => realRead(CONFIG);
const quarantined = () => fs.readdirSync(paths.userData).filter(name => name.startsWith('config.json.corrupt-'));
const errorLines = () => vi.mocked(console.error).mock.calls.map(args => args.map(a => (typeof a === 'string' ? a : inspect(a))).join(' '));

beforeEach(() => {
    for (const name of fs.readdirSync(paths.userData)) fs.rmSync(path.join(paths.userData, name), { force: true });
    Object.assign(fault, { readCode: null, readHits: 0, renameCode: null, renameHits: 0 });
    vi.spyOn(fs, 'readFileSync').mockImplementation(((...args: Parameters<typeof realRead>) => {
        if (fault.readCode && isConfig(args[0])) { fault.readHits++; throw fsError(fault.readCode); }
        return realRead(...args);
    }) as typeof fs.readFileSync);
    vi.spyOn(fs, 'renameSync').mockImplementation((...args: Parameters<typeof realRename>) => {
        if (fault.renameCode && isConfig(args[0])) { fault.renameHits++; throw fsError(fault.renameCode); }
        realRename(...args);
    });
    for (const level of ['log', 'warn', 'error'] as const) vi.spyOn(console, level).mockImplementation(() => undefined);
    // A lock case in an earlier test leaves "already reported" state behind; one clean read resets it.
    store.read();
});

afterEach(() => vi.restoreAllMocks());

describe('store.read — a missing or readable file', () => {
    it('reads an absent file as the defaults', () => {
        expect(store.read()).toEqual({ kind: 'absent', config: DEFAULTS });
    });

    it('loads a file with a leading BOM (what a PowerShell 5.1 hand repair writes)', () => {
        seed('﻿' + JSON.stringify({ calendarIds: ['cal-a'], ...PAIRING }));
        const read = store.read();
        expect(read.kind).toBe('loaded');
        if (read.kind === 'loaded') expect(read.config).toMatchObject({ calendarIds: ['cal-a'], ...PAIRING });
        expect(quarantined()).toEqual([]);
    });
});

describe('store.read — content that can never parse is moved aside, not refused for ever', () => {
    const NEVER_PARSES: Array<[string, string | Buffer]> = [
        ['truncated JSON (a crash mid-write)', '{"calendarIds": ["cal-a"], "remoteKey": "sec'],
        ['an empty file', ''],
        ['a NUL-filled file', Buffer.alloc(64)],
        ['null', 'null'],
        ['an array', '[]'],
        ['a number', '42'],
    ];

    it.each(NEVER_PARSES)('quarantines %s and reads as absent', (_label, content) => {
        seed(content);
        const before = bytes();

        expect(store.read()).toEqual({ kind: 'absent', config: DEFAULTS });

        const [aside, ...more] = quarantined();
        expect(more, 'one read, one quarantine').toEqual([]);
        expect(realRead(path.join(paths.userData, aside)).equals(before), 'the bytes were not kept').toBe(true);
        expect(fs.existsSync(CONFIG)).toBe(false);
        expect(errorLines().some(line => line.includes(aside)), 'no log line names where the file went').toBe(true);
        expect(store.update(PAIRING)).toEqual({ ok: true });
    });

    it('refuses instead when the quarantine rename is itself refused, and keeps the bytes in place', () => {
        seed('{"calendarIds": ["cal-a"], "remoteKey": "sec');
        const before = bytes();
        fault.renameCode = 'EPERM';

        const read = store.read();

        expect(fault.renameHits, 'the rename fault never fired').toBeGreaterThan(0);
        expect(read).toEqual({ kind: 'unreadable', failure: { ok: false, reason: 'locked', code: 'EPERM', file: CONFIG } });
        expect(store.get()).toEqual(DEFAULTS);
        expect(bytes().equals(before)).toBe(true);
        expect(quarantined()).toEqual([]);
    });

    it('logs where the file went but nothing it contained, not even a JSON.parse message', () => {
        const SECRET = 'SECRET42'; // V8 quotes ~10 characters around the bad token
        const content = `{"remoteKey": ${SECRET}}`;
        expect(() => JSON.parse(content), 'the fixture no longer provokes a quoting message').toThrow(SECRET);
        seed(content);

        store.get();

        const everything = (['log', 'warn', 'error'] as const).flatMap(level => vi.mocked(console[level]).mock.calls.flat())
            .map(arg => (arg instanceof Error ? `${arg.message}\n${arg.stack ?? ''}` : typeof arg === 'string' ? arg : inspect(arg, { depth: 6 })));
        expect(everything.filter(line => line.includes(SECRET))).toEqual([]);
        expect(quarantined()).toHaveLength(1);
    });
});

describe('store.read — a read that fails is transient: refuse, never quarantine', () => {
    it.each(['EBUSY', 'EPERM', 'EACCES'])('treats a %s read as locked and leaves the file where it is', (code) => {
        seed(JSON.stringify({ calendarIds: ['cal-a'], ...PAIRING }));
        const before = bytes();
        fault.readCode = code;

        const read = store.read();

        expect(fault.readHits, 'the read fault never fired').toBeGreaterThan(0);
        expect(read).toEqual({ kind: 'unreadable', failure: { ok: false, reason: 'locked', code, file: CONFIG } });
        expect(store.get()).toEqual(DEFAULTS);
        expect(store.update({ calendarIds: ['clobber'] })).toEqual({ ok: false, reason: 'locked', code, file: CONFIG });
        fault.readCode = null;
        expect(bytes().equals(before), 'config.json was rewritten').toBe(true);
        expect(quarantined()).toEqual([]);
    });

    it('calls any other read error unreadable, not locked', () => {
        seed(JSON.stringify({ calendarIds: ['cal-a'] }));
        fault.readCode = 'EIO';
        expect(store.read()).toEqual({ kind: 'unreadable', failure: { ok: false, reason: 'unreadable', code: 'EIO', file: CONFIG } });
    });

    it('logs a persisting lock once, and again after the file was readable in between', () => {
        seed(JSON.stringify({ calendarIds: ['cal-a'] }));
        fault.readCode = 'EBUSY';
        store.get(); store.get(); store.read();
        expect(errorLines().filter(line => line.includes('EBUSY'))).toHaveLength(1);

        fault.readCode = null;
        store.get();
        fault.readCode = 'EBUSY';
        store.get();
        expect(errorLines().filter(line => line.includes('EBUSY'))).toHaveLength(2);
    });

    it('reads fresh on every call, so the file loads once the lock lifts', () => {
        seed(JSON.stringify({ calendarIds: ['cal-a'], taskListIds: ['list-1'], sleepEnabled: false }));
        fault.readCode = 'EBUSY';
        expect(store.read().kind).toBe('unreadable');

        fault.readCode = null;
        const read = store.read();
        expect(read.kind).toBe('loaded');
        if (read.kind === 'loaded') expect(read.config).toMatchObject({ calendarIds: ['cal-a'], taskListIds: ['list-1'], sleepEnabled: false });
    });
});
