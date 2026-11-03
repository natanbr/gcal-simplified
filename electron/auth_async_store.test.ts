// ============================================================
// The token store is async: what it must still guarantee (2026-11-03)
// ------------------------------------------------------------
// Electron 46 removes safeStorage's synchronous encryptString / decryptString,
// so saving and loading the Google tokens now wait on a promise. A sync save
// could never be overtaken; an async one can: a sign-out, a sign-in or a newer
// refresh can all happen while an earlier encrypt or decrypt is still in
// flight, and the slow one must not undo them. These hold each such call open
// (authTestKit's holdNext), do the overtaking thing, and let it finish:
//   - a sign-out during a save: the signed-out account must not come back on disk;
//   - two saves, the first slower: the newer tokens are the ones on disk;
//   - a sign-in or sign-out during the first load: the load must not overwrite them;
//   - concurrent first readers decrypt once; a held file is retried, not remembered;
//   - startAuth (auth:login) resolves only after the tokens are on disk.
// Failures of the cipher itself (a decrypt that rejects, an encrypt that
// rejects) are at the end. The fakes are in authTestKit.ts.
// ============================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { inspect } from 'node:util';

const { kit, fake } = await vi.hoisted(async () => {
    const kit = await import('./authTestKit');
    return { kit, fake: await kit.createAuthFakes() };
});

vi.mock('electron', () => kit.electronModule(fake));
vi.mock('electron-store', () => kit.electronStoreModule(fake));
vi.mock('googleapis', () => kit.googleapisModule(fake));

const { authorization, expiredSession, googleAnswers, holdNext, readStored, settle, stored } = kit;
const storeEncrypted = (plain: string) => kit.storeEncrypted(fake, plain);
const relaunch = () => kit.relaunch(fake);
const appReady = () => { fake.app.ready = true; };

await relaunch(); // the first import, at collection (see authTestKit.ts)

const SEED = 'SEEDED-SECRET-77';
const REFRESHED = { access_token: 'refreshed-access', expires_in: 3600 };
const NEW_ACCOUNT = { access_token: 'new-access', refresh_token: 'new-refresh', expires_in: 3600 };
const fsError = (code: string) => Object.assign(new Error(`${code}: operation failed`), { code });
const ENCRYPT = () => fake.safeStorage.encryptStringAsync;
const DECRYPT = () => fake.safeStorage.decryptStringAsync;

/** Everything written to the console from here on, objects expanded in full. */
function consoleOutput(): () => string {
    const spies = (['error', 'warn', 'log', 'info'] as const).map(level => vi.spyOn(console, level).mockImplementation(() => undefined));
    return () => spies.flatMap(spy => spy.mock.calls.flat())
        .map(arg => (typeof arg === 'string' ? arg : inspect(arg, { depth: null, showHidden: true }))).join('\n');
}

/** A launch whose saved session has expired: the first Google call refreshes it, and that refresh's save runs in the background. */
async function expiredLaunch() {
    storeEncrypted(JSON.stringify(expiredSession()));
    googleAnswers(fake, REFRESHED);
    const authService = await relaunch();
    appReady();
    return authService;
}

