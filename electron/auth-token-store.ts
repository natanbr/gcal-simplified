import { app, safeStorage } from 'electron';
import Store from 'electron-store';
import fs from 'node:fs';
import path from 'node:path';
import type { Credentials } from 'google-auth-library';
import { errorSummary } from './log-safe';

interface AuthStore {
    tokens?: Credentials | string;
    isEncrypted?: boolean;
}

/** PowerShell 5.1's Set-Content -Encoding UTF8 writes a byte-order mark, so a hand repair has one. */
const withoutBom = (text: string): AuthStore => JSON.parse(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text);

/** userData/auth-store.json; the folder is named here because the corrupt-file path below must be the same one. */
const openStore = () => new Store<AuthStore>({ name: 'auth-store', cwd: app.getPath('userData'), deserialize: withoutBom });
const storeFile = () => path.join(app.getPath('userData'), 'auth-store.json');

let opened: Store<AuthStore> | null = null;

/**
 * The token file, opened on first use, never while main.js is imported: that
 * runs before the single-instance lock and before any window, and electron-store
 * reads and parses the file as it opens, so an unparseable one stopped every
 * launch with no window. A file that is held (EBUSY/EPERM/EACCES) throws and is
 * tried again by the next call.
 */
function authStore(): Store<AuthStore> {
    opened ??= parsedOrMovedAside(openStore, openStore);
    return opened;
}

/**
 * Runs `read`. Content that can never parse (empty, truncated, NUL-filled) is
 * moved aside to auth-store.json.corrupt-<time> and read as absent, which shows
 * Sign in; refusing it would block the app until someone deleted the file. Any
 * other failure is rethrown, and a rename that is refused means the file is in
 * use: that throws too, so the next call tries again.
 */
function parsedOrMovedAside<T>(read: () => T, absent: () => T): T {
    try {
        return read();
    } catch (error) {
        if (!(error instanceof Error) || error.name !== 'SyntaxError') throw error;
    }
    const aside = `${storeFile()}.corrupt-${new Date().toISOString().replace(/[:.]/g, '-')}`;
    fs.renameSync(storeFile(), aside);
    // A fixed phrase: a JSON.parse message quotes the file, and the file holds the tokens.
    console.error(`[auth] auth-store.json could not be parsed: moved it to ${aside}. Sign in with Google again.`);
    return absent();
}

/** google-auth-library's eagerRefreshThresholdMillis: an access token this close to expiry is refreshed, not sent. */
const REFRESH_MARGIN_MS = 5 * 60 * 1000;

/**
 * Whether these credentials can authorize a Google call: a refresh token, or an
 * access token still valid beyond the library's refresh margin. An expired
 * access token with no refresh token is not a sign-in (every call fails "No
 * refresh token is set."), and neither is a parsed `42`, `null` or `{}`.
 * An access token with no expiry_date is refused too, on purpose: the library
 * treats a missing expiry as "never expires" and would send it, but Google's
 * access tokens last an hour, so nothing shows this one is still valid, and with
 * no refresh token the first 401 leaves an empty week.
 */
export function canAuthorize(value: unknown): value is Credentials {
    if (typeof value !== 'object' || value === null) return false;
    if ('refresh_token' in value && typeof value.refresh_token === 'string' && value.refresh_token !== '') return true;
    return 'access_token' in value && typeof value.access_token === 'string' && value.access_token !== ''
        && 'expiry_date' in value && typeof value.expiry_date === 'number'
        && value.expiry_date > Date.now() + REFRESH_MARGIN_MS;
}

/** About as long as the held-file waits: a slow keychain still answers, a stuck one shows Sign in instead of nothing. */
export const CIPHER_TIMEOUT_MS = 15_000;

/** A fixed phrase, no data: it reaches the log and, through auth:check, the window. */
class SafeStorageTimeout extends Error {
    constructor() {
        super('safeStorage did not answer in time');
        this.name = 'SafeStorageTimeout';
    }
}

/**
 * What `cipher` answers, or a SafeStorageTimeout once it has taken
 * CIPHER_TIMEOUT_MS. Each safeStorage call is a round trip to the OS keychain,
 * and one that never answers would leave auth:check pending, or hold every
 * later save behind it. The timer is cleared as soon as the call settles, so an
 * idle app holds none. A call cannot be cancelled: an answer after the timeout
 * reaches the handlers below and changes nothing, so a late rejection is never
 * an unhandled one.
 */
function withinCipherTimeout<T>(cipher: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        const timer = setTimeout(() => reject(new SafeStorageTimeout()), CIPHER_TIMEOUT_MS);
        cipher().then(
            (value) => { clearTimeout(timer); resolve(value); },
            (error: unknown) => { clearTimeout(timer); reject(error); },
        );
    });
}

/**
 * The saved credentials, or null when there are none this client could use.
 * The file is read synchronously, so a held one (EBUSY/EPERM/EACCES) rejects
 * and the caller tries again; only the decrypt waits, and one that times out
 * rejects the same way.
 */
