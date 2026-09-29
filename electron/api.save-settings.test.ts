// ============================================================
// ApiService.saveSettings / getSettings — the Settings dialog's two channels.
//
// What this protects:
//   - saveSettings used to write the renderer's config verbatim. It now copies
//     only the SETTINGS fields (an allowlist) and merges them onto the file, so
//     the pairing — owned by the main process — is never written from a stale
//     dialog, and anything else the renderer sends is ignored.
//   - A refused write is a RESULT the dialog can explain (locked / unreadable /
//     write-failed, with the file's path), never a thrown string.
//   - getSettings (settings:get) throws while the file cannot be read, so the
//     dialog never offers the defaults as the user's settings and saves them back.
// Real store on one temp userData dir (store.ts memoizes the path); auth and
// googleapis are stubbed only so api.ts can be imported.
// ============================================================

import { describe, it, expect, vi, beforeEach, afterEach, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ApiService } from './api';
import type { UserConfig } from './store';

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

const seed = (content: string) => fs.writeFileSync(CONFIG, content);
const bytes = () => realRead(CONFIG);
const onDisk = (): Record<string, unknown> => JSON.parse(realRead(CONFIG, 'utf-8'));
const save = (config: UserConfig) => new ApiService().saveSettings(config);

beforeEach(() => {
    for (const name of fs.readdirSync(paths.userData)) fs.rmSync(path.join(paths.userData, name), { force: true });
    lock.code = null;
    lock.hits = 0;
    vi.spyOn(fs, 'readFileSync').mockImplementation(((...args: Parameters<typeof realRead>) => {
        if (lock.code && typeof args[0] !== 'number' && path.resolve(String(args[0])) === path.resolve(CONFIG)) {
            lock.hits++;
            throw Object.assign(new Error(`${lock.code}: resource busy or locked`), { code: lock.code });
        }
        return realRead(...args);
    }) as typeof fs.readFileSync);
    for (const level of ['log', 'warn', 'error'] as const) vi.spyOn(console, level).mockImplementation(() => undefined);
});

afterEach(() => vi.restoreAllMocks());

describe('ApiService.saveSettings', () => {
    it('saves the settings and keeps the phone pairing the renderer does not carry', () => {
        seed(JSON.stringify(SEED, null, 2));

        expect(save({ calendarIds: ['cal-b'], taskListIds: [] })).toEqual({ ok: true });

        expect(onDisk()).toMatchObject({ calendarIds: ['cal-b'], taskListIds: [], remoteRoomId: 'room-orig', remoteKey: 'key-orig' });
    });

    // Settings opened, then Regenerate Keys in Mission Control, then Save: the
    // dialog's copy still holds the old pairing. The main process owns it.
    it('ignores a pairing the renderer sends, stale or cleared', () => {
        seed(JSON.stringify(SEED, null, 2));

        save({ calendarIds: ['cal-b'], taskListIds: [], remoteRoomId: 'room-stale', remoteKey: 'key-stale' });
        expect(onDisk()).toMatchObject({ calendarIds: ['cal-b'], remoteRoomId: 'room-orig', remoteKey: 'key-orig' });

        save({ calendarIds: ['cal-c'], taskListIds: [], remoteRoomId: undefined, remoteKey: undefined });
        expect(onDisk()).toMatchObject({ calendarIds: ['cal-c'], remoteRoomId: 'room-orig', remoteKey: 'key-orig' });
    });

    it('copies only the settings fields: anything else the renderer sends is not written', () => {
        seed(JSON.stringify(SEED, null, 2));
        const fromRenderer = { calendarIds: ['cal-b'], taskListIds: [], themeMode: 'manual', injected: 'x', remotePairingVersion: 1 };

        save(fromRenderer as UserConfig);

        const written = onDisk();
        expect(written).toMatchObject({ calendarIds: ['cal-b'], themeMode: 'manual' });
        expect(written).not.toHaveProperty('injected');
        expect(written).not.toHaveProperty('remotePairingVersion');
    });

    it('moves a corrupt file aside and saves the settings over a fresh one', () => {
        seed('{"calendarIds": ["cal-a"], "remoteRoomId": "room-orig", "remoteKey": "key-o');
        const before = bytes();

        expect(save({ calendarIds: ['cal-b'], taskListIds: [] })).toEqual({ ok: true });

        const aside = fs.readdirSync(paths.userData).filter(name => name.startsWith('config.json.corrupt-'));
        expect(aside).toHaveLength(1);
        expect(realRead(path.join(paths.userData, aside[0])).equals(before)).toBe(true);
        expect(onDisk()).toMatchObject({ calendarIds: ['cal-b'] });
    });

    it('refuses with a result naming the file when config.json is locked, and writes nothing', () => {
        seed(JSON.stringify(SEED, null, 2));
        const before = bytes();
        lock.code = 'EBUSY';

        const result = save({ calendarIds: ['cal-b'], taskListIds: [] });

        expect(lock.hits, 'the fs fault never fired — the case proves nothing').toBeGreaterThan(0);
        expect(result).toEqual({ ok: false, reason: 'locked', code: 'EBUSY', file: CONFIG });
        lock.code = null;
        expect(bytes().equals(before), 'saveSettings wrote over a locked config.json').toBe(true);
    });
});

describe('ApiService.getSettings (settings:get)', () => {
    it('returns the saved settings', () => {
        seed(JSON.stringify(SEED, null, 2));
        expect(new ApiService().getSettings()).toMatchObject({ calendarIds: ['cal-a'], taskListIds: ['list-1'], sleepEnabled: false });
    });

    it('returns the defaults when there is no file yet', () => {
        expect(new ApiService().getSettings()).toMatchObject({ calendarIds: ['primary'], taskListIds: [] });
    });

    // The dialog shows this sentence as it is (after Electron's IPC prefix), so it carries the
    // same reason classes as a refused save and names the file.
    it.each([
        ['EBUSY', `Settings could not be loaded: ${CONFIG} is in use by another program (antivirus or a backup). Try again in a moment.`],
        ['EIO', `Settings could not be loaded: ${CONFIG} could not be read (EIO). Try again in a moment.`],
    ])('throws a %s read as the sentence the dialog shows, so it never offers the defaults as the saved settings', (code, sentence) => {
        seed(JSON.stringify(SEED, null, 2));
        lock.code = code;

        expect(() => new ApiService().getSettings()).toThrow(sentence);
        expect(lock.hits).toBeGreaterThan(0);
    });
});
