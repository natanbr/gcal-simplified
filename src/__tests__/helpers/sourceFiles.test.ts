// ============================================================
// The source walk behind the structural guards.
// ------------------------------------------------------------
// Five guards walk productionSources and most of them then open every file it
// names, so a path it yields that cannot be read fails them for a reason that has
// nothing to do with the rule they enforce. A link pointing nowhere was exactly
// that: with a dangling src/stale-probe.ts planted, file-size-ratchet (at
// collection, so the whole file errors out), end-game-dispatcher and
// test-kit-boundary threw ENOENT out of readSource, and typescript-strict-config
// reported the path as a source the app config had dropped — four suites red, all
// proven 2026-09-23. style-token-ratchet survived only because its roots are
// subdirectories of src/.
//
// The walk is exercised against a temporary tree rather than the repo: planting a
// probe file under src/ would be seen by every other suite walking src/ at the
// same time, which is how a mutation in one place becomes a phantom failure in
// another.
// ============================================================

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { productionSourcesIn, readSource } from './sourceFiles';

let root = '';
let linkable = true;

beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), 'source-walk-'));
    mkdirSync(join(root, 'nested'));
    writeFileSync(join(root, 'real.ts'), 'export const real = 1;\n');
    writeFileSync(join(root, 'nested', 'deep.ts'), 'export const deep = 2;\n');
    writeFileSync(join(root, 'skipped.test.ts'), '');
    writeFileSync(join(root, 'skipped.d.ts'), '');
    try {
        symlinkSync(join(root, 'no-such-target.ts'), join(root, 'dangling.ts'));
    } catch (error) {
        // Only "you may not create links here" is a reason to skip — Windows wants
        // Developer Mode or elevation. Anything else means this fixture is broken,
        // and swallowing it would turn that into a quiet skip.
        const code = (error as NodeJS.ErrnoException).code;
        if (code !== 'EPERM' && code !== 'EACCES' && code !== 'ENOSYS') throw error;
        linkable = false;
    }
});

afterAll(() => {
    if (root) rmSync(root, { recursive: true, force: true });
});

describe('productionSourcesIn', () => {
    it('finds production sources and leaves out tests and declarations', () => {
        expect(productionSourcesIn([root])).toEqual([join(root, 'nested', 'deep.ts'), join(root, 'real.ts')]);
    });

    it('skips a link that points nowhere, so callers can open what it names', ctx => {
        // Skipped at RUN time, not with it.runIf: runIf reads its condition while
        // vitest collects the file, which is before beforeAll has tried to create
        // the link — so the case would always be collected, and on a machine that
        // refuses symlinks it would pass with no link present, which is the
        // vacuous green this whole file exists to argue against.
        if (!linkable) ctx.skip('symlinks need Developer Mode or elevation here');

        const walked = productionSourcesIn([root]);

        expect(walked).not.toContain(join(root, 'dangling.ts'));
        expect(() => walked.map(readSource)).not.toThrow();
    });

    it('returns nothing for a directory that does not exist', () => {
        expect(productionSourcesIn([join(root, 'absent')])).toEqual([]);
    });
});
