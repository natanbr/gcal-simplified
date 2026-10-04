// ============================================================
// Google sign-in sessions: sign-in and sign-out
// ------------------------------------------------------------
// The real google-auth-library client against a faked token endpoint (see
// authTestKit.ts). Loading the credentials on a relaunch is in
// auth_app_ready.test.ts.
// ============================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { kit, fake } = await vi.hoisted(async () => {
    const kit = await import('./authTestKit');
    return { kit, fake: await kit.createAuthFakes() };
});

vi.mock('electron', () => kit.electronModule(fake));
vi.mock('electron-store', () => kit.electronStoreModule(fake));
vi.mock('googleapis', () => kit.googleapisModule(fake));

const { NO_CREDENTIALS, authorization, googleAnswers, readStored, stored } = kit;
const storeEncrypted = (plain: string) => kit.storeEncrypted(fake, plain);
const relaunch = () => kit.relaunch(fake);
const appReady = () => { fake.app.ready = true; };

await relaunch(); // the first import, at collection (see authTestKit.ts)

describe('Google sign-in sessions', () => {
    beforeEach(() => kit.resetAuthFakes(fake));

    it.each([
        ['after auth:check said signed out', true],
        ['before anything read the credentials', false],
    ])('a sign-in %s is what the client and isAuthenticated() see, stored encrypted', async (_case, checkFirst) => {
        const authService = await relaunch();
        appReady();
        if (checkFirst) expect(authService.isAuthenticated()).toBe(false);
        googleAnswers(fake, { access_token: 'signed-in-access', refresh_token: 'signed-in-refresh', expires_in: 3600 });

        await kit.signIn(fake, authService);

        expect(authService.isAuthenticated()).toBe(true);
        expect(await authorization(authService)).toBe('Bearer signed-in-access');
        expect(readStored(fake)).toMatchObject({ access_token: 'signed-in-access', refresh_token: 'signed-in-refresh' });
    });

    it('a sign-out leaves no credentials in the client or the store', async () => {
        storeEncrypted(JSON.stringify(stored()));
        const authService = await relaunch();
        appReady();
        expect(authService.isAuthenticated()).toBe(true);

        authService.logout();

        expect(authService.isAuthenticated()).toBe(false);
        await expect(authorization(authService)).rejects.toThrow(NO_CREDENTIALS);
        expect(fake.storeData.has('tokens')).toBe(false);
    });
});
