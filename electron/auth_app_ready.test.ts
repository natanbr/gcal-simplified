// ============================================================
// Google credentials load after the app is ready (2026-10-01)
// ------------------------------------------------------------
// auth.ts builds its singleton when main.js is imported, before Electron's
// `app` is ready. On Windows safeStorage cannot decrypt then
// (isEncryptionAvailable() is false, decryptString throws), so the load in the
// constructor found nothing and the OAuth client started every relaunch with no
// credentials. isAuthenticated() re-read the store later, after ready, and said
// "signed in", so the login screen was skipped and every Google call failed with
// "No access, refresh token, API key or refresh handler callback is set": an
// empty week with no error on screen.
//
// Sign-in, sign-out and Google refusing the refresh token are in
// auth_session.test.ts; the fakes are in authTestKit.ts.
// ============================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { kit, fake } = await vi.hoisted(async () => {
    const kit = await import('./authTestKit');
    return { kit, fake: await kit.createAuthFakes() };
});

vi.mock('electron', () => kit.electronModule(fake));
vi.mock('electron-store', () => kit.electronStoreModule(fake));
vi.mock('googleapis', () => kit.googleapisModule(fake));

const { HOUR, NO_CREDENTIALS, authorization, googleAnswers, readStored, stored } = kit;
const storeEncrypted = (plain: string) => kit.storeEncrypted(fake, plain);
const relaunch = () => kit.relaunch(fake);
const appReady = () => { fake.app.ready = true; };

await relaunch(); // the first import, at collection (see authTestKit.ts)

