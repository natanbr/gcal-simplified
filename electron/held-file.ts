/** Another program holds the file for a moment (antivirus, a backup): the codes store.ts reads as "locked". */
const HELD_FILE_CODES = new Set(['EBUSY', 'EPERM', 'EACCES']);

/** The waits between reads while the file is held: about 15 s in all, then the error is the answer. */
export const HELD_FILE_WAITS_MS = [500, 1000, 2000, 4000, 8000];

export function isHeldFileError(error: unknown): boolean {
    if (typeof error !== 'object' || error === null || !('code' in error)) return false;
    return typeof error.code === 'string' && HELD_FILE_CODES.has(error.code);
}

/**
 * Runs `read`, and while it fails because the file is held, runs it again
 * after each wait. Any other failure, or a hold that outlasts the waits, is
 * thrown. Timers run only while a file is held, never on an idle app.
 */
export async function readWhileHeld<T>(read: () => T): Promise<T> {
    for (const wait of [...HELD_FILE_WAITS_MS, null]) {
        try {
            return read();
        } catch (error) {
            if (wait === null || !isHeldFileError(error)) throw error;
            await new Promise(resolve => setTimeout(resolve, wait));
        }
    }
    throw new Error('unreachable: the last attempt returns or throws');
}
