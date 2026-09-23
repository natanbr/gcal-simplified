// ============================================================
// Every TypeScript file is type-checked by `npm run tsc`.
// ------------------------------------------------------------
// The Definition of Done trusts `npm run tsc` to mean "the code type-checks".
// Until 2026-09-21 it checked no src test file at all: tsconfig.json excludes
// them, and tsconfig.test.json overrode `include` but inherited that `exclude`
// through `extends`. 22 type errors had piled up in 9 test files, and a correct
// tsconfig.test.json alone would not have closed it — vitest.config.ts already
// pointed at that config, and nothing ever ran it.
//
// So this guard checks both halves: which configs the `tsc` script runs, and
// which files those configs actually resolve to. The TypeScript API resolves
// `extends`, `include` and `exclude` exactly as tsc does, without an 11 s run.
// How strict those configs are, and @ts-nocheck, belong to
// typescript-strict-config.test.ts, which pins the script this one parses.
//
// The walk starts at the repo root rather than at a list of source folders: a
// new top-level directory that no tsconfig covers is exactly the gap this
// guard exists to see, and a list of roots would have hidden it. Files that
// really are checked by nothing are named in UNCHECKED_BY_DESIGN, one line
// each, so closing one is a deliberate edit.
// ============================================================

import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import ts from 'typescript';
import { configsRunBy } from './helpers/tscScript';
import { repoRoot, toRepoPath } from './helpers/sourceFiles';

/** Build output, tooling caches and the worktrees the agent sessions check out. */
const IGNORED_DIRS = new Set([
    'node_modules', 'dist', 'dist-electron', 'release', '.git', '.claude',
    'coverage', 'test-results', 'playwright-report', '.vscode', 'patches',
]);

/** Checked by no config the tsc script runs, knowingly. Each line is a hole.
 *  tsconfig.node.json holds the last two but `tsc` does not build project
 *  references, and playwright.config.ts is in no tsconfig at all — the rule
 *  registry's "TypeScript: strict — root config files included" entry owns
 *  this list, and the follow-up task that adds a third tsc step empties it. */
const UNCHECKED_BY_DESIGN = ['playwright.config.ts', 'vite.config.ts', 'vitest.config.ts'];

/** A declaration file is in a config's file list but `skipLibCheck: true` means
 *  tsc reports nothing from inside it, so counting one as covered would be a
 *  lie. sourceFiles.productionSources drops them for the same reason. */
const DECLARATION = /\.d\.[cm]?tsx?$/;

const TEST_FILE = /\.(test|spec)\.tsx?$/;

/** Whether a link points at anything. A dangling one names no file to check, and
 *  statSync would otherwise fail this guard with an ENOENT from the walk itself. */
function resolves(path: string): boolean {
    try {
        statSync(path);
        return true;
    } catch {
        return false;
    }
}

function typeScriptFiles(): string[] {
    const out: string[] = [];
    const walk = (dir: string) => {
        // withFileTypes reports a link as a link (lstat), so a linked directory — a
        // junction back into the tree — is never descended into and cannot loop. The
        // files behind it are audited where they really live.
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
            if (IGNORED_DIRS.has(entry.name)) continue;
            const full = join(dir, entry.name);
            if (entry.isDirectory()) walk(full);
            else if (/\.[cm]?tsx?$/.test(entry.name) && !DECLARATION.test(entry.name)
                && (!entry.isSymbolicLink() || resolves(full))) out.push(toRepoPath(full));
        }
    };
    walk(repoRoot);
    return out;
}

function parseConfig(configPath: string): ts.ParsedCommandLine {
    const absolute = resolve(repoRoot, configPath);
    const { config, error } = ts.readConfigFile(absolute, ts.sys.readFile);
    if (error) throw new Error(ts.flattenDiagnosticMessageText(error.messageText, '\n'));
    return ts.parseJsonConfigFileContent(config, ts.sys, repoRoot, undefined, absolute);
}

// Parsed once at module scope: this walks include globs only — milliseconds, unlike
// the sibling guard's pragma scan, which reads every compiled file and needs a hook.
const tscScript: string = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8')).scripts.tsc;
const configs = configsRunBy(tscScript);
const checked = new Set(configs.flatMap(parseConfig).flatMap(p => p.fileNames).map(file => toRepoPath(resolve(file))));

describe('npm run tsc covers every TypeScript file', () => {
    it('runs the app config and the test config', () => {
        // The app config runs alone first, which is what keeps test globals (vi,
        // describe) out of the app's type space; the tests need a second pass.
        expect(configs, `scripts.tsc is "${tscScript}"`).toContain('tsconfig.json');
        expect(configs, `scripts.tsc is "${tscScript}"`).toContain('tsconfig.test.json');
    });

    it('reaches the unit tests', () => {
        // Guards the guard: a walk that found no test files would make the
        // coverage assertion below pass vacuously.
        const tests = typeScriptFiles().filter(file => TEST_FILE.test(file));
        expect(tests.filter(file => file.startsWith('src/')).length).toBeGreaterThan(50);
        expect(tests.filter(file => file.includes('/__tests__/')).length).toBeGreaterThan(5);
    });

    it('names only files that are really unchecked in UNCHECKED_BY_DESIGN', () => {
        // The list may only shrink: a file that a config picked up must leave it,
        // or it reads as a standing hole that was quietly filled.
        const covered = UNCHECKED_BY_DESIGN.filter(file => checked.has(file));
        expect(covered, 'now type-checked — drop it from UNCHECKED_BY_DESIGN').toEqual([]);
    });

    it('leaves no other TypeScript file unchecked', () => {
        const unchecked = typeScriptFiles().filter(file => !checked.has(file) && !UNCHECKED_BY_DESIGN.includes(file));
        expect(
            unchecked,
            `${unchecked.length} file(s) that no config run by \`npm run tsc\` ("${tscScript}") type-checks.\n` +
            `A tsconfig \`exclude\` is inherited through \`extends\` even when \`include\` is overridden —\n` +
            `check with: npx tsc --listFilesOnly -p <config>`,
        ).toEqual([]);
    });
});
