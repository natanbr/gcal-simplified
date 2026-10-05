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
    const oauthError = field(field(response, 'data'), 'error');
    const name = field(error, 'name');
    const parts = [
        typeof status === 'number' ? `status ${status}` : null,
        (typeof code === 'string' || typeof code === 'number') && SHORT_CODE.test(String(code)) ? String(code) : null,
        typeof oauthError === 'string' && OAUTH_ERROR.test(oauthError) ? oauthError : null,
    ].filter((part): part is string => part !== null);
    if (parts.length > 0) return parts.join(' ');
    return typeof name === 'string' && SHORT_CODE.test(name) ? name : 'unknown error';
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
const OAUTH_ERROR = /^[a-z_]{1,40}$/;

function field(value: unknown, key: string): unknown {
    return typeof value === 'object' && value !== null ? Reflect.get(value, key) : undefined;
}
