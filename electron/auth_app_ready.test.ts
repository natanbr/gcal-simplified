// ============================================================
// Google credentials load after the app is ready (2026-10-01)
// ------------------------------------------------------------
// auth.ts builds its singleton when main.js is imported, before Electron's
// `app` is ready. On Windows safeStorage cannot decrypt then
// (isEncryptionAvailable() is false, decryptString throws), so the load in the
// constructor found nothing and the OAuth client started every relaunch with no
// credentials. isAuthenticated() re-read the store later, after ready, and said
// "signed in", so the login screen was skipped and every Google call failed with
// "No access, refresh token, API key or refresh handler callback is set": an
// empty week with no error on screen.
//
// The fake safeStorage behaves like Electron's on Windows: unusable before
// ready, a reversible cipher after it. The OAuth client is the real
// google-auth-library one; only Google's token endpoint is faked, on the
// client's own transporter, so no test can reach the network.
// ============================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import http from 'node:http';
import type { Credentials } from 'google-auth-library';

const fake = vi.hoisted(() => {
    const app = { ready: false };
    const notReady = () => new Error('safeStorage cannot be used before app is ready');
    return {
        app,
        storeData: new Map<string, unknown>(),
        safeStorage: {
            isEncryptionAvailable: vi.fn(() => app.ready),
            encryptString: vi.fn((plain: string): Buffer => {
                if (!app.ready) throw notReady();
                return Buffer.from(`enc:${plain}`, 'utf-8');
            }),
            decryptString: vi.fn((cipher: Buffer): string => {
                if (!app.ready) throw notReady();
                const text = cipher.toString('utf-8');
                if (!text.startsWith('enc:')) {
                    throw new Error('Error while decrypting the ciphertext provided to safeStorage.decryptString.');
                }
                return text.slice('enc:'.length);
            }),
        },
        /** When set, the next store read throws it (a file held by antivirus or a backup). */
        storeReadError: { next: null as Error | null },
        openExternal: vi.fn(),
        /** Google's token endpoint (code exchange and refresh). */
        tokenEndpoint: vi.fn<typeof fetch>(),
    };
});

vi.mock('electron', () => ({
    app: { isReady: () => fake.app.ready, getPath: () => '/tmp' },
    safeStorage: fake.safeStorage,
    shell: { openExternal: fake.openExternal },
}));

vi.mock('electron-store', () => ({
    default: class FakeStore {
        get = (key: string) => {
            const error = fake.storeReadError.next;
            fake.storeReadError.next = null;
            if (error) throw error;
            return fake.storeData.get(key);
        };
        set = (key: string, value: unknown) => { fake.storeData.set(key, value); };
        delete = (key: string) => { fake.storeData.delete(key); };
    },
}));

vi.mock('googleapis', async () => {
    const { OAuth2Client } = await import('google-auth-library');
    class OAuth2 extends OAuth2Client {
        constructor(clientId?: string, clientSecret?: string) {
            super({ clientId, clientSecret, transporterOptions: { fetchImplementation: fake.tokenEndpoint } });
        }
    }
    return { google: { auth: { OAuth2 } } };
});

const HOUR = 60 * 60 * 1000;
const NO_CREDENTIALS = 'No access, refresh token, API key or refresh handler callback is set';

const stored = (): Credentials => ({
    access_token: 'stored-access',
    refresh_token: 'stored-refresh',
    expiry_date: Date.now() + HOUR,
    token_type: 'Bearer',
});

function storeEncrypted(plain: string): void {
    fake.storeData.set('tokens', Buffer.from(`enc:${plain}`, 'utf-8').toString('base64'));
    fake.storeData.set('isEncrypted', true);
}

/** Decrypts what the service persisted, failing if it was written in plain text. */
function readStored(): Credentials {
    expect(fake.storeData.get('isEncrypted')).toBe(true);
    const blob = fake.storeData.get('tokens');
    if (typeof blob !== 'string') throw new Error('expected an encrypted token blob');
    const plain = Buffer.from(blob, 'base64').toString('utf-8');
    expect(plain.startsWith('enc:')).toBe(true);
    const credentials: Credentials = JSON.parse(plain.slice('enc:'.length));
    return credentials;
}

/** What main.js does on every launch: import auth.ts while the app is not ready yet. */
async function relaunch() {
    fake.app.ready = false;
    vi.resetModules();
    const { authService } = await import('./auth');
    return authService;
}

function appReady(): void {
    fake.app.ready = true;
}

function googleAnswers(body: Record<string, unknown>): void {
    fake.tokenEndpoint.mockImplementation(async () => new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'content-type': 'application/json' },
    }));
}

function get(url: URL): Promise<void> {
    return new Promise((resolve, reject) => {
        http.get(url, res => { res.resume(); res.on('end', () => resolve()); }).on('error', reject);
    });
}

async function authorization(authService: Awaited<ReturnType<typeof relaunch>>): Promise<string | null> {
    return (await authService.getAuthClient().getRequestHeaders()).get('authorization');
}

