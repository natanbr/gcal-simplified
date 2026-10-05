// ============================================================
// auth.ts logs the failures it survives without the error object (2026-10-04)
// ------------------------------------------------------------
// Four places in auth.ts catch an error and carry on: a refresh whose save
// fails (the 'tokens' listener), a sign-in whose save fails, a refusal whose
// clear fails, and a signed-out listener that throws. Each logs a fixed phrase
// with errorSummary, never the object: a store error can quote the token file,
// and an error from Google carries its request, refresh token included.
// The fakes are in authTestKit.ts.
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

const relaunch = () => kit.relaunch(fake);
const appReady = () => { fake.app.ready = true; };

await relaunch(); // the first import, at collection (see authTestKit.ts)

const SEED = 'SEEDED-REFRESH-TOKEN-0123';
/** A store error quoting the file, carrying a request the way a Google error does. */
const seededError = () => Object.assign(new Error(`EPERM: operation not permitted near "${SEED}"`), {
    code: 'EPERM', config: { data: `refresh_token=${SEED}` },
});

/** Everything written to the console from here on, objects expanded in full. */
function consoleOutput(): () => string {
    const spies = (['error', 'warn', 'log', 'info'] as const).map(level => vi.spyOn(console, level).mockImplementation(() => undefined));
    return () => spies.flatMap(spy => spy.mock.calls.flat())
        .map(arg => (typeof arg === 'string' ? arg : inspect(arg, { depth: null, showHidden: true }))).join('\n');
}

describe('auth.ts logs a failure it survives without the error object', () => {
    beforeEach(() => kit.resetAuthFakes(fake));
    afterEach(() => vi.restoreAllMocks());

    it('a refresh whose save fails', async () => {
        kit.storeEncrypted(fake, JSON.stringify(kit.expiredSession()));
        kit.googleAnswers(fake, { access_token: 'refreshed-access', expires_in: 3600 });
        const output = consoleOutput();
        const authService = await relaunch();
        appReady();
        expect(authService.isAuthenticated()).toBe(true);
        fake.storeWriteError.next = seededError();

        expect(await kit.authorization(authService)).toBe('Bearer refreshed-access');

        expect(output()).toContain('Failed to save the Google tokens (EPERM)');
        expect(output()).not.toContain(SEED);
    });

    it('a sign-in whose save fails', async () => {
        kit.googleAnswers(fake, { access_token: 'signed-in-access', refresh_token: 'signed-in-refresh', expires_in: 3600 });
        const output = consoleOutput();
        const authService = await relaunch();
        appReady();
        fake.storeWriteError.next = seededError();

        await kit.signIn(fake, authService);

        expect(authService.isAuthenticated()).toBe(true);
        expect(output()).toContain('Failed to save the Google tokens (EPERM)');
        expect(output()).not.toContain(SEED);
    });

    it('a refusal whose clear fails, and a signed-out listener that throws', async () => {
        kit.storeEncrypted(fake, JSON.stringify(kit.expiredSession()));
        kit.googleAnswers(fake, kit.REVOKED, 400);
        const output = consoleOutput();
        const authService = await relaunch();
        appReady();
        authService.onSignedOut(() => { throw seededError(); });
        fake.storeWriteError.next = seededError();

        await expect(kit.authorization(authService)).rejects.toMatchObject({ status: 400 });

        expect(authService.isAuthenticated()).toBe(false);
        expect(output()).toContain('[auth] Could not clear the saved Google tokens (EPERM)');
        expect(output()).toContain('[auth] A signed-out listener failed (EPERM)');
        expect(output()).not.toContain(SEED);
    });
});
