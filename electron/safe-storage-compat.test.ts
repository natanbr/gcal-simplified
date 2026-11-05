// @vitest-environment node
// ============================================================
// Tokens saved on an older Electron still decrypt after the move to the async safeStorage API.
// ------------------------------------------------------------
// auth-token-store.ts used to call the synchronous safeStorage.encryptString /
// decryptString; Electron 46 removes them, so the code moves to
// encryptStringAsync / decryptStringAsync. Every family that updates has a
// auth-store.json written by v0.0.45 (Electron 40, synchronous encryptString).
// If the async decrypt could not read that blob, the update would sign everyone
// out of Google at its first launch, and no fake safeStorage can say whether it
// can: only the real backend (DPAPI behind Chromium's os_crypt) can.
//
// So this suite spawns the Electron binary the project installs, twice, on one
// throwaway userData folder. Process 1 encrypts a token-shaped JSON with the
// deprecated synchronous encryptString (what v0.0.45 wrote with); process 2, a
// separate process like a relaunch, decrypts it with decryptStringAsync. The
// round trip must return the input, and shouldReEncrypt must be false.
//
// The trap, measured on Electron 45.2.1 / Windows: the key lives in
// <userData>/Local State (os_crypt.encrypted_key) and is written only when the
// app quits cleanly. A process that ends with app.exit() never writes it, and
// the next process then cannot decrypt anything. So the probe script ends with
// app.quit(), after a no-op 'window-all-closed' handler (the default handler
// quits when no window ever opened, which would race the work).
//
// A second case writes with encryptStringAsync, what every save writes now, and
// reads it back in a later process.
//
// This suite characterizes the platform and is green before the app code
// changes. The synchronous cases need Electron 45 or older: from Electron 46 the
// synchronous writer does not exist, and they then fail with that message.
// Retire them when Electron 46 lands, once no installed copy can still hold a
// token file from a synchronous build; keep the async case.
// ============================================================

import { describe, it, expect, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { electronBinary } from './electronBinaryTestKit';

/** What a refresh-token blob looks like. Nothing here is a credential. */
const TOKENS = {
    access_token: 'ya29.compat-access-token',
    refresh_token: '1//compat-refresh-token',
    scope: 'https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/tasks.readonly',
    token_type: 'Bearer',
    expiry_date: 1_799_999_999_000,
};

/**
 * The probe: runs as the Electron main script. Its work and its outcome go through
 * files, so Chromium's stderr noise (shader cache lines, the deprecation notice) never matters.
 */
const PROBE = `
'use strict';
const { app, safeStorage } = require('electron');
const fs = require('node:fs');
const env = process.env;
app.setPath('userData', env.COMPAT_USER_DATA);
app.on('window-all-closed', () => {});

async function encrypt() {
    if (typeof safeStorage.encryptString !== 'function') {
        return { ok: false, message: 'safeStorage.encryptString does not exist in this Electron (removed in 46)' };
    }
    if (!safeStorage.isEncryptionAvailable()) return { ok: false, message: 'safeStorage reports encryption unavailable' };
    const blob = safeStorage.encryptString(fs.readFileSync(env.COMPAT_PLAIN, 'utf8'));
    fs.writeFileSync(env.COMPAT_BLOB, blob.toString('base64'));
    return { ok: true };
}

async function encryptAsync() {
    if (!(await safeStorage.isAsyncEncryptionAvailable())) return { ok: false, message: 'safeStorage reports async encryption unavailable' };
    const blob = await safeStorage.encryptStringAsync(fs.readFileSync(env.COMPAT_PLAIN, 'utf8'));
    fs.writeFileSync(env.COMPAT_BLOB, blob.toString('base64'));
    return { ok: true };
}

async function decrypt() {
    if (!(await safeStorage.isAsyncEncryptionAvailable())) return { ok: false, message: 'safeStorage reports async encryption unavailable' };
    const blob = Buffer.from(fs.readFileSync(env.COMPAT_BLOB, 'utf8'), 'base64');
    const { result, shouldReEncrypt } = await safeStorage.decryptStringAsync(blob);
    return { ok: true, result, shouldReEncrypt };
}

app.whenReady().then(async () => {
    let outcome;
    try {
        outcome = await ({ encrypt, 'encrypt-async': encryptAsync, decrypt })[env.COMPAT_MODE]();
    } catch (error) {
        outcome = { ok: false, message: error instanceof Error ? error.message : String(error) };
    }
    fs.writeFileSync(env.COMPAT_OUTCOME, JSON.stringify(outcome));
    app.quit();
});
`;

interface Outcome {
    ok: boolean;
    message: string | undefined;
    result: string | undefined;
    shouldReEncrypt: boolean | undefined;
}

function readOutcome(file: string, run: string): Outcome {
    if (!existsSync(file)) throw new Error(`The probe wrote no outcome (${run}).`);
    const parsed: unknown = JSON.parse(readFileSync(file, 'utf8'));
    if (typeof parsed !== 'object' || parsed === null) throw new Error(`Unexpected probe outcome: ${JSON.stringify(parsed)} (${run})`);
    const fields = new Map(Object.entries(parsed));
    const text = (name: string) => { const value = fields.get(name); return typeof value === 'string' ? value : undefined; };
    const flag = (name: string) => { const value = fields.get(name); return typeof value === 'boolean' ? value : undefined; };
    return { ok: flag('ok') === true, message: text('message'), result: text('result'), shouldReEncrypt: flag('shouldReEncrypt') };
}

const root = mkdtempSync(join(tmpdir(), 'gcal-safestorage-'));
const script = join(root, 'probe.cjs');
const plainFile = join(root, 'plain.json');
let runs = 0;

/** One Electron process on `userData`, reading or writing `blobFile`. */
function runProbe(mode: 'encrypt' | 'encrypt-async' | 'decrypt', userData: string, blobFile: string): Outcome {
    const binary = electronBinary();
    const outcomeFile = join(root, `outcome-${++runs}.json`);
    // Electron given a script that does not exist waits on an error dialog, hidden, until the timeout.
    if (!existsSync(script)) writeFileSync(script, PROBE);
    mkdirSync(userData, { recursive: true });
    const env: NodeJS.ProcessEnv = {
        ...process.env,
        COMPAT_MODE: mode, COMPAT_USER_DATA: userData, COMPAT_PLAIN: plainFile, COMPAT_BLOB: blobFile, COMPAT_OUTCOME: outcomeFile,
    };
    // As plain Node the binary would not be an app at all.
    delete env.ELECTRON_RUN_AS_NODE;
    const run = `${mode} on ${userData}`;
    const result = spawnSync(binary, [script], { env, encoding: 'utf8', timeout: 25_000, windowsHide: true });
    if (result.error) throw new Error(`Could not run ${binary} (${run}): ${result.error.message}`);
    if (!existsSync(outcomeFile)) {
        throw new Error(`${binary} exited with ${result.status} and wrote no outcome (${run}): ${result.stderr.trim().slice(-600)}`);
    }
    return readOutcome(outcomeFile, run);
}

const userData = join(root, 'user-data');
const blob = join(root, 'tokens.b64');
let written: Outcome | undefined;

/** Process 1, once: the blob the cases decrypt. Its failure fails every case that needs it. */
function writeBlobWithTheOldApi(): void {
    if (written) return;
    writeFileSync(plainFile, JSON.stringify(TOKENS));
    written = runProbe('encrypt', userData, blob);
    if (!written.ok) throw new Error(`The synchronous writer failed: ${written.message}`);
}

afterAll(() => rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }));