describe('Google credentials and the app-ready lifecycle', () => {
    beforeEach(() => {
        fake.storeData.clear();
        fake.storeReadError.next = null;
        fake.app.ready = false;
        vi.clearAllMocks();
        fake.tokenEndpoint.mockRejectedValue(new Error('this test expected no call to Google'));
    });

    it('importing auth.ts before the app is ready touches no safeStorage method', async () => {
        storeEncrypted(JSON.stringify(stored()));

        await relaunch();

        expect(fake.safeStorage.isEncryptionAvailable).not.toHaveBeenCalled();
        expect(fake.safeStorage.decryptString).not.toHaveBeenCalled();
        expect(fake.safeStorage.encryptString).not.toHaveBeenCalled();
    });

    it('a relaunch gives the OAuth client the stored credentials before the first Google call', async () => {
        storeEncrypted(JSON.stringify(stored()));
        const authService = await relaunch();
        appReady();

        expect(await authorization(authService)).toBe('Bearer stored-access');
    });

    it('a relaunch after the access token expired refreshes it with the stored refresh_token and keeps it encrypted', async () => {
        storeEncrypted(JSON.stringify({ ...stored(), access_token: 'expired-access', expiry_date: Date.now() - HOUR }));
        googleAnswers({ access_token: 'refreshed-access', expires_in: 3600 });
        const authService = await relaunch();
        appReady();

        expect(await authorization(authService)).toBe('Bearer refreshed-access');
        const refreshBody = new URLSearchParams(String(fake.tokenEndpoint.mock.calls[0][1]?.body));
        expect(refreshBody.get('refresh_token')).toBe('stored-refresh');
        // The tokens listener persisted the refresh, and the refresh response
        // (which carries no refresh_token) did not erase the stored one.
        expect(readStored()).toMatchObject({ access_token: 'refreshed-access', refresh_token: 'stored-refresh' });
    });

    it('isAuthenticated() answers from the credentials the client holds, decrypted once', async () => {
        storeEncrypted(JSON.stringify(stored()));
        const authService = await relaunch();
        appReady();

        expect([authService.isAuthenticated(), authService.isAuthenticated(), authService.isAuthenticated()])
            .toEqual([true, true, true]);
        expect(authService.getAuthClient().credentials.refresh_token).toBe('stored-refresh');
        expect(fake.safeStorage.decryptString).toHaveBeenCalledTimes(1);
    });

    it('a legacy plain-text blob still signs in', async () => {
        fake.storeData.set('tokens', stored());
        fake.storeData.set('isEncrypted', false);
        const authService = await relaunch();
        appReady();

        expect(authService.isAuthenticated()).toBe(true);
        expect(await authorization(authService)).toBe('Bearer stored-access');
    });

    it.each([
        ['ciphertext this machine cannot decrypt', () => {
            fake.storeData.set('tokens', Buffer.from('a blob from another machine').toString('base64'));
            fake.storeData.set('isEncrypted', true);
        }],
        ['a blob that decrypts to something other than JSON', () => storeEncrypted('not json')],
        ['JSON that is not an object', () => storeEncrypted('42')],
        ['JSON null', () => storeEncrypted('null')],
        ['an object with no token in it', () => storeEncrypted('{}')],
        ['a legacy plain-text object with no token in it', () => {
            fake.storeData.set('tokens', { scope: 'calendar' });
            fake.storeData.set('isEncrypted', false);
        }],
    ])('%s: not signed in, and the client holds no credentials', async (_case, seed) => {
        seed();
        const authService = await relaunch();
        appReady();

        expect(authService.isAuthenticated()).toBe(false);
        await expect(authorization(authService)).rejects.toThrow(NO_CREDENTIALS);
    });

    it('before the app is ready, the readers throw instead of answering "signed out"', async () => {
        storeEncrypted(JSON.stringify(stored()));
        const authService = await relaunch();

        expect(() => authService.isAuthenticated()).toThrow(/before the app is ready/);
        expect(() => authService.getAuthClient()).toThrow(/before the app is ready/);

        appReady();
        expect(authService.isAuthenticated()).toBe(true);
    });

    it('a store read that throws is retried by the next call, not remembered as "signed out"', async () => {
        storeEncrypted(JSON.stringify(stored()));
        const authService = await relaunch();
        appReady();
        fake.storeReadError.next = Object.assign(new Error('EBUSY: resource busy or locked'), { code: 'EBUSY' });

        expect(() => authService.isAuthenticated()).toThrow('EBUSY');
        expect(authService.isAuthenticated()).toBe(true);
        expect(await authorization(authService)).toBe('Bearer stored-access');
    });

    it.each([
        ['after auth:check said signed out', true],
        ['before anything read the credentials', false],
    ])('a sign-in %s is what the client and isAuthenticated() see, stored encrypted', async (_case, checkFirst) => {
        const authService = await relaunch();
        appReady();
        if (checkFirst) expect(authService.isAuthenticated()).toBe(false);
        googleAnswers({ access_token: 'signed-in-access', refresh_token: 'signed-in-refresh', expires_in: 3600 });

        const signedIn = authService.startAuth();
        await vi.waitFor(() => expect(fake.openExternal).toHaveBeenCalled());
        const authUrl = new URL(String(fake.openExternal.mock.calls[0][0]));
        const callback = new URL(authUrl.searchParams.get('redirect_uri') ?? '');
        callback.searchParams.set('code', 'one-time-code');
        callback.searchParams.set('state', authUrl.searchParams.get('state') ?? '');
        await get(callback);
        await signedIn;

        expect(authService.isAuthenticated()).toBe(true);
        expect(await authorization(authService)).toBe('Bearer signed-in-access');
        expect(readStored()).toMatchObject({ access_token: 'signed-in-access', refresh_token: 'signed-in-refresh' });
    });

    it('a sign-out leaves no credentials in the client or the store', async () => {
        storeEncrypted(JSON.stringify(stored()));
        const authService = await relaunch();
        appReady();
        expect(authService.isAuthenticated()).toBe(true);

        authService.logout();

        expect(authService.isAuthenticated()).toBe(false);
        await expect(authorization(authService)).rejects.toThrow(NO_CREDENTIALS);
        expect(fake.storeData.has('tokens')).toBe(false);
    });
});
