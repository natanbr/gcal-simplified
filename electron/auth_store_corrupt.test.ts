// @vitest-environment node
// ============================================================
// A corrupt auth-store.json never stops a launch (2026-10-04)
// ------------------------------------------------------------
// The token file used to be opened while main.js was imported, before the
// single-instance lock and before any window, and electron-store rethrows a
// parse error. An empty, truncated or NUL-filled file (power loss, a disk
// fault) stopped every launch, with no window, until someone deleted the file
// by hand. These run the real electron-store and conf against a throwaway
// userData folder; only Electron itself and Google are faked.
// ============================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const { kit, fake, userData } = await vi.hoisted(async () => {
    const kit = await import('./authTestKit');
    return { kit, fake: await kit.createAuthFakes(), userData: { dir: '' } };
});

vi.mock('electron', () => {
    const electron = {
        ...kit.electronModule(fake),
        app: { isReady: () => fake.app.ready, getPath: () => userData.dir, getVersion: () => '0.0.0' },
        ipcMain: { on: () => undefined },
    };
    return { ...electron, default: electron };
});
vi.mock('googleapis', () => kit.googleapisModule(fake));

const tokenFile = () => path.join(userData.dir, 'auth-store.json');
const movedAside = () => fs.readdirSync(userData.dir).filter(name => name.startsWith('auth-store.json.corrupt-'));
const relaunch = () => kit.relaunch(fake);
const appReady = () => { fake.app.ready = true; };

describe('a corrupt token file', () => {
    beforeEach(() => {
        kit.resetAuthFakes(fake);
        userData.dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gcal-auth-store-'));
    });
    afterEach(() => {
        vi.restoreAllMocks();
        fs.rmSync(userData.dir, { recursive: true, force: true });
    });

    it.each([
        ['empty', ''],
        ['truncated', '{"tokens":{"access_token":"A","refresh_token":"R'],
        ['NUL-filled', '\0'.repeat(64)],
    ])('%s: the import succeeds, the file is moved aside unchanged, and the app shows Sign in', async (_case, content) => {
        fs.writeFileSync(tokenFile(), content);
        const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);

        const authService = await relaunch();
        appReady();

        expect(authService.isAuthenticated()).toBe(false);
        const aside = movedAside();
        expect(aside).toHaveLength(1);
        expect(fs.readFileSync(path.join(userData.dir, aside[0]), 'utf-8')).toBe(content);
        // A JSON.parse message quotes the text around the bad token: never log it.
        expect(JSON.stringify(logged.mock.calls)).not.toContain('refresh_token');
    });

    it('after it was moved aside, a sign-in saves a fresh file that the next launch reads', async () => {
        fs.writeFileSync(tokenFile(), '');
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
        let authService = await relaunch();
        appReady();
        expect(authService.isAuthenticated()).toBe(false);
        kit.googleAnswers(fake, { access_token: 'signed-in-access', refresh_token: 'signed-in-refresh', expires_in: 3600 });

        await kit.signIn(fake, authService);
        authService = await relaunch();
        appReady();

        expect(authService.isAuthenticated()).toBe(true);
        expect(authService.getAuthClient().credentials.refresh_token).toBe('signed-in-refresh');
    });

    it('a byte-order mark (a hand repair in PowerShell 5.1) is read, not moved aside', async () => {
        fs.writeFileSync(tokenFile(), '﻿' + JSON.stringify({ tokens: kit.stored(), isEncrypted: false }));

        const authService = await relaunch();
        appReady();

        expect(authService.isAuthenticated()).toBe(true);
        expect(movedAside()).toEqual([]);
    });

    it('a healthy file still signs in through the real store', async () => {
        fs.writeFileSync(tokenFile(), JSON.stringify({ tokens: kit.stored(), isEncrypted: false }));

        const authService = await relaunch();
        appReady();

        expect(authService.isAuthenticated()).toBe(true);
        expect(movedAside()).toEqual([]);
    });
});
