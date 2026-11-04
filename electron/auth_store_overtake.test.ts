// ============================================================
// Two ways a sign-in's save can be overtaken (2026-11-04)
// ------------------------------------------------------------
// auth_async_store.test.ts holds a refresh's save open and signs out or in
// around it. The security review of the async migration found two cases it
// does not reach, both about the save a SIGN-IN makes (signedIn in auth.ts):
//   - account A's refresh save is still encrypting when account B signs in with
//     no sign-out between (Reconnect while a refresh is in flight). B's save must
//     queue behind A's on the one chain, or A, released last, lands last and the
//     disk holds A while the window shows B. Nothing bumps the generation here,
//     so only the chain order protects B;
//   - the user signs out while B's own sign-in save is still encrypting. The
//     save is DROPPED (the generation moved on): nothing lands on disk, and
//     startAuth still resolves. A drop is not a failure, so it is not logged as one.
// Both pass on the code as it is; each was proven to fail against a mutant
// (the sign-in's save written outside the chain; the generation check removed).
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

const { authorization, expiredSession, googleAnswers, holdNext, readStored, settle } = kit;
const relaunch = () => kit.relaunch(fake);
const appReady = () => { fake.app.ready = true; };

await relaunch(); // the first import, at collection (see authTestKit.ts)

const REFRESHED = { access_token: 'refreshed-access', expires_in: 3600 };
const NEW_ACCOUNT = { access_token: 'new-access', refresh_token: 'new-refresh', expires_in: 3600 };
const ENCRYPT = () => fake.safeStorage.encryptStringAsync;

/** Everything written to the console from here on, objects expanded in full. */
function consoleOutput(): () => string {
    const spies = (['error', 'warn', 'log', 'info'] as const).map(level => vi.spyOn(console, level).mockImplementation(() => undefined));
    return () => spies.flatMap(spy => spy.mock.calls.flat())
        .map(arg => (typeof arg === 'string' ? arg : inspect(arg, { depth: null, showHidden: true }))).join('\n');
}

describe('a sign-in whose save meets another change', () => {
    beforeEach(() => kit.resetAuthFakes(fake));
    afterEach(() => vi.restoreAllMocks());

    it('another account signs in while the first one\'s refresh save is still encrypting, with no sign-out: the new account is on disk', async () => {
        kit.storeEncrypted(fake, JSON.stringify(expiredSession()));
        googleAnswers(fake, REFRESHED);
        const authService = await relaunch();
        appReady();
        const refreshSave = holdNext(ENCRYPT());
        expect(await authorization(authService)).toBe('Bearer refreshed-access'); // the refresh's save runs in the background
        await vi.waitFor(() => expect(ENCRYPT()).toHaveBeenCalledTimes(1));
        googleAnswers(fake, NEW_ACCOUNT);

        const { signedIn, callback } = await kit.startSignIn(fake, authService);
        // The sign-in has installed the new account on the client, so its save has been asked for.
        await vi.waitFor(async () => expect((await authService.getAuthClient()).credentials.refresh_token).toBe('new-refresh'));
        await settle(); // long enough for a save that is not queued behind the first to land before it
        refreshSave.release();
        await Promise.all([signedIn, callback]);
        await settle(); // the refresh's save, which nothing awaits, has finished too

        expect(readStored(fake)).toMatchObject({ access_token: 'new-access', refresh_token: 'new-refresh' });
    });

    it('a sign-out while the sign-in\'s own save is still encrypting: nothing on disk, and startAuth resolves (dropped, not failed)', async () => {
        const output = consoleOutput();
        const authService = await relaunch();
        appReady();
        const encrypting = holdNext(ENCRYPT());
        googleAnswers(fake, NEW_ACCOUNT);
        const { signedIn, callback } = await kit.startSignIn(fake, authService);
        await vi.waitFor(() => expect(ENCRYPT()).toHaveBeenCalledTimes(1));

        authService.logout();
        encrypting.release();
        await Promise.all([signedIn, callback]); // rejects here if the dropped save was treated as a failure that stops the sign-in

        expect([...fake.storeData.keys()]).toEqual([]);
        expect(output()).not.toContain('Failed to save the Google tokens');
        expect(await authService.isAuthenticated()).toBe(false);
    });
});
