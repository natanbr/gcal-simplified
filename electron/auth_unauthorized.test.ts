// ============================================================
// A 401 from a Google API asks for a new token once; a 403 never does (2026-10-04)
// ------------------------------------------------------------
// A revoke can kill a still-valid access token: the Calendar and Tasks reads
// then answer 401 and api.ts turns that into an empty list, so the refusal must
// be found by asking the token endpoint, on the first 401 (GoogleOAuthClient's
// requestAsync override in auth-client.ts). One refresh and one retry, never a
// loop; a 403 (a quota, a scope left unchecked) never asks, or it would on
// every 5-minute poll. Moved from auth_session.test.ts (300-line limit).
// ============================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Credentials } from 'google-auth-library';

const { kit, fake } = await vi.hoisted(async () => {
    const kit = await import('./authTestKit');
    return { kit, fake: await kit.createAuthFakes() };
});

vi.mock('electron', () => kit.electronModule(fake));
vi.mock('electron-store', () => kit.electronStoreModule(fake));
vi.mock('googleapis', () => kit.googleapisModule(fake));

const { REVOKED, readStored, stored } = kit;
const storeSession = (credentials: Credentials) => kit.storeEncrypted(fake, JSON.stringify(credentials));
const relaunch = () => kit.relaunch(fake);
const appReady = () => { fake.app.ready = true; };

await relaunch(); // the first import, at collection (see authTestKit.ts)

const CALENDAR_LIST = 'https://www.googleapis.com/calendar/v3/users/me/calendarList';
const isTokenRequest = (input: unknown) => String(input).includes('oauth2.googleapis.com/token');
const calls = (which: (input: unknown) => boolean) => fake.tokenEndpoint.mock.calls.filter(([input]) => which(input)).length;
const UNAUTHORIZED = { error: { code: 401, message: 'Invalid Credentials' } };
const RATE_LIMITED = { error: { code: 403, message: 'Rate Limit Exceeded', errors: [{ reason: 'rateLimitExceeded' }] } };
const REFRESHED = { access_token: 'refreshed-access', expires_in: 3600 };

/** Google's token endpoint and the Calendar API answer separately. */
function googleRoutes(token: [number, Record<string, unknown>], api: [number, Record<string, unknown>]): void {
    fake.tokenEndpoint.mockImplementation(async input => {
        const [status, body] = isTokenRequest(input) ? token : api;
        return kit.googleResponse(body, status);
    });
}

async function calendarListAfterLaunch() {
    const authService = await relaunch();
    appReady();
    return { authService, read: authService.getAuthClient().request({ url: CALENDAR_LIST }) };
}

describe('a revoke that also kills the access token before it expires', () => {
    beforeEach(() => kit.resetAuthFakes(fake));

    it('the first 401 asks for a new token, and the refusal signs out', async () => {
        storeSession(stored()); // still valid for an hour
        googleRoutes([400, REVOKED], [401, UNAUTHORIZED]);
        const { authService, read } = await calendarListAfterLaunch();

        await expect(read).rejects.toBeInstanceOf(Error);

        expect(authService.isAuthenticated()).toBe(false);
        expect(fake.storeData.has('tokens')).toBe(false);
        expect(calls(isTokenRequest)).toBe(1);
    });

    it('a 401 with a valid grant refreshes once, retries once with the new token, and keeps the sign-in', async () => {
        storeSession(stored());
        googleRoutes([200, REFRESHED], [200, { items: [] }]);
        fake.tokenEndpoint.mockImplementationOnce(async () => kit.googleResponse(UNAUTHORIZED, 401)); // the first read only
        const { authService, read } = await calendarListAfterLaunch();

        await expect(read).resolves.toMatchObject({ status: 200 });

        expect(calls(isTokenRequest)).toBe(1);
        const apiCalls = fake.tokenEndpoint.mock.calls.filter(([input]) => !isTokenRequest(input));
        expect(apiCalls).toHaveLength(2); // gaxios redacts the failed request's headers in place, so only the retry's is readable
        expect(new Headers(apiCalls[1][1]?.headers).get('authorization')).toBe('Bearer refreshed-access');
        expect(authService.isAuthenticated()).toBe(true);
        expect(readStored(fake)).toMatchObject({ access_token: 'refreshed-access', refresh_token: 'stored-refresh' });
    });

    it('a 401 that keeps coming back with a valid grant is retried once, not forever', async () => {
        storeSession(stored());
        // 401 for the first five reads, then 200: a retry that loops ends there and resolves
        // (a red test), instead of spinning on microtasks so the test timeout never fires.
        let apiReads = 0;
        fake.tokenEndpoint.mockImplementation(async input => (isTokenRequest(input)
            ? kit.googleResponse(REFRESHED, 200)
            : (++apiReads <= 5 ? kit.googleResponse(UNAUTHORIZED, 401) : kit.googleResponse({ items: [] }, 200))));
        const { authService, read } = await calendarListAfterLaunch();

        await expect(read).rejects.toMatchObject({ status: 401 });

        expect(calls(isTokenRequest)).toBe(1);
        expect(calls(input => !isTokenRequest(input))).toBe(2);
        expect(authService.isAuthenticated()).toBe(true);
    });

    it('a 401 from the token endpoint itself (invalid_client) asks it once, not twice', async () => {
        storeSession({ ...stored(), access_token: 'expired-access', expiry_date: Date.now() - 60 * 60 * 1000 });
        googleRoutes([401, { error: 'invalid_client' }], [200, { items: [] }]);
        const { authService, read } = await calendarListAfterLaunch();

        await expect(read).rejects.toMatchObject({ status: 401 });

        expect(calls(isTokenRequest)).toBe(1);
        expect(calls(input => !isTokenRequest(input))).toBe(0);
        expect(authService.isAuthenticated()).toBe(true); // a misconfigured app is not a sign-out
    });

    it.each([
        ['an access token with an expiry', stored()],
        // With no expiry_date the library's own retry would refresh on a 403 too.
        ['an access token with no expiry_date', { access_token: 'stored-access', refresh_token: 'stored-refresh' }],
    ])('a 403 (a quota, a scope left unchecked) asks for no new token, %s: it would on every poll', async (_case, session) => {
        storeSession(session);
        googleRoutes([200, REFRESHED], [403, RATE_LIMITED]);
        const { authService, read } = await calendarListAfterLaunch();

        await expect(read).rejects.toMatchObject({ status: 403 });

        expect(calls(isTokenRequest)).toBe(0);
        expect(calls(input => !isTokenRequest(input))).toBe(1);
        expect(authService.isAuthenticated()).toBe(true);
    });
});
