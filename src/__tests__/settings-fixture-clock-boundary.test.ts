// ============================================================
// A scheduler test's fixture save is made at an instant the test chose
// (source-reading test, on the TypeScript parser as action-literal-boundary is).
// ------------------------------------------------------------
// A Settings save that moves a start time or changes a length is stamped at its
// action's instant when it puts a window under the clock (savedIntoWindows,
// store/missionActivity.ts), and the scheduler then counts that window as
// handled (store/occurrenceHandled.ts). The reducer takes the instant from
// `action.timestamp`, or from `new Date()` when there is none. So a fixture
// state built through mcReducer with a timestamp-less SET_SETTINGS is stamped
// at whatever the clock says while the fixture is built, and before a test
// sets its fake clock that is the REAL wall clock (vi.useFakeTimers starts from
// it). `tenSeconds()` in useMissionScheduler.skipped-window.test.tsx (evening
// 23:58 for 10 s) failed both its cases when run between 23:58 and midnight,
// local time (proven 2026-11-15, the real clock moved with a fixed-offset TZ).
//
// The rule, for the kit and every test file that mounts the scheduler (imports
// schedulerTestKit or useMissionScheduler): a SET_SETTINGS object literal that
// may change a window (a `*StartsAt` or `*DurationMins` key, a computed key, or
// settings the parser cannot see into) carries a `timestamp` the test chose
// (chosenInstant: SAVED_LONG_AGO from the kit, which is pinned before 2000, a
// call that takes arguments, a date literal, or a name that is, where it is
// used, a `const` of one (helpers/constInScope.ts: the nearest declaration in
// scope decides); never `undefined`, a parameter or the real clock), except
//   - the argument of a `dispatch` call: the dispatch interceptor stamps it at
//     the test's clock when the test dispatches it, which is what a save made
//     mid-test means;
//   - a literal built elsewhere (an action helper such as `retime`) in a
//     DELIBERATE file, whose helpers build the saves its tests dispatch at their
//     own clock.
// A literal handed straight to mcReducer is a fixture and has no exception.
//
// Limits (review matters): a DELIBERATE helper reduced into a fixture before the
// test sets its clock is not seen, nor is a dispatch made before it; a pure
// reducer test that never mounts the scheduler is not scanned; a call's
// arguments are not followed (`new Date(t)` passes whatever `t` is);
// SAVED_LONG_AGO is trusted by name, even a local one that shadows the kit's;
// a spread after the timestamp (`{ timestamp: SAVED_LONG_AGO, ...overrides }`)
// is read as the timestamp, though the spread can set it back to undefined
// (review of PR 209, Codex).
//
// verifiedRedBy: remove `timestamp: SAVED_LONG_AGO` from `tenSeconds()` in
// useMissionScheduler.skipped-window.test.tsx — the last case names that file
// and line ("handed to mcReducer") and fails; remove it from `eveningOnlyAt` in
// schedulerTestKit.ts — the same, naming the kit, and the scanning case fails;
// drop useRemoteControl.start.test.tsx from DELIBERATE — the last case names
// its `retime` ("built outside a dispatch") (all three proven 2026-11-15); make the
// kit's `timestamp` `new Date().toISOString()` — the classifier case for the real
// clock goes red (proven 2026-11-16). Make SAVED_LONG_AGO itself
// `new Date().toISOString()` — the SAVED_LONG_AGO case goes red (before it, the
// classifier trusted the name and every fixture saved at the real clock). Put
// back the old name-only `namesAnInstant` (any timestamp but the real clock's
// text) — the 'did not choose' case goes red on all seven rows (undefined, the
// const of the real clock, its shorthand, the parameter, the `let`, the
// zero-argument call and the word); drop the
// computed-key clause from mayChangeWindow — the computed-key case goes red
// (all proven 2026-11-27, review of PR 209). Put back the file-wide map of
// `const`s by name (every initializer of the name must pass) in place of
// constInitializer — both scope cases go red: the five shadowing rows (a
// parameter, an arrow's parameter, a `let`, a hoisted `var`, a loop variable)
// are accepted, and the nearest `const` shadowing a real-clock one is refused
// (proven 2026-11-27, the same review).
// ============================================================

