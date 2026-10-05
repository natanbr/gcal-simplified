// ============================================================
// Google sign-in sessions: sign-in, sign-out, and Google refusing the grant
// ------------------------------------------------------------
// The real google-auth-library client against a faked token endpoint (see
// authTestKit.ts). Loading the credentials on a relaunch is in
// auth_app_ready.test.ts.
//
// Google refusing the refresh token (invalid_grant: access revoked, or the
// 7-day expiry while the OAuth consent screen is in Testing mode) left the
// client and the file holding it. auth:check kept saying "signed in", the data
// reads in api.ts turned every failure into an empty list, and the parent saw
// an empty week with no error and no way back but Settings → Reconnect.
// ============================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { kit, fake } = await vi.hoisted(async () => {
    const kit = await import('./authTestKit');
    return { kit, fake: await kit.createAuthFakes() };
});

vi.mock('electron', () => kit.electronModule(fake));
vi.mock('electron-store', () => kit.electronStoreModule(fake));
vi.mock('googleapis', () => kit.googleapisModule(fake));

const { HOUR, NO_CREDENTIALS, REVOKED, authorization, expiredSession, googleAnswers, readStored, stored } = kit;
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

describe('Google refusing the refresh token signs out', () => {
    beforeEach(() => kit.resetAuthFakes(fake));
    afterEach(() => vi.useRealTimers());

    it('mid-session: the client and the stored tokens are cleared', async () => {
        vi.useFakeTimers({ toFake: ['Date'] });
        storeEncrypted(JSON.stringify(stored()));
        const authService = await relaunch();
        appReady();
        expect(await authorization(authService)).toBe('Bearer stored-access');
        vi.setSystemTime(Date.now() + 2 * HOUR); // the access token has expired
        googleAnswers(fake, REVOKED, 400);

        await expect(authorization(authService)).rejects.toMatchObject({ status: 400 });

        expect(authService.isAuthenticated()).toBe(false);
        expect(fake.storeData.has('tokens')).toBe(false);
        await expect(authorization(authService)).rejects.toThrow(NO_CREDENTIALS);
    });

    it('a relaunch after it shows the login screen without asking Google again', async () => {
        storeEncrypted(JSON.stringify(expiredSession()));
        googleAnswers(fake, REVOKED, 400);
        let authService = await relaunch();
        appReady();
        expect(authService.isAuthenticated()).toBe(true); // only Google can say the grant is gone
        await expect(authorization(authService)).rejects.toMatchObject({ status: 400 });

        authService = await relaunch();
        appReady();

        expect(authService.isAuthenticated()).toBe(false);
        expect(fake.tokenEndpoint).toHaveBeenCalledTimes(1);
    });

    it('tells the signed-out listeners once, however many calls waited on that refresh', async () => {
        storeEncrypted(JSON.stringify(expiredSession()));
        googleAnswers(fake, REVOKED, 400);
        const authService = await relaunch();
        appReady();
        const signedOut = vi.fn();
        authService.onSignedOut(signedOut);

        await Promise.allSettled([authorization(authService), authorization(authService), authorization(authService)]);

        expect(signedOut).toHaveBeenCalledTimes(1);
        expect(fake.tokenEndpoint).toHaveBeenCalledTimes(1);
    });

    it('a call still holding the client from before is not sent to Google again', async () => {
        storeEncrypted(JSON.stringify(expiredSession()));
        googleAnswers(fake, REVOKED, 400);
        const authService = await relaunch();
        appReady();
        const heldByAnEventsRead = authService.getAuthClient(); // api.ts keeps it across calendarList and events.list

        await expect(heldByAnEventsRead.getRequestHeaders()).rejects.toMatchObject({ status: 400 });
        await expect(heldByAnEventsRead.getRequestHeaders()).rejects.toThrow(NO_CREDENTIALS);

        expect(fake.tokenEndpoint).toHaveBeenCalledTimes(1);
    });

    it('a sign-out the user asked for (Reconnect) is not reported as one', async () => {
        storeEncrypted(JSON.stringify(stored()));
        const authService = await relaunch();
        appReady();
        const signedOut = vi.fn();
        authService.onSignedOut(signedOut);

        authService.logout();

        expect(signedOut).not.toHaveBeenCalled();
    });

    it.each([
        ['offline', () => fake.tokenEndpoint.mockRejectedValue(new TypeError('fetch failed'))],
        ['a Google outage (503)', () => googleAnswers(fake, { error: 'backend_error' }, 503)],
        ['a misconfigured app (401 invalid_client)', () => googleAnswers(fake, { error: 'invalid_client' }, 401)],
        ['a malformed request (400 invalid_request)', () => googleAnswers(fake, { error: 'invalid_request' }, 400)],
    ])('a refresh that fails because of %s keeps the sign-in', async (_case, fail) => {
        vi.useFakeTimers({ toFake: ['setTimeout', 'Date'] }); // skips the library's retry back-off (2.1 s for a 503)
        storeEncrypted(JSON.stringify(expiredSession()));
        fail();
        const authService = await relaunch();
        appReady();

        const refresh = authorization(authService).then(() => null, (error: unknown) => error);
        await vi.runAllTimersAsync();

        expect(await refresh).toBeInstanceOf(Error);
        expect(authService.isAuthenticated()).toBe(true);
        expect(readStored(fake).refresh_token).toBe('stored-refresh');
    });
});

describe('a refresh still in flight when the user clicks Reconnect', () => {
    beforeEach(() => kit.resetAuthFakes(fake));

    async function refreshInFlight() {
        storeEncrypted(JSON.stringify(expiredSession()));
        const late = kit.googleAnswersLater(fake);
        const authService = await relaunch();
        appReady();
        const pending = authorization(authService).catch(() => null);
        await vi.waitFor(() => expect(fake.tokenEndpoint).toHaveBeenCalledTimes(1));
        return { authService, late, pending };
    }

    it('lands after the sign-out without signing the old account back in', async () => {
        const { authService, late, pending } = await refreshInFlight();

        authService.logout();
        late.answer({ access_token: 'late-access', expires_in: 3600 });
        await pending;

        expect(fake.storeData.has('tokens')).toBe(false);
        expect(authService.isAuthenticated()).toBe(false);
        await expect(authorization(authService)).rejects.toThrow(NO_CREDENTIALS);
    });

    it('lands after the new sign-in without replacing the new account', async () => {
        const { authService, late, pending } = await refreshInFlight();

        authService.logout();
        googleAnswers(fake, { access_token: 'new-access', refresh_token: 'new-refresh', expires_in: 3600 });
        await kit.signIn(fake, authService);
        late.answer({ access_token: 'old-account-access', expires_in: 3600 });
        await pending;

        expect(await authorization(authService)).toBe('Bearer new-access');
        expect(readStored(fake)).toMatchObject({ access_token: 'new-access', refresh_token: 'new-refresh' });
    });
});
