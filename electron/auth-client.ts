import { google } from 'googleapis';
import { Readable } from 'node:stream';
import type { OAuth2Client } from 'google-auth-library';

/** What OAuth2Client.request takes (gaxios's options; gaxios is not a direct dependency). */
type RequestOptions = Parameters<OAuth2Client['request']>[0];

function field(value: unknown, key: string): unknown {
    return typeof value === 'object' && value !== null ? Reflect.get(value, key) : undefined;
}

/**
 * Whether Google's token endpoint refused the refresh token itself
 * (`invalid_grant`): access revoked, or the 7-day expiry while the OAuth consent
 * screen is in Testing mode. Read from the response body, not the message, which
 * the library rewrites for some of these. Offline, a 5xx or a misconfigured
 * client (`invalid_client`) is not a refusal: signing out would not fix those.
 */
export function isRefusedGrant(error: unknown): boolean {
    if (typeof error !== 'object' || error === null || !('response' in error)) return false;
    const { response } = error;
    if (typeof response !== 'object' || response === null || !('data' in response)) return false;
    const { data } = response;
    return typeof data === 'object' && data !== null && 'error' in data && data.error === 'invalid_grant';
}

/**
 * google-auth-library's OAuth client, telling its owner when Google refuses the
 * refresh token. It hooks the library's one refresh request, so a failed code
 * exchange during a sign-in is never mistaken for a revoked grant. `override`
 * turns a rename in a library upgrade into a tsc error instead of a silent no-op.
 * The library leaves its credentials in place after a refusal, so without this
 * "signed in?" kept answering yes over an empty week.
 */
export class GoogleOAuthClient extends google.auth.OAuth2 {
    private readonly onRefusedGrant: () => void;
    private retired = false;

    constructor(clientId: string | undefined, clientSecret: string | undefined, onRefusedGrant: () => void) {
        super({ clientId, clientSecret });
        this.onRefusedGrant = onRefusedGrant;
    }

    /**
     * A 401 is the access token refused: ask for a new one once and retry once,
     * so a revoke that also killed a still-valid access token reaches the token
     * endpoint, and the refusal hook below, on the first read. The library does
     * that only for a token with no expiry_date, or with forceRefreshOnFailure,
     * which covers a 403 too, and a 403 that keeps coming back (a quota, a scope
     * left unchecked) would then refresh and save the tokens on every poll.
     */
    protected override async requestAsync<T>(opts: RequestOptions, reAuthRetried = false) {
        try {
            return await super.requestAsync<T>(opts, true); // true: the library's own refresh-and-retry stays off
        } catch (error) {
            const status = field(error, 'status') ?? field(field(error, 'response'), 'status');
            // A stream body cannot be sent twice; the library skips those too.
            if (reAuthRetried || status !== 401 || !this.credentials.refresh_token || opts.data instanceof Readable) throw error;
            await this.refreshAccessToken();
            return super.requestAsync<T>(opts, true);
        }
    }

    /**
     * Signed out: emptied, and a refresh still in flight is dropped. Emptying
     * alone is not enough: the library installs a refresh's result on the client
     * after its await, so a read holding this client would otherwise reach
     * Google as the signed-out account.
     */
    retire(): void {
        this.retired = true;
        this.setCredentials({});
    }

    protected override async refreshTokenNoCache(refreshToken?: string | null) {
        let refreshed;
        try {
            refreshed = await super.refreshTokenNoCache(refreshToken);
        } catch (error) {
            if (isRefusedGrant(error)) this.onRefusedGrant();
            throw error;
        }
        if (this.retired) throw new Error('Signed out of Google while this token refresh was running.');
        return refreshed;
    }
}