import { describe, it, expect } from 'vitest';
import ts from 'typescript';
import { readdirSync, type Dirent } from 'node:fs';
import { join } from 'node:path';
import { constInitializer } from './helpers/constInScope';
import { entryResolves, readSource, repoRoot, toRepoPath } from './helpers/sourceFiles';
import { SAVED_LONG_AGO } from '../mission-control/hooks/schedulerTestKit';

const KIT = 'src/mission-control/hooks/schedulerTestKit.ts';
const HOOKS = 'src/mission-control/hooks/';

/** Files whose action helpers build saves their tests dispatch at the test's own clock, each with its reason. */
const DELIBERATE: Record<string, string> = {
    [`${HOOKS}useMissionScheduler.no-start-on-demand.test.tsx`]: 'a save that puts a window under the test clock starts nothing (retime, save)',
    [`${HOOKS}useMissionScheduler.no-start-on-demand.dst.test.tsx`]: 'the same on the DST nights (moveEvening)',
    [`${HOOKS}useMissionScheduler.settings-retime.test.tsx`]: 'a save at the test clock moves a run it covered (retime; one case reduces it unstamped on purpose)',
    [`${HOOKS}useMissionScheduler.settings-retime.coverage.test.tsx`]: 'the review holes of that rule (retime)',
    [`${HOOKS}useRemoteControl.start.test.tsx`]: 'a save at the test clock after a phone session (retime)',
};

const WINDOW_KEY = /(StartsAt|DurationMins)$/;

type Context = 'dispatch' | 'reducer' | 'other';
interface Save { line: number; context: Context; window: boolean; timestamp: boolean }

function skipWrappers(e: ts.Expression): ts.Expression {
    while (ts.isParenthesizedExpression(e) || ts.isAsExpression(e) || ts.isSatisfiesExpression(e) || ts.isNonNullExpression(e)) e = e.expression;
    return e;
}

function nameOf(p: ts.ObjectLiteralElementLike): string | undefined {
    if (ts.isSpreadAssignment(p)) return undefined;
    return ts.isIdentifier(p.name) || ts.isStringLiteral(p.name) ? p.name.text : undefined;
}

const property = (o: ts.ObjectLiteralExpression, name: string) => o.properties.find(p => nameOf(p) === name);

/**
 * Whether a `timestamp` value is an instant the test chose: SAVED_LONG_AGO, a
 * literal that parses as a date, a call that takes arguments (`at(8, 0)`,
 * `new Date(2026, 10, 16)`, and a method of one: `.toISOString()`), or a name
 * that is, where it is used, a `const` of one of these (constInitializer).
 * Never the real clock (`new Date()`, `Date.now()`) anywhere in it, never
 * `undefined` or a parameter (the reducer reads a missing instant as the real
 * clock, and a parameter could carry it). An argument is not followed:
 * `new Date(t)` passes whatever `t` is.
 */
function chosenInstant(value: ts.Expression, depth = 0): boolean {
    const e = skipWrappers(value);
    if (depth > 8 || /\bDate\.now\b|new Date\(\s*\)/.test(e.getText())) return false;
    if (ts.isIdentifier(e)) {
        if (e.text === 'SAVED_LONG_AGO') return true;
        const init = constInitializer(e);
        return init !== null && chosenInstant(init, depth + 1);
    }
    if (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e)) return Number.isFinite(Date.parse(e.text));
    if (ts.isCallExpression(e) || ts.isNewExpression(e)) {
        return (e.arguments?.length ?? 0) > 0 || chosenInstant(e.expression, depth + 1);
    }
    if (ts.isPropertyAccessExpression(e)) return chosenInstant(e.expression, depth + 1);
    if (ts.isConditionalExpression(e)) return chosenInstant(e.whenTrue, depth + 1) && chosenInstant(e.whenFalse, depth + 1);
    return false;
}

/** The action's `timestamp` names an instant the test chose (chosenInstant); `{ timestamp }` reads the name in scope there. */
function namesAnInstant(p: ts.ObjectLiteralElementLike | undefined): boolean {
    if (p === undefined) return false;
    if (ts.isShorthandPropertyAssignment(p)) return chosenInstant(p.name);
    return ts.isPropertyAssignment(p) && chosenInstant(p.initializer);
}

