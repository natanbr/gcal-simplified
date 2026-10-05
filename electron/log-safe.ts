/**
 * What a log line may say about an error from Google or the token file: its
 * HTTP status, its errno code, the OAuth error code, or else its name. Never
 * the object or its message: gaxios keeps a failed refresh's request body,
 * refresh_token included, in the error's config, and a JSON.parse message
 * quotes the text it could not parse (the token file's, or a decrypted token).
 */
export function errorSummary(error: unknown): string {
    const response = field(error, 'response');
    const status = field(error, 'status') ?? field(response, 'status');
    const code = field(error, 'code');
    const body = field(field(response, 'data'), 'error');
    // The token endpoint answers { error: 'invalid_grant' }; an API, { error: { errors: [{ reason }] } }.
    const reasons = field(body, 'errors');
    const reason = typeof body === 'string' ? body : Array.isArray(reasons) ? field(reasons[0], 'reason') : undefined;
    const named = name(error);
    const parts = [
        // A gaxios error and an fs error are both plain `Error`s: the name tells nothing there.
        named === 'Error' ? null : named,
        typeof status === 'number' ? `status ${status}` : null,
        (typeof code === 'string' || typeof code === 'number') && String(code) !== String(status) && SHORT_CODE.test(String(code)) ? String(code) : null,
        typeof reason === 'string' && REASON.test(reason) ? reason : null,
    ].filter((part): part is string => part !== null);
    return parts.length > 0 ? parts.join(' ') : named ?? 'unknown error';
}

function name(error: unknown): string | null {
    const value = field(error, 'name');
    return typeof value === 'string' && SHORT_CODE.test(value) ? value : null;
}

/**
 * What an IPC handler may reject with. Electron logs every rejected
 * ipcMain.handle with the error object, at Node's print depth, and a gaxios
 * error carries its request (a refresh's body holds the refresh token). A plain
 * Error our own code threw keeps its message; anything else is rebuilt from
 * errorSummary, so the window still learns what failed.
 */
export function ipcSafeError(error: unknown): Error {
    if (error instanceof Error && Object.getPrototypeOf(error) === Error.prototype
        && Object.keys(error).length === 0 && !('cause' in error)) return error;
    const fromGoogle = field(error, 'config') !== undefined || field(error, 'response') !== undefined;
    return new Error(`${fromGoogle ? 'Google request failed' : 'Failed'} (${errorSummary(error)})`);
}

/** An ipcMain.handle handler whose rejection is always ipcSafeError's. */
export function ipcSafe<A extends unknown[]>(handler: (...args: A) => unknown): (...args: A) => Promise<unknown> {
    return async (...args: A) => {
        try {
            return await handler(...args);
        } catch (error) {
            throw ipcSafeError(error);
        }
    };
}

const SHORT_CODE = /^[A-Za-z0-9_]{1,40}$/;
/** OAuth error codes (invalid_grant) and API reasons (rateLimitExceeded): short words, never free text. */
const REASON = /^[A-Za-z_]{1,40}$/;

function field(value: unknown, key: string): unknown {
    return typeof value === 'object' && value !== null ? Reflect.get(value, key) : undefined;
}
