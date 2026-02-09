import { shell } from 'electron';
import { google } from 'googleapis';
import Store from 'electron-store';
import http from 'http';
import url from 'url';
import { OAuth2Client, Credentials } from 'google-auth-library';

interface AuthStore {
    tokens?: Credentials;
}

const store = new Store<AuthStore>();

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
            process.env.GOOGLE_CLIENT_SECRET,
            'http://localhost/callback' // Redirect URI placeholder
        );

        // Load saved tokens
        const tokens = store.get('tokens');
        if (tokens) {
            this.oauth2Client.setCredentials(tokens);
        }
    }

    getAuthClient() {
        return this.oauth2Client;
    }

    isAuthenticated() {
        const tokens = store.get('tokens');
        return !!tokens;
    }

    async startAuth(): Promise<void> {
        return new Promise((resolve, reject) => {
            // 1. Spin up local server to catch callback
            const server = http.createServer(async (req, res) => {
                try {
                    if (!req.url) return;
                    const queryObject = url.parse(req.url, true).query;
                    const { code } = queryObject;

                    if (code) {
                        // 4. Exchange code for tokens
                        const address = server.address();
                        const port = address && typeof address !== 'string' ? address.port : 0;
                        const redirectUri = `http://localhost:${port}/callback`;

                        const { tokens } = await this.oauth2Client.getToken({
                            code: code as string,
                            redirect_uri: redirectUri
                        });
                        this.oauth2Client.setCredentials(tokens);
                        store.set('tokens', tokens); // Persist

                        res.end('Authentication successful! You can close this window.');

                        // Notify via IPC
                        resolve();
                    }
                } catch (e) {
                    reject(e);
                    res.end('Authentication failed.');
                } finally {
                    server.close();
                }
            });

            server.on('error', (err) => {
                reject(err);
            });

            server.listen(0, () => {
                const address = server.address();
                const port = address && typeof address !== 'string' ? address.port : 0;
                console.log(`Auth server listening on port ${port}`);

                const redirectUri = `http://localhost:${port}/callback`;

                // 2. Generate Auth URL
                const authUrl = this.oauth2Client.generateAuthUrl({
                    access_type: 'offline', // Crucial for refresh token
                    scope: SCOPES,
                    redirect_uri: redirectUri
                });

                // 3. Open in System Browser
                shell.openExternal(authUrl);
            });
        });
    }

    logout() {
        store.delete('tokens');
        this.oauth2Client.setCredentials({});
    }
}

export const authService = new AuthService();