/** Whether a `settings` value may move a start time or change a length; true when the parser cannot see into it. */
function mayChangeWindow(value: ts.Expression | undefined): boolean {
    if (value === undefined) return true; // the shorthand `{ settings }`
    const e = skipWrappers(value);
    if (ts.isObjectLiteralExpression(e)) {
        return e.properties.some(p => ts.isSpreadAssignment(p) || (p.name !== undefined && ts.isComputedPropertyName(p.name)) || WINDOW_KEY.test(nameOf(p) ?? ''));
    }
    if (ts.isConditionalExpression(e)) return mayChangeWindow(e.whenTrue) || mayChangeWindow(e.whenFalse);
    return true;
}

/** Whose argument the literal is: a dispatch (stamped at the test's clock), mcReducer (a fixture), or neither. */
function contextOf(literal: ts.ObjectLiteralExpression): Context {
    let node: ts.Node = literal;
    while (ts.isParenthesizedExpression(node.parent) || ts.isAsExpression(node.parent) || ts.isSatisfiesExpression(node.parent)) node = node.parent;
    const call = node.parent;
    if (!ts.isCallExpression(call) || !call.arguments.some(a => a === node)) return 'other';
    const callee = call.expression;
    const name = ts.isIdentifier(callee) ? callee.text : ts.isPropertyAccessExpression(callee) ? callee.name.text : '';
    return name === 'dispatch' ? 'dispatch' : name === 'mcReducer' ? 'reducer' : 'other';
}

/** Every SET_SETTINGS object literal in `source`. */
function settingsSaves(source: string, fileName = 'file.tsx'): Save[] {
    if (!source.includes('SET_SETTINGS')) return [];
    const kind = fileName.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
    const file = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, kind);
    const saves: Save[] = [];
    const visit = (node: ts.Node): void => {
        if (ts.isObjectLiteralExpression(node)) {
            const type = property(node, 'type');
            const value = type && ts.isPropertyAssignment(type) ? skipWrappers(type.initializer) : undefined;
            if (value && (ts.isStringLiteral(value) || ts.isNoSubstitutionTemplateLiteral(value)) && value.text === 'SET_SETTINGS') {
                const settings = property(node, 'settings');
                saves.push({
                    line: file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1,
                    context: contextOf(node),
                    window: mayChangeWindow(settings && ts.isPropertyAssignment(settings) ? settings.initializer : undefined),
                    timestamp: namesAnInstant(property(node, 'timestamp')),
                });
            }
        }
        ts.forEachChild(node, visit);
    };
    visit(file);
    return saves;
}

/** A save the rule refuses: it may change a window, has no timestamp, and is neither dispatched nor a DELIBERATE helper. */
const refused = (s: Save, deliberate: boolean) =>
    s.window && !s.timestamp && (s.context === 'reducer' || (s.context === 'other' && !deliberate));

/** Whether the file imports the scheduler, directly or through the kit. */
function mountsScheduler(source: string, fileName: string): boolean {
    const file = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, false, fileName.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    return file.statements.some(s => ts.isImportDeclaration(s) && ts.isStringLiteral(s.moduleSpecifier)
        && /\/(schedulerTestKit|useMissionScheduler)$/.test(s.moduleSpecifier.text));
}

function testFilesUnder(dir: string, out: string[] = []): string[] {
    let entries: Dirent[];
    try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return out; }
    for (const dirent of entries) {
        const full = join(dir, dirent.name);
        if (!entryResolves(dirent, full)) continue;
        if (dirent.isDirectory()) testFilesUnder(full, out);
        else if (/\.test\.tsx?$/.test(dirent.name)) out.push(full);
    }
    return out;
}

const TARGETS = [join(repoRoot, KIT), ...testFilesUnder(join(repoRoot, 'src'))]
    .map(f => ({ path: toRepoPath(f), code: readSource(f) }))
    .filter(f => f.path === KIT || mountsScheduler(f.code, f.path));

