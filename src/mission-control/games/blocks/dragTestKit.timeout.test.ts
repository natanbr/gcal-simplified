// ============================================================
// Every suite that renders through dragTestKit sets CANVAS_SUITE_TIMEOUT_MS.
//
// The first test of such a file pays BlocksCanvas's cold render in a fresh
// worker, which crossed the 5s default under load (see the constant). A new
// suite that forgets the line does not fail: it goes green alone and flakes
// only when the machine is busy — the symptom this guard exists to prevent.
// dragFixtures, the DOM-free half, renders nothing and is not covered.
// ============================================================
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const self = fileURLToPath(import.meta.url);
const srcRoot = resolve(self, '..', '..', '..', '..');

/** Static or dynamic import, either quote style, any relative path, with or
 *  without the `.ts` extension (allowImportingTsExtensions is on). */
const IMPORTS_KIT = /(?:\bfrom\s*|\bimport\s*\(\s*)['"](?:\.{1,2}\/)+(?:[\w.-]+\/)*dragTestKit(?:\.ts)?['"]/;

/** Only an unindented, uncommented statement that precedes every test counts.
 *  Vitest fixes a test's timeout when `it()` is collected, so the same call
 *  inside a `beforeAll`, commented out, or below a top-level `it()` leaves the
 *  5s default in place while a looser match passes. */
const SETS_TIMEOUT = /^vi\.setConfig\(\{ testTimeout: CANVAS_SUITE_TIMEOUT_MS \}\);?\s*$/m;
/** A top-level test is collected as its line runs; tests inside `describe` are
 *  collected after the module finishes, so they see the line wherever it sits. */
const FIRST_TEST = /^(?:it|test)(?:\.\w+)*\s*\(/m;

function setsTimeoutFirst(source: string): boolean {
    const line = SETS_TIMEOUT.exec(source);
    const test = FIRST_TEST.exec(source);
    return line !== null && (test === null || line.index < test.index);
}

const kitSuites = readdirSync(srcRoot, { recursive: true, encoding: 'utf8' })
    .filter(path => /\.(test|spec)\.tsx?$/.test(path))
    .map(path => join(srcRoot, path))
    .filter(path => path !== self && IMPORTS_KIT.test(readFileSync(path, 'utf8')));

const name = (path: string) => relative(srcRoot, path).split(sep).join('/');

describe('suites rendering through dragTestKit allow for the cold canvas render', () => {
    it('finds the kit suites (an empty list would pass vacuously)', () => {
        expect(kitSuites.length).toBeGreaterThanOrEqual(7);
    });

    it('every one sets CANVAS_SUITE_TIMEOUT_MS', () => {
        const missing = kitSuites.filter(path => !setsTimeoutFirst(readFileSync(path, 'utf8'))).map(name);
        expect(
            missing,
            'Add `vi.setConfig({ testTimeout: CANVAS_SUITE_TIMEOUT_MS });` after the imports: ' +
            'its first test renders BlocksCanvas cold and will time out on a busy machine.',
        ).toEqual([]);
    });
});
