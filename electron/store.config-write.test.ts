// ============================================================
// config.json writes — store.update is the only writer, and it never leaves
// the file half-written or loses a field.
//
// What this protects:
//   - update() re-reads the file at write time and merges the patch onto the
//     file AS IT IS ON DISK (the raw object), so a key this build does not know
//     — written by a newer version — survives a save.
//   - The write goes to config.json.tmp and is renamed over the file, so a crash
//     mid-write leaves the old file whole (a plain writeFileSync truncates first,
//     and a truncated file is exactly what used to wipe the settings).
//   - Antivirus often holds a file it just saw written: the rename is retried a
//     few times on EPERM/EBUSY/EACCES (bounded — this runs on the main thread),
//     then reported as { ok: false, reason: 'locked' } with no temp file left.
//   - Any failure is a result, never a throw, and names the file for the UI.
// Real store on one temp dir (store.ts memoizes the path); rename and write
// faults throw only for config.json paths, and each case asserts it fired.
// ============================================================

import { describe, it, expect, vi, beforeEach, afterEach, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { store } from './store';

const paths = vi.hoisted(() => ({ userData: '' }));
vi.mock('electron', () => ({ app: { getPath: () => paths.userData } }));

paths.userData = fs.mkdtempSync(path.join(os.tmpdir(), 'store-config-write-'));
afterAll(() => fs.rmSync(paths.userData, { recursive: true, force: true }));

const CONFIG = path.join(paths.userData, 'config.json');
const TEMP = `${CONFIG}.tmp`;
const realRead = fs.readFileSync;
const realWrite = fs.writeFileSync;
const realRename = fs.renameSync;
const PAIRING = { remoteRoomId: 'room-new', remoteKey: 'key-new' };

/** `renameFailures`: how many renames onto config.json throw `renameCode` before one succeeds. */
const fault = { renameCode: 'EPERM', renameFailures: 0, renameHits: 0, writeCode: null as string | null, writeHits: 0 };
const fsError = (code: string) => Object.assign(new Error(`${code}: operation failed`), { code });
const under = (file: unknown, target: string) => typeof file !== 'number' && path.resolve(String(file)) === path.resolve(target);

const seed = (config: object) => realWrite(CONFIG, JSON.stringify(config, null, 2));
const bytes = () => realRead(CONFIG);
const onDisk = (): Record<string, unknown> => JSON.parse(realRead(CONFIG, 'utf-8'));

beforeEach(() => {
    for (const name of fs.readdirSync(paths.userData)) fs.rmSync(path.join(paths.userData, name), { force: true });
    Object.assign(fault, { renameCode: 'EPERM', renameFailures: 0, renameHits: 0, writeCode: null, writeHits: 0 });
    vi.spyOn(fs, 'renameSync').mockImplementation((...args: Parameters<typeof realRename>) => {
        if (under(args[1], CONFIG) && fault.renameHits < fault.renameFailures) { fault.renameHits++; throw fsError(fault.renameCode); }
        realRename(...args);
    });
    vi.spyOn(fs, 'writeFileSync').mockImplementation((...args: Parameters<typeof realWrite>) => {
        if (fault.writeCode && (under(args[0], CONFIG) || under(args[0], TEMP))) { fault.writeHits++; throw fsError(fault.writeCode); }
        realWrite(...args);
    });
    for (const level of ['log', 'warn', 'error'] as const) vi.spyOn(console, level).mockImplementation(() => undefined);
});

afterEach(() => vi.restoreAllMocks());

describe('store.update — merges onto the file as it is on disk', () => {
    it('writes defaults + patch when there is no file', () => {
        expect(store.update(PAIRING)).toEqual({ ok: true });
        expect(onDisk()).toMatchObject({ calendarIds: ['primary'], weekStartDay: 'today', ...PAIRING });
    });

    it('keeps every field it was not given, including keys this build does not know', () => {
        seed({ calendarIds: ['cal-a', 'cal-b'], taskListIds: ['list-1'], sleepEnabled: false, futureField: { from: 'a newer build' } });

        expect(store.update(PAIRING)).toEqual({ ok: true });

        expect(onDisk()).toEqual({
            calendarIds: ['cal-a', 'cal-b'], taskListIds: ['list-1'], sleepEnabled: false,
            futureField: { from: 'a newer build' }, ...PAIRING,
        });
    });
});

describe('store.update — atomic: a temp file renamed over config.json', () => {
    it('never writes config.json in place, and leaves no temp file after a success', () => {
        seed({ calendarIds: ['cal-a'] });
        const written: string[] = [];
        vi.mocked(fs.writeFileSync).mockImplementation((...args: Parameters<typeof realWrite>) => { written.push(String(args[0])); realWrite(...args); });

        expect(store.update(PAIRING)).toEqual({ ok: true });

        expect(written.map(file => path.resolve(file))).toEqual([path.resolve(TEMP)]);
        expect(fs.existsSync(TEMP)).toBe(false);
        expect(onDisk()).toMatchObject({ calendarIds: ['cal-a'], ...PAIRING });
    });

    it('retries a rename that antivirus refuses, and succeeds when it lets go', () => {
        seed({ calendarIds: ['cal-a'] });
        fault.renameFailures = 2;

        expect(store.update(PAIRING)).toEqual({ ok: true });

        expect(fault.renameHits).toBe(2);
        expect(onDisk()).toMatchObject({ calendarIds: ['cal-a'], ...PAIRING });
        expect(fs.existsSync(TEMP)).toBe(false);
    });

    it.each(['EPERM', 'EBUSY', 'EACCES'])('gives up on a rename refused with %s after a bounded wait: locked, file intact, no temp left', (code) => {
        seed({ calendarIds: ['cal-a'] });
        const before = bytes();
        fault.renameCode = code;
        fault.renameFailures = 99;

        const started = Date.now();
        const result = store.update(PAIRING);

        expect(result).toEqual({ ok: false, reason: 'locked', code, file: CONFIG });
        expect(fault.renameHits, 'no retry happened').toBeGreaterThan(1);
        expect(Date.now() - started, 'the main thread was held too long').toBeLessThan(1_000);
        expect(bytes().equals(before)).toBe(true);
        expect(fs.existsSync(TEMP), 'the temp file was left behind').toBe(false);
    });

    it('does not retry an error that waiting cannot fix', () => {
        seed({ calendarIds: ['cal-a'] });
        fault.renameCode = 'EXDEV';
        fault.renameFailures = 99;

        expect(store.update(PAIRING)).toEqual({ ok: false, reason: 'write-failed', code: 'EXDEV', file: CONFIG });
        expect(fault.renameHits).toBe(1);
    });

    it('reports a failed temp write as write-failed and leaves config.json alone', () => {
        seed({ calendarIds: ['cal-a'] });
        const before = bytes();
        fault.writeCode = 'ENOSPC';

        expect(store.update(PAIRING)).toEqual({ ok: false, reason: 'write-failed', code: 'ENOSPC', file: CONFIG });
        expect(fault.writeHits).toBeGreaterThan(0);
        expect(bytes().equals(before)).toBe(true);
        expect(fs.existsSync(TEMP)).toBe(false);
    });
});
