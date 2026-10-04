// @vitest-environment node
// ============================================================
// Package key guard, structural half — the hook is only worth something if
// every packaging path runs it. Two ways it could silently stop:
//
//   * the config electron-builder actually loads has no beforePack. A regex
//     over electron-builder.json5 would miss the real precedence: electron-builder
//     reads package.json's "build" key first, then electron-builder.yml before
//     .json5. So this suite asks electron-builder's own loader and resolver.
//   * a command skips it: `-c.beforePack=null` or `--config <other file>`
//     replaces the config, `--projectDir` loads another project's, and
//     `--prepackaged` returns before the hook is ever emitted
//     (app-builder-lib platformPackager.doPack).
// ============================================================

import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { getConfig } from 'app-builder-lib/out/util/config/config';
import { resolveFunction } from 'app-builder-lib/out/util/resolve';
import { repoRoot } from './helpers/sourceFiles';
import { minifiedBundle, projectFactory, syntheticJwt } from './helpers/syntheticKeys';
import { PACKAGED_ROOTS, type PackContext } from '../../scripts/package-key-guard.mjs';

const GUARD = join(repoRoot, 'scripts/package-key-guard.mjs');
const GUARD_COMMAND = 'node scripts/package-key-guard.mjs';

/** Flags that replace the config, the project, or the packing step itself. */
const BYPASS = /(?:^|\s)(?:-c(?=[\s.=]|$)|--config\b|--prepackaged\b|--pd\b|--projectDir\b|--project\b)/;

/** What follows each electron-builder binary in a command, up to the end of that command. */
function electronBuilderRuns(command: string): string[] {
    return [...command.matchAll(/electron-builder(?:\/cli\.js)?(?![.\w-])([^;&|`\n]*)/g)].map(m => m[1]);
}

/** The code in a markdown file: fenced blocks and inline spans. */
function codeIn(markdown: string): string[] {
    const fenced = [...markdown.matchAll(/```[^\n]*\n([\s\S]*?)```/g)].map(m => m[1]);
    const inline = [...markdown.replace(/```[\s\S]*?```/g, '').matchAll(/`([^`\n]+)`/g)].map(m => m[1]);
    return [...fenced, ...inline];
}

const projects = projectFactory();
afterEach(() => projects.cleanup());

describe('package key guard — wiring', () => {
    it('is the beforePack hook electron-builder resolves from this repo, and it refuses an admin key', async () => {
        const config = await getConfig(repoRoot, null, null);
        expect(typeof config.beforePack, 'the config electron-builder loads has no beforePack hook').toBe('string');
        const hookPath = String(config.beforePack);
        expect(resolve(repoRoot, hookPath)).toBe(GUARD);

        // The function electron-builder itself would call, loaded the way it loads it.
        const hook = await resolveFunction<(context: PackContext) => Promise<void>>('module', hookPath, 'beforePack');
        const bundle = (role: string) => ({
            'dist/index.html': '<!doctype html>',
            'dist-electron/main.js': minifiedBundle(syntheticJwt(role)),
        });
        const context = (projectDir: string) => ({ packager: { projectDir, config: { files: config.files } } });

        await expect(hook(context(projects.make(bundle('service_role'))))).rejects.toThrow(/service_role/);
        await expect(hook(context(projects.make(bundle('anon'))))).resolves.toBeUndefined();
    });

    it('packages exactly the folders the guard scans, on every platform', async () => {
        const config = await getConfig(repoRoot, null, null);
        // electron-builder normalizes `files: ["dist", "dist-electron"]` into one file set.
        expect(config.files).toEqual([{ filter: [...PACKAGED_ROOTS] }]);

        // Each of these adds files to the package that the guard would not read.
        const optionSets: Array<[string, object | null | undefined]> = [
            ['', config], ['win.', config.win], ['mac.', config.mac], ['linux.', config.linux],
        ];
        const unscanned = optionSets.flatMap(([prefix, options]) => {
            const set = new Map(Object.entries(options ?? {}));
            return ['extraResources', 'extraFiles', ...(prefix === '' ? [] : ['files'])]
                .filter(key => set.get(key) != null)
                .map(key => `${prefix}${key}`);
        });
        expect(unscanned, 'scan these in the guard, then add them to PACKAGED_ROOTS').toEqual([]);
    });

    it('no npm script runs electron-builder past the hook', () => {
        const scripts: Record<string, string> = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8')).scripts;
        const runs = Object.entries(scripts).flatMap(([name, command]) =>
            electronBuilderRuns(command).map(args => ({ name, args })));

        expect(runs.map(run => run.name)).toEqual(expect.arrayContaining(['build', 'release']));
        expect(runs.filter(run => BYPASS.test(run.args))).toEqual([]);
    });

    it("/release's publish command runs electron-builder with nothing that skips the hook", () => {
        const release = readFileSync(join(repoRoot, '.claude/commands/release.md'), 'utf8');
        const runs = codeIn(release).flatMap(electronBuilderRuns);

        expect(runs.some(args => /--publish always/.test(args)), 'no publish command found in release.md').toBe(true);
        expect(runs.filter(args => BYPASS.test(args))).toEqual([]);
    });

    it('/release checks the QA\'d build for an admin key before the version bump', () => {
        // Only the Pre-flight section counts: the frontmatter's allowed-tools names
        // both the build and the check, and satisfied an indexOf over the whole file.
        const release = readFileSync(join(repoRoot, '.claude/commands/release.md'), 'utf8');
        const start = release.indexOf('\n## Pre-flight');
        const bump = release.indexOf('\n## Release');
        expect(start, 'release.md needs a "## Pre-flight" section before "## Release"').toBeGreaterThan(-1);
        expect(bump).toBeGreaterThan(start);

        const preflight = release.slice(start, bump);
        expect(preflight, 'the pre-flight no longer builds what it QAs').toContain('npx vite build');
        const check = preflight.indexOf(GUARD_COMMAND);
        expect(check, `the pre-flight never runs ${GUARD_COMMAND}`).toBeGreaterThan(-1);
        expect(check, 'the check must read the build made for QA, so it comes after it')
            .toBeGreaterThan(preflight.indexOf('npx vite build'));
    });
});
