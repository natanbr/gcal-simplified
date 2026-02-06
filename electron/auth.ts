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
            'http://localhost:3000/callback' // Redirect URI
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
            // 1. Generate Auth URL
            const authUrl = this.oauth2Client.generateAuthUrl({
                access_type: 'offline', // Crucial for refresh token
                scope: SCOPES,
            });

            // 2. Open in System Browser
            shell.openExternal(authUrl);

            // 3. Spin up local server to catch callback
            const server = http.createServer(async (req, res) => {
                try {
                    if (!req.url) return;
                    const queryObject = url.parse(req.url, true).query;
                    const { code } = queryObject;

                    if (code) {
                        // 4. Exchange code for tokens
                        const { tokens } = await this.oauth2Client.getToken(code as string);
                        this.oauth2Client.setCredentials(tokens);
                        store.set('tokens', tokens); // Persist

                        res.end('Authentication successful! You can close this window.');

                        // Notify via IPC (we'll assume the caller handles the IPC reply)
                        // Or better, we resolve the promise and the main process sends the event
                        resolve();
                    }
                } catch (e) {
                    reject(e);
                    res.end('Authentication failed.');
                } finally {
                    server.close();
                }
            });

            server.listen(3000, () => {
                console.log('Auth server listening on port 3000');
            });
        });
    }

    logout() {
        store.delete('tokens');
        this.oauth2Client.setCredentials({});
    }
}

export const authService = new AuthService();
