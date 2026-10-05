// ============================================================
// readWhileHeld — a file held for a moment is read again (2026-10-04)
// ------------------------------------------------------------
// auth:check reads the token file once per launch. Antivirus or a backup can
// hold it for a few seconds; the calendar then showed "Sign in with Google" to a
// parent who was signed in. The read is tried again, a bounded number of times,
// for the held-file codes only.
// ============================================================

import { describe, it, expect, vi, afterEach } from 'vitest';
import { HELD_FILE_WAITS_MS, isHeldFileError, readWhileHeld } from './held-file';

const fsError = (code: string) => Object.assign(new Error(`${code}: operation failed`), { code });

describe('readWhileHeld', () => {
    afterEach(() => vi.useRealTimers());

    it('answers at once when the read works', async () => {
        const read = vi.fn(() => 'answer');

        await expect(readWhileHeld(read)).resolves.toBe('answer');
        expect(read).toHaveBeenCalledTimes(1);
    });

    it.each(['EBUSY', 'EPERM', 'EACCES'])('reads again after %s, and answers once the file is free', async code => {
        vi.useFakeTimers();
        const read = vi.fn().mockImplementationOnce(() => { throw fsError(code); }).mockReturnValue('answer');

        const answer = readWhileHeld(read);
        await vi.advanceTimersByTimeAsync(HELD_FILE_WAITS_MS[0]);

        await expect(answer).resolves.toBe('answer');
        expect(read).toHaveBeenCalledTimes(2);
    });

    it('a hold that outlasts every wait is the answer, and it stops asking', async () => {
        vi.useFakeTimers();
        const read = vi.fn(() => { throw fsError('EBUSY'); });

        const answer = readWhileHeld(read).catch((error: unknown) => error);
        await vi.runAllTimersAsync();
        await vi.advanceTimersByTimeAsync(60 * 60 * 1000);

        expect(await answer).toMatchObject({ code: 'EBUSY' });
        expect(read).toHaveBeenCalledTimes(HELD_FILE_WAITS_MS.length + 1);
    });

    it.each([
        ['a damaged file', Object.assign(new SyntaxError('Unexpected end of JSON input'))],
        ['a missing file', fsError('ENOENT')],
        ['a read before the app is ready', new Error('Google credentials were requested before the app is ready')],
    ])('%s is not waited for', async (_case, error) => {
        const read = vi.fn(() => { throw error; });

        await expect(readWhileHeld(read)).rejects.toBe(error);
        expect(read).toHaveBeenCalledTimes(1);
        expect(isHeldFileError(error)).toBe(false);
    });
});
