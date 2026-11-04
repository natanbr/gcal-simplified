// ============================================================
// A safeStorage call that never answers must not hang the app (2026-11-04)
// ------------------------------------------------------------
// The token store awaits isAsyncEncryptionAvailable, encryptStringAsync and
// decryptStringAsync (auth_async_store.test.ts): round trips to the OS keychain.
// If one never answers, a read leaves every auth:check pending and a write blocks
// every later save behind it. So each gets CIPHER_TIMEOUT_MS, and a timeout:
//   - on a READ rejects with SafeStorageTimeout (a fixed phrase, no data), and is
//     not "signed out": the tokens are fine, so the next call decrypts again;
//   - on a WRITE rejects too, writes nothing and NEVER falls back to plain text
//     (that branch is for an encrypt that FAILS, not a slow one); later saves still run;
//   - leaves no timer behind once the call settles, and an answer that arrives
//     after it (a resolve, or a reject nobody awaits) changes nothing.
// The clock is faked for setTimeout/clearTimeout only. kit.settle() and vi.waitFor
// wait on timers, so this file moves it by hand (tick, pass) and polls real time
// only for the sign-in's socket.
// ============================================================

import { describe, it, expect, vi, beforeEach, afterEach, onTestFinished } from 'vitest';
import { inspect } from 'node:util';
import { CIPHER_TIMEOUT_MS } from './auth-token-store';
import { readWhileHeld } from './held-file';

const { kit, fake } = await vi.hoisted(async () => {
    const kit = await import('./authTestKit');
    return { kit, fake: await kit.createAuthFakes() };
});

vi.mock('electron', () => kit.electronModule(fake));
vi.mock('electron-store', () => kit.electronStoreModule(fake));
vi.mock('googleapis', () => kit.googleapisModule(fake));

const { deferred, googleAnswers, holdNext, readStored, stored } = kit;
const storeEncrypted = (plain: string) => kit.storeEncrypted(fake, plain);

await kit.relaunch(fake); // the first import, at collection (see authTestKit.ts)

const SEED = 'SEEDED-SECRET-77';
const NEW_ACCOUNT = { access_token: 'new-access', refresh_token: 'new-refresh', expires_in: 3600 };
const ENCRYPT = () => fake.safeStorage.encryptStringAsync;
const DECRYPT = () => fake.safeStorage.decryptStringAsync;
const AVAILABLE = () => fake.safeStorage.isAsyncEncryptionAvailable;
const TIMEOUT_MS = CIPHER_TIMEOUT_MS;

const realSetTimeout = globalThis.setTimeout;
/** Real time, for what a fake clock cannot move: a socket. */
const realTick = (ms = 10) => new Promise<void>(resolve => realSetTimeout(resolve, ms));
const tick = () => vi.advanceTimersByTimeAsync(0); // every pending continuation runs, the clock stays
const pass = (ms: number) => vi.advanceTimersByTimeAsync(ms);

/** Everything written to the console from here on, objects expanded in full. */
function consoleOutput(): () => string {
    const spies = (['error', 'warn', 'log', 'info'] as const).map(level => vi.spyOn(console, level).mockImplementation(() => undefined));
    return () => spies.flatMap(spy => spy.mock.calls.flat())
        .map(arg => (typeof arg === 'string' ? arg : inspect(arg, { depth: null, showHidden: true }))).join('\n');
}

/** Where a promise stands, readable at any time: a failure says "expected 'pending' to be 'rejected'", not "timed out". */
interface Call { status: 'pending' | 'fulfilled' | 'rejected'; reason?: unknown }
function track(promise: Promise<unknown>): Call {
    const call: Call = { status: 'pending' };
    promise.then(() => { call.status = 'fulfilled'; }, (reason: unknown) => { call.status = 'rejected'; call.reason = reason; });
    return call;
}

/** The SafeStorageTimeout a call was rejected with; one still pending, or settled otherwise, fails here saying so. */
function timedOut(call: Call): Error {
    expect(call.status).toBe('rejected');
    if (!(call.reason instanceof Error)) throw new Error(`rejected with ${String(call.reason)}, not an Error`);
    expect(call.reason.name).toBe('SafeStorageTimeout');
    return call.reason;
}

/** A cipher call that never answers until afterEach lets it go, so no server or save outlives its test. */
const lateAnswers: Array<() => void> = [];
function stuck<T>(answer: T): Promise<T> {
    return new Promise<T>(resolve => { lateAnswers.push(() => resolve(answer)); });
}
const lateTokens = () => ({ result: JSON.stringify(stored()), shouldReEncrypt: false });

/** A launch after ready, on a clock that moves only when a test moves it. */
async function launch() {
    const authService = await kit.relaunch(fake);
    fake.app.ready = true;
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    return authService;
}

