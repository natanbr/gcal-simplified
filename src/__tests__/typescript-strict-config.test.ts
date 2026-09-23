// ============================================================
// Strict-config guard — CLAUDE.md → Conventions → TypeScript: "strict".
// ------------------------------------------------------------
// `npm run tsc` compiles with whatever its configs and flags say, so a one-line
// edit — `strictNullChecks: false`, `noCheck: true`, a wider `exclude` — passes
// every Definition-of-Done gate. The configs are read through the compiler's
// own parser, which resolves `extends` and accepts the comments tsconfig allows.
//
// The flags matter as much as the configs: the step that type-checks the root
// config files must not emit and must not leave a build-info file behind, which
// the last case here pins.
// ============================================================
import { describe, it, expect, beforeAll } from 'vitest';
import ts from 'typescript';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { productionSources, repoRoot, toRepoPath } from './helpers/sourceFiles';
import { configsRunBy, stepsRunBy } from './helpers/tscScript';

/** The command this guard models. Pinned rather than read from package.json: tsc
 *  accepts too many spellings (`npx tsc`, `-P`, `-b a b`, single-dash flags) to
 *  trust a parse of whatever the script becomes. Changing the script means
 *  changing this line — the reviewable act — and both the configs and the
 *  per-step flag checks follow from it. Equality alone would not stop a flag
 *  being added in both places, so the steps are checked for `--noCheck` and for
 *  opting back out of strict below. */
const TSC_SCRIPT = 'tsc && tsc -p tsconfig.test.json && tsc -p tsconfig.node.json --composite false --noEmit';

/** What TSC_SCRIPT compiles, derived from it: a further step reaches the strict
 *  checks and the @ts-nocheck scan below without a second edit anyone can forget. */
const GATE_CONFIGS = configsRunBy(TSC_SCRIPT);

/** GATE_CONFIGS, plus tsconfig.node.json even if a step for it is ever dropped.
 *  It held the root configs while no gate compiled it (plain `tsc` does not build
 *  project references), so it was checked here to be strict the moment one did;
 *  one does since 2026-09-23, and it stays listed so that removing that step
 *  cannot quietly remove its strict checks too. */
const CONFIGS = [...new Set([...GATE_CONFIGS, 'tsconfig.node.json'])];

/** The flags `strict: true` turns on in the installed compiler; an explicit
 *  `false` on any one opts back out. Pinned, and checked against the compiler
 *  below, so a TypeScript upgrade that adds one fails here instead of widening
 *  the hole. */
const STRICT_FAMILY = [
    'noImplicitAny',
    'noImplicitThis',
    'alwaysStrict',
    'strictBindCallApply',
    'strictBuiltinIteratorReturn',
    'strictNullChecks',
    'strictFunctionTypes',
    'strictPropertyInitialization',
    'useUnknownInCatchVariables',
] as const;

/** Every flag a step of TSC_SCRIPT may carry. Anything else — a flag that makes
 *  tsc print instead of check, or one nobody has considered — fails rather than
 *  being waved through, which is what a denylist of known-bad flags would do. */
const MODELLED_FLAGS = new Set(['-p', '--project', '--noEmit', '--composite']);

/** Test infrastructure the app config deliberately leaves out; tsconfig.test.json
 *  compiles it, which typecheck-coverage.test.ts proves. */
const TEST_INFRASTRUCTURE = /(^|\/)__tests__\/|^src\/test\//;

/** TypeScript lower-cases pragma names (with Unicode rules) before matching, so
 *  `@TS-NOCHECK` works too. */
const NOCHECK = /(\/\/|\/\*)\s*@ts-nocheck\b/iu;

/** The compiler honours the pragma only in the comments before the first token
 *  (after any BOM or shebang), so prose about it further down — the rule
 *  registry quotes it — switches nothing off and is not reported.
 *
 *  Read through ts.sys.readFile, which is the decoder the compiler itself uses:
 *  it strips a UTF-8 BOM and decodes UTF-16, while Node's 'utf8' does neither.
 *  A UTF-16LE file (what Windows PowerShell 5.1 redirection writes) would
 *  otherwise carry a pragma that tsc honours and this scan cannot read. */
function optsOut(file: string): boolean {
    const source = ts.sys.readFile(join(repoRoot, file)) ?? '';
    return (ts.getLeadingCommentRanges(source, 0) ?? []).some(({ pos, end }) => NOCHECK.test(source.slice(pos, end)));
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}

