// @vitest-environment node
// ============================================================
// Package key guard, structural half — the hook is only worth something if
// every packaging command runs it. Ways it could silently stop:
//
//   * the config electron-builder loads has no beforePack. A regex over
//     electron-builder.json5 would miss the real precedence: electron-builder
//     reads package.json's "build" key first, then electron-builder.yml before
//     .json5. So this suite asks electron-builder's own loader.
//   * a command skips it: `--no-c.beforePack` or `-c.beforePack=0` unsets it,
//     `--config`/`-c <file>` or `--projectDir` loads another config, and
//     `--prepackaged` returns before the hook is ever emitted
//     (app-builder-lib platformPackager.doPack). Rather than list such flags,
//     each command's arguments go through electron-builder's own CLI parser and
//     Packager, and the hook that comes out must be this guard and must refuse.
//   * a script tags and pushes before anything checked the build.
// ============================================================

import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import ts from 'typescript';
import { Packager } from 'app-builder-lib';
import { getConfig } from 'app-builder-lib/out/util/config/config';
import { resolveFunction } from 'app-builder-lib/out/util/resolve';
import { configureBuildCommand, createYargs, normalizeOptions } from 'electron-builder/out/builder';
import { repoRoot } from './helpers/sourceFiles';
import { minifiedBundle, projectFactory, syntheticJwt, viteBuild } from './helpers/syntheticKeys';
import * as guard from '../../scripts/package-key-guard.js';

const GUARD = join(repoRoot, 'scripts/package-key-guard.js');
const GUARD_COMMAND = 'node scripts/package-key-guard.js';
const PLATFORM_KEY = process.platform === 'win32' ? 'win' : process.platform === 'darwin' ? 'mac' : 'linux';

const readText = (path: string) => readFileSync(join(repoRoot, path), 'utf8');
const scripts = (): Record<string, string> => JSON.parse(readText('package.json')).scripts;

