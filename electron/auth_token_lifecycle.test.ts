// ============================================================
// Google OAuth — token LIFECYCLE (calendar app)
// ------------------------------------------------------------
// Regression tests for "the calendar makes me sign in again every couple of
// days". The existing auth_security.test.ts covers the *security* of the login
// flow (CSRF state validation); nothing covered what happens to the credential
// afterwards, which is where all three bugs lived:
//
//   1. `saveTokens` wrote the refresh response verbatim, destroying the stored
//      refresh_token (Google only issues one on the FIRST consent).
//   2. `generateAuthUrl` had no `prompt: 'consent'`, so re-authing an
//      already-authorised account returned no refresh_token at all.
//   3. No `oauth2Client.on('tokens')` listener, so refreshed credentials were
//      never persisted and the stored blob went stale.
// ============================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => {
    const storeData = new Map<string, unknown>();
    return {
        storeData,
        storeInstance: {
            get: vi.fn((key: string) => storeData.get(key)),
            set: vi.fn((key: string, value: unknown) => storeData.set(key, value)),
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
    app: { getPath: () => '/tmp' },
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
                generateAuthUrl = mocks.oauthCalls.generateAuthUrl;
                setCredentials = mocks.oauthCalls.setCredentials;
                getToken = mocks.oauthCalls.getToken;
                on = mocks.oauthCalls.on;
            },
        },
    },
}));

const { AuthService } = await import('./auth');

/** Reads back whatever the service last persisted. */
function storedTokens(): Record<string, unknown> | undefined {
    return mocks.storeData.get('tokens') as Record<string, unknown> | undefined;
}

describe('OAuth token lifecycle', () => {
    beforeEach(() => {
        mocks.storeData.clear();
        vi.clearAllMocks();
        mocks.safeStorage.isEncryptionAvailable.mockReturnValue(false);
    });

    describe('refresh_token preservation', () => {
        it('keeps the stored refresh_token when the new credentials omit one', () => {
            mocks.storeData.set('tokens', {
                access_token: 'old-access',
                refresh_token: 'THE-ONLY-REFRESH-TOKEN',
                expiry_date: 1,
            });
            mocks.storeData.set('isEncrypted', false);

            const service = new AuthService();
            // A refresh response: new access token, NO refresh token.
            (service as unknown as { saveTokens: (t: unknown) => void })
                .saveTokens({ access_token: 'new-access', expiry_date: 2 });

            expect(storedTokens()?.refresh_token).toBe('THE-ONLY-REFRESH-TOKEN');
            expect(storedTokens()?.access_token).toBe('new-access');
        });

        it('accepts a new refresh_token when one IS supplied (first consent / rotation)', () => {
            mocks.storeData.set('tokens', { refresh_token: 'old-refresh' });
            mocks.storeData.set('isEncrypted', false);

            const service = new AuthService();
            (service as unknown as { saveTokens: (t: unknown) => void })
                .saveTokens({ access_token: 'a', refresh_token: 'rotated-refresh' });

            expect(storedTokens()?.refresh_token).toBe('rotated-refresh');
        });

        it('stores cleanly on a first-ever login with nothing saved yet', () => {
            const service = new AuthService();
            (service as unknown as { saveTokens: (t: unknown) => void })
                .saveTokens({ access_token: 'a', refresh_token: 'first-refresh' });

            expect(storedTokens()?.refresh_token).toBe('first-refresh');
        });
    });

    describe('refresh persistence', () => {
        it('registers a tokens listener so in-memory refreshes reach the store', () => {
            new AuthService();
            expect(mocks.oauthCalls.on).toHaveBeenCalledWith('tokens', expect.any(Function));
        });

        it('persists credentials handed to it by that listener', () => {
            mocks.storeData.set('tokens', { refresh_token: 'keep-me', access_token: 'stale' });
            mocks.storeData.set('isEncrypted', false);

            new AuthService();
            const [, listener] = mocks.oauthCalls.on.mock.calls.find(([event]) => event === 'tokens')!;

            listener({ access_token: 'freshly-refreshed', expiry_date: 999 });

            expect(storedTokens()?.access_token).toBe('freshly-refreshed');
            // ...and the refresh token survives that write too.
            expect(storedTokens()?.refresh_token).toBe('keep-me');
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
            mocks.safeStorage.isEncryptionAvailable.mockReturnValue(true);
            mocks.safeStorage.encryptString.mockImplementation((s: string) => Buffer.from(s, 'utf-8'));
            mocks.safeStorage.decryptString.mockImplementation((b: Buffer) => b.toString('utf-8'));

            mocks.storeData.set('tokens', Buffer.from(JSON.stringify({
                access_token: 'old', refresh_token: 'encrypted-refresh',
            }), 'utf-8').toString('base64'));
            mocks.storeData.set('isEncrypted', true);

            const service = new AuthService();
            (service as unknown as { saveTokens: (t: unknown) => void })
                .saveTokens({ access_token: 'new' });

            const raw = JSON.parse(
                Buffer.from(mocks.storeData.get('tokens') as string, 'base64').toString('utf-8')
            );
            expect(raw.refresh_token).toBe('encrypted-refresh');
            expect(raw.access_token).toBe('new');
        });
    });
});
