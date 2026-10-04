// ============================================================
// Test kit for the Google sign-in suites (auth_app_ready, auth_session).
// ------------------------------------------------------------
// The fake safeStorage behaves like Electron's on Windows: unusable before
// ready, a reversible cipher after it. The OAuth client is the real
// google-auth-library one; only Google's token endpoint is faked, on the
// client's own transporter, so no test can reach the network.
//
// A suite builds the fakes once, at collection, and closes every vi.mock
// factory over them:
//
//   const { kit, fake } = await vi.hoisted(async () => {
//       const kit = await import('./authTestKit');
//       return { kit, fake: await kit.createAuthFakes() };
//   });
//   vi.mock('electron', () => kit.electronModule(fake));
//
// relaunch() resets the module registry, so a factory that imported the kit
// itself would get a fresh copy with fresh state after the first relaunch.
//
// Then `await kit.relaunch(fake)` once at the top level, after the mocks: the
// first import of auth.ts waits for Vite to transform it and auth-token-store.ts
// (~90 ms alone; a re-import after a reset takes 3 ms). Inside a test that wait
// counts against the 5 s timeout, and under a loaded full suite, where every
// worker queues on the same transform server, it ran out (2026-10-01, twice).
// At the top level it is paid at collection, which has no per-test timeout.
// ============================================================

import { expect, vi } from 'vitest';
import http from 'node:http';
import type { Credentials, OAuth2Client } from 'google-auth-library';

export const HOUR = 60 * 60 * 1000;
export const NO_CREDENTIALS = 'No access, refresh token, API key or refresh handler callback is set';

/** The real OAuth client class is loaded here, at collection, for googleapisModule to extend. */
export async function createAuthFakes() {
    const { OAuth2Client: RealOAuth2Client } = await import('google-auth-library');
    const app = { ready: false };
    const notReady = () => new Error('safeStorage cannot be used before app is ready');
    return {
        app,
        RealOAuth2Client,
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
}

export type AuthFakes = Awaited<ReturnType<typeof createAuthFakes>>;

export function electronModule(fake: AuthFakes) {
    return {
        app: { isReady: () => fake.app.ready, getPath: () => '/tmp' },
        safeStorage: fake.safeStorage,
        shell: { openExternal: fake.openExternal },
    };
}

/** electron-store's two forms of set: set(key, value) and set({ key: value }). */
export function electronStoreModule(fake: AuthFakes) {
    return {
        default: class FakeStore {
            get = (key: string) => {
                const error = fake.storeReadError.next;
                fake.storeReadError.next = null;
                if (error) throw error;
                return fake.storeData.get(key);
            };
            set = (keyOrValues: string | Record<string, unknown>, value?: unknown) => {
                const entries = typeof keyOrValues === 'string' ? [[keyOrValues, value] as const] : Object.entries(keyOrValues);
                for (const [key, entry] of entries) fake.storeData.set(key, entry);
            };
            delete = (key: string) => { fake.storeData.delete(key); };
        },
    };
}

export function googleapisModule(fake: AuthFakes) {
    class OAuth2 extends fake.RealOAuth2Client {
        constructor(clientId?: string, clientSecret?: string) {
            super({ clientId, clientSecret, transporterOptions: { fetchImplementation: fake.tokenEndpoint } });
        }
    }
    return { google: { auth: { OAuth2 } } };
}

export function resetAuthFakes(fake: AuthFakes): void {
    fake.storeData.clear();
    fake.storeReadError.next = null;
    fake.app.ready = false;
    vi.clearAllMocks();
    fake.tokenEndpoint.mockRejectedValue(new Error('this test expected no call to Google'));
}

export const stored = (): Credentials => ({
    access_token: 'stored-access',
    refresh_token: 'stored-refresh',
    expiry_date: Date.now() + HOUR,
    token_type: 'Bearer',
});

export function storeEncrypted(fake: AuthFakes, plain: string): void {
    fake.storeData.set('tokens', Buffer.from(`enc:${plain}`, 'utf-8').toString('base64'));
    fake.storeData.set('isEncrypted', true);
}

/** Decrypts what the service persisted, failing if it was written in plain text. */
export function readStored(fake: AuthFakes): Credentials {
    expect(fake.storeData.get('isEncrypted')).toBe(true);
    const blob = fake.storeData.get('tokens');
    if (typeof blob !== 'string') throw new Error('expected an encrypted token blob');
    const plain = Buffer.from(blob, 'base64').toString('utf-8');
    expect(plain.startsWith('enc:')).toBe(true);
    const credentials: Credentials = JSON.parse(plain.slice('enc:'.length));
    return credentials;
}

/** What main.js does on every launch: import auth.ts while the app is not ready yet. */
export async function relaunch(fake: AuthFakes) {
    fake.app.ready = false;
    vi.resetModules();
    const { authService } = await import('./auth');
    return authService;
}

export type Service = Awaited<ReturnType<typeof relaunch>>;

export function googleAnswers(fake: AuthFakes, body: Record<string, unknown>, status = 200): void {
    fake.tokenEndpoint.mockImplementation(async () => new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
    }));
}

function get(url: URL): Promise<void> {
    return new Promise((resolve, reject) => {
        http.get(url, res => { res.resume(); res.on('end', () => resolve()); }).on('error', reject);
    });
}

/** Runs the whole loopback sign-in: the consent page "redirects" back with a code. */
export async function signIn(fake: AuthFakes, authService: Service): Promise<void> {
    const signedIn = authService.startAuth();
    await vi.waitFor(() => expect(fake.openExternal).toHaveBeenCalled());
    const authUrl = new URL(String(fake.openExternal.mock.calls.at(-1)?.[0]));
    const callback = new URL(authUrl.searchParams.get('redirect_uri') ?? '');
    callback.searchParams.set('code', 'one-time-code');
    callback.searchParams.set('state', authUrl.searchParams.get('state') ?? '');
    await get(callback);
    await signedIn;
}

/** The Authorization header the client would send to Google right now (refreshing first if it must). */
export async function authorization(authService: Service): Promise<string | null> {
    const client: OAuth2Client = authService.getAuthClient();
    return (await client.getRequestHeaders()).get('authorization');
}
