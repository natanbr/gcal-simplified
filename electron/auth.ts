import { shell, safeStorage } from 'electron';
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

export class AuthService {
    private oauth2Client: OAuth2Client;

    constructor() {
        // These will be loaded from env vars or a separate config file
        // For now, we expect them to be available in process.env
        this.oauth2Client = new google.auth.OAuth2(
            process.env.GOOGLE_CLIENT_ID,
            process.env.GOOGLE_CLIENT_SECRET
        );

        // Load saved tokens
        const tokens = this.loadTokens();
        if (tokens) {
            this.oauth2Client.setCredentials(tokens);
        }
    }

    private saveTokens(tokens: Credentials) {
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
                const decrypted = safeStorage.decryptString(buffer);
                return JSON.parse(decrypted);
            } catch (e) {
                console.error('Failed to decrypt tokens', e);
                return null;
            }
        } else if (typeof stored === 'object') {
            // Unencrypted object (legacy or fallback)
            return stored as Credentials;
        }

        return null;
    }

    getAuthClient() {
        return this.oauth2Client;
    }

    isAuthenticated() {
        const tokens = this.loadTokens();
        return !!tokens;
    }

    async startAuth(): Promise<void> {
        return new Promise((resolve, reject) => {
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
            server.listen(0, '127.0.0.1', () => {
                const address = server.address() as AddressInfo;
                if (address) {
                    const port = address.port;
                    redirectUri = `http://127.0.0.1:${port}/callback`;

                    // Generate Auth URL
                    const authUrl = this.oauth2Client.generateAuthUrl({
                        access_type: 'offline', // Crucial for refresh token
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

            server.on('error', (err) => {
                reject(err);
                server.close();
            });
        });
    }

    logout() {
        store.delete('tokens');
        store.delete('isEncrypted');
        this.oauth2Client.setCredentials({});
    }
}

export const authService = new AuthService();
