// ============================================================
// Google credentials load after ready — structural pin (source-reading test).
// ------------------------------------------------------------
// electron/auth_app_ready.test.ts proves auth.ts itself touches no safeStorage
// method while it is imported. It cannot see a CALLER: a module-scope
// `authService.isAuthenticated()` in main.ts runs while main.js is imported,
// before `app` is ready, so it throws and no window opens on any launch, yet
// every suite that loads main.ts mocks './auth' (a reviewer added exactly that
// line and all 2234 unit tests stayed green, 2026-10-01). So this walks every
// production file under electron/ with the TypeScript parser and lists each
// `authService.` and `safeStorage.` read outside every function body, i.e. code
// that runs on import. Inside a function (an IPC handler, a whenReady callback)
// is fine.
//
// Not covered: a constructor of a class built at module scope (the original
// bug, `new AuthService()` whose constructor decrypted; that is the import case
// in auth_app_ready.test.ts), and an alias (`const s = safeStorage`).
//
// verifiedRedBy: see the registry entry in rule-registry.test.ts.
// ============================================================

import { describe, it, expect } from 'vitest';
import ts from 'typescript';
import { productionSources, readSource, toRepoPath } from './helpers/sourceFiles';

const READY_ONLY = new Set(['authService', 'safeStorage']);

/** Each `authService.x` / `safeStorage.x` outside every function body, as "file:line authService.x". */
function moduleScopeReads(path: string, code: string): string[] {
    const file = ts.createSourceFile(path, code, ts.ScriptTarget.Latest, true);
    const found: string[] = [];
    const visit = (node: ts.Node): void => {
        if (ts.isFunctionLike(node)) return;
        if (ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.expression) && READY_ONLY.has(node.expression.text)) {
            found.push(`${path}:${file.getLineAndCharacterOfPosition(node.getStart()).line + 1} ${node.getText()}`);
        }
        ts.forEachChild(node, visit);
    };
    visit(file);
    return found;
}

const SOURCES = productionSources(['electron']).map(f => ({ path: toRepoPath(f), code: readSource(f) }));

describe('Google credentials are never read while main.js is imported', () => {
    it('no production file under electron/ reads authService or safeStorage at module scope', () => {
        expect(SOURCES.length, 'the file walk found nothing — the guard would pass vacuously').toBeGreaterThan(10);
        expect(SOURCES.flatMap(({ path, code }) => moduleScopeReads(path, code))).toEqual([]);
    });

    it('flags a module-scope read and allows the same read inside a handler', () => {
        const probe = [
            'authService.isAuthenticated();',
            "ipcMain.handle('auth:check', () => authService.isAuthenticated());",
            'const available = safeStorage.isEncryptionAvailable();',
            'app.whenReady().then(function () { safeStorage.decryptString(blob); });',
        ].join('\n');

        expect(moduleScopeReads('probe.ts', probe)).toEqual([
            'probe.ts:1 authService.isAuthenticated',
            'probe.ts:3 safeStorage.isEncryptionAvailable',
        ]);
    });
});
