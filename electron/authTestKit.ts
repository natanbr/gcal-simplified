// ============================================================
// Test kit for the Google sign-in suites (auth_app_ready, auth_session,
// auth_store_corrupt, auth_unauthorized, auth_logging, auth_async_store, ...).
// ------------------------------------------------------------
// The fake safeStorage behaves like Electron's on Windows: unusable before
// ready (the async trio rejects, isAsyncEncryptionAvailable resolves false), a
// reversible cipher after it. Electron 46 removes the synchronous trio
// (isEncryptionAvailable, encryptString, decryptString), so the fakes of those
// throw: a production call left on one fails a suite instead of passing on a
// method the real app no longer has. The OAuth client is the real
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
//
// A test that needs an async call to stay in flight (a save racing a sign-out)
// gates it with holdNext() and lets the microtasks drain with settle().
// ============================================================

import { expect, vi, type Mock } from 'vitest';
import http from 'node:http';
import type { Credentials, OAuth2Client, OAuth2ClientOptions } from 'google-auth-library';

export const HOUR = 60 * 60 * 1000;
export const NO_CREDENTIALS = 'No access, refresh token, API key or refresh handler callback is set';

/** The real OAuth client class is loaded here, at collection, for googleapisModule to extend. */
export async function createAuthFakes() {
    const { OAuth2Client: RealOAuth2Client } = await import('google-auth-library');
    const app = { ready: false };
    const notReady = () => new Error('safeStorage cannot be used before app is ready');
    const removed = (name: string) => vi.fn((): never => { throw new Error(`safeStorage.${name} was removed in Electron 46`); });
    const cipher = {
        isAvailable: async (): Promise<boolean> => app.ready,
        encrypt: async (plain: string): Promise<Buffer> => {
            if (!app.ready) throw notReady();
            return Buffer.from(`enc:${plain}`, 'utf-8');
        },
        decrypt: async (blob: Buffer): Promise<{ result: string; shouldReEncrypt: boolean }> => {
            if (!app.ready) throw notReady();
            const text = blob.toString('utf-8');
            if (!text.startsWith('enc:')) {
                throw new Error('Error while decrypting the ciphertext provided to safeStorage.decryptStringAsync.');
            }
            return { result: text.slice('enc:'.length), shouldReEncrypt: false };
        },
    };
    const safeStorage = {
        isEncryptionAvailable: removed('isEncryptionAvailable'),
        encryptString: removed('encryptString'),
        decryptString: removed('decryptString'),
        isAsyncEncryptionAvailable: vi.fn(cipher.isAvailable),
        encryptStringAsync: vi.fn(cipher.encrypt),
        decryptStringAsync: vi.fn(cipher.decrypt),
    };
    /** Puts an async fake back to the cipher above, dropping what a test queued on it. */
    const restoreCipher = <A extends unknown[], R>(spy: Mock<(...args: A) => R>, behaviour: (...args: A) => R) => {
        spy.mockReset();
        spy.mockImplementation(behaviour);
    };
    return {
        app,
        RealOAuth2Client,
        storeData: new Map<string, unknown>(),
        safeStorage,
        resetSafeStorage: () => {
            restoreCipher(safeStorage.isAsyncEncryptionAvailable, cipher.isAvailable);
            restoreCipher(safeStorage.encryptStringAsync, cipher.encrypt);
            restoreCipher(safeStorage.decryptStringAsync, cipher.decrypt);
        },
        /** When set, the next store read throws it (a file held by antivirus or a backup). */
        storeReadError: { next: null as Error | null },
        /** The same, for the read electron-store makes when it is created. */
        storeOpenError: { next: null as Error | null },
        /** The same, for the next set or delete. */
        storeWriteError: { next: null as Error | null },
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

/** Throws the error a test queued in `slot`, once. */
function throwQueued(slot: { next: Error | null }): void {
    const error = slot.next;
    slot.next = null;
    if (error) throw error;
}

/** electron-store's two forms of set: set(key, value) and set({ key: value }). */
export function electronStoreModule(fake: AuthFakes) {
    return {
        default: class FakeStore {
            constructor() {
                throwQueued(fake.storeOpenError);
            }
            get = (key: string) => {
                throwQueued(fake.storeReadError);
                return fake.storeData.get(key);
            };
            set = (keyOrValues: string | Record<string, unknown>, value?: unknown) => {
                throwQueued(fake.storeWriteError);
                const entries = typeof keyOrValues === 'string' ? [[keyOrValues, value] as const] : Object.entries(keyOrValues);
                for (const [key, entry] of entries) fake.storeData.set(key, entry);
            };
            delete = (key: string) => {
                throwQueued(fake.storeWriteError);
                fake.storeData.delete(key);
            };
        },
    };
}

export function googleapisModule(fake: AuthFakes) {
    class OAuth2 extends fake.RealOAuth2Client {
        constructor(options?: OAuth2ClientOptions) {
            super({ ...options, transporterOptions: { fetchImplementation: fake.tokenEndpoint } });
        }
    }
    return { google: { auth: { OAuth2 } } };
}

export function resetAuthFakes(fake: AuthFakes): void {
    fake.storeData.clear();
    fake.storeReadError.next = null;
    fake.storeOpenError.next = null;
    fake.storeWriteError.next = null;
    fake.app.ready = false;
    vi.clearAllMocks();
    fake.resetSafeStorage();
    // mockReset, not only clear: a one-time answer a test queued and never used must not reach the next test.
    fake.tokenEndpoint.mockReset();
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

/** For a save that runs in the background (a refresh does not wait for its own save): waits until the store holds these. */
export const expectStoredEventually = (fake: AuthFakes, expected: Credentials): Promise<void> =>
    vi.waitFor(() => expect(readStored(fake)).toMatchObject(expected));

/** What main.js does on every launch: import auth.ts while the app is not ready yet. */
export async function relaunch(fake: AuthFakes) {
    fake.app.ready = false;
    vi.resetModules();
    const { authService } = await import('./auth');
    return authService;
}

export type Service = Awaited<ReturnType<typeof relaunch>>;

/** A saved session whose access token has expired, so the first Google call refreshes it. */
export const expiredSession = (): Credentials => ({ ...stored(), access_token: 'expired-access', expiry_date: Date.now() - HOUR });

/** What Google's token endpoint answers for a revoked grant, or a refresh token past its 7 days in Testing mode. */
export const REVOKED = { error: 'invalid_grant', error_description: 'Token has been expired or revoked.' };

export function googleResponse(body: Record<string, unknown>, status: number): Response {
    return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

export function googleAnswers(fake: AuthFakes, body: Record<string, unknown>, status = 200): void {
    fake.tokenEndpoint.mockImplementation(async () => googleResponse(body, status));
}

/**
 * A real gaxios error, raised by google-auth-library's own transport: the
 * answer is `failure` (a status and body, or a network error), and the request
 * carried `sent` as its body, the way a refresh carries its refresh token.
 */
export async function realGoogleError(
    failure: { status: number; body: Record<string, unknown> } | Error, sent: Record<string, string> = {},
): Promise<unknown> {
    const { OAuth2Client } = await import('google-auth-library');
    const fetchImplementation = async () => {
        if (failure instanceof Error) throw failure;
        return googleResponse(failure.body, failure.status);
    };
    const client = new OAuth2Client({ transporterOptions: { fetchImplementation } });
    return client.transporter.request({ url: 'https://oauth2.googleapis.com/token', method: 'POST', data: new URLSearchParams(sent), retry: false })
        .then(() => { throw new Error('expected Google to fail'); }, (error: unknown) => error);
}

/** The next call to Google waits until the test answers it (a refresh still in flight). */
export function googleAnswersLater(fake: AuthFakes): { answer(body: Record<string, unknown>, status?: number): void } {
    let respond: (response: Response) => void = () => { throw new Error('Google was never asked'); };
    fake.tokenEndpoint.mockImplementationOnce(() => new Promise<Response>(resolve => { respond = resolve; }));
    return { answer: (body, status = 200) => respond(googleResponse(body, status)) };
}

export function deferred<T = void>() {
    let resolve!: (value: T) => void;
    let reject!: (error: Error) => void;
    const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
    return { promise, resolve, reject };
}

/** The fakes use no timer, so one macrotask lets every pending continuation run. */
export const settle = () => new Promise<void>(resolve => setTimeout(resolve, 0));

/** The next call to this async fake stays in flight until released (then it does what the fake does) or failed. */
export function holdNext<A extends unknown[], R>(fake: Mock<(...args: A) => Promise<R>>): { release(): void; fail(error: Error): void } {
    const proceed = fake.getMockImplementation();
    if (!proceed) throw new Error('holdNext: the fake has no implementation to run once released');
    const gate = deferred();
    fake.mockImplementationOnce(async (...args: A) => { await gate.promise; return proceed(...args); });
    return { release: () => gate.resolve(), fail: error => gate.reject(error) };
}

/** `call` must hand back a Promise: a reader that throws or answers a plain value fails here, saying so. */
export function promised<T>(name: string, call: () => Promise<T>): Promise<T> {
    let result: unknown;
    try {
        result = call();
    } catch (error) {
        throw new Error(`${name} threw instead of returning a Promise: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (!(result instanceof Promise)) throw new Error(`${name} returned ${typeof result}, not a Promise`);
    return result;
}

function get(url: URL): Promise<void> {
    return new Promise((resolve, reject) => {
        http.get(url, res => { res.resume(); res.on('end', () => resolve()); }).on('error', reject);
    });
}

/** Starts the loopback sign-in and "redirects" back with a code: `callback` ends with the HTTP answer, `signedIn` when startAuth settles. */
export async function startSignIn(fake: AuthFakes, authService: Service): Promise<{ signedIn: Promise<void>; callback: Promise<void> }> {
    const signedIn = authService.startAuth();
    await vi.waitFor(() => expect(fake.openExternal).toHaveBeenCalled());
    const authUrl = new URL(String(fake.openExternal.mock.calls.at(-1)?.[0]));
    const callback = new URL(authUrl.searchParams.get('redirect_uri') ?? '');
    callback.searchParams.set('code', 'one-time-code');
    callback.searchParams.set('state', authUrl.searchParams.get('state') ?? '');
    return { signedIn, callback: get(callback) };
}

/** Runs the whole loopback sign-in to its end. */
export async function signIn(fake: AuthFakes, authService: Service): Promise<void> {
    const { signedIn, callback } = await startSignIn(fake, authService);
    await callback;
    await signedIn;
}

/** The Authorization header the client would send to Google right now (refreshing first if it must). */
export async function authorization(authService: Service): Promise<string | null> {
    const client: OAuth2Client = await authService.getAuthClient();
    return (await client.getRequestHeaders()).get('authorization');
}
