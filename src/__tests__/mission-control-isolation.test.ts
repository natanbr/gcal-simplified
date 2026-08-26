// ============================================================
// Mission Control isolation contract — structural guard
// ------------------------------------------------------------
// CLAUDE.md declares that `src/mission-control/` must not import from the
// parent app's `src/components/`, `src/hooks/` or `src/utils/`. That rule was
// written down and reviewed by hand, but nothing enforced it — the same class
// of gap as the IPC whitelist and the single-instance lock: a declared
// invariant with no test behind it.
//
// A violation is not a crash; it is a slow erosion that makes the eventual
// split of the two apps progressively more expensive.
// ============================================================

import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const mcRoot = join(repoRoot, 'src', 'mission-control');

function collectSourceFiles(dir: string, acc: string[] = []): string[] {
    for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) {
            collectSourceFiles(full, acc);
        } else if (/\.tsx?$/.test(entry)) {
            acc.push(full);
        }
    }
    return acc;
}

const files = collectSourceFiles(mcRoot);

/** Every import/from specifier in a file. */
function importSpecifiers(source: string): string[] {
    const specs: string[] = [];
    for (const m of source.matchAll(/(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g)) {
        specs.push(m[1]);
    }
    return specs;
}

/** Resolves a relative specifier against the importing file, repo-relative. */
function resolveSpecifier(fromFile: string, spec: string): string | null {
    if (!spec.startsWith('.')) return null;
    return relative(repoRoot, resolve(dirname(fromFile), spec)).split(sep).join('/');
}

/** Parent-app directories mission-control is forbidden to reach into. */
const FORBIDDEN_PREFIXES = [
    'src/components/',
    'src/hooks/',
    'src/utils/',
    'src/features/',
    // Test helpers count. A repo-wide structural guard that needs
    // helpers/sourceFiles belongs in src/__tests__/, not inside the module it
    // watches — this prefix was missing when an attribution guard reached into
    // it, which is how the module acquired its only parent-tree import.
    'src/__tests__/',
];

describe('Mission Control isolation contract', () => {
    it('finds the mission-control sources (guard is actually running)', () => {
        expect(files.length).toBeGreaterThan(30);
    });

    it('never imports from the parent app', () => {
        const violations: string[] = [];

        for (const file of files) {
            const source = readFileSync(file, 'utf-8');
            for (const spec of importSpecifiers(source)) {
                const resolved = resolveSpecifier(file, spec);
                if (!resolved) continue;
                if (FORBIDDEN_PREFIXES.some(prefix => resolved.startsWith(prefix))) {
                    violations.push(`${relative(repoRoot, file).split(sep).join('/')} → ${spec}`);
                }
            }
        }

        expect(
            violations,
            `mission-control must not import from the parent app (CLAUDE.md isolation contract):\n${violations.join('\n')}`
        ).toEqual([]);
    });

    it('does not reach outside src/ either', () => {
        const violations: string[] = [];

        for (const file of files) {
            const source = readFileSync(file, 'utf-8');
            for (const spec of importSpecifiers(source)) {
                const resolved = resolveSpecifier(file, spec);
                if (!resolved) continue;
                // Anything resolving above src/ (e.g. into electron/) breaks the
                // renderer/main boundary as well as the module boundary.
                if (!resolved.startsWith('src/')) {
                    violations.push(`${relative(repoRoot, file).split(sep).join('/')} → ${spec}`);
                }
            }
        }

        expect(violations, `mission-control reached outside src/:\n${violations.join('\n')}`).toEqual([]);
    });

    it('keeps the parent app from importing mission-control internals', () => {
        // The only sanctioned entry points are the module's top-level exports
        // that App.tsx wires up. Deep imports from the calendar side would make
        // the boundary bidirectional and just as hard to split.
        const parentDirs = ['src/components', 'src/hooks', 'src/utils', 'src/features'];
        const violations: string[] = [];

        for (const dir of parentDirs) {
            const full = join(repoRoot, dir);
            let parentFiles: string[] = [];
            try {
                parentFiles = collectSourceFiles(full);
            } catch {
                continue; // directory may not exist
            }

            for (const file of parentFiles) {
                const source = readFileSync(file, 'utf-8');
                for (const spec of importSpecifiers(source)) {
                    const resolved = resolveSpecifier(file, spec);
                    if (resolved?.startsWith('src/mission-control/')) {
                        violations.push(`${relative(repoRoot, file).split(sep).join('/')} → ${spec}`);
                    }
                }
            }
        }

        expect(
            violations,
            `the calendar app reached into mission-control internals:\n${violations.join('\n')}`
        ).toEqual([]);
    });

    it('uses only the mission-control stylesheet, never Tailwind tokens from the parent config', () => {
        // The two design systems are disjoint by rule (CLAUDE.md → Styling).
        // A `family.*` / `dark.*` token here means the systems have started to mix.
        const violations: string[] = [];

        for (const file of files) {
            if (!/\.tsx$/.test(file)) continue;
            const source = readFileSync(file, 'utf-8');
            const matches = source.match(/\b(?:bg|text|border)-family-[a-z]+/g);
            if (matches) {
                violations.push(`${relative(repoRoot, file).split(sep).join('/')} → ${[...new Set(matches)].join(', ')}`);
            }
        }

        expect(
            violations,
            `mission-control used calendar-app Tailwind tokens:\n${violations.join('\n')}`
        ).toEqual([]);
    });
});
