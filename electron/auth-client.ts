import { google } from 'googleapis';

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
        // forceRefreshOnFailure: a revoke can kill the access token before it
        // expires, and without it a 401 on a token that has an expiry_date never
        // refreshes, so the refusal above would surface only up to an hour later.
        // The library refreshes and retries once per 401/403, never in a loop.
        super({ clientId, clientSecret, forceRefreshOnFailure: true });
        this.onRefusedGrant = onRefusedGrant;
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