describe('a save that is still encrypting when something else happens', () => {
    beforeEach(() => kit.resetAuthFakes(fake));
    afterEach(() => vi.restoreAllMocks());

    it('a sign-out: the signed-out account does not come back on disk', async () => {
        const authService = await expiredLaunch();
        const encrypting = holdNext(ENCRYPT());
        expect(await authorization(authService)).toBe('Bearer refreshed-access'); // the read does not wait for its save
        await vi.waitFor(() => expect(ENCRYPT()).toHaveBeenCalledTimes(1));

        authService.logout();
        encrypting.release();
        await settle();

        expect([...fake.storeData.keys()]).toEqual([]);
        expect(await authService.isAuthenticated()).toBe(false);
    });

    it('a sign-out and a sign-in of another account: the new account is what is on disk', async () => {
        const authService = await expiredLaunch();
        const encrypting = holdNext(ENCRYPT());
        await authorization(authService);
        await vi.waitFor(() => expect(ENCRYPT()).toHaveBeenCalledTimes(1));
        authService.logout();
        googleAnswers(fake, NEW_ACCOUNT);

        const { signedIn, callback } = await kit.startSignIn(fake, authService);
        await settle();
        encrypting.release();
        await Promise.all([signedIn, callback]);

        expect(readStored(fake)).toMatchObject({ access_token: 'new-access', refresh_token: 'new-refresh' });
        expect(await authorization(authService)).toBe('Bearer new-access');
    });

    it('a newer save asked for meanwhile: the newer tokens are on disk, however the encrypts finish', async () => {
        storeEncrypted(JSON.stringify(stored()));
        const authService = await relaunch();
        appReady();
        const client = await authService.getAuthClient();
        const slow = holdNext(ENCRYPT());

        client.emit('tokens', { access_token: 'older-access' });
        await vi.waitFor(() => expect(ENCRYPT()).toHaveBeenCalledTimes(1));
        client.emit('tokens', { access_token: 'newer-access' });
        await settle();
        slow.release();

        await kit.expectStoredEventually(fake, { access_token: 'newer-access', refresh_token: 'stored-refresh' });
        await settle(); // and the older one does not land after it
        expect(readStored(fake).access_token).toBe('newer-access');
    });

    it('the kept refresh token is taken when the save is asked for, before the library installs the new set', async () => {
        storeEncrypted(JSON.stringify(stored()));
        const authService = await relaunch();
        appReady();
        const client = await authService.getAuthClient();

        client.emit('tokens', { access_token: 'granted-access' });
        client.setCredentials({ access_token: 'granted-access' }); // what the library does right after its emit

        await kit.expectStoredEventually(fake, { access_token: 'granted-access', refresh_token: 'stored-refresh' });
    });

    it('a save that fails does not stop the saves after it', async () => {
        const output = consoleOutput();
        storeEncrypted(JSON.stringify(stored()));
        const authService = await relaunch();
        appReady();
        const client = await authService.getAuthClient();
        fake.storeWriteError.next = fsError('EPERM');

        client.emit('tokens', { access_token: 'lost-access' });
        await vi.waitFor(() => expect(output()).toContain('Failed to save the Google tokens (EPERM)'));
        client.emit('tokens', { access_token: 'next-access' });

        await kit.expectStoredEventually(fake, { access_token: 'next-access', refresh_token: 'stored-refresh' });
    });

    it('a sign-in: startAuth resolves only after the tokens are on disk', async () => {
        const authService = await relaunch();
        appReady();
        const encrypting = holdNext(ENCRYPT());
        googleAnswers(fake, NEW_ACCOUNT);
        const { signedIn, callback } = await kit.startSignIn(fake, authService);
        let resolved = false;
        void signedIn.then(() => { resolved = true; });

        await vi.waitFor(() => expect(ENCRYPT()).toHaveBeenCalledTimes(1));
        await settle();
        expect(resolved).toBe(false);
        expect(fake.storeData.has('tokens')).toBe(false);
        encrypting.release();
        await Promise.all([signedIn, callback]);

        expect(readStored(fake)).toMatchObject({ access_token: 'new-access', refresh_token: 'new-refresh' });
    });
});

describe('the first load of the saved credentials, while it is still decrypting', () => {
    beforeEach(() => kit.resetAuthFakes(fake));
    afterEach(() => vi.restoreAllMocks());

    async function loadingSavedAccount() {
        storeEncrypted(JSON.stringify({ ...stored(), access_token: 'old-account-access', refresh_token: 'old-account-refresh' }));
        const authService = await relaunch();
        appReady();
        const decrypting = holdNext(DECRYPT());
        const firstLoad = authService.isAuthenticated();
        await vi.waitFor(() => expect(DECRYPT()).toHaveBeenCalledTimes(1));
        return { authService, decrypting, firstLoad };
    }

    it('a sign-in completes: its credentials stay on the client and in the store', async () => {
        const { authService, decrypting, firstLoad } = await loadingSavedAccount();
        googleAnswers(fake, NEW_ACCOUNT);

        await kit.signIn(fake, authService);
        decrypting.release();

        expect(await firstLoad).toBe(true);
        expect((await authService.getAuthClient()).credentials).toMatchObject({ access_token: 'new-access', refresh_token: 'new-refresh' });
        expect(await authorization(authService)).toBe('Bearer new-access');
        expect(readStored(fake)).toMatchObject({ access_token: 'new-access', refresh_token: 'new-refresh' });
    });

    it('a sign-out: the saved account does not come back', async () => {
        const { authService, decrypting, firstLoad } = await loadingSavedAccount();

        authService.logout();
        decrypting.release();

        expect(await firstLoad).toBe(false);
        expect((await authService.getAuthClient()).credentials).toEqual({});
        expect([...fake.storeData.keys()]).toEqual([]);
    });

    it('a second reader joins it: one decrypt for isAuthenticated() and getAuthClient() together', async () => {
        const { authService, decrypting, firstLoad } = await loadingSavedAccount();
        const client = authService.getAuthClient();
        await settle();

        decrypting.release();

        expect(await firstLoad).toBe(true);
        expect((await client).credentials.refresh_token).toBe('old-account-refresh');
        expect(DECRYPT()).toHaveBeenCalledTimes(1);
    });

    it('a held token file fails the readers waiting on it, and the next call loads (not "signed out" until a restart)', async () => {
        storeEncrypted(JSON.stringify(stored()));
        const authService = await relaunch();
        appReady();
        fake.storeReadError.next = fsError('EBUSY');

        const [first] = await Promise.allSettled([authService.isAuthenticated(), authService.getAuthClient()]);

        expect(first).toMatchObject({ status: 'rejected', reason: { code: 'EBUSY' } });
        expect(await authService.isAuthenticated()).toBe(true);
        expect(DECRYPT()).toHaveBeenCalledTimes(1);
    });
});