export async function readStoredTokens(): Promise<Credentials | null> {
    const store = authStore();
    // electron-store reads the file again on every get, so a file damaged since it was opened is handled here too.
    const [stored, isEncrypted] = parsedOrMovedAside(
        () => [store.get('tokens'), store.get('isEncrypted')] as const,
        () => [undefined, undefined] as const,
    );

    if (!stored) return null;

    if (isEncrypted && typeof stored === 'string') {
        return decrypted(stored);
    } else if (typeof stored === 'object') {
        // Unencrypted object (legacy or fallback)
        return canAuthorize(stored) ? stored : null;
    }

    return null;
}

/**
 * A blob this machine cannot decrypt is "signed out", never a rejection: the
 * availability check is inside the try too, so no cipher failure reaches
 * auth:check, and none is logged with its text (a parse message quotes it).
 * A timeout does reject: the tokens may be fine, so like a held file the next
 * call decrypts again, where null would leave the app signed out until a restart.
 */
async function decrypted(stored: string): Promise<Credentials | null> {
    try {
        const plain = await withinCipherTimeout(async () => {
            if (!(await safeStorage.isAsyncEncryptionAvailable())) return null;
            // shouldReEncrypt is ignored: the next 'tokens' save (every refresh,
            // hourly) encrypts with the current key anyway, and a load never writes.
            const { result } = await safeStorage.decryptStringAsync(Buffer.from(stored, 'base64'));
            return result;
        });
        if (plain === null) return null;
        const parsed: unknown = JSON.parse(plain);
        return canAuthorize(parsed) ? parsed : null;
    } catch (e) {
        if (e instanceof SafeStorageTimeout) throw e;
        console.error(`Failed to decrypt tokens (${errorSummary(e)})`);
        return null;
    }
}

/** Every save, in the order they were asked for: a slow encrypt cannot let an older save land after a newer one. */
let saving: Promise<void> = Promise.resolve();
/** Moved on by every sign-out, so a save still encrypting when the user signed out is dropped. */
let generation = 0;

/**
 * Plain text only when this platform has no encryption (Linux without a
 * keyring) or encrypting fails, never when it times out: a slow keychain is not
 * a missing one, so that save rejects and writes nothing. A failed write
 * rejects and leaves the file as it was: falling back to plain text there wrote
 * the refresh token to disk unencrypted. electron-store re-reads the file
 * before every write, so one damaged since it was opened is moved aside here
 * too, and the write goes to a fresh file.
 *
 * The encrypt is async, so a sign-out can happen while it runs: the generation
 * is taken now, when the save is asked for, and a save that finds it moved on
 * writes nothing, or the signed-out account would come back on disk. A failed
 * or timed-out save does not stop the ones queued after it, and they do not
 * wait for the stuck call.
 */
export function writeStoredTokens(tokens: Credentials): Promise<void> {
    const askedIn = generation;
    const save = saving.then(async () => {
        const values = (await encrypted(tokens)) ?? { tokens, isEncrypted: false };
        if (askedIn !== generation) return;
        const write = () => authStore().set(values);
        parsedOrMovedAside(write, write);
        removeMovedAsideCopies();
    });
    saving = save.catch(() => undefined);
    return save;
}

/**
 * null means plain text: this platform has no encryption, or the encrypt was
 * asked and failed, as the synchronous API did when it threw. An availability
 * check that fails and a timeout both reject the save: either as null would
 * widen that fallback.
 */
async function encrypted(tokens: Credentials): Promise<AuthStore | null> {
    let asked = false;
    try {
        const blob = await withinCipherTimeout(async () => {
            if (!(await safeStorage.isAsyncEncryptionAvailable())) return null;
            asked = true;
            return safeStorage.encryptStringAsync(JSON.stringify(tokens));
        });
        return blob && { tokens: blob.toString('base64'), isEncrypted: true };
    } catch (error) {
        if (!asked || error instanceof SafeStorageTimeout) throw error;
        console.error(`Failed to encrypt tokens (${errorSummary(error)})`);
        return null;
    }
}

/** Synchronous, so the sign-out is on disk before logout() returns; every save asked for before it and not yet written is dropped. */
export function clearStoredTokens(): void {
    generation += 1;
    parsedOrMovedAside(() => {
        const store = authStore();
        store.delete('tokens');
        store.delete('isEncrypted');
    }, () => undefined);
    removeMovedAsideCopies();
}

/**
 * A moved-aside token file has no recovery value and may still hold a refresh
 * token, so the copies go on the next successful save and on every sign-out.
 * config.json's copies are not this module's (a separate decision).
 */
function removeMovedAsideCopies(): void {
    const folder = app.getPath('userData');
    let names: string[];
    try {
        names = fs.readdirSync(folder);
    } catch (error) {
        console.error(`[auth] Could not list the userData folder for old token-file copies (${errorSummary(error)})`);
        return;
    }
    for (const name of names.filter(entry => entry.startsWith('auth-store.json.corrupt-'))) {
        try {
            fs.unlinkSync(path.join(folder, name));
        } catch (error) {
            console.error(`[auth] Could not delete ${name} (${errorSummary(error)}); the next save or sign-out tries again.`);
        }
    }
}
