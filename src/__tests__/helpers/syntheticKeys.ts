// ============================================================
// Synthetic Supabase keys and throwaway project folders for the package key
// guard's suites. Every key here is built at run time and signed with nothing:
// no real key, and no literal in the source that a secret scanner could take
// for one.
// ============================================================

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

const base64url = (value: object): string => Buffer.from(JSON.stringify(value)).toString('base64url');

/** A JWT shaped like Supabase's legacy keys, with the given `role` claim. */
export function syntheticJwt(role: string): string {
    const header = base64url({ alg: 'HS256', typ: 'JWT' });
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

/** Throwaway project folders, removed by `cleanup()`. */
export function projectFactory() {
    const made: string[] = [];
    return {
        make(files: Record<string, string>): string {
            const dir = mkdtempSync(join(tmpdir(), 'package-key-guard-'));
            made.push(dir);
            for (const [relative, content] of Object.entries(files)) {
                mkdirSync(dirname(join(dir, relative)), { recursive: true });
                writeFileSync(join(dir, relative), content);
            }
            return dir;
        },
        write(dir: string, relative: string, content: string): void {
            mkdirSync(dirname(join(dir, relative)), { recursive: true });
            writeFileSync(join(dir, relative), content);
        },
        cleanup(): void {
            for (const dir of made.splice(0)) rmSync(dir, { recursive: true, force: true });
        },
    };
}