describe('the classifier', () => {
    const one = (src: string) => settingsSaves(src);
    const window = "{ type: 'SET_SETTINGS', settings: { morningStartsAt: '07:00' } }";

    it('refuses a timestamp-less window save handed to mcReducer, written any way', () => {
        expect(one(`mcReducer(s, ${window});`).map(s => refused(s, true))).toEqual([true]);
        expect(one("const x = mcReducer(s, {\n    type: \"SET_SETTINGS\",\n    settings: { eveningDurationMins: 1 / 6 },\n} as const);").map(s => refused(s, true))).toEqual([true]);
        expect(one("ranOnce(mcReducer(initialState, { type: 'SET_SETTINGS', settings: { ...patch } }), 'morning', at(8, 0));").map(s => refused(s, false))).toEqual([true]);
        expect(one("mcReducer(s, { type: 'SET_SETTINGS', settings });").map(s => refused(s, false))).toEqual([true]);
    });

    it('refuses a timestamp that is the real clock, which is what no timestamp means', () => {
        expect(one("mcReducer(s, { type: 'SET_SETTINGS', settings: { morningStartsAt: '07:00' }, timestamp: new Date().toISOString() });").map(s => refused(s, false))).toEqual([true]);
        expect(one("mcReducer(s, { type: 'SET_SETTINGS', settings: { morningStartsAt: '07:00' }, timestamp: new Date(Date.now()).toISOString() });").map(s => refused(s, false))).toEqual([true]);
        expect(one("mcReducer(s, { type: 'SET_SETTINGS', settings: { morningStartsAt: '07:00' }, timestamp: new Date(2026, 10, 16, 8, 0).toISOString() });").map(s => refused(s, false))).toEqual([false]);
    });

    it('refuses a timestamp the test did not choose: undefined, a const of the real clock, a parameter, a zero-argument call, a word', () => {
        const save = (timestamp: string) => `mcReducer(s, { type: 'SET_SETTINGS', settings: { morningStartsAt: '07:00' }, ${timestamp} });`;
        expect([
            save('timestamp: undefined'),
            `const now = new Date().toISOString();\n${save('timestamp: now')}`,
            `const timestamp = String(Date.now());\n${save('timestamp')}`,
            `const at = (timestamp: string) => ${save('timestamp')}`,
            `let when = '2026-11-16T08:00:00.000Z';\n${save('timestamp: when')}`,
            save('timestamp: clockNow()'),
            save("timestamp: 'yesterday'"),
        ].map(src => one(src).map(s => refused(s, false)))).toEqual([[true], [true], [true], [true], [true], [true], [true]]);
    });

    it('reads a name where it is used: a parameter, a `let` or a hoisted `var` that shadows a chosen const is refused', () => {
        const save = (timestamp: string) => `mcReducer(s, { type: 'SET_SETTINGS', settings: { morningStartsAt: '07:00' }, ${timestamp} });`;
        const fixed = "const timestamp = '2026-11-16T08:00:00.000Z';";
        expect([
            // Called as seed(), the parameter is undefined, which the reducer reads as the real clock.
            `${fixed}\nfunction seed(timestamp?: string) { ${save('timestamp')} }`,
            `${fixed}\nconst seed = (timestamp?: string) => ${save('timestamp: timestamp')}`,
            `${fixed}\nfunction seed() { { let timestamp = clockNow(); ${save('timestamp')} } }`,
            `${fixed}\nfunction seed() { if (x) { var timestamp = clockNow(); } ${save('timestamp')} }`,
            `${fixed}\nfunction seed() { for (const timestamp of stamps) { ${save('timestamp')} } }`,
        ].map(src => one(src).map(s => refused(s, false)))).toEqual([[true], [true], [true], [true], [true]]);
    });

    it('reads a name where it is used: a chosen const in scope is accepted, the nearest one deciding', () => {
        const save = (timestamp: string) => `mcReducer(s, { type: 'SET_SETTINGS', settings: { morningStartsAt: '07:00' }, ${timestamp} });`;
        expect([
            `const T = '2026-11-16T08:00:00.000Z';\nfunction seed() { ${save('timestamp: T')} }`,
            `function seed(t: string) { const timestamp = at(8, 0); ${save('timestamp')} }`,
            `const timestamp = new Date().toISOString();\nfunction seed() { const timestamp = at(8, 0); ${save('timestamp')} }`,
        ].map(src => one(src).map(s => refused(s, false)))).toEqual([[false], [false], [false]]);
    });

    it('accepts SAVED_LONG_AGO, a call that takes arguments, a date literal, and a const of one', () => {
        const save = (timestamp: string) => `mcReducer(s, { type: 'SET_SETTINGS', settings: { morningStartsAt: '07:00' }, ${timestamp} });`;
        expect([
            save('timestamp: SAVED_LONG_AGO'),
            save('timestamp: at(8, 0)'),
            save('timestamp: new Date(ends.getTime() + 10 * 60_000).toISOString()'),
            `const T = '2026-10-01T19:05:00';\n${save('timestamp: T')}`,
            `const when = nov(10, 7, 0);\n${save('timestamp: when.toISOString()')}`,
            `const timestamp = at(8, 0);\n${save('timestamp')}`,
        ].map(src => one(src).map(s => refused(s, false)))).toEqual([[false], [false], [false], [false], [false], [false]]);
    });

    it('reads a computed settings key as one that may change a window', () => {
        expect(one("mcReducer(s, { type: 'SET_SETTINGS', settings: { [key]: '07:00' } });").map(s => refused(s, false))).toEqual([true]);
        expect(one("mcReducer(s, { type: 'SET_SETTINGS', settings: { [`${phase}StartsAt`]: '07:00' } });").map(s => refused(s, false))).toEqual([true]);
    });

    it('accepts one with a timestamp, one that changes no window, and a dispatch', () => {
        expect(one("mcReducer(s, { type: 'SET_SETTINGS', settings: { morningStartsAt: '07:00' }, timestamp: SAVED_LONG_AGO });").map(s => refused(s, false))).toEqual([false]);
        expect(one("mcReducer(s, { type: 'SET_SETTINGS', settings: { creamTaskEnabled: true } });").map(s => refused(s, false))).toEqual([false]);
        expect(one(`h.dispatch(${window}); act(() => { dispatch(${window}); });`).map(s => [s.context, refused(s, false)])).toEqual([['dispatch', false], ['dispatch', false]]);
    });

    it('refuses an action helper outside a DELIBERATE file only, and reads a conditional settings value', () => {
        const helper = "const retime = (p: string, t: string) => ({ type: 'SET_SETTINGS', settings: p === 'morning' ? { morningStartsAt: t } : { eveningStartsAt: t } }) as const;";
        expect(one(helper).map(s => [s.context, refused(s, false), refused(s, true)])).toEqual([['other', true, false]]);
    });

    it('reads a comment as a comment', () => {
        expect(one(`// mcReducer(s, ${window});\n/* mcReducer(s, ${window}) */`)).toEqual([]);
    });
});