describe('the cipher failing', () => {
    beforeEach(() => kit.resetAuthFakes(fake));
    afterEach(() => vi.restoreAllMocks());

    it.each([
        ['decryptStringAsync rejects', () => {
            storeEncrypted(JSON.stringify(stored()));
            DECRYPT().mockRejectedValue(new Error(`keychain refused ${SEED}`));
        }, 'Failed to decrypt tokens (Error)'],
        ['the availability check rejects', () => {
            storeEncrypted(JSON.stringify(stored()));
            fake.safeStorage.isAsyncEncryptionAvailable.mockRejectedValue(new Error(`encryptor failed ${SEED}`));
        }, 'Failed to decrypt tokens (Error)'],
        ['it resolves text that is not JSON', () => storeEncrypted(`{"refresh_token":${SEED}}`), 'Failed to decrypt tokens (SyntaxError)'],
        ['it resolves JSON that cannot authorize', () => storeEncrypted(JSON.stringify({ scope: SEED })), null],
        ['encryption is unavailable when the tokens are read', () => {
            storeEncrypted(JSON.stringify(stored()));
            fake.safeStorage.isAsyncEncryptionAvailable.mockResolvedValue(false);
        }, null],
    ])('%s: signed out, never a rejection, and none of the plaintext in the log', async (_case, seed, logged) => {
        seed();
        const output = consoleOutput();
        const authService = await relaunch();
        appReady();

        expect(await authService.isAuthenticated()).toBe(false);

        if (logged) expect(output()).toContain(logged);
        expect(output()).not.toContain(SEED);
        expect((await authService.getAuthClient()).credentials).toEqual({});
    });

    it('encryption unavailable when the tokens are read: decryptStringAsync is not asked', async () => {
        storeEncrypted(JSON.stringify(stored()));
        fake.safeStorage.isAsyncEncryptionAvailable.mockResolvedValue(false);
        const authService = await relaunch();
        appReady();

        expect(await authService.isAuthenticated()).toBe(false);
        expect(DECRYPT()).not.toHaveBeenCalled();
    });

    it('encryptStringAsync rejects: stored in plain text, as a throwing encryptString was, logged without its text', async () => {
        const output = consoleOutput();
        const authService = await relaunch();
        appReady();
        ENCRYPT().mockRejectedValue(new Error(`keyring locked ${SEED}`));
        googleAnswers(fake, NEW_ACCOUNT);

        await kit.signIn(fake, authService);

        expect(fake.storeData.get('isEncrypted')).toBe(false);
        expect(fake.storeData.get('tokens')).toMatchObject({ access_token: 'new-access', refresh_token: 'new-refresh' });
        expect(output()).toContain('Failed to encrypt tokens (Error)');
        expect(output()).not.toContain(SEED);

        const nextLaunch = await relaunch();
        appReady();
        expect(await nextLaunch.isAuthenticated()).toBe(true); // and the next launch reads it back
    });

    it('encryption unavailable when the tokens are saved: stored in plain text, and nothing is encrypted', async () => {
        const authService = await relaunch();
        appReady();
        fake.safeStorage.isAsyncEncryptionAvailable.mockResolvedValue(false);
        googleAnswers(fake, NEW_ACCOUNT);

        await kit.signIn(fake, authService);

        expect(fake.storeData.get('isEncrypted')).toBe(false);
        expect(fake.storeData.get('tokens')).toMatchObject({ access_token: 'new-access', refresh_token: 'new-refresh' });
        expect(ENCRYPT()).not.toHaveBeenCalled();
    });
});
