// ============================================================
// Synthetic Supabase keys and throwaway project folders for the package key
// guard's suites. Every key here is built at run time and signed with nothing:
// no real key, and no literal in the source that a secret scanner could take
// for one.
// ============================================================

import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

const base64url = (value: object): string => Buffer.from(JSON.stringify(value)).toString('base64url');

/** A JWT shaped like Supabase's legacy keys, with the given `role` claim. */
export function syntheticJwt(role: string, headerClaims: object = { alg: 'HS256', typ: 'JWT' }): string {
    const header = base64url(headerClaims);
    const payload = base64url({ iss: 'supabase', ref: 'synthetictestprojectref', role, iat: 1700000000, exp: 2000000000 });
    const signature = Buffer.from(`synthetic-signature-for-${role}-not-a-real-key`).toString('base64url');
    return `${header}.${payload}.${signature}`;
}

/** New-style keys: `sb_secret_…` is an admin key, `sb_publishable_…` a public one. */
export const syntheticSecretKey = (): string => ['sb', 'secret', 'SyntheticTestOnlyKeyBody0000000'].join('_');
export const syntheticPublishableKey = (): string => ['sb', 'publishable', 'SyntheticTestOnlyKeyBody00'].join('_');

/** The part of a key that must never be printed: everything after its public
 *  prefix (the `sb_secret_` label, or a JWT's standard header). */
export function secretPart(key: string): string {
    if (key.startsWith('sb_secret_')) return key.slice('sb_secret_'.length);
    return key.slice(key.indexOf('.') + 1);
}

/** Every 6-character run of the secret part, so a test can prove none of it was printed. */
export function secretWindows(key: string): string[] {
    const secret = secretPart(key);
    const windows: string[] = [];
    for (let i = 0; i + 6 <= secret.length; i++) windows.push(secret.slice(i, i + 6));
    return windows;
}

/** A line of minified main-process code holding `key` the way vite's `define` writes it. */
export const minifiedBundle = (key: string): string =>
    `"use strict";const Q=require("electron");var Xr="https://synthetic.supabase.co",Yr="${key}";function Zr(){return Kn(Xr,Yr,{realtime:{}})}`;

/** A build as `npx vite build` leaves it: the renderer in dist/, the main process in dist-electron/. */
export const viteBuild = (mainJs: string, rendererJs = 'console.log("renderer")') => ({
    'dist/index.html': '<!doctype html><script src="./assets/index-abc123.js"></script>',
    'dist/assets/index-abc123.js': rendererJs,
    'dist-electron/main.js': mainJs,
    'dist-electron/preload.mjs': 'const{contextBridge}=require("electron");',
});

/** `text` as UTF-16 bytes, little- or big-endian, with a byte-order mark. */
export function utf16(text: string, order: 'le' | 'be'): Buffer {
    const le = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(text, 'utf16le')]);
    return order === 'le' ? le : Buffer.from(le).swap16();
}

/** `length` characters of base64url that look random but are the same on every run,
 *  with a dot every 37 characters so JWT-shaped runs turn up. */
export function deterministicBase64(length: number): string {
    let out = '';
    for (let block = 0; out.length < length; block++) {
        out += createHash('sha256').update(`block-${block}`).digest('base64url');
    }
    return out.slice(0, length).replace(/(.{36})./g, '$1.');
}

/** Throwaway project folders, removed by `cleanup()`. */
export function projectFactory() {
    const made: string[] = [];
    return {
        make(files: Record<string, string | Buffer>): string {
            const dir = mkdtempSync(join(tmpdir(), 'package-key-guard-'));
            made.push(dir);
            for (const [relative, content] of Object.entries(files)) {
                mkdirSync(dirname(join(dir, relative)), { recursive: true });
                writeFileSync(join(dir, relative), content);
            }
            return dir;
        },
        write(dir: string, relative: string, content: string | Buffer): void {
            mkdirSync(dirname(join(dir, relative)), { recursive: true });
            writeFileSync(join(dir, relative), content);
        },
        cleanup(): void {
            for (const dir of made.splice(0)) rmSync(dir, { recursive: true, force: true });
        },
    };
}