/** The argument list after each electron-builder binary in a command. */
function electronBuilderArgs(command: string): string[][] {
    return [...command.matchAll(/electron-builder(?:\/cli\.js)?(?![.\w-])([^;&|`\n]*)/g)]
        .map(match => (match[1].match(/"[^"]*"|'[^']*'|\S+/g) ?? []).map(word => word.replace(/^(["'])(.*)\1$/, '$2')));
}

/** The code in a markdown file: fenced blocks and inline spans. */
function codeIn(markdown: string): string[] {
    const fenced = [...markdown.matchAll(/```[^\n]*\n([\s\S]*?)```/g)].map(m => m[1]);
    const inline = [...markdown.replace(/```[\s\S]*?```/g, '').matchAll(/`([^`\n]+)`/g)].map(m => m[1]);
    return [...fenced, ...inline];
}

/** A script's && chain, with `npm run x` replaced by x's own chain. */
function chainOf(name: string, all: Record<string, string>): string[] {
    return all[name].split('&&').map(step => step.trim()).flatMap(step => {
        const nested = /^npm run ([\w:-]+)$/.exec(step);
        return nested && all[nested[1]] !== undefined ? chainOf(nested[1], all) : [step];
    });
}

const projects = projectFactory();
afterEach(() => projects.cleanup());

/** What electron-builder makes of `args`, by its own parser and its own Packager. */
async function packagerFor(args: string[]): Promise<Packager> {
    const packager = new Packager(normalizeOptions(configureBuildCommand(createYargs()).parseSync(args)));
    await packager.validateConfig();
    return packager;
}

/** Runs the hook electron-builder resolves for `packager`, as it would, on a synthetic build. */
async function runHook(packager: Packager, role: string): Promise<void> {
    const hook = await resolveFunction<unknown>('module', packager.config.beforePack ?? '', 'beforePack');
    if (typeof hook !== 'function') throw new Error(`beforePack resolved to ${JSON.stringify(hook)}, not a function`);
    const dir = projects.make(viteBuild(minifiedBundle(syntheticJwt(role))));
    const platform = new Map(Object.entries(packager.config)).get(PLATFORM_KEY) ?? {};
    await hook({ packager: { projectDir: dir, info: { appDir: dir }, config: packager.config, platformSpecificBuildOptions: platform } });
}

async function expectGuarded(args: string[]): Promise<void> {
    const packager = await packagerFor(args);
    expect(packager.options.prepackaged ?? null, `${args.join(' ')}: a prepackaged app skips beforePack`).toBeNull();
    expect(relative(repoRoot, packager.projectDir), `${args.join(' ')}: another project's config`).toBe('');
    expect(resolve(repoRoot, String(packager.config.beforePack)), `${args.join(' ')}: beforePack`).toBe(GUARD);
    await expect(runHook(packager, 'service_role')).rejects.toThrow(/service_role/);
    await expect(runHook(packager, 'anon')).resolves.toBeUndefined();
}

describe('package key guard — wiring', () => {
    it('is the beforePack hook electron-builder resolves from this repo, and it refuses an admin key', async () => {
        await expectGuarded([]);
    });

    it('relies on a precedence this repo keeps: no "build" key in package.json, which electron-builder would read instead', async () => {
        expect(JSON.parse(readText('package.json')).build).toBeUndefined();

        const dir = projects.make({
            'package.json': JSON.stringify({ name: 'probe', version: '1.0.0', build: { files: ['dist'] } }),
            'electron-builder.json5': readText('electron-builder.json5'),
        });
        expect((await getConfig(dir, null, null)).beforePack, 'electron-builder no longer reads package.json first').toBeUndefined();
        writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'probe', version: '1.0.0' }));
        expect((await getConfig(dir, null, null)).beforePack).toBe('./scripts/package-key-guard.js');
    });

    it('packages exactly the folders the guard scans, on every platform', async () => {
        const config = await getConfig(repoRoot, null, null);
        // electron-builder normalizes `files: ["dist", "dist-electron"]` into one file set.
        expect(config.files).toEqual([{ filter: [...guard.PACKAGED_ROOTS] }]);

        // Each of these adds files to the package; the hook refuses them, and this says so first.
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
        expect(guard.PACKAGED_ROOTS.filter(root => /[*?[\]{}!]|\.\./.test(root)), 'a root is a plain path, never a glob').toEqual([]);
    });

    it('every npm script that runs electron-builder runs the guard', async () => {
        const runs = Object.entries(scripts()).flatMap(([name, command]) => electronBuilderArgs(command).map(args => ({ name, args })));
        expect(runs.map(run => run.name)).toEqual(expect.arrayContaining(['build', 'release']));
        for (const run of runs) await expectGuarded(run.args);
    });

    it("/release's publish command runs the guard", async () => {
        const runs = codeIn(readText('.claude/commands/release.md')).flatMap(electronBuilderArgs);
        const publishes = runs.filter(args => args.join(' ').includes('--publish always'));
        expect(publishes.length, 'no publish command found in release.md').toBeGreaterThan(0);
        for (const args of runs) await expectGuarded(args);
    });

    it('npm run release builds and checks for an admin key before it tags, then rebuilds and publishes', () => {
        const all = scripts();
        for (const name of Object.keys(all)) {
            const chain = chainOf(name, all);
            const firstTag = chain.findIndex(step => /\bnpm version\b|\bgit push\b/.test(step));
            if (firstTag === -1) continue;
            const check = chain.indexOf(GUARD_COMMAND);
            expect(check, `npm run ${name} tags or pushes without checking the build first`).toBeGreaterThan(-1);
            expect(check, `npm run ${name} tags or pushes before checking the build`).toBeLessThan(firstTag);
            expect(all[name], `npm run ${name}: only && stops the chain when the check refuses`).not.toMatch(/;|\|\||(?<!&)&(?!&)/);
        }

        const release = chainOf('release', all);
        const at = (pattern: RegExp, after = -1) => release.findIndex((step, i) => i > after && pattern.test(step));
        const build = at(/^vite build$/);
        const check = at(/^node scripts\/package-key-guard\.js$/, build);
        const tag = at(/^npm version /, check);
        const push = at(/^git push /, tag);
        const rebuild = at(/^vite build$/, push);
        const publish = at(/electron-builder.*--publish always/, rebuild);
        // Each step is searched for after the one before, so all found means this order.
        expect([build, check, tag, push, rebuild, publish].every(index => index > -1), `build → check → tag → push → rebuild → publish, not: ${release.join(' && ')}`).toBe(true);
    });

    it("/release checks the build for an admin key after making it, before the QA pass and the bump, and requires its success line", () => {
        // Only the Pre-flight section counts: the frontmatter's allowed-tools names
        // both the build and the check, and satisfied an indexOf over the whole file.
        const release = readText('.claude/commands/release.md');
        const start = release.indexOf('\n## Pre-flight');
        const bump = release.indexOf('\n## Release');
        expect(start, 'release.md needs a "## Pre-flight" section before "## Release"').toBeGreaterThan(-1);
        expect(bump).toBeGreaterThan(start);

        const preflight = release.slice(start, bump);
        expect(preflight, 'the pre-flight no longer builds what it QAs').toContain('npx vite build');
        const check = preflight.indexOf(GUARD_COMMAND);
        expect(check, `the pre-flight never runs ${GUARD_COMMAND}`).toBeGreaterThan(-1);
        expect(check, 'the check must read the build made for QA, so it comes after it').toBeGreaterThan(preflight.indexOf('npx vite build'));
        expect(check, 'run the check before spending a QA pass on the build').toBeLessThan(preflight.indexOf('Release QA pass'));
        expect(preflight.slice(check), 'exit 0 without the success line means the check never ran').toContain('No admin Supabase key in dist, dist-electron');

        const releaseSection = release.slice(bump);
        expect(releaseSection.indexOf('npm version patch')).toBeGreaterThan(-1);
        expect(releaseSection.indexOf('--publish always')).toBeGreaterThan(releaseSection.indexOf('npm version patch'));
    });

    it('declares in package-key-guard.d.ts exactly what package-key-guard.js exports (the .js is neither type-checked nor linted)', () => {
        const source = ts.createSourceFile('package-key-guard.d.ts', readText('scripts/package-key-guard.d.ts'), ts.ScriptTarget.Latest);
        const exported = (node: ts.Statement) => ts.canHaveModifiers(node) && (ts.getModifiers(node) ?? []).some(m => m.kind === ts.SyntaxKind.ExportKeyword);
        const declared = source.statements.filter(exported).flatMap(statement => {
            if (ts.isFunctionDeclaration(statement) && statement.name) return [[statement.name.text, 'function']];
            if (ts.isVariableStatement(statement)) return statement.declarationList.declarations.map(d => [d.name.getText(source), 'value']);
            return [];
        });
        const actual = Object.entries(guard).map(([name, value]) => [name, typeof value === 'function' ? 'function' : 'value']);
        expect(actual.sort()).toEqual(declared.sort());
    });
});
