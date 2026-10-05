// ============================================================
// errorSummary — what a log line may say about an error (2026-10-04)
// ------------------------------------------------------------
// Enough to tell failures apart (the error's name, HTTP status, errno code, and
// Google's OAuth error code or API reason), never the object or its message: a
// gaxios error carries its request, and a JSON.parse message quotes the text.
// ============================================================

import { describe, it, expect } from 'vitest';
import { errorSummary, ipcSafeError } from './log-safe';

const SEED = 'SEEDED-REFRESH-TOKEN-0123';

/** The shape googleapis rejects with for a Calendar or Tasks API error. */
const apiError = (status: number, reason: string) => Object.assign(new Error(`${reason} for ${SEED}`), {
    name: 'GaxiosError',
    status,
    code: status,
    config: { data: `refresh_token=${SEED}` },
    response: { status, data: { error: { code: status, message: `${reason} message`, errors: [{ domain: 'global', reason, message: SEED }] } } },
});

describe('errorSummary', () => {
    it.each([
        ['a refused refresh token', Object.assign(new Error('invalid_grant'), {
            name: 'GaxiosError', status: 400, config: { data: `refresh_token=${SEED}` },
            response: { status: 400, data: { error: 'invalid_grant', error_description: 'Token has been expired or revoked.' } },
        }), 'GaxiosError status 400 invalid_grant'],
        ['a rate limit', apiError(403, 'rateLimitExceeded'), 'GaxiosError status 403 rateLimitExceeded'],
        ['a forbidden calendar', apiError(403, 'forbidden'), 'GaxiosError status 403 forbidden'],
        ['a quota', apiError(403, 'quotaExceeded'), 'GaxiosError status 403 quotaExceeded'],
        ['offline', Object.assign(new Error(`connect ECONNRESET ${SEED}`), { name: 'GaxiosError', code: 'ECONNRESET' }), 'GaxiosError ECONNRESET'],
        ['a held file', Object.assign(new Error(`EBUSY: resource busy or locked, open '${SEED}'`), { code: 'EBUSY' }), 'Error EBUSY'],
        ['a damaged file', new SyntaxError(`Unexpected token 'S', ..."h_token":${SEED}"... is not valid JSON`), 'SyntaxError'],
        ['something that is not an error', `refresh_token=${SEED}`, 'unknown error'],
    ])('%s: %#', (_case, error, summary) => {
        expect(errorSummary(error)).toBe(summary);
        expect(errorSummary(error)).not.toContain(SEED);
    });
});

describe('ipcSafeError', () => {
    it('keeps a plain Error our own code threw', () => {
        const ours = new Error('timeMin and timeMax must be strings');

        expect(ipcSafeError(ours)).toBe(ours);
    });

    it('rebuilds a Google error from its summary', () => {
        const safe = ipcSafeError(apiError(403, 'rateLimitExceeded'));

        expect(safe.message).toBe('Google request failed (GaxiosError status 403 rateLimitExceeded)');
        expect(Object.keys(safe)).toEqual([]);
    });

    it('rebuilds any other error that carries more than a message', () => {
        expect(ipcSafeError(Object.assign(new Error('EBUSY'), { code: 'EBUSY', path: SEED })).message).toBe('Failed (Error EBUSY)');
        expect(ipcSafeError(new Error('wrapped', { cause: apiError(500, 'backendError') })).message).toBe('Failed (Error)');
    });
});
