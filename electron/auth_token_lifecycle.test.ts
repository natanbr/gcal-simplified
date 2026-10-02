// ============================================================
// Google OAuth — token LIFECYCLE (calendar app)
// ------------------------------------------------------------
// Regression tests for "the calendar makes me sign in again every couple of
// days". The existing auth_security.test.ts covers the *security* of the login
// flow (CSRF state validation); nothing covered what happens to the credential
// afterwards, where three of the bugs lived (the fourth, the tokens never
// loading on a relaunch, is in auth_app_ready.test.ts):
//
//   1. `saveTokens` wrote the refresh response verbatim, destroying the stored
//      refresh_token (Google only issues one on the FIRST consent).
//   2. `generateAuthUrl` had no `prompt: 'consent'`, so re-authing an
//      already-authorised account returned no refresh_token at all.
//   3. No `oauth2Client.on('tokens')` listener, so refreshed credentials were
//      never persisted and the stored blob went stale.
//
// Since 2026-10-01 the save runs on every hourly refresh, so its failure paths
// are covered too: the refresh_token comes from the client (a re-read of the
// store could lose it), a failed write never falls back to plain text, a store
// error never escapes the library's 'tokens' emit, and sign-out clears the
// client before the store.
// ============================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import http from 'node:http';
import type { Credentials } from 'google-auth-library';

const mocks = vi.hoisted(() => {
    const storeData = new Map<string, unknown>();
    return {
        storeData,
        storeInstance: {
            get: vi.fn((key: string) => storeData.get(key)),
            set: vi.fn((keyOrValues: string | Record<string, unknown>, value?: unknown) => {
                const entries = typeof keyOrValues === 'string' ? [[keyOrValues, value] as const] : Object.entries(keyOrValues);
                for (const [key, entry] of entries) storeData.set(key, entry);
            }),
            delete: vi.fn((key: string) => storeData.delete(key)),
        },
        safeStorage: {
            // Plaintext path — keeps assertions about the stored value readable.
            isEncryptionAvailable: vi.fn().mockReturnValue(false),
            encryptString: vi.fn(),
            decryptString: vi.fn(),
        },
        shell: { openExternal: vi.fn() },
        oauthCalls: {
            generateAuthUrl: vi.fn().mockReturnValue('http://auth-url'),
            setCredentials: vi.fn(),
            getToken: vi.fn().mockResolvedValue({ tokens: {} }),
            on: vi.fn(),
        },
    };
});

vi.mock('electron', () => ({
    shell: mocks.shell,
    safeStorage: mocks.safeStorage,
    app: { getPath: () => '/tmp', isReady: () => true },
}));

vi.mock('electron-store', () => ({
    default: class MockStore {
        get = mocks.storeInstance.get;
        set = mocks.storeInstance.set;
        delete = mocks.storeInstance.delete;
    },
}));

vi.mock('googleapis', () => ({
    google: {
        auth: {
            OAuth2: class {
                credentials: Credentials = {};
                generateAuthUrl = mocks.oauthCalls.generateAuthUrl;
                setCredentials = (credentials: Credentials) => {
                    this.credentials = credentials;
                    mocks.oauthCalls.setCredentials(credentials);
                };
                getToken = mocks.oauthCalls.getToken;
                on = mocks.oauthCalls.on;
            },
        },
    },
}));

const { AuthService } = await import('./auth');

const EPERM = () => Object.assign(new Error('EPERM: operation not permitted'), { code: 'EPERM' });

/** Reads back whatever the service last persisted. */
function storedTokens(): Record<string, unknown> | undefined {
    return mocks.storeData.get('tokens') as Record<string, unknown> | undefined;
}

/** The service's 'tokens' listener: what google-auth-library calls on a code exchange or a refresh. */
function tokensListener(): (tokens: Credentials) => void {
    const [, listener] = mocks.oauthCalls.on.mock.calls.find(([event]) => event === 'tokens')!;
    return listener;
}

/** A service whose OAuth client already holds these credentials (signed in, mid-session). */
function signedIn(credentials: Credentials) {
    const service = new AuthService();
    service['oauth2Client'].setCredentials(credentials);
    return service;
}

function encryptionOn(): void {
    mocks.safeStorage.isEncryptionAvailable.mockReturnValue(true);
    mocks.safeStorage.encryptString.mockImplementation((s: string) => Buffer.from(s, 'utf-8'));
    mocks.safeStorage.decryptString.mockImplementation((b: Buffer) => b.toString('utf-8'));
}

