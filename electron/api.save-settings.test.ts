// ============================================================
// ApiService.saveSettings — merge into config.json, never replace it.
//
// What this protects: `settings:save` hands the renderer's config straight to
// the store. It used to write it verbatim, so a renderer config without the
// pairing fields erased the phone pairing, and a save while the file was
// unreadable (locked by antivirus/backup, or corrupt) wrote the renderer's
// view — itself built from the defaults — over the real file.
//
// The contract: saveSettings goes through store.update (a fresh read, then a
// merge). If the file cannot be read it writes nothing and THROWS, so the
// renderer's invoke rejects and the Settings modal can say so.
//
// Real store on one temp userData dir (store.ts memoizes the path); auth and
// googleapis are stubbed only so api.ts can be imported.
// ============================================================

import { describe, it, expect, vi, beforeEach, afterEach, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ApiService } from './api';

const paths = vi.hoisted(() => ({ userData: '' }));
vi.mock('electron', () => ({ app: { getPath: () => paths.userData } }));
vi.mock('./auth', () => ({ authService: {} }));
vi.mock('googleapis', () => ({ google: {} }));

paths.userData = fs.mkdtempSync(path.join(os.tmpdir(), 'api-save-settings-'));
afterAll(() => fs.rmSync(paths.userData, { recursive: true, force: true }));

const CONFIG = path.join(paths.userData, 'config.json');
const realRead = fs.readFileSync;
const SEED = { calendarIds: ['cal-a'], taskListIds: ['list-1'], sleepEnabled: false, remoteRoomId: 'room-orig', remoteKey: 'key-orig' };

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

/** Runs fn and returns what it threw, so the byte check can run first and name the real failure. */
function thrownBy(fn: () => unknown): unknown {
    try { fn(); } catch (e) { return e; }
    return null;
}

beforeEach(() => {
    fs.rmSync(CONFIG, { force: true });
    lock.code = null;
    lock.hits = 0;
    vi.spyOn(fs, 'readFileSync').mockImplementation(lockedRead as typeof fs.readFileSync);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(CONFIG, { force: true });
});

describe('ApiService.saveSettings', () => {
    it('keeps the phone pairing when the renderer config does not carry it', () => {
        seed(JSON.stringify(SEED, null, 2));

        new ApiService().saveSettings({ calendarIds: ['cal-b'], taskListIds: [] });

        expect(onDisk()).toMatchObject({ calendarIds: ['cal-b'], taskListIds: [], remoteRoomId: 'room-orig', remoteKey: 'key-orig' });
    });

    it('throws and writes nothing when config.json is corrupt', () => {
        seed('{"calendarIds": ["cal-a"], "remoteRoomId": "room-orig", "remoteKey": "key-o');
        const before = bytes();

        const thrown = thrownBy(() => new ApiService().saveSettings({ calendarIds: ['cal-b'], taskListIds: [] }));

        expect(bytes().equals(before), 'saveSettings wrote over a corrupt config.json').toBe(true);
        expect(thrown, 'saveSettings reported success for a save it did not make').toBeInstanceOf(Error);
    });

    it('throws and writes nothing when config.json is locked (EBUSY)', () => {
        seed(JSON.stringify(SEED, null, 2));
        const before = bytes();
        lock.code = 'EBUSY';

        const thrown = thrownBy(() => new ApiService().saveSettings({ calendarIds: ['cal-b'], taskListIds: [] }));

        expect(bytes().equals(before), 'saveSettings wrote over a locked config.json').toBe(true);
        expect(lock.hits, 'the fs fault never fired — the case proves nothing').toBeGreaterThan(0);
        expect(thrown, 'saveSettings reported success for a save it did not make').toBeInstanceOf(Error);
    });
});
