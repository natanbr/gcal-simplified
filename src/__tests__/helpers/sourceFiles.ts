// ============================================================
// Shared helpers for the structural rule guards.
// Not a test file — vitest only collects *.test.*
// ============================================================

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

const IGNORED_DIRS = new Set([
    'node_modules', 'dist', 'dist-electron', 'release', '.git',
    'test-results', 'playwright-report', 'coverage', '.claude',
]);

/** Repo-relative path with POSIX separators, so baselines are stable across platforms. */
export function toRepoPath(absolute: string): string {
    return relative(repoRoot, absolute).split(sep).join('/');
}

/**
 * Every production TypeScript source file under the given repo-relative roots.
 * Excludes tests, type declarations, and build output.
 */
export function productionSources(roots: string[] = ['src', 'electron']): string[] {
    const out: string[] = [];

    function walk(dir: string): void {
        let entries: string[];
        try {
            entries = readdirSync(dir);
        } catch {
            return; // directory may not exist
        }

        for (const entry of entries) {
            if (IGNORED_DIRS.has(entry)) continue;
            const full = join(dir, entry);
            if (statSync(full).isDirectory()) {
                walk(full);
            } else if (
                /\.tsx?$/.test(entry) &&
                !/\.test\.tsx?$/.test(entry) &&
                !entry.endsWith('.d.ts')
            ) {
                out.push(full);
            }
        }
    }

    for (const root of roots) walk(join(repoRoot, root));
    return out.sort();
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
