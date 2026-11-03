// ============================================================
// No production file under electron/ uses safeStorage's synchronous methods.
// ------------------------------------------------------------
// Electron 46 removes safeStorage.isEncryptionAvailable, encryptString and
// decryptString (deprecated since 45); the async trio replaces them
// (isAsyncEncryptionAvailable, encryptStringAsync, decryptStringAsync). A call
// left behind is invisible to everything but a run on Electron 46: tsc stops it
// only once the typings drop the methods, and the unit suites fake safeStorage
// (authTestKit.ts makes the fake's sync trio throw, which catches a call a suite
// exercises, not one on a path no suite reaches).
//
// This reads the sources and looks for the three names as whole words. Kept
// simple on purpose: comments and strings count too, so a comment that quotes
// an old name also fails (say "the synchronous API" instead). The Async names
// are different words and do not match. Test files and *TestKit.ts are exempt:
// they fake or probe the removed methods deliberately.
// ============================================================

import { describe, it, expect } from 'vitest';
import { productionSources, readSource, toRepoPath } from './helpers/sourceFiles';

const REMOVED_IN_46 = /\b(isEncryptionAvailable|encryptString|decryptString)\b/;

/** Production files only: the walk already drops *.test.ts and *.d.ts; kits are dropped here. */
const isKit = (repoPath: string) => /TestKit\.tsx?$/.test(repoPath);

function offenders(): string[] {
    const found: string[] = [];
    for (const file of productionSources(['electron'])) {
        const repoPath = toRepoPath(file);
        if (isKit(repoPath)) continue;
        readSource(file).split(/\r\n|\r|\n/).forEach((line, index) => {
            const hit = REMOVED_IN_46.exec(line);
            if (hit) found.push(`${repoPath}:${index + 1} names ${hit[1]}`);
        });
    }
    return found;
}

describe('safeStorage: the synchronous methods Electron 46 removes', () => {
    it('the pattern matches the three removed names and none of the async ones', () => {
        for (const removed of ['isEncryptionAvailable', 'encryptString', 'decryptString']) {
            expect(REMOVED_IN_46.test(`safeStorage.${removed}(x)`), removed).toBe(true);
        }
        for (const kept of ['isAsyncEncryptionAvailable', 'encryptStringAsync', 'decryptStringAsync']) {
            expect(REMOVED_IN_46.test(`await safeStorage.${kept}(x)`), kept).toBe(false);
        }
    });

    it('the walk reaches the file that talks to safeStorage (the guard cannot pass by reading nothing)', () => {
        const files = productionSources(['electron']).map(toRepoPath);
        expect(files).toContain('electron/auth-token-store.ts');
    });

    it('no production file under electron/ names isEncryptionAvailable, encryptString or decryptString', () => {
        expect(
            offenders(),
            'Electron 46 removes these methods, so the call throws there. Use isAsyncEncryptionAvailable, ' +
            'encryptStringAsync and decryptStringAsync (auth-token-store.ts is the only caller); a comment that ' +
            'quotes an old name fails too, so describe it ("the synchronous API") instead.',
        ).toEqual([]);
    });
});
