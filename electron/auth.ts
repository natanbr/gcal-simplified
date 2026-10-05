import { app, shell } from 'electron';
import http from 'http';
import { AddressInfo } from 'net';
import { OAuth2Client, Credentials } from 'google-auth-library';
import crypto from 'node:crypto';
import { canAuthorize, clearStoredTokens, readStoredTokens, writeStoredTokens } from './auth-token-store';
import { GoogleOAuthClient } from './auth-client';

const SCOPES = [
    'https://www.googleapis.com/auth/calendar.readonly',
    'https://www.googleapis.com/auth/tasks.readonly'
];

export class AuthService {
    private oauth2Client: OAuth2Client;
    private isAuthInProgress: boolean = false;
    private credentialsLoaded = false;
    private readonly signedOutListeners = new Set<() => void>();

    constructor() {
        this.oauth2Client = this.newClient();
    }

    /**
     * One client per sign-in: a sign-out, or Google refusing the grant, replaces
     * it, and a client that is no longer current is ignored. A token refresh
     * still in flight when the user clicks Reconnect then lands on a client
     * nobody uses. Ignoring its 'tokens' event alone would not do: the library
     * installs the refresh on its client after the event, with the refresh token
     * it finds there (none, after a sign-out), so the old account came back for
     * an hour on an access token that could not be renewed.
     */
    private newClient(): OAuth2Client {
        const client: OAuth2Client = new GoogleOAuthClient(
            process.env.GOOGLE_CLIENT_ID,
            process.env.GOOGLE_CLIENT_SECRET,
            () => this.refused(client),
        );

        // google-auth-library refreshes the access token in memory and never
        // tells the store about it. This listener persists every refresh, so the
        // stored blob stays current and a rotated refresh_token survives a
        // restart. It runs inside the library's synchronous emit, before the
        // library installs the tokens, so a store error must not escape it: that
        // would throw away a grant Google already made.
        client.on('tokens', (granted) => {
            if (client !== this.oauth2Client) return;
            try {
                this.saveTokens(granted);
            } catch (error) {
                console.error('Failed to save the Google tokens; they stay in memory until the next save', error);
            }
        });
        return client;
    }

    /**
     * Google refused the saved refresh token (revoked, or expired): signed out,
     * exactly as logout() leaves it, and the listeners (the window) are told, so
     * the parent sees Sign in instead of an empty week. Never throws: it runs
     * inside the library's refresh, whose own error must reach the caller.
     */
    private refused(client: OAuth2Client): void {
        if (client !== this.oauth2Client) return;
        console.warn('[auth] Google refused the saved sign-in (revoked or expired); signing out.');
        try {
            this.logout();
        } catch (error) {
            console.error('[auth] Could not clear the saved Google tokens; the next launch will be refused again', error);
        }
        for (const listener of this.signedOutListeners) {
            try {
                listener();
            } catch (error) {
                console.error('[auth] A signed-out listener failed', error);
            }
        }
    }

    /** Told when Google ends the sign-in, never for a sign-out the user asked for. Returns the unsubscribe. */
    onSignedOut(listener: () => void): () => void {
        this.signedOutListeners.add(listener);
        return () => { this.signedOutListeners.delete(listener); };
    }

    /**
     * Loads the stored credentials into the client, once, on first use.
     *
     * Never in the constructor: the singleton is built when main.js is imported,
     * before Electron's `app` is ready, and safeStorage cannot decrypt then (on
     * Windows isEncryptionAvailable() is false and decryptString throws). Loading
     * there started every relaunch with an empty client while isAuthenticated()
     * said "signed in": an empty week with no error. Before ready this throws,
     * because answering "signed out" would be a lie.
     *
     * Sign-in and sign-out mark the credentials loaded: a save can fail and leave
     * the store behind the client, and a later first load must not overwrite them.
     */
    private ensureCredentialsLoaded(): void {
        if (this.credentialsLoaded) return;
        if (!app.isReady()) {
            throw new Error('Google credentials were requested before the app is ready; safeStorage cannot decrypt them yet.');
        }
        const tokens = readStoredTokens();
        // Set only once the read returned: a store read that throws (the file
        // held by antivirus or a backup) is retried by the next call instead of
        // answering "signed out" until a restart.
        this.credentialsLoaded = true;
        if (tokens) this.oauth2Client.setCredentials(tokens);
    }

    /**
     * Persists credentials, preserving the refresh_token when the incoming set
     * does not carry one.
     *
     * Google issues a refresh_token only on the FIRST consent. Every later grant
     * and every refresh response omits it, so writing the response verbatim
     * destroys the only long-lived credential we have — and the next start finds
     * an access token that is already expired with nothing to renew it from.
     * The kept one comes from the client, which still holds the previous set
     * when the library emits 'tokens' (as its own refresh does), never from a
     * re-read of the store, which can fail and lose it.
     */
    private saveTokens(granted: Credentials) {
        const refreshToken = granted.refresh_token ?? this.oauth2Client.credentials.refresh_token;
        const tokens = refreshToken ? { ...granted, refresh_token: refreshToken } : granted;
        writeStoredTokens(tokens);
    }

