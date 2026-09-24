// ============================================================
// Shared helpers for the structural rule guards.
// Not a test file — vitest only collects *.test.*
// ============================================================

import { existsSync, readdirSync, readFileSync, type Dirent } from 'node:fs';
import { join, relative, sep, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

const IGNORED_DIRS = new Set([
    'node_modules', 'dist', 'dist-electron', 'release', '.git',
    'test-results', 'playwright-report', 'coverage', '.claude',
]);

/**
 * Whether a directory entry names something that can actually be opened. A link
 * pointing nowhere names nothing, and listing one costs whichever guard reads the
 * path: with a dangling src/stale-probe.ts planted, file-size-ratchet,
 * end-game-dispatcher and test-kit-boundary throw ENOENT out of readSource, and
 * typescript-strict-config reports the path as a source the app config dropped
 * (all four proven 2026-09-23). Both source walks share this predicate.
 */
export function entryResolves(dirent: Dirent, absolutePath: string): boolean {
    return !dirent.isSymbolicLink() || existsSync(absolutePath);
}

/** Repo-relative path with POSIX separators, so baselines are stable across platforms. */
export function toRepoPath(absolute: string): string {
    return relative(repoRoot, absolute).split(sep).join('/');
}

/**
 * Every production TypeScript source file under the given absolute directories.
 * Excludes tests, type declarations, and build output. Absolute so that the walk
 * itself can be tested against a temporary tree, rather than by planting a probe
 * file inside the repo while other suites are walking it.
 */
export function productionSourcesIn(directories: string[]): string[] {
    const out: string[] = [];

    function walk(dir: string): void {
        let entries: Dirent[];
        try {
            // withFileTypes reports a link as a link, so a linked directory is never
            // descended into and a junction cannot loop.
            entries = readdirSync(dir, { withFileTypes: true });
        } catch {
            return; // directory may not exist
        }

        for (const dirent of entries) {
            const entry = dirent.name;
            if (IGNORED_DIRS.has(entry)) continue;
            const full = join(dir, entry);
            if (dirent.isDirectory()) {
                walk(full);
            } else if (
                /\.tsx?$/.test(entry) &&
                !/\.test\.tsx?$/.test(entry) &&
                !entry.endsWith('.d.ts') &&
                entryResolves(dirent, full)
            ) {
                out.push(full);
            }
        }
    }

    for (const directory of directories) walk(directory);
    return out.sort();
}

/**
 * Every production TypeScript source file under the given repo-relative roots.
 * Excludes tests, type declarations, and build output.
 */
export function productionSources(roots: string[] = ['src', 'electron']): string[] {
    return productionSourcesIn(roots.map(root => join(repoRoot, root)));
}

export function readSource(absolutePath: string): string {
    return readFileSync(absolutePath, 'utf-8');
}

/** Line count as a human would read it — trailing newline does not add a line. */
export function countLines(source: string): number {
    if (source === '') return 0;
    const lines = source.split(/\r\n|\r|\n/);
    if (lines[lines.length - 1] === '') lines.pop();
    return lines.length;
}

/**
 * Renders a baseline object as pasteable source, so a failing ratchet can tell
 * you exactly what to write rather than making you compute it.
 */
export function formatBaseline(entries: Array<[string, number]>): string {
    return entries
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([file, value]) => `    '${file}': ${value},`)
        .join('\n');
}

/**
 * Removes comments so a *mention* of a dispatch (or of an action type) cannot be mistaken for one.
 * String and template literals are tracked, so a `//` inside a URL does not
 * swallow the rest of its line.
 *
 * The project journal records this exact trap for regex-parsing `preload.ts`:
 * a source-reading guard is only as good as its parsing, and the naive version
 * of this one was both false-positive (a comment made it RED) and
 * false-negative (a multi-line dispatch left it GREEN).
 */
export function stripComments(source: string): string {
    type Mode = 'code' | 'line' | 'block' | "'" | '"' | '`';
    let mode: Mode = 'code';
    let out = '';
    let i = 0;

    while (i < source.length) {
        const ch = source[i];
        const next = source[i + 1];

        if (mode === 'code') {
            if (ch === '/' && next === '/') { mode = 'line'; i += 2; continue; }
            if (ch === '/' && next === '*') { mode = 'block'; i += 2; continue; }
            if (ch === "'" || ch === '"' || ch === '`') mode = ch;
            out += ch;
            i += 1;
            continue;
        }

        if (mode === 'line') {
            if (ch === '\n') { mode = 'code'; out += ch; }
            i += 1;
            continue;
        }

        if (mode === 'block') {
            if (ch === '*' && next === '/') { mode = 'code'; i += 2; continue; }
            if (ch === '\n') out += ch; // keep line numbering intact
            i += 1;
            continue;
        }

        // Inside a string/template literal.
        if (ch === '\\') { out += ch + (next ?? ''); i += 2; continue; }
        if (ch === mode) mode = 'code';
        out += ch;
        i += 1;
    }

    return out;
}