/** Internal compiler API, read defensively: absent or reshaped means re-check by hand. */
function compilerStrictFamily(): string[] {
    const declarations: unknown = Reflect.get(ts, 'optionDeclarations');
    if (!Array.isArray(declarations)) throw new Error('typescript no longer exposes optionDeclarations; re-check STRICT_FAMILY by hand');
    const names: string[] = [];
    for (const declaration of declarations) {
        const item: unknown = declaration;
        if (isRecord(item) && item.strictFlag === true && typeof item.name === 'string') names.push(item.name);
    }
    return names;
}

function tscScript(): unknown {
    const pkg: unknown = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8'));
    return isRecord(pkg) && isRecord(pkg.scripts) ? pkg.scripts.tsc : undefined;
}

/** What the app config must compile, free of test globals: production sources in
 *  all three roots (e2e was once checked by nothing — see tsconfig.json), and
 *  electron's tests. */
function gatedFiles(): string[] {
    const electronTests = readdirSync(join(repoRoot, 'electron'), { recursive: true, encoding: 'utf8' })
        .map(file => `electron/${file.split(sep).join('/')}`)
        .filter(file => /\.test\.tsx?$/.test(file));
    const production = productionSources(['src', 'electron', 'e2e']).map(toRepoPath).filter(file => !TEST_INFRASTRUCTURE.test(file));
    return [...production, ...electronTests];
}

function compiledBy(configs: string[]): Set<string> {
    return new Set(configs.flatMap(config => parse(config).fileNames).map(file => relative(repoRoot, file).split(sep).join('/')));
}

const parsed = new Map<string, ts.ParsedCommandLine>();

function parse(config: string): ts.ParsedCommandLine {
    const cached = parsed.get(config);
    if (cached) return cached;
    const fatal: string[] = [];
    const result = ts.getParsedCommandLineOfConfigFile(join(repoRoot, config), undefined, {
        ...ts.sys,
        onUnRecoverableConfigFileDiagnostic: d => { fatal.push(ts.flattenDiagnosticMessageText(d.messageText, '\n')); },
    });
    if (!result || fatal.length > 0) throw new Error(`cannot parse ${config}: ${fatal.join('; ')}`);
    parsed.set(config, result);
    return result;
}

/** What a step really compiles with: the config file's options, then the step's
 *  own flags over the top, which is the precedence tsc itself applies. */
function effectiveOptions(config: string, args: string[]): ts.CompilerOptions {
    return { ...parse(config).options, ...ts.parseCommandLine(args).options };
}

let gated: string[] = [];
let optedOut: string[] = [];
let setupError: unknown;

// Parsing the configs walks their include globs and the pragma scan reads every
// compiled file: cold, ~5s, past the default test timeout. A failure is kept,
// not thrown, so the tests fail and are counted (a throwing hook skips them).
beforeAll(() => {
    try {
        for (const config of CONFIGS) parse(config);
        gated = gatedFiles();
        // Every file either gate config compiles, so a test file cannot opt out either.
        optedOut = [...compiledBy(GATE_CONFIGS)].filter(optsOut);
    } catch (error) {
        setupError = error;
    }
}, 60_000);

