// ============================================================
// A scheduler test's fixture save is made at an instant the test chose
// (source-reading test, on the TypeScript parser as action-literal-boundary is).
// ------------------------------------------------------------
// A Settings save that moves a start time or changes a length is stamped at its
// action's instant when it puts a window under the clock (savedIntoWindowAt,
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
// may change a window (a `*StartsAt` or `*DurationMins` key, or settings the
// parser cannot see into) carries a `timestamp` (SAVED_LONG_AGO from the kit,
// or an instant of the test's own), except
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
// reducer test that never mounts the scheduler is not scanned.
//
// verifiedRedBy: remove `timestamp: SAVED_LONG_AGO` from `tenSeconds()` in
// useMissionScheduler.skipped-window.test.tsx — the last case names that file
// and line ("handed to mcReducer") and fails; remove it from `eveningOnlyAt` in
// schedulerTestKit.ts — the same, naming the kit, and the scanning case fails;
// drop useRemoteControl.start.test.tsx from DELIBERATE — the last case names
// its `retime` ("built outside a dispatch") (all three proven 2026-11-15).
// ============================================================

import { describe, it, expect } from 'vitest';
import ts from 'typescript';
import { readdirSync, type Dirent } from 'node:fs';
import { join } from 'node:path';
import { entryResolves, readSource, repoRoot, toRepoPath } from './helpers/sourceFiles';

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

/** Whether a `settings` value may move a start time or change a length; true when the parser cannot see into it. */
function mayChangeWindow(value: ts.Expression | undefined): boolean {
    if (value === undefined) return true; // the shorthand `{ settings }`
    const e = skipWrappers(value);
    if (ts.isObjectLiteralExpression(e)) return e.properties.some(p => ts.isSpreadAssignment(p) || WINDOW_KEY.test(nameOf(p) ?? ''));
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
                    timestamp: property(node, 'timestamp') !== undefined,
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
            '(savedIntoWindowAt). Add `timestamp: SAVED_LONG_AGO` (schedulerTestKit.ts) or an instant of the test\'s:\n  ' +
            offenders.join('\n  '),
        ).toEqual([]);
    });
});
