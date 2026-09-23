// ============================================================
// Strict-config guard — CLAUDE.md → Conventions → TypeScript: "strict".
// ------------------------------------------------------------
// `npm run tsc` compiles with whatever its configs and flags say, so a one-line
// edit — `strictNullChecks: false`, `noCheck: true`, a wider `exclude` — passes
// every Definition-of-Done gate. The configs are read through the compiler's
// own parser, which resolves `extends` and accepts the comments tsconfig allows.
// ============================================================
import { describe, it, expect, beforeAll } from 'vitest';
import ts from 'typescript';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { productionSources, repoRoot, toRepoPath } from './helpers/sourceFiles';
import { configsRunBy } from './helpers/tscScript';

/** The command this guard models. Pinned rather than read from package.json: tsc
 *  accepts too many spellings (`npx tsc`, `-P`, `-b a b`, single-dash flags) to
 *  trust a parse of whatever the script becomes, and a flag this guard cannot see
 *  (`--noCheck`) would otherwise pass unnoticed. Changing the script means
 *  changing this line — the reviewable act — and the configs follow from it. */
const TSC_SCRIPT = 'tsc && tsc -p tsconfig.test.json';

/** What TSC_SCRIPT compiles, derived from it: a third step reaches the strict
 *  checks and the @ts-nocheck scan below without a second edit anyone can forget. */
const GATE_CONFIGS = configsRunBy(TSC_SCRIPT);

/** GATE_CONFIGS plus tsconfig.node.json. No gate compiles the latter (plain `tsc`
 *  does not build project references), so vite.config.ts and vitest.config.ts are
 *  type-checked by nothing; it is checked anyway, so it is strict the moment one does. */
const CONFIGS = [...GATE_CONFIGS, 'tsconfig.node.json'];

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