describe('scheduler test fixtures save at an instant the test chose', () => {
    it("the kit's SAVED_LONG_AGO is long before any clock a test sets (the classifier trusts it by name)", () => {
        expect(Date.parse(SAVED_LONG_AGO), 'SAVED_LONG_AGO must be a fixed instant before 2000').toBeLessThan(Date.UTC(2000, 0, 1));
    });

    it('is actually scanning the scheduler tests and the kit', () => {
        expect(TARGETS.length, 'the walk found too few files that mount the scheduler').toBeGreaterThan(20);
        const kit = TARGETS.find(f => f.path === KIT);
        expect(kit && settingsSaves(kit.code, KIT), "the kit's eveningOnlyAt").toEqual([expect.objectContaining({ context: 'reducer', window: true, timestamp: true })]);
    });

    it('lists each DELIBERATE file exactly: it exists, mounts the scheduler, and builds a save at the test clock', () => {
        for (const path of Object.keys(DELIBERATE)) {
            const target = TARGETS.find(f => f.path === path);
            expect(target, `${path} does not exist or no longer mounts the scheduler: drop it from DELIBERATE`).toBeDefined();
            const helpers = settingsSaves(target?.code ?? '', path).filter(s => s.context === 'other' && s.window && !s.timestamp);
            expect(helpers.length, `${path} builds no timestamp-less save outside a dispatch: drop it from DELIBERATE`).toBeGreaterThan(0);
        }
    });

    it('builds no state through a timestamp-less SET_SETTINGS that moves a start time or changes a length', () => {
        const offenders = TARGETS.flatMap(f => settingsSaves(f.code, f.path)
            .filter(s => refused(s, f.path in DELIBERATE))
            .map(s => `${f.path}:${s.line} (${s.context === 'reducer' ? 'handed to mcReducer' : 'built outside a dispatch'})`));
        expect(
            offenders,
            'These SET_SETTINGS saves are stamped at the clock of the moment the line runs, the real wall clock ' +
            'before a test sets its fake one, and a save that puts a window under the clock is counted as handled ' +
            '(savedIntoWindows). Add `timestamp: SAVED_LONG_AGO` (schedulerTestKit.ts) or an instant of the test\'s ' +
            '(a call with arguments, a date literal, or a const of one):\n  ' +
            offenders.join('\n  '),
        ).toEqual([]);
    });
});
