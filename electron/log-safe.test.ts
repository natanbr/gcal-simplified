// ============================================================
// errorSummary — what a log line may say about an error (2026-10-04)
// ------------------------------------------------------------
// Enough to tell failures apart (the HTTP status, the errno code, Google's OAuth
// error code or API reason, and the error's name unless it is the plain
// `Error`), never the object or its message: a gaxios error carries its
// request, and a JSON.parse message quotes the text. The Google errors here are
// real gaxios errors (authTestKit's realGoogleError); their name is `Error`.
// ============================================================

import { describe, it, expect } from 'vitest';
import { errorSummary, ipcSafeError } from './log-safe';
import { realGoogleError } from './authTestKit';

const SEED = 'SEEDED-REFRESH-TOKEN-0123';
const sent = { refresh_token: SEED, grant_type: 'refresh_token' };
const apiError = (status: number, reason: string) =>
    realGoogleError({ status, body: { error: { code: status, message: `${reason} ${SEED}`, errors: [{ domain: 'global', reason, message: SEED }] } } }, sent);

describe('errorSummary', () => {
    it.each([
        ['a refused refresh token', () => realGoogleError({ status: 400, body: { error: 'invalid_grant', error_description: 'Token has been expired or revoked.' } }, sent), 'status 400 invalid_grant'],
        ['a rate limit', () => apiError(403, 'rateLimitExceeded'), 'status 403 rateLimitExceeded'],
        ['a forbidden calendar', () => apiError(403, 'forbidden'), 'status 403 forbidden'],
        ['a quota', () => apiError(403, 'quotaExceeded'), 'status 403 quotaExceeded'],
        ['a reason that is not a plain word (a dot)', () => apiError(403, `quota.${SEED}`), 'status 403'],
        ['a reason that is not a plain word (a digit)', () => apiError(403, 'quota2'), 'status 403'],
        ['offline', () => realGoogleError(Object.assign(new Error(`getaddrinfo ENOTFOUND ${SEED}`), { code: 'ENOTFOUND' }), sent), 'ENOTFOUND'],
        ['a held file', async () => Object.assign(new Error(`EBUSY: resource busy or locked, open '${SEED}'`), { code: 'EBUSY' }), 'EBUSY'],
        ['a damaged file', async () => new SyntaxError(`Unexpected token 'S', ..."h_token":${SEED}"... is not valid JSON`), 'SyntaxError'],
        ['something that is not an error', async () => `refresh_token=${SEED}`, 'unknown error'],
    ])('%s', async (_case, make, summary) => {
        const error = await make();

        expect(errorSummary(error)).toBe(summary);
        expect(errorSummary(error)).not.toContain(SEED);
    });

    it('the errors above are real gaxios errors, named Error', async () => {
        const error = await apiError(403, 'rateLimitExceeded');

        expect(error).toMatchObject({ name: 'Error', status: 403 });
        expect(Object.getPrototypeOf(error).constructor.name).toBe('GaxiosError');
    });
});

describe('ipcSafeError', () => {
    it('keeps a plain Error our own code threw', () => {
        const ours = new Error('timeMin and timeMax must be strings');

        expect(ipcSafeError(ours)).toBe(ours);
    });

    it('rebuilds a Google error from its summary', async () => {
        const safe = ipcSafeError(await apiError(403, 'rateLimitExceeded'));

        expect(safe.message).toBe('Google request failed (status 403 rateLimitExceeded)');
        expect(Object.keys(safe)).toEqual([]);
    });

    it('rebuilds a parse error, whose message quotes the text it could not parse', () => {
        const safe = ipcSafeError(new SyntaxError(`Unexpected token 'S', ..."h_token":${SEED}"... is not valid JSON`));

        expect(safe.message).toBe('Failed (SyntaxError)');
    });

    it('rebuilds any other error that carries more than a message', async () => {
        expect(ipcSafeError(Object.assign(new Error('EBUSY'), { code: 'EBUSY', path: SEED })).message).toBe('Failed (EBUSY)');
        expect(ipcSafeError(new Error('wrapped', { cause: await apiError(500, 'backendError') })).message).toBe('Failed (Error)');
    });
});