/** A launch whose saved tokens are loaded, and the store as it is, to compare against. */
async function signedInLaunch() {
    storeEncrypted(JSON.stringify(stored()));
    const authService = await launch();
    const client = await authService.getAuthClient();
    return { client, onDisk: new Map(fake.storeData) };
}

beforeEach(() => kit.resetAuthFakes(fake));
afterEach(async () => {
    for (const answer of lateAnswers.splice(0)) answer();
    if (vi.isFakeTimers()) await tick();
    vi.useRealTimers();
    vi.restoreAllMocks();
});

it('exports the timeout: long enough for a slow keychain, short enough that Sign in shows within a minute', () => {
    expect(CIPHER_TIMEOUT_MS).toBeGreaterThanOrEqual(5_000);
    expect(CIPHER_TIMEOUT_MS).toBeLessThanOrEqual(60_000);
});

describe('a read whose cipher call never answers', () => {
    const READ_STALLS: Array<[string, () => void]> = [
        ['decryptStringAsync', () => { DECRYPT().mockImplementationOnce(() => stuck(lateTokens())); }],
        ['isAsyncEncryptionAvailable', () => { AVAILABLE().mockImplementationOnce(() => stuck(true)); }],
    ];

    it.each(READ_STALLS)('%s: rejects with the timeout, touches nothing, and the next call reads again', async (_call, hang) => {
        const output = consoleOutput();
        storeEncrypted(JSON.stringify({ ...stored(), scope: SEED }));
        const onDisk = new Map(fake.storeData);
        const authService = await launch();
        hang();

        const check = track(authService.isAuthenticated());
        await tick();
        await pass(TIMEOUT_MS - 1);
        expect(check.status).toBe('pending'); // not before its time
        await pass(1);

        const error = timedOut(check);
        expect(error.message).not.toContain(SEED);
        expect(error.message).not.toContain(String(onDisk.get('tokens')));
        expect(output()).not.toContain(SEED);
        expect(fake.storeData).toEqual(onDisk);
        expect(await authService.isAuthenticated()).toBe(true); // retried, not remembered as signed out
        expect((await authService.getAuthClient()).credentials).toMatchObject({ refresh_token: 'stored-refresh' });
    });

    it('every reader waiting on the stuck decrypt fails with the timeout, from one decrypt (readWhileHeld, on the auth:check path, does not retry it)', async () => {
        storeEncrypted(JSON.stringify(stored()));
        const authService = await launch();
        DECRYPT().mockImplementationOnce(() => stuck(lateTokens()));

        const readers = [authService.isAuthenticated(), authService.getAuthClient(), readWhileHeld(() => authService.isAuthenticated())].map(reader => track(reader));
        await tick();
        await pass(TIMEOUT_MS);

        for (const reader of readers) timedOut(reader); // a retry inside readWhileHeld would leave it pending
        expect(DECRYPT()).toHaveBeenCalledTimes(1);
    });

    it.each(['before', 'after'])('a decrypt that answers %s the retry changes nothing: the client is as the retry left it', async (when) => {
        storeEncrypted(JSON.stringify(stored()));
        const authService = await launch();
        const late = deferred<{ result: string; shouldReEncrypt: boolean }>();
        DECRYPT().mockImplementationOnce(() => late.promise);
        const answerLate = () => late.resolve({
            result: JSON.stringify({ ...stored(), access_token: 'late-access', refresh_token: 'late-refresh' }), shouldReEncrypt: false,
        });
        const first = track(authService.isAuthenticated());
        await tick();
        await pass(TIMEOUT_MS);
        timedOut(first);

        if (when === 'before') answerLate();
        await tick();
        expect(await authService.isAuthenticated()).toBe(true); // the retry
        if (when === 'after') answerLate();
        await tick();

        expect((await authService.getAuthClient()).credentials).toMatchObject({ access_token: 'stored-access', refresh_token: 'stored-refresh' });
        expect(DECRYPT()).toHaveBeenCalledTimes(2); // the late answer did not count as the load
    });
});

