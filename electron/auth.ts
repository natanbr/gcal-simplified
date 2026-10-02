import { app, shell, safeStorage } from 'electron';
import { google } from 'googleapis';
import Store from 'electron-store';
import http from 'http';
import { AddressInfo } from 'net';
import { OAuth2Client, Credentials } from 'google-auth-library';
import crypto from 'node:crypto';

interface AuthStore {
    tokens?: Credentials | string;
    isEncrypted?: boolean;
}

const store = new Store<AuthStore>({ name: 'auth-store' });

const SCOPES = [
    'https://www.googleapis.com/auth/calendar.readonly',
    'https://www.googleapis.com/auth/tasks.readonly'
];

/** google-auth-library's eagerRefreshThresholdMillis: an access token this close to expiry is refreshed, not sent. */
const REFRESH_MARGIN_MS = 5 * 60 * 1000;

/**
 * Whether these credentials can authorize a Google call: a refresh token, or an
 * access token the client will still send. An expired access token with no
 * refresh token is not a sign-in (every call fails "No refresh token is set."),
 * and neither is a parsed `42`, `null` or `{}`.
 */
function canAuthorize(value: unknown): value is Credentials {
    if (typeof value !== 'object' || value === null) return false;
    if ('refresh_token' in value && typeof value.refresh_token === 'string' && value.refresh_token !== '') return true;
    return 'access_token' in value && typeof value.access_token === 'string' && value.access_token !== ''
        && 'expiry_date' in value && typeof value.expiry_date === 'number'
        && value.expiry_date > Date.now() + REFRESH_MARGIN_MS;
}

export class AuthService {
    private oauth2Client: OAuth2Client;
    private isAuthInProgress: boolean = false;
    private credentialsLoaded = false;

    constructor() {
        // These will be loaded from env vars or a separate config file
        // For now, we expect them to be available in process.env
        this.oauth2Client = new google.auth.OAuth2(
            process.env.GOOGLE_CLIENT_ID,
            process.env.GOOGLE_CLIENT_SECRET
        );

        // google-auth-library refreshes the access token in memory and never
        // tells the store about it. This listener persists every refresh, so the
        // stored blob stays current and a rotated refresh_token survives a
        // restart. (It was once credited with the "sign in again every few days"
        // symptom; the more likely cause was the credentials never loading on a
        // relaunch, fixed 2026-10-01: see ensureCredentialsLoaded.)
        // It runs inside the library's synchronous emit, before the library
        // installs the tokens, so a store error must not escape it: that would
        // throw away a grant Google already made.
        this.oauth2Client.on('tokens', (granted) => {
            try {
                this.saveTokens(granted);
            } catch (error) {
                console.error('Failed to save the Google tokens; they stay in memory until the next save', error);
            }
        });
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
        const tokens = this.loadTokens();
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
     *
     * Plain text only when this platform has no encryption (Linux without a
     * keyring) or encrypting throws. A failed write throws and leaves the file as
     * it was: falling back to plain text there wrote the refresh token to disk
     * unencrypted.
     */
    private saveTokens(granted: Credentials) {
        const refreshToken = granted.refresh_token ?? this.oauth2Client.credentials.refresh_token;
        const tokens = refreshToken ? { ...granted, refresh_token: refreshToken } : granted;
        store.set(this.encrypted(tokens) ?? { tokens, isEncrypted: false });
    }

    private encrypted(tokens: Credentials): AuthStore | null {
        if (!safeStorage.isEncryptionAvailable()) return null;
        try {
            return { tokens: safeStorage.encryptString(JSON.stringify(tokens)).toString('base64'), isEncrypted: true };
        } catch (error) {
            console.error('Failed to encrypt tokens', error);
            return null;
        }
    }

    private loadTokens(): Credentials | null {
        const stored = store.get('tokens');
        const isEncrypted = store.get('isEncrypted');

        if (!stored) return null;

        if (isEncrypted && typeof stored === 'string' && safeStorage.isEncryptionAvailable()) {
            try {
                const buffer = Buffer.from(stored, 'base64');
                const parsed: unknown = JSON.parse(safeStorage.decryptString(buffer));
                return canAuthorize(parsed) ? parsed : null;
            } catch (e) {
                console.error('Failed to decrypt tokens', e);
                return null;
            }
        } else if (typeof stored === 'object') {
            // Unencrypted object (legacy or fallback)
            return canAuthorize(stored) ? stored : null;
        }

        return null;
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
        this.oauth2Client.setCredentials({});
        this.credentialsLoaded = true;
        store.delete('tokens');
        store.delete('isEncrypted');
    }
}

export const authService = new AuthService();