describe('safeStorage: a blob from the synchronous API decrypts with the async API in a later process', { timeout: 60_000 }, () => {
    it('round-trips a token-shaped JSON, and says it needs no re-encryption', () => {
        writeBlobWithTheOldApi();

        const read = runProbe('decrypt', userData, blob);

        expect(read.ok, `decryptStringAsync failed: ${read.message}`).toBe(true);
        expect(read.result).toBe(JSON.stringify(TOKENS));
        expect(JSON.parse(read.result ?? 'null')).toEqual(TOKENS);
        expect(read.shouldReEncrypt).toBe(false);
    });

    it('rejects input that is not a safeStorage blob', () => {
        writeBlobWithTheOldApi(); // so the key is in place and the garbage is the only difference
        const garbage = join(root, 'garbage.b64');
        writeFileSync(garbage, Buffer.from('this is not ciphertext').toString('base64'));

        const read = runProbe('decrypt', userData, garbage);

        expect(read.ok).toBe(false);
        expect(read.result).toBeUndefined();
        expect(read.message).toContain('decryptStringAsync');
    });

    it('the key belongs to the userData folder: another folder cannot read the blob (the round trip is not trivially green)', () => {
        writeBlobWithTheOldApi();

        const read = runProbe('decrypt', join(root, 'other-user-data'), blob);

        expect(read.ok).toBe(false);
        expect(read.result).toBeUndefined();
        expect(read.message).toContain('decryptStringAsync');
    });
});

describe('safeStorage: a blob from the async API decrypts in a later process (what every save writes now)', { timeout: 60_000 }, () => {
    it('round-trips a token-shaped JSON through encryptStringAsync and decryptStringAsync', () => {
        const asyncUserData = join(root, 'async-user-data');
        const asyncBlob = join(root, 'tokens-async.b64');
        writeFileSync(plainFile, JSON.stringify(TOKENS));
        const wrote = runProbe('encrypt-async', asyncUserData, asyncBlob);
        expect(wrote.ok, `encryptStringAsync failed: ${wrote.message}`).toBe(true);

        const read = runProbe('decrypt', asyncUserData, asyncBlob);

        expect(read.ok, `decryptStringAsync failed: ${read.message}`).toBe(true);
        expect(JSON.parse(read.result ?? 'null')).toEqual(TOKENS);
        expect(read.shouldReEncrypt).toBe(false);
    });
});
