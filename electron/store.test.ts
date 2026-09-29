// ============================================================
// store.read() — the read side of config.json, for the remote pairing fields.
// ------------------------------------------------------------
// readConfig rebuilds the config from an explicit field list, so a field missing
// from that list is silently DROPPED on every read. And it is the only filter
// between a hand-edited file and code that feeds the key to createHmac.
// ============================================================

import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { store, type UserConfig } from './store';

const paths = vi.hoisted(() => ({ userData: '' }));

vi.mock('electron', () => ({ app: { getPath: () => paths.userData } }));

function writeConfig(contents: Record<string, unknown>): void {
    writeFileSync(join(paths.userData, 'config.json'), JSON.stringify(contents), 'utf-8');
}

/** The config a read of the file just written returns: the file is readable, so 'loaded'. */
function loaded(): UserConfig {
    const result = store.read();
    if (result.kind !== 'loaded') throw new Error(`expected a loaded config, got ${result.kind}`);
    return result.config;
}

const ROOM = '5f0c2a9e-7b1d-4c3e-9a8f-2d6b4e1c7a90';
const KEY = 'q7Lk2mPz9XwR4tYb8NcV';

beforeAll(() => {
    paths.userData = mkdtempSync(join(tmpdir(), 'gcal-store-test-'));
});

afterAll(() => {
    rmSync(paths.userData, { recursive: true, force: true });
});

describe('store.read — remote pairing fields', () => {
    it('keeps a valid pairing and its protocol marker', () => {
        writeConfig({ calendarIds: [], remoteRoomId: ROOM, remoteKey: KEY, remotePairingVersion: 2 });
        const config = loaded();
        expect(config.remoteRoomId).toBe(ROOM);
        expect(config.remoteKey).toBe(KEY);
        // Not in the field list = dropped on read = the pairing renewed on every start.
        expect(config.remotePairingVersion).toBe(2);
    });

    it('drops a room id or key that is not a non-empty string', () => {
        for (const bad of [123, {}, '', null, ['x'], true]) {
            writeConfig({ calendarIds: [], remoteRoomId: bad, remoteKey: bad, remotePairingVersion: 2 });
            const config = loaded();
            expect(config.remoteRoomId).toBeUndefined();
            expect(config.remoteKey).toBeUndefined();
        }
    });

    it('keeps the pending-renewal notice time, and drops one that is not a non-empty string', () => {
        writeConfig({ calendarIds: [], remoteRoomId: ROOM, remoteKey: KEY, remotePairingVersion: 2, remotePairingRenewedAt: '2026-09-28T12:00:00.000Z' });
        expect(loaded().remotePairingRenewedAt).toBe('2026-09-28T12:00:00.000Z');
        writeConfig({ calendarIds: [], remoteRoomId: ROOM, remoteKey: KEY, remotePairingVersion: 2, remotePairingRenewedAt: 42 });
        expect(loaded().remotePairingRenewedAt).toBeUndefined();
    });

    it('drops a protocol marker that is not a number', () => {
        writeConfig({ calendarIds: [], remoteRoomId: ROOM, remoteKey: KEY, remotePairingVersion: '2' });
        expect(loaded().remotePairingVersion).toBeUndefined();
    });
});