describe('strict-mode guard', () => {
    it('reads the configs and the compiled files', () => {
        expect(setupError).toBeUndefined();
    });

    it('models the tsc command as it is actually run', () => {
        expect(tscScript(), 'a changed tsc command may compile configs this guard does not check').toBe(TSC_SCRIPT);
    });

    it('knows every flag the installed compiler puts under strict', () => {
        expect([...STRICT_FAMILY].sort()).toEqual(compilerStrictFamily().sort());
    });

    it('type-checks every source file under the app config, electron tests included', () => {
        const compiled = compiledBy(['tsconfig.json']);
        expect(gated.length, 'an empty walk would pass everything').toBeGreaterThan(100);
        expect(gated.filter(file => !compiled.has(file)), 'an exclude or include edit took these out of the app config').toEqual([]);
    });

    it('lets no compiled file switch checking off with @ts-nocheck, in any casing', () => {
        expect(setupError, 'the scan did not run').toBeUndefined();
        expect(optedOut).toEqual([]);
    });

    // A type-check gate must leave the tree as it found it, and the flags that
    // keep it that way are easy to drop as noise when the command is edited.
    // tsconfig.node.json sets no `noEmit`, so without the flag the step emits
    // vite.config.js beside the source — and Vite loads vite.config.js BEFORE
    // vite.config.ts, so a stale copy silently becomes the build config. Being
    // `composite` it also forces incremental mode, which writes
    // tsconfig.node.tsbuildinfo into the repo root even under --noEmit.
    // Redirecting tsBuildInfoFile would satisfy the intent too; this asserts the
    // narrower shape the script actually uses.
    it.each(stepsRunBy(TSC_SCRIPT))('compiles $config with no emit and no build-info', ({ config, args }) => {
        // How tsc itself resolves a step: the command line wins over the config file.
        const options = effectiveOptions(config, args);

        expect(options.noEmit, `tsc ${args.join(' ')} would emit next to the sources`).toBe(true);
        expect(
            options.composite === true || options.incremental === true,
            `tsc ${args.join(' ')} would write a .tsbuildinfo into the repo`,
        ).toBe(false);
    });

    // The cases below read the CONFIG files; these read what each STEP actually
    // compiles with. The difference is a flag added on the command line: the pin
    // above is string equality, so `--noCheck` appended to both the script and
    // TSC_SCRIPT is a two-line edit that switched the whole gate off with every
    // guard still green (`npm run tsc` exited 0 on a real TS2322). Flags reach the
    // same options object the config does, so they are checked in the same place.
    it.each(stepsRunBy(TSC_SCRIPT))('compiles $config with checking still on', ({ config, args }) => {
        const options = effectiveOptions(config, args);

        expect(options.noCheck, `tsc ${args.join(' ')} would skip type-checking entirely`).not.toBe(true);
        expect(options.strict, `tsc ${args.join(' ')} would turn strict off`).not.toBe(false);
        for (const flag of STRICT_FAMILY) {
            expect(options[flag], `tsc ${args.join(' ')} opts back out of ${flag}`).not.toBe(false);
        }
    });

    // An allowlist, not a denylist: `--noCheck` and `--strict false` are caught
    // above by name, but `--listFilesOnly` and `--showConfig` make tsc print and
    // exit 0 with a real TS2322 in the tree, and neither shows up in the options
    // this guard reasons about. Listing what a step MAY pass is the only form of
    // this check that a flag nobody has thought of cannot walk through.
    it.each(stepsRunBy(TSC_SCRIPT))('passes $config no flag this guard cannot model', ({ args }) => {
        const unmodelled = args.filter(arg => arg.startsWith('-') && !MODELLED_FLAGS.has(arg));

        expect(
            unmodelled,
            `tsc ${args.join(' ')}: this guard reads the options tsc resolves, and these flags change\n` +
            `what the run DOES instead — --listFilesOnly and --showConfig both exit 0 with a type error\n` +
            `present. Add a flag here only together with a case that models what it does.`,
        ).toEqual([]);
    });

    it('chains its steps with && and nothing else', () => {
        // `tsc ... || true` exits 0 whatever tsc says, and configsRunBy splits on
        // `||` and `;` as step separators, so the swallowing tail is not even seen
        // as part of the step. Every &&-joined segment must be exactly one step.
        const segments = TSC_SCRIPT.split('&&').map(segment => segment.trim());

        expect(segments).toEqual(stepsRunBy(TSC_SCRIPT).map(step => ['tsc', ...step.args].join(' ')));
        expect(TSC_SCRIPT, 'only && may join the steps').not.toMatch(/\||;|(?<!&)&(?!&)/);
    });

    it('compiles exactly the configs this guard checks', () => {
        // vitest generates no cases at all from an empty it.each table, so a
        // TSC_SCRIPT that parsed to zero steps would delete the two cases above
        // and empty the @ts-nocheck scan, silently.
        expect(GATE_CONFIGS).toEqual(['tsconfig.json', 'tsconfig.test.json', 'tsconfig.node.json']);
    });

    it('type-checks the root configs against Node, not a browser', () => {
        // Deleting `lib` is the mutation to beat, and it leaves options.lib
        // undefined rather than listing the default — so absence has to fail here,
        // or this case passes on exactly what it exists to catch. Without an
        // explicit lib the default pulls DOM in and `document.querySelector(...)`
        // inside playwright.config.ts compiles clean, which is most of the value of
        // type-checking a config file at all.
        const lib = parse('tsconfig.node.json').options.lib;

        expect(lib, 'no explicit lib: the default pulls DOM into files that only run in Node').toBeDefined();
        expect(lib ?? [], 'the root configs only ever run in Node').not.toContain('lib.dom.d.ts');
    });
});

describe.each(CONFIGS)('%s', config => {
    it('turns strict mode on', () => {
        expect(parse(config).options.strict).toBe(true);
    });

    it('does not switch type-checking off with noCheck', () => {
        expect(parse(config).options.noCheck).not.toBe(true);
    });

    it.each(STRICT_FAMILY)('does not opt back out of %s', flag => {
        expect(parse(config).options[flag]).not.toBe(false);
    });
});
