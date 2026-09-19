// ============================================================
// Test kits stay out of the app.
// ------------------------------------------------------------
// The per-module test kits (quizTestKit, dragTestKit, dragFixtures) live beside
// the code they fake and are not *.test.* files, so tsc, lint and the build all
// treat them as production source. An editor auto-import of `emptyGrid` into a
// game module passes every one of those checks.
//
// A kit's own `vitest` import is no defence: vitest declares
// `"sideEffects": false`, so a production build drops any import of it whose
// bindings go unused, and the fixture ships without a sound. Only this guard,
// which reads the imports themselves, sees it.
// ============================================================

import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { productionSources, readSource, repoRoot, toRepoPath } from './helpers/sourceFiles';

/** Non-test files that exist only to support tests. Adding one is a deliberate edit. */
const TEST_SUPPORT = [
    'src/mission-control/games/blocks/dragFixtures.ts',
    'src/mission-control/games/blocks/dragTestKit.ts',
    'src/mission-control/games/quiz/quizTestKit.ts',
    'src/test/setup.ts',
];

const TEST_LIBRARY = /^(vitest|@vitest\/|@testing-library\/)/;

/** A kit by the naming convention CLAUDE.md → Testing → Fixtures describes. */
const KIT_NAME = /(TestKit|Fixtures)\.tsx?$/;

/** Module specifiers of static imports, re-exports and dynamic imports. */
const SPECIFIER = /(?:\bfrom\s*|\bimport\s*\(?\s*)['"]([^'"]+)['"]/g;

function resolveRelative(fromFile: string, specifier: string): string | null {
    if (!specifier.startsWith('.')) return null;
    const base = resolve(dirname(fromFile), specifier);
    const candidates = [`${base}.ts`, `${base}.tsx`, base, join(base, 'index.ts'), join(base, 'index.tsx')];
    const hit = candidates.find(path => /\.tsx?$/.test(path) && existsSync(path));
    return hit ? toRepoPath(hit) : null;
}

const production = () => productionSources().filter(file => !TEST_SUPPORT.includes(toRepoPath(file)));

describe('test kits stay out of the app', () => {
    it('lists only test-support files that exist', () => {
        // A renamed kit would otherwise drop out of the check below unnoticed.
        const missing = TEST_SUPPORT.filter(path => !existsSync(join(repoRoot, path)));
        expect(missing, 'TEST_SUPPORT names files that no longer exist').toEqual([]);
    });

    it('lists every file named like a test kit', () => {
        const unlisted = production().filter(file => KIT_NAME.test(basename(file))).map(toRepoPath);
        expect(
            unlisted,
            'A file named *TestKit / *Fixtures is a test kit: add it to TEST_SUPPORT so production code is barred from importing it',
        ).toEqual([]);
    });

    it('no production module imports a test library or a test kit', () => {
        const violations: string[] = [];
        for (const file of production()) {
            for (const [, specifier] of readSource(file).matchAll(SPECIFIER)) {
                const target = resolveRelative(file, specifier);
                if (TEST_LIBRARY.test(specifier) || (target && TEST_SUPPORT.includes(target))) {
                    violations.push(`${toRepoPath(file)} → '${specifier}'`);
                }
            }
        }
        expect(
            violations,
            'Production code imports test-only code, which a build would ship (a kit\'s own vitest ' +
            'import is tree-shaken, so nothing else fails). Import it from a *.test.* file instead.',
        ).toEqual([]);
    });
});