describe('OAuth token lifecycle', () => {
    beforeEach(() => {
        mocks.storeData.clear();
        vi.clearAllMocks();
        mocks.storeInstance.set.mockReset();
        mocks.storeInstance.delete.mockReset();
        mocks.safeStorage.isEncryptionAvailable.mockReturnValue(false);
    });

    describe('refresh_token preservation', () => {
        it('keeps the client\'s refresh_token when the new credentials omit one', () => {
            const service = signedIn({ access_token: 'old-access', refresh_token: 'THE-ONLY-REFRESH-TOKEN', expiry_date: 1 });
            // A refresh response: new access token, NO refresh token.
            service['saveTokens']({ access_token: 'new-access', expiry_date: 2 });

            expect(storedTokens()?.refresh_token).toBe('THE-ONLY-REFRESH-TOKEN');
            expect(storedTokens()?.access_token).toBe('new-access');
        });

        it('takes it from the client, not from a re-read of the store (here unreadable)', () => {
            mocks.storeData.set('tokens', 'ciphertext this machine cannot decrypt');
            mocks.storeData.set('isEncrypted', true);
            const service = signedIn({ access_token: 'old-access', refresh_token: 'THE-ONLY-REFRESH-TOKEN' });

            service['saveTokens']({ access_token: 'new-access' });

            expect(storedTokens()?.refresh_token).toBe('THE-ONLY-REFRESH-TOKEN');
        });

        it('accepts a new refresh_token when one IS supplied (first consent / rotation)', () => {
            const service = signedIn({ refresh_token: 'old-refresh' });
            service['saveTokens']({ access_token: 'a', refresh_token: 'rotated-refresh' });

            expect(storedTokens()?.refresh_token).toBe('rotated-refresh');
        });

        it('stores cleanly on a first-ever login with nothing saved yet', () => {
            const service = new AuthService();
            service['saveTokens']({ access_token: 'a', refresh_token: 'first-refresh' });

            expect(storedTokens()?.refresh_token).toBe('first-refresh');
        });
    });

    describe('refresh persistence', () => {
        it('registers a tokens listener so in-memory refreshes reach the store', () => {
            new AuthService();
            expect(mocks.oauthCalls.on).toHaveBeenCalledWith('tokens', expect.any(Function));
        });

        it('persists credentials handed to it by that listener', () => {
            signedIn({ refresh_token: 'keep-me', access_token: 'stale' });

            tokensListener()({ access_token: 'freshly-refreshed', expiry_date: 999 });

            expect(storedTokens()?.access_token).toBe('freshly-refreshed');
            // ...and the refresh token survives that write too.
            expect(storedTokens()?.refresh_token).toBe('keep-me');
        });
    });

    describe('a failed save', () => {
        it('a write that fails leaves the file as it was: no plain-text token on disk', () => {
            encryptionOn();
            mocks.storeData.set('tokens', 'previous-encrypted-blob');
            mocks.storeData.set('isEncrypted', true);
            signedIn({ access_token: 'old-access', refresh_token: 'R' });
            // Antivirus or a backup holds auth-store.json for this one write.
            mocks.storeInstance.set.mockImplementationOnce(() => { throw EPERM(); });

            tokensListener()({ access_token: 'refreshed-access' });

            expect(mocks.storeData.get('tokens')).toBe('previous-encrypted-blob');
            expect(mocks.storeData.get('isEncrypted')).toBe(true);
        });

        it('a store error never escapes the listener, so the library still installs the granted token', () => {
            signedIn({ access_token: 'old-access', refresh_token: 'R' });
            mocks.storeInstance.set.mockImplementation(() => { throw EPERM(); });

            expect(() => tokensListener()({ access_token: 'refreshed-access' })).not.toThrow();
        });

        it('a sign-in whose save fails still signs in, and a later first read does not bring back the old store', async () => {
            mocks.storeData.set('tokens', { access_token: 'old-access', refresh_token: 'old-refresh' });
            mocks.storeData.set('isEncrypted', false);
            const service = new AuthService();
            const granted = { access_token: 'new-access', refresh_token: 'new-refresh', expiry_date: Date.now() + 3_600_000 };
            // Like google-auth-library: the code exchange emits 'tokens' synchronously before resolving.
            mocks.oauthCalls.getToken.mockImplementationOnce(async () => {
                tokensListener()({ ...granted });
                return { tokens: { ...granted } };
            });
            mocks.storeInstance.set.mockImplementation(() => { throw EPERM(); });

            const signingIn = service.startAuth();
            await vi.waitFor(() => expect(mocks.oauthCalls.generateAuthUrl).toHaveBeenCalled());
            const { redirect_uri, state } = mocks.oauthCalls.generateAuthUrl.mock.calls[0][0];
            await new Promise<void>((resolve, reject) => {
                http.get(`${redirect_uri}?code=one-time-code&state=${state}`, res => { res.resume(); res.on('end', resolve); })
                    .on('error', reject);
            });

            await expect(signingIn).resolves.toBeUndefined();
            expect(service.isAuthenticated()).toBe(true);
            expect(service.getAuthClient().credentials.access_token).toBe('new-access');
        });
    });

    describe('sign-out', () => {
        it('clears the client first, so a store delete that throws cannot leave it signed in', () => {
            mocks.storeData.set('tokens', { refresh_token: 'R' });
            mocks.storeData.set('isEncrypted', false);
            const service = new AuthService();
            expect(service.isAuthenticated()).toBe(true);
            mocks.storeInstance.delete.mockImplementationOnce(() => { throw EPERM(); });

            expect(() => service.logout()).toThrow('EPERM');

            expect(service.isAuthenticated()).toBe(false);
        });
    });

    describe('consent prompt', () => {
        it('forces the consent screen so a re-auth actually returns a refresh_token', async () => {
            const service = new AuthService();
            // startAuth spins up a local HTTP server; we only care that the URL
            // was generated with the right params, so let it run and inspect.
            service.startAuth().catch(() => { /* no callback ever arrives in test */ });
            await vi.waitFor(() => expect(mocks.oauthCalls.generateAuthUrl).toHaveBeenCalled());

            const params = mocks.oauthCalls.generateAuthUrl.mock.calls[0][0];
            expect(params.access_type).toBe('offline');
            expect(params.prompt).toBe('consent');
        });
    });

    describe('encrypted storage path', () => {
        it('preserves the refresh_token when safeStorage encryption is in use', () => {
            encryptionOn();
            const service = signedIn({ access_token: 'old', refresh_token: 'encrypted-refresh' });
            service['saveTokens']({ access_token: 'new' });

            expect(mocks.storeData.get('isEncrypted')).toBe(true);
            const raw = JSON.parse(
                Buffer.from(mocks.storeData.get('tokens') as string, 'base64').toString('utf-8')
            );
            expect(raw.refresh_token).toBe('encrypted-refresh');
            expect(raw.access_token).toBe('new');
        });
    });
});