describe('Google credentials and the app-ready lifecycle', () => {
    beforeEach(() => kit.resetAuthFakes(fake));

    it('importing auth.ts before the app is ready touches no safeStorage method', async () => {
        storeEncrypted(JSON.stringify(stored()));

        await relaunch();

        expect(fake.safeStorage.isEncryptionAvailable).not.toHaveBeenCalled();
        expect(fake.safeStorage.decryptString).not.toHaveBeenCalled();
        expect(fake.safeStorage.encryptString).not.toHaveBeenCalled();
    });

    it('a relaunch gives the OAuth client the stored credentials before the first Google call', async () => {
        storeEncrypted(JSON.stringify(stored()));
        const authService = await relaunch();
        appReady();

        expect(await authorization(authService)).toBe('Bearer stored-access');
    });

    it('a relaunch after the access token expired refreshes it with the stored refresh_token and keeps it encrypted', async () => {
        storeEncrypted(JSON.stringify({ ...stored(), access_token: 'expired-access', expiry_date: Date.now() - HOUR }));
        googleAnswers(fake, { access_token: 'refreshed-access', expires_in: 3600 });
        const authService = await relaunch();
        appReady();

        expect(await authorization(authService)).toBe('Bearer refreshed-access');
        const refreshBody = new URLSearchParams(String(fake.tokenEndpoint.mock.calls[0][1]?.body));
        expect(refreshBody.get('refresh_token')).toBe('stored-refresh');
        // The tokens listener persisted the refresh, and the refresh response
        // (which carries no refresh_token) did not erase the stored one.
        expect(readStored(fake)).toMatchObject({ access_token: 'refreshed-access', refresh_token: 'stored-refresh' });
    });

    it('isAuthenticated() answers from the credentials the client holds, decrypted once', async () => {
        storeEncrypted(JSON.stringify(stored()));
        const authService = await relaunch();
        appReady();

        expect([authService.isAuthenticated(), authService.isAuthenticated(), authService.isAuthenticated()])
            .toEqual([true, true, true]);
        expect(authService.getAuthClient().credentials.refresh_token).toBe('stored-refresh');
        expect(fake.safeStorage.decryptString).toHaveBeenCalledTimes(1);
    });

    it('a legacy plain-text blob still signs in', async () => {
        fake.storeData.set('tokens', stored());
        fake.storeData.set('isEncrypted', false);
        const authService = await relaunch();
        appReady();

        expect(authService.isAuthenticated()).toBe(true);
        expect(await authorization(authService)).toBe('Bearer stored-access');
    });

    it('an access token valid for an hour signs in without a refresh token', async () => {
        storeEncrypted(JSON.stringify({ access_token: 'stored-access', expiry_date: Date.now() + HOUR }));
        const authService = await relaunch();
        appReady();

        expect(authService.isAuthenticated()).toBe(true);
        expect(await authorization(authService)).toBe('Bearer stored-access');
    });

    it.each([
        ['ciphertext this machine cannot decrypt', () => {
            fake.storeData.set('tokens', Buffer.from('a blob from another machine').toString('base64'));
            fake.storeData.set('isEncrypted', true);
        }],
        ['a blob that decrypts to something other than JSON', () => storeEncrypted('not json')],
        ['JSON that is not an object', () => storeEncrypted('42')],
        ['JSON null', () => storeEncrypted('null')],
        ['an object with no token in it', () => storeEncrypted('{}')],
        ['a legacy plain-text object with no token in it', () => {
            fake.storeData.set('tokens', { scope: 'calendar' });
            fake.storeData.set('isEncrypted', false);
        }],
        // An access token alone signs in only while the client will still send it.
        ['an expired access token and no refresh token', () => storeEncrypted(JSON.stringify({ access_token: 'a', expiry_date: Date.now() - HOUR }))],
        ['an access token inside the library\'s 5-minute refresh margin and no refresh token', () => storeEncrypted(JSON.stringify({ access_token: 'a', expiry_date: Date.now() + 2 * 60 * 1000 }))],
        ['an access token with no expiry and no refresh token', () => storeEncrypted(JSON.stringify({ access_token: 'a' }))],
    ])('%s: not signed in, and the client holds no credentials', async (_case, seed) => {
        seed();
        const authService = await relaunch();
        appReady();

        expect(authService.isAuthenticated()).toBe(false);
        await expect(authorization(authService)).rejects.toThrow(NO_CREDENTIALS);
    });

    it('a blob that decrypts to damaged JSON is logged without its text', async () => {
        storeEncrypted('{"refresh_token":SEEDED-SECRET-77}'); // V8's parse message would quote ~10 characters of it
        const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const authService = await relaunch();
        appReady();

        expect(authService.isAuthenticated()).toBe(false);
        expect(logged).toHaveBeenCalled();
        expect(JSON.stringify(logged.mock.calls.map(call => call.map(String)))).not.toContain('SEEDED');
        logged.mockRestore();
    });

    it('before the app is ready, the readers throw instead of answering "signed out"', async () => {
        storeEncrypted(JSON.stringify(stored()));
        const authService = await relaunch();

        expect(() => authService.isAuthenticated()).toThrow(/before the app is ready/);
        expect(() => authService.getAuthClient()).toThrow(/before the app is ready/);

        appReady();
        expect(authService.isAuthenticated()).toBe(true);
    });

    it('a store read that throws is retried by the next call, not remembered as "signed out"', async () => {
        storeEncrypted(JSON.stringify(stored()));
        const authService = await relaunch();
        appReady();
        fake.storeReadError.next = Object.assign(new Error('EBUSY: resource busy or locked'), { code: 'EBUSY' });

        expect(() => authService.isAuthenticated()).toThrow('EBUSY');
        expect(authService.isAuthenticated()).toBe(true);
        expect(await authorization(authService)).toBe('Bearer stored-access');
    });

    it('a token file held at launch stops neither the import nor the next call', async () => {
        storeEncrypted(JSON.stringify(stored()));
        fake.storeOpenError.next = Object.assign(new Error('EBUSY: resource busy or locked'), { code: 'EBUSY' });

        const authService = await relaunch(); // the store opens on first use, after ready
        appReady();

        expect(() => authService.isAuthenticated()).toThrow('EBUSY');
        expect(authService.isAuthenticated()).toBe(true);
    });
});
