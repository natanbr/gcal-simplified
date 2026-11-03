// ============================================================
// Test kit for the suites that run the real Electron binary
// (bundled-tzdata.test.ts, safe-storage-compat.test.ts).
// ------------------------------------------------------------
// Imports no test library, so only its name and the TEST_SUPPORT list in
// src/__tests__/test-kit-boundary.test.ts keep production code from importing it.
// ============================================================

import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

export const INSTALL_HINT =
    'Since Electron 42 `npm install` does not download it; run `npx install-electron` in the project ' +
    '(or `node node_modules/electron/install.js`), then run this suite again.';

/** The path the `electron` package exports when required from Node, or a failure saying how to install it. */
export function electronBinary(): string {
    const requireFromHere = createRequire(import.meta.url);
    // From Electron 42 the package downloads a missing binary inside require('electron').
    // A unit test must not reach the network, so a binary that was never extracted
    // (the package writes path.txt when it extracts one) fails here instead.
    const packageDir = dirname(requireFromHere.resolve('electron/package.json'));
    if (process.env.ELECTRON_OVERRIDE_DIST_PATH) {
        throw new Error('ELECTRON_OVERRIDE_DIST_PATH is set: this suite checks the Electron the project installs, so unset it.');
    }
    const pathFile = join(packageDir, 'path.txt');
    if (!existsSync(pathFile)) throw new Error(`The Electron binary is not installed (no ${pathFile}). ${INSTALL_HINT}`);
    // require('electron') also downloads when path.txt is there but the binary it names is gone.
    const extracted = join(packageDir, 'dist', readFileSync(pathFile, 'utf8').trim());
    if (!existsSync(extracted)) throw new Error(`The Electron binary is missing at ${extracted}. ${INSTALL_HINT}`);
    let exported: unknown;
    try {
        exported = requireFromHere('electron');
    } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        throw new Error(`The Electron binary is not installed (${reason}). ${INSTALL_HINT}`);
    }
    if (typeof exported !== 'string') {
        throw new Error(`require('electron') from Node returned a ${typeof exported}, not the binary's path.`);
    }
    if (!existsSync(exported)) throw new Error(`The Electron binary is missing at ${exported}. ${INSTALL_HINT}`);
    return exported;
}
