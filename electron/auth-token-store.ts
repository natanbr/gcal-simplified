import { safeStorage } from 'electron';
import Store from 'electron-store';
import type { Credentials } from 'google-auth-library';

interface AuthStore {
    tokens?: Credentials | string;
    isEncrypted?: boolean;
}

const store = new Store<AuthStore>({ name: 'auth-store' });

/** google-auth-library's eagerRefreshThresholdMillis: an access token this close to expiry is refreshed, not sent. */
const REFRESH_MARGIN_MS = 5 * 60 * 1000;

/**
 * Whether these credentials can authorize a Google call: a refresh token, or an
 * access token the client will still send. An expired access token with no
 * refresh token is not a sign-in (every call fails "No refresh token is set."),
 * and neither is a parsed `42`, `null` or `{}`.
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
    const stored = store.get('tokens');
    const isEncrypted = store.get('isEncrypted');

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
    store.set(encrypted(tokens) ?? { tokens, isEncrypted: false });
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
    store.delete('tokens');
    store.delete('isEncrypted');
}
