/**
 * Whether a failed Google read means Google could not answer now, rather than
 * that it refused this request for good. The Calendar's reads fail on the first
 * and skip what refused (api.ts): an empty answer for an unreachable Google was
 * cached as the month and blanked the calendar until a later refresh worked.
 *
 * | The failure                                                   | Means       |
 * |---------------------------------------------------------------|-------------|
 * | no HTTP answer: gaxios raised it without a response (DNS,     | unreachable |
 * | reset, refused, TLS, a timeout or an abort, which has no code)|             |
 * | HTTP 408, 429 or 5xx                                          | unreachable |
 * | HTTP 403 whose reason is a rate limit or a quota              | unreachable |
 * | any other HTTP status: 400, 401, 403, 404, 410...             | refused     |
 * | not a request: signed out under the read (the auth library's  | refused     |
 * | "No refresh token is set.", a retired client), anything else  |             |
 *
 * `invalid_grant` is a 400 from the token endpoint: refused here, and handled
 * by auth-client.ts, which signs out.
 */
export function isGoogleUnreachable(error: unknown): boolean {
    const response = field(error, 'response');
    const status = field(response, 'status');
    if (typeof status !== 'number') return response === undefined && field(error, 'config') !== undefined;
    if (status === 408 || status === 429 || (status >= 500 && status <= 599)) return true;
    return status === 403 && reasons(response).some(reason => RATE_LIMITS.has(reason));
}

/** Google's usage-limit reasons (domain `usageLimits`): the request is fine, only not now. */
const RATE_LIMITS = new Set(['rateLimitExceeded', 'userRateLimitExceeded', 'dailyLimitExceeded', 'quotaExceeded']);

/** An API error body: { error: { code, message, errors: [{ domain, reason }] } }. */
function reasons(response: unknown): string[] {
    const errors = field(field(field(response, 'data'), 'error'), 'errors');
    return Array.isArray(errors) ? errors.map(e => field(e, 'reason')).filter((r): r is string => typeof r === 'string') : [];
}

function field(value: unknown, key: string): unknown {
    return typeof value === 'object' && value !== null ? Reflect.get(value, key) : undefined;
}
