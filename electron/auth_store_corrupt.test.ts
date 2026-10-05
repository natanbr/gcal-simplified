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
import { inspect } from 'node:util';

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

/** A hand edit that drops a value's quotes: V8's parse message then quotes ~10 characters of it. */
const DAMAGED = '{"tokens":{"refresh_token":SEEDED-SECRET-77},"isEncrypted":false}';
const SIGNED_IN = { access_token: 'signed-in-access', refresh_token: 'signed-in-refresh', expires_in: 3600 };
const MOVED_ASIDE_LINE = /^\[auth\] auth-store\.json could not be parsed: moved it to \S+\.corrupt-\S+\. Sign in with Google again\.$/;

/** Everything the app writes to the console from here on, objects expanded as Node prints them. */
function consoleOutput(): () => string {
    const spies = (['error', 'warn', 'log', 'info'] as const).map(level => vi.spyOn(console, level).mockImplementation(() => undefined));
    return () => spies.flatMap(spy => spy.mock.calls.flat())
        .map(arg => (typeof arg === 'string' ? arg : inspect(arg, { depth: 10 }))).join('\n');
}

await relaunch(); // the first import, at collection (see authTestKit.ts); the store opens on first use, so no file is touched

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
        // One line, a fixed phrase: a JSON.parse message quotes the text around the bad token.
        expect(logged.mock.calls).toEqual([[expect.stringMatching(MOVED_ASIDE_LINE)]]);
    });

    it('after it was moved aside, a sign-in saves a fresh file that the next launch reads, and deletes the copy', async () => {
        fs.writeFileSync(tokenFile(), '');
        fs.writeFileSync(path.join(userData.dir, 'config.json.corrupt-2026-01-01T00-00-00-000Z'), '{');
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
        let authService = await relaunch();
        appReady();
        expect(authService.isAuthenticated()).toBe(false);
        expect(movedAside()).toHaveLength(1);
        kit.googleAnswers(fake, SIGNED_IN);

        await kit.signIn(fake, authService);
        expect(movedAside()).toEqual([]); // a copy of a token file has no recovery value, and may hold a refresh token
        authService = await relaunch();
        appReady();

        expect(authService.isAuthenticated()).toBe(true);
        expect(authService.getAuthClient().credentials.refresh_token).toBe('signed-in-refresh');
        expect(fs.existsSync(path.join(userData.dir, 'config.json.corrupt-2026-01-01T00-00-00-000Z'))).toBe(true);
    });

    it('a sign-out deletes every moved-aside copy, and leaves config.json\'s alone', async () => {
        fs.writeFileSync(tokenFile(), '');
        fs.writeFileSync(path.join(userData.dir, 'auth-store.json.corrupt-2026-01-01T00-00-00-000Z'), DAMAGED);
        fs.writeFileSync(path.join(userData.dir, 'config.json.corrupt-2026-01-01T00-00-00-000Z'), '{');
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const authService = await relaunch();
        appReady();
        expect(authService.isAuthenticated()).toBe(false);
        expect(movedAside()).toHaveLength(2);

        authService.logout();

        expect(movedAside()).toEqual([]);
        expect(fs.existsSync(path.join(userData.dir, 'config.json.corrupt-2026-01-01T00-00-00-000Z'))).toBe(true);
    });

    it('damaged after it was opened: a save and a sign-out move it aside and log none of its text', async () => {
        fs.writeFileSync(tokenFile(), JSON.stringify({ tokens: kit.stored(), isEncrypted: false }));
        const output = consoleOutput();
        let authService = await relaunch();
        appReady();
        expect(authService.isAuthenticated()).toBe(true); // opened and read
        fs.writeFileSync(tokenFile(), DAMAGED); // a hand edit while the app runs
        kit.googleAnswers(fake, SIGNED_IN);

        await kit.signIn(fake, authService); // the save re-reads the file first
        authService = await relaunch();
        appReady();
        expect(authService.getAuthClient().credentials.refresh_token).toBe('signed-in-refresh');

        fs.writeFileSync(tokenFile(), DAMAGED);
        expect(() => authService.logout()).not.toThrow();
        expect(movedAside()).toEqual([]);
        expect(output()).not.toContain('SEEDED');
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
