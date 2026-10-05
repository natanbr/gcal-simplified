import { app, safeStorage } from 'electron';
import Store from 'electron-store';
import fs from 'node:fs';
import path from 'node:path';
import type { Credentials } from 'google-auth-library';

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

/** The saved credentials, or null when there are none this client could use. */
export function readStoredTokens(): Credentials | null {
    const store = authStore();
    // electron-store reads the file again on every get, so a file damaged since it was opened is handled here too.
    const [stored, isEncrypted] = parsedOrMovedAside(
        () => [store.get('tokens'), store.get('isEncrypted')] as const,
        () => [undefined, undefined] as const,
    );

    if (!stored) return null;

    if (isEncrypted && typeof stored === 'string' && safeStorage.isEncryptionAvailable()) {
        try {
            const buffer = Buffer.from(stored, 'base64');
            const parsed: unknown = JSON.parse(safeStorage.decryptString(buffer));
            return canAuthorize(parsed) ? parsed : null;
        } catch (e) {
            console.error('Failed to decrypt tokens', e);
            return null;
        }
    } else if (typeof stored === 'object') {
        // Unencrypted object (legacy or fallback)
        return canAuthorize(stored) ? stored : null;
    }

    return null;
}

/**
 * Plain text only when this platform has no encryption (Linux without a
 * keyring) or encrypting throws. A failed write throws and leaves the file as
 * it was: falling back to plain text there wrote the refresh token to disk
 * unencrypted.
 */
export function writeStoredTokens(tokens: Credentials): void {
    authStore().set(encrypted(tokens) ?? { tokens, isEncrypted: false });
}

function encrypted(tokens: Credentials): AuthStore | null {
    if (!safeStorage.isEncryptionAvailable()) return null;
    try {
        return { tokens: safeStorage.encryptString(JSON.stringify(tokens)).toString('base64'), isEncrypted: true };
    } catch (error) {
        console.error('Failed to encrypt tokens', error);
        return null;
    }
}

export function clearStoredTokens(): void {
    const store = authStore();
    store.delete('tokens');
    store.delete('isEncrypted');
}
