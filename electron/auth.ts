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

/** A stored blob is a sign-in only with a token in it: a parsed `42`, `null` or `{}` is not. */
function hasToken(value: unknown): value is Credentials {
    if (typeof value !== 'object' || value === null) return false;
    return ('access_token' in value && typeof value.access_token === 'string' && value.access_token !== '')
        || ('refresh_token' in value && typeof value.refresh_token === 'string' && value.refresh_token !== '');
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
        this.oauth2Client.on('tokens', (refreshed) => {
            this.saveTokens(refreshed);
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
     * Sign-in, the tokens listener and sign-out write the client and the store
     * together, so a first load that runs after one of them reads what it wrote.
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
     */
    private saveTokens(tokens: Credentials) {
        if (!tokens.refresh_token) {
            const existing = this.loadTokens();
            if (existing?.refresh_token) {
                tokens = { ...existing, ...tokens, refresh_token: existing.refresh_token };
            }
        }

        if (safeStorage.isEncryptionAvailable()) {
            try {
                const json = JSON.stringify(tokens);
                const buffer = safeStorage.encryptString(json);
                store.set('tokens', buffer.toString('base64')); // Store as base64 string
                store.set('isEncrypted', true);
            } catch (error) {
                console.error('Failed to encrypt tokens', error);
                // Fallback to unencrypted
                store.set('tokens', tokens);
                store.set('isEncrypted', false);
            }
        } else {
            // Fallback for systems without safeStorage support
            store.set('tokens', tokens);
            store.set('isEncrypted', false);
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
                return hasToken(parsed) ? parsed : null;
            } catch (e) {
                console.error('Failed to decrypt tokens', e);
                return null;
            }
        } else if (typeof stored === 'object') {
            // Unencrypted object (legacy or fallback)
            return hasToken(stored) ? stored : null;
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
        return hasToken(this.oauth2Client.credentials);
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
                        this.oauth2Client.setCredentials(tokens);
                        this.saveTokens(tokens); // Persist securely

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
        store.delete('tokens');
        store.delete('isEncrypted');
        this.oauth2Client.setCredentials({});
    }
}

export const authService = new AuthService();
