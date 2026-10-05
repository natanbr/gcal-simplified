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

const SHORT_CODE = /^[A-Za-z0-9_]{1,40}$/;
const OAUTH_ERROR = /^[a-z_]{1,40}$/;

function field(value: unknown, key: string): unknown {
    return typeof value === 'object' && value !== null ? Reflect.get(value, key) : undefined;
}