describe('a save whose cipher call never answers', () => {
    const WRITE_STALLS: Array<[string, () => void]> = [
        ['encryptStringAsync', () => { ENCRYPT().mockImplementationOnce(() => stuck(Buffer.from('enc:{}'))); }],
        ['isAsyncEncryptionAvailable', () => { AVAILABLE().mockImplementationOnce(() => stuck(true)); }],
    ];

    it.each(WRITE_STALLS)('%s: nothing is written (never plain text), the failure is logged, and a later save lands', async (_call, hang) => {
        const output = consoleOutput();
        const { client, onDisk } = await signedInLaunch();
        hang();

        client.emit('tokens', { access_token: 'lost-access' });
        await tick();
        await pass(TIMEOUT_MS - 1);
        expect(output()).not.toContain('Failed to save'); // not before its time
        await pass(1);

        expect(fake.storeData).toEqual(onDisk);
        expect(fake.storeData.get('isEncrypted')).toBe(true);
        expect(output()).toContain('Failed to save the Google tokens (SafeStorageTimeout)');

        client.emit('tokens', { access_token: 'next-access' });
        await tick();
        expect(readStored(fake)).toMatchObject({ access_token: 'next-access', refresh_token: 'stored-refresh' });
    });

    it('an availability check that rejects (not a timeout) also writes nothing: only "no encryption" or a failed encrypt is plain text', async () => {
        const output = consoleOutput();
        const { client, onDisk } = await signedInLaunch();
        AVAILABLE().mockRejectedValueOnce(new Error(`encryptor failed ${SEED}`));
        client.emit('tokens', { access_token: 'lost-access' });
        await tick();
        expect(fake.storeData).toEqual(onDisk);
        expect(output()).toContain('Failed to save the Google tokens (Error)');
        expect(output()).not.toContain(SEED);
    });

    it('a sign-in: startAuth still resolves after the timeout, stays signed in, and writes nothing in plain text', async () => {
        const output = consoleOutput();
        const authService = await launch();
        ENCRYPT().mockImplementationOnce(() => stuck(Buffer.from('enc:{}')));
        googleAnswers(fake, NEW_ACCOUNT);
        const { signedIn, callback } = await kit.startSignIn(fake, authService);
        const signIn = track(signedIn);
        for (let waited = 0; ENCRYPT().mock.calls.length === 0 && waited < 200; waited++) await realTick(5); // a real socket brings the code in

        expect(ENCRYPT()).toHaveBeenCalledTimes(1);
        await pass(TIMEOUT_MS - 1);
        expect(signIn.status).toBe('pending'); // waits for the save, up to the timeout
        await pass(1);

        expect(fake.storeData.has('tokens')).toBe(false);
        expect(fake.storeData.get('isEncrypted')).not.toBe(false);
        expect(signIn.status).toBe('fulfilled');
        expect(output()).toContain('Failed to save the Google tokens (SafeStorageTimeout)');
        expect((await authService.getAuthClient()).credentials).toMatchObject({ access_token: 'new-access', refresh_token: 'new-refresh' });
        await callback; // the browser got its answer too
    });

    it('a stuck encrypt that REJECTS after the timeout: no unhandled rejection, no plain-text fallback, nothing written', async () => {
        const unhandled: unknown[] = [];
        const onUnhandled = (reason: unknown) => { unhandled.push(reason); };
        process.on('unhandledRejection', onUnhandled);
        onTestFinished(() => { process.off('unhandledRejection', onUnhandled); });
        const output = consoleOutput();
        const { client, onDisk } = await signedInLaunch();
        const late = deferred<Buffer>();
        ENCRYPT().mockImplementationOnce(() => late.promise);

        client.emit('tokens', { access_token: 'lost-access' });
        await tick();
        await pass(TIMEOUT_MS);
        expect(fake.storeData).toEqual(onDisk);
        expect(output()).toContain('Failed to save the Google tokens (SafeStorageTimeout)');

        late.reject(new Error(`keychain gave up ${SEED}`));
        await tick();
        await realTick(); // Node reports an unhandled rejection after the microtasks drain

        expect(unhandled).toEqual([]);
        expect(fake.storeData).toEqual(onDisk);
        expect(output()).not.toContain(SEED);
    });
});

describe('the timeout is a timer only while a call is in flight', () => {
    it('a decrypt and an encrypt that settle normally leave no timer behind', async () => {
        storeEncrypted(JSON.stringify(stored()));
        const authService = await launch();
        const decrypting = holdNext(DECRYPT());
        const loading = authService.isAuthenticated();
        await tick();
        expect(DECRYPT()).toHaveBeenCalledTimes(1);
        expect(vi.getTimerCount()).toBeGreaterThan(0); // armed while it is out

        decrypting.release();
        expect(await loading).toBe(true);
        expect(vi.getTimerCount()).toBe(0);

        const client = await authService.getAuthClient();
        const encrypting = holdNext(ENCRYPT());
        client.emit('tokens', { access_token: 'next-access' });
        await tick();
        expect(ENCRYPT()).toHaveBeenCalledTimes(1);
        expect(vi.getTimerCount()).toBeGreaterThan(0);

        encrypting.release();
        await tick();
        expect(readStored(fake)).toMatchObject({ access_token: 'next-access' });
        expect(vi.getTimerCount()).toBe(0);
    });

    it('a call that rejects clears its timer too', async () => {
        storeEncrypted(JSON.stringify(stored()));
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const authService = await launch();
        const decrypting = holdNext(DECRYPT());
        const loading = authService.isAuthenticated();
        await tick();
        expect(vi.getTimerCount()).toBeGreaterThan(0);

        decrypting.fail(new Error('keychain refused'));
        expect(await loading).toBe(false); // a failure is "signed out", as before
        expect(vi.getTimerCount()).toBe(0);
    });
});
