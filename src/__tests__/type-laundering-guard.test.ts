// ============================================================
// Type-laundering guard — proves the lint rules behind CLAUDE.md → TypeScript
// reach every file the linter checks.
// ------------------------------------------------------------
// File existence is all the rule registry checks, so naming .eslintrc.cjs as
// the guard cannot tell a deleted rule from a live one. Two halves:
//  1. PROBES lint sample code through the real config: what each rule matches.
//  2. The SWEEP walks what `npm run lint` walks and asserts every file resolves
//     the probe's parser and settings for every rule in CASES. An eslintrc
//     `overrides` block REPLACES a rule's options per glob, so hand-picked
//     probe paths only cover the globs someone thought of. A file ESLint never
//     reaches gets no rules — ignored, in a dot-folder, or outside `--ext
//     ts,tsx` (.mts, .cts) — and an inline rule-config comment or a block
//     `eslint-disable` rewrites a rule for a whole file; none may appear, and
//     no ignored folder that holds TypeScript may be skipped. The lint command
//     is pinned: --rule or --ignore-pattern changes what lint enforces
//     without touching the config.
// The sweep runs as a child process, helpers/typeLaunderingSweep.cjs (eslint@8
// ships no type declarations); `loadESLint` picks eslintrc or flat config as
// the CLI does.
// ============================================================
import { describe, it, expect, beforeAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { repoRoot } from './helpers/sourceFiles';

const LAUNDERING = 'no-restricted-syntax';
const EXPLICIT_ANY = '@typescript-eslint/no-explicit-any';
const EMPTY_OBJECT_TYPE = '@typescript-eslint/ban-types';

const CASES: ReadonlyArray<{ code: string; rule: string; flagged: boolean }> = [
    { code: 'export const a = v as unknown as string;', rule: LAUNDERING, flagged: true },
    { code: 'export const b = <string><unknown>v;', rule: LAUNDERING, flagged: true },
    { code: 'export const c = (<unknown>v) as string;', rule: LAUNDERING, flagged: true },
    { code: 'export const d = <string>(v as unknown);', rule: LAUNDERING, flagged: true },
    { code: 'export const e = v as never as string;', rule: LAUNDERING, flagged: true },
    { code: 'export const f = v as any as string;', rule: LAUNDERING, flagged: true },
    { code: 'export const g = v as object as string[];', rule: LAUNDERING, flagged: true },
    // Nested casts, so a selector narrowed by location (`:not(:function *)`, or
    // skipping test callbacks) cannot keep every probe green.
    { code: 'export const n = () => v as unknown as string;', rule: LAUNDERING, flagged: true },
    { code: "it('launders', () => { void (v as unknown as string); });", rule: LAUNDERING, flagged: true },
    { code: 'export const h: any = v;', rule: EXPLICIT_ANY, flagged: true },
    // The registry says `as {} as X` is caught by ban-types instead. v8 of
    // typescript-eslint removes that rule; this case makes the upgrade say so.
    { code: 'export const m = v as {} as string;', rule: EMPTY_OBJECT_TYPE, flagged: true },
    { code: 'export const i = v as unknown;', rule: LAUNDERING, flagged: false },
    { code: "export const j = 'v as unknown as string';", rule: LAUNDERING, flagged: false },
    { code: '// v as unknown as string', rule: LAUNDERING, flagged: false },
    { code: 'export const k = (v as number) as unknown;', rule: LAUNDERING, flagged: false },
    { code: 'export const l = v as number & { brand?: true };', rule: LAUNDERING, flagged: false },
];

/** Derived, so a rule the probes prove can never be missing from the sweep. */
const SWEPT_RULES = [...new Set(CASES.map(c => c.rule))];

/** The sweep compares every file's resolved config against this probe's. */
const REFERENCE_PROBE = 'src/__laundering_probe__.ts';
/** The .tsx parser path, with the cases that are valid there. */
const PROBE_FILES = [REFERENCE_PROBE, 'src/components/__laundering_probe__.tsx'];
/** Walked in full: nothing under them may be ignored. Other folders are walked
 *  too, skipping only what ESLint ignores and SKIPPABLE allows. */
const PROTECTED_ROOTS = ['src', 'electron', 'e2e'];
/** Top-level folders ESLint ignores that the walk skips without looking inside:
 *  build output, and tool dot-folders (.claude holds whole worktrees). Any other
 *  ignored folder is reported if it holds TypeScript. */
const SKIPPABLE = ['dist', 'dist-electron', 'release', '.git', '.claude'];
/** The command the sweep models. Changing it is a deliberate edit here too. */
const LINT_SCRIPT = 'eslint . --ext ts,tsx --report-unused-disable-directives --max-warnings 0';
const MARKER = '@@type-laundering-guard@@';

/** `<T>v` is JSX in a .tsx file, so the angle-bracket cases cannot appear there. */
const casesFor = (file: string) => (file.endsWith('.tsx') ? CASES.filter(c => !c.code.includes('<')) : CASES);

/** Line 1 declares `v` and `it`; case n sits on line n + 2, so a message's line names its case. */
const probeFor = (file: string) => [
    'declare const v: number; declare function it(name: string, body: () => void): void;',
    ...casesFor(file).map(c => c.code),
].join('\n') + '\n';

/** The child process: walks and resolves configs in ESLint's own terms. */
const SWEEP_SCRIPT = join(repoRoot, 'src/__tests__/helpers/typeLaunderingSweep.cjs');

interface LintMessage { ruleId: string | null; line: number; fatal: boolean }
interface GuardReport {
    /** `null` for a probe path ESLint ignores. */
    lint: Record<string, LintMessage[] | null>;
    swept: number;
    ignored: string[];
    drifted: string[];
    inline: string[];
    pruned: string[];
    hidden: string[];
    unlinted: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}

function isStringArray(value: unknown): value is string[] {
    return Array.isArray(value) && value.every(item => typeof item === 'string');
}

function messagesOf(value: unknown): LintMessage[] | null {
    if (value === null) return null;
    if (!Array.isArray(value)) throw new Error(`unexpected messages: ${JSON.stringify(value)}`);
    return value.map((m: unknown): LintMessage => {
        if (!isRecord(m) || typeof m.line !== 'number') throw new Error(`unexpected message: ${JSON.stringify(m)}`);
        return { ruleId: typeof m.ruleId === 'string' ? m.ruleId : null, line: m.line, fatal: m.fatal === true };
    });
}

function parseReport(stdout: string): GuardReport {
    // Anything the ESLint stack prints to stdout lands before the marker.
    const at = stdout.lastIndexOf(MARKER);
    if (at < 0) throw new Error(`no report in ESLint output: ${stdout.slice(0, 300)}`);
    const raw: unknown = JSON.parse(stdout.slice(at + MARKER.length));
    if (!isRecord(raw) || !isRecord(raw.lint) || typeof raw.swept !== 'number'
        || !isStringArray(raw.ignored) || !isStringArray(raw.drifted) || !isStringArray(raw.inline)
        || !isStringArray(raw.pruned) || !isStringArray(raw.hidden) || !isStringArray(raw.unlinted)) {
        throw new Error(`unexpected report: ${JSON.stringify(raw).slice(0, 300)}`);
    }
    const lint = raw.lint;
    return {
        lint: Object.fromEntries(PROBE_FILES.map(file => [file, messagesOf(lint[file] ?? null)])),
        swept: raw.swept,
        ignored: raw.ignored,
        drifted: raw.drifted,
        inline: raw.inline,
        pruned: raw.pruned,
        hidden: raw.hidden,
        unlinted: raw.unlinted,
    };
}

function runGuard(): GuardReport {
    const run = spawnSync(
        process.execPath,
        [SWEEP_SCRIPT, createRequire(import.meta.url).resolve('eslint'), repoRoot, MARKER],
        {
            input: JSON.stringify({
                probes: PROBE_FILES.map(file => ({ file, code: probeFor(file) })),
                reference: REFERENCE_PROBE,
                rules: SWEPT_RULES,
                protectedRoots: PROTECTED_ROOTS,
                skippable: SKIPPABLE,
            }),
            encoding: 'utf8',
            // spawnSync blocks the worker, so the hook timeout below cannot
            // interrupt a hung child; this one can. A timeout leaves status null.
            timeout: 55_000,
        },
    );
    if (run.status !== 0) throw new Error(`ESLint child exited ${run.status}: ${run.stderr || String(run.error)}`);
    return parseReport(run.stdout);
}

function lintScript(): unknown {
    const pkg: unknown = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8'));
    return isRecord(pkg) && isRecord(pkg.scripts) ? pkg.scripts.lint : undefined;
}

describe('type-laundering guard (the real .eslintrc.cjs, via the CLI\'s config loader)', () => {
    let report: GuardReport | undefined;
    let runError: unknown;

    // Loading ESLint with the TypeScript parser takes seconds, and far longer on
    // a loaded machine; the default 5s hook timeout would make this flaky. A
    // failure is kept, not thrown, so every test below fails and is counted
    // (a throwing hook would mark them skipped).
    beforeAll(() => {
        try { report = runGuard(); } catch (error) { runError = error; }
    }, 60_000);

    const need = (): GuardReport => {
        if (!report) throw new Error(`ESLint produced no report: ${String(runError)}`);
        return report;
    };

    it('runs ESLint and gets a report back', () => {
        expect(runError).toBeUndefined();
    });

    describe.each(PROBE_FILES)('probe %s', file => {
        it('is linted, not ignored, and parses without a fatal error', () => {
            const messages = need().lint[file];
            expect(messages, `${file} is ignored by ESLint, so it proves nothing`).not.toBeNull();
            expect((messages ?? []).filter(m => m.fatal)).toEqual([]);
        });

        it.each(casesFor(file).map((c, i) => ({ ...c, line: i + 2 })))(
            'line $line `$code` → $rule flagged: $flagged',
            ({ rule, line, flagged }) => {
                expect((need().lint[file] ?? []).some(m => m.ruleId === rule && m.line === line)).toBe(flagged);
            },
        );
    });

    describe('sweep over what `npm run lint` walks', () => {
        it('models the lint command as it is actually run', () => {
            expect(lintScript(), 'a changed lint command may enforce something this sweep does not model').toBe(LINT_SCRIPT);
        });

        it('finds the source tree (an empty walk would pass everything below)', () => {
            expect(need().swept).toBeGreaterThan(200);
        });

        it('finds no source file ESLint ignores, outside ignored build folders', () => {
            expect(need().ignored, 'an ignored file gets no lint rules at all').toEqual([]);
        });

        it(`skips no ignored folder that holds TypeScript, apart from ${SKIPPABLE.join(', ')}`, () => {
            expect(need().pruned, 'ESLint never lints these, yet TypeScript lives in them').toEqual([]);
        });

        it('finds no dot-folder or dot-file under src, electron or e2e, where ESLint never looks', () => {
            expect(need().hidden).toEqual([]);
        });

        it('finds no .mts or .cts file, which `--ext ts,tsx` never lints', () => {
            expect(need().unlinted).toEqual([]);
        });

        it(`resolves the parser and ${SWEPT_RULES.join(', ')} for every file exactly as for the probe`, () => {
            expect(need().drifted, 'an overrides block changed these for these files').toEqual([]);
        });

        it('finds no inline rule-config comment or block eslint-disable of a swept rule', () => {
            expect(need().inline, 'either one rewrites a rule for the whole file').toEqual([]);
        });
    });
});