    getAuthClient() {
        this.ensureCredentialsLoaded();
        return this.oauth2Client;
    }

    /** Answers from the client's own credentials, so it never says "signed in" while the client holds none. */
    isAuthenticated() {
        this.ensureCredentialsLoaded();
        return canAuthorize(this.oauth2Client.credentials);
    }

    async startAuth(): Promise<void> {
        if (this.isAuthInProgress) {
            return Promise.reject(new Error('Authentication is already in progress.'));
        }
        this.isAuthInProgress = true;

        const authPromise = new Promise<void>((resolve, reject) => {
            // Generate a secure random state token for CSRF protection
            const state = crypto.randomBytes(32).toString('hex');
            let redirectUri = '';

            // Spin up local server to catch callback
            const server = http.createServer(async (req, res) => {
                try {
                    if (!req.url) {
                        res.end();
                        return;
                    }

                    const requestUrl = new URL(req.url, 'http://127.0.0.1');

                    // Ignore favicon and other noise - only handle the callback path
                    if (requestUrl.pathname !== '/callback') {
                        res.writeHead(404);
                        res.end('Not found');
                        return;
                    }

                    const code = requestUrl.searchParams.get('code');
                    const returnedState = requestUrl.searchParams.get('state');
                    const error = requestUrl.searchParams.get('error');

                    if (error) {
                        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
                        // Sanitize error just in case, though text/plain makes it safe
                        const sanitizedError = error.replace(/[<>]/g, '');
                        res.end('Authentication failed: ' + sanitizedError);
                        reject(new Error(error));
                        server.close();
                        return;
                    }

                    // Validate state parameter to prevent CSRF
                    if (!returnedState || returnedState !== state) {
                        console.error('State mismatch in OAuth callback');
                        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
                        res.writeHead(403);
                        res.end('Authentication failed: Invalid state parameter.');
                        reject(new Error('Invalid state parameter'));
                        server.close();
                        return;
                    }

                    if (code) {
                        // Exchange code for tokens
                        const { tokens } = await this.oauth2Client.getToken({
                            code: code,
                            redirect_uri: redirectUri
                        });
                        // getToken already saved them, through the 'tokens' listener.
                        this.oauth2Client.setCredentials(tokens);
                        this.credentialsLoaded = true;

                        res.setHeader('Content-Type', 'text/html; charset=utf-8');
                        res.end('<h1>Authentication successful!</h1><p>You can close this window.</p><script>window.close()</script>');

                        // Notify via IPC (we'll assume the caller handles the IPC reply)
                        // Or better, we resolve the promise and the main process sends the event
                        resolve();
                        server.close();
                    }
                } catch (e) {
                    reject(e);
                    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
                    res.end('Authentication failed.');
                    server.close();
                }
            });

            // Listen on random port (0) and loopback address
            const timeoutHandle = setTimeout(() => {
                reject(new Error('Authentication timed out.'));
                server.close();
            }, 5 * 60 * 1000); // 5 minutes timeout

            server.listen(0, '127.0.0.1', () => {
                const address = server.address() as AddressInfo;
                if (address) {
                    const port = address.port;
                    redirectUri = `http://127.0.0.1:${port}/callback`;

                    // Generate Auth URL
                    const authUrl = this.oauth2Client.generateAuthUrl({
                        access_type: 'offline', // Crucial for refresh token
                        // Force the consent screen. Without it a re-auth of an
                        // already-authorised account returns NO refresh_token,
                        // so the session dies again as soon as the access token
                        // expires — the "signed in, then signed out again" loop.
                        prompt: 'consent',
                        scope: SCOPES,
                        redirect_uri: redirectUri,
                        state: state // Include state parameter
                    });

                    // Open in System Browser
                    shell.openExternal(authUrl);
                } else {
                    reject(new Error('Failed to get server address'));
                    server.close();
                }
            });

            server.on('close', () => {
                clearTimeout(timeoutHandle);
            });

            server.on('error', (err) => {
                reject(err);
                server.close();
            });
        });

        return authPromise.finally(() => {
            this.isAuthInProgress = false;
        });
    }

    logout() {
        // The client first: a store delete that throws must not leave it signed in.
        const previous = this.oauth2Client;
        this.oauth2Client = this.newClient();
        // A read still holding it (api.ts keeps one across calendarList and
        // events.list) must not send the old account's tokens to Google again.
        previous.setCredentials({});
        this.credentialsLoaded = true;
        clearStoredTokens();
    }
}

export const authService = new AuthService();
