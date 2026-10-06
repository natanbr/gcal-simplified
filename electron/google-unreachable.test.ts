// ============================================================
// isGoogleUnreachable — "could not answer now" vs "refused" (2026-10-06)
// ------------------------------------------------------------
// The Calendar's 5-minute refresh read an offline machine, a Google outage or a
// rate limit as "no events": the forgiving read turned each failed calendar into
// [], the window cached that empty month, and the family's calendar went blank
// with no error until a later refresh worked. A read Google could not answer now
// must fail, so the window keeps what it shows; a calendar Google refuses for
// good is still skipped, or one unshared calendar would freeze the others.
//
// The errors are real gaxios errors raised by google-auth-library's transport
// (authTestKit's realGoogleError). A network failure is thrown by the fetch the
// way node-fetch 3 (gaxios's fetch in the main process) throws it: a FetchError
// carrying the system errno code, or an AbortError with no code at all when the
// request times out or is aborted.
// ============================================================

import { describe, it, expect } from 'vitest';
import { isGoogleUnreachable } from './google-unreachable';
import { REVOKED, realGoogleError } from './authTestKit';

// The first import of google-auth-library takes seconds: paid here, at collection, it counts
// against no test's timeout (authTestKit's header).
await import('google-auth-library');

/** node-fetch 3's FetchError for a system error: the errno code is copied onto it. */
const systemError = (code: string) =>
    Object.assign(new Error(`request to https://www.googleapis.com/calendar/v3 failed, reason: ${code}`), { code, type: 'system' });

/** node-fetch 3's AbortError: what a timeout (AbortSignal.timeout) or an abort rejects with. No code. */
class AbortError extends Error {
    override name = 'AbortError';
    type = 'aborted';
}

/** Google's API error body: { error: { code, message, errors: [{ domain, reason }] } }. */
const apiError = (status: number, reason: string, domain = 'global') =>
    realGoogleError({ status, body: { error: { code: status, message: reason, errors: [{ domain, reason, message: reason }] } } });

describe('isGoogleUnreachable: Google could not answer now', () => {
    it.each(['ENOTFOUND', 'EAI_AGAIN', 'ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'ENETUNREACH'])('no answer at all: %s', async code => {
        const error = await realGoogleError(systemError(code));

        expect(error).toMatchObject({ code, response: undefined }); // the real shape: the errno, and no response
        expect(isGoogleUnreachable(error)).toBe(true);
    });

    it('a timeout or an abort: no answer, and no code either', async () => {
        const error = await realGoogleError(new AbortError('The operation was aborted.'));

        expect(error).toMatchObject({ code: undefined, response: undefined });
        expect(isGoogleUnreachable(error)).toBe(true);
    });

    it.each([500, 502, 503, 504])('Google failing: HTTP %i', async status => {
        expect(isGoogleUnreachable(await apiError(status, 'backendError'))).toBe(true);
    });

    it('a request timeout: HTTP 408', async () => {
        expect(isGoogleUnreachable(await apiError(408, 'requestTimeout'))).toBe(true);
    });

    it('too many requests: HTTP 429', async () => {
        expect(isGoogleUnreachable(await apiError(429, 'rateLimitExceeded', 'usageLimits'))).toBe(true);
    });

    it.each(['rateLimitExceeded', 'userRateLimitExceeded', 'dailyLimitExceeded', 'quotaExceeded'])(
        'a 403 that is a rate limit or a quota: %s', async reason => {
            expect(isGoogleUnreachable(await apiError(403, reason, 'usageLimits'))).toBe(true);
        });
});

describe('isGoogleUnreachable: refused for good, or not a failed request', () => {
    it.each([
        [404, 'notFound'],
        [410, 'deleted'],
        [403, 'forbidden'],
        [403, 'insufficientPermissions'],
        [400, 'badRequest'],
        [401, 'authError'],
    ])('HTTP %i %s', async (status, reason) => {
        expect(isGoogleUnreachable(await apiError(status, reason))).toBe(false);
    });

    it('a 403 with no reason in its body', async () => {
        expect(isGoogleUnreachable(await realGoogleError({ status: 403, body: { error: { code: 403, message: 'Forbidden' } } }))).toBe(false);
    });

    it('the token endpoint refusing the sign-in (invalid_grant): auth.ts signs out, the window shows Sign in', async () => {
        expect(isGoogleUnreachable(await realGoogleError({ status: 400, body: REVOKED }))).toBe(false);
    });

    it('signed out under the read: the auth library has no token, or the client was retired (auth-client.ts)', () => {
        expect(isGoogleUnreachable(new Error('No refresh token is set.'))).toBe(false);
        expect(isGoogleUnreachable(new Error('Signed out of Google while this token refresh was running.'))).toBe(false);
    });

    it('an errno code on an error that is not a request (a file held by another program)', () => {
        expect(isGoogleUnreachable(Object.assign(new Error('EBUSY: resource busy or locked'), { code: 'EBUSY' }))).toBe(false);
    });

    it.each([undefined, null, 'offline', {}])('not an error: %s', value => {
        expect(isGoogleUnreachable(value)).toBe(false);
    });
});
