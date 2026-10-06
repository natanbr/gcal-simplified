// ============================================================
// Google unreachable is a failure, not nothing — structural pin (source-reading test)
// ------------------------------------------------------------
// CLAUDE.md → Architecture. The Calendar's reads in electron/api.ts forgive a
// calendar or list Google refuses, but an unreachable Google must fail the
// read: an empty answer was cached as the month and blanked the calendar at
// every offline refresh (2026-10-06). A NEW forgiving catch is code no
// behavioural test drives, so this reads api.ts with the TypeScript parser and
// requires every catch in ApiService either to rethrow first when
// `isGoogleUnreachable(<its error>)`, or to be listed below with the reason it
// may forgive an unreachable source. The list is exact: an entry whose catch
// is gone, or now rethrows, fails too.
//
// verifiedRedBy (2026-10-06, each reverted):
//   - the rethrow removed from getTasks's per-list catch → "getTasks › service.tasks.list" named;
//   - getCalendars wrapped in try/catch answering [] → "getCalendars › …" named;
//   - the check negated, `if (!isGoogleUnreachable(e)) throw e` → that catch named;
//   - the colours entry deleted from FORGIVES_UNREACHABLE → "getEvents › calendar.calendarList.list" named;
//   - an entry added for getTasks's per-list catch, which rethrows → the exact-list case red.
// ============================================================

import { describe, it, expect } from 'vitest';
import ts from 'typescript';
import { join } from 'node:path';
import { readSource, repoRoot } from './helpers/sourceFiles';

/** `method › first call in the try block` → why that catch may forgive an unreachable source. */
const FORGIVES_UNREACHABLE: Record<string, string> = {
    'getEvents › calendar.calendarList.list': 'the calendar colours: cosmetic; the stale colour map is kept and the events read goes on',
    'getPublicHolidays › fetch': 'the holiday feed is not Google, and a year once read is cached for the session: its outage must not freeze the calendar (requirements 2026-10-06)',
};

interface CatchSite { site: string; rethrowsUnreachable: boolean }

/** `isGoogleUnreachable(name)`, alone or as one side of `||` (so never negated). */
function testsUnreachable(expression: ts.Expression, name: string): boolean {
    if (ts.isParenthesizedExpression(expression)) return testsUnreachable(expression.expression, name);
    if (ts.isBinaryExpression(expression) && expression.operatorToken.kind === ts.SyntaxKind.BarBarToken) {
        return testsUnreachable(expression.left, name) || testsUnreachable(expression.right, name);
    }
    return ts.isCallExpression(expression) && ts.isIdentifier(expression.expression)
        && expression.expression.text === 'isGoogleUnreachable' && expression.arguments.length === 1
        && ts.isIdentifier(expression.arguments[0]) && expression.arguments[0].text === name;
}

/** The catch's first statement is `if (<tests unreachable>) throw <its error>;`. */
function rethrowsFirst(clause: ts.CatchClause): boolean {
    const name = clause.variableDeclaration && ts.isIdentifier(clause.variableDeclaration.name) ? clause.variableDeclaration.name.text : null;
    const first = clause.block.statements[0];
    if (!name || !first || !ts.isIfStatement(first) || first.elseStatement) return false;
    const then = ts.isBlock(first.thenStatement) && first.thenStatement.statements.length === 1 ? first.thenStatement.statements[0] : first.thenStatement;
    return testsUnreachable(first.expression, name) && ts.isThrowStatement(then)
        && !!then.expression && ts.isIdentifier(then.expression) && then.expression.text === name;
}

function firstCall(node: ts.Node, file: ts.SourceFile): string {
    if (ts.isCallExpression(node)) return node.expression.getText(file);
    let found = '';
    ts.forEachChild(node, child => { if (!found) found = firstCall(child, file); });
    return found;
}

/** Every try/catch inside the ApiService class, named by its method and the first call it guards. */
function catchSites(source: string): CatchSite[] {
    const file = ts.createSourceFile('api.ts', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    const sites: CatchSite[] = [];
    const visit = (node: ts.Node, method: string | null): void => {
        if (ts.isClassDeclaration(node) && node.name?.text !== 'ApiService') return;
        const inMethod = (ts.isMethodDeclaration(node) || ts.isGetAccessor(node)) && ts.isIdentifier(node.name) ? node.name.text : method;
        if (ts.isTryStatement(node) && node.catchClause && inMethod) {
            sites.push({ site: `${inMethod} › ${firstCall(node.tryBlock, file) || '(no call)'}`, rethrowsUnreachable: rethrowsFirst(node.catchClause) });
        }
        ts.forEachChild(node, child => visit(child, inMethod));
    };
    visit(file, null);
    return sites;
}

const API = catchSites(readSource(join(repoRoot, 'electron', 'api.ts')));

describe('Google unreachable is a failure, not nothing (electron/api.ts)', () => {
    it('every catch in ApiService rethrows an unreachable Google first, or is listed with its reason', () => {
        const forgiving = API.filter(c => !c.rethrowsUnreachable && !(c.site in FORGIVES_UNREACHABLE)).map(c => c.site);

        expect(forgiving, 'a catch that forgives an unreachable Google answers "nothing", and the window caches it').toEqual([]);
    });

    it('the list of exceptions is exact: each names a catch that exists and forgives', () => {
        const forgiving = new Set(API.filter(c => !c.rethrowsUnreachable).map(c => c.site));

        expect(Object.keys(FORGIVES_UNREACHABLE).filter(site => !forgiving.has(site))).toEqual([]);
    });

    it('finds the catches that rethrow (the parse still sees api.ts)', () => {
        expect(API.filter(c => c.rethrowsUnreachable).map(c => c.site).sort()).toEqual([
            'getEvents › this.listCalendarEvents',
            'getTasks › service.tasklists.list',
            'getTasks › service.tasks.list',
        ]);
    });
});

describe('catchSites reads the shapes it must tell apart', () => {
    const inService = (body: string) => catchSites(`class ApiService { async read() { try { await google.read(); } catch (e) { ${body} } } }`)[0];

    it.each([
        ['the rethrow first', 'if (isGoogleUnreachable(e)) throw e; return [];', true],
        ['one side of ||', 'if (strict || isGoogleUnreachable(e)) throw e; return [];', true],
        ['in a block', 'if (isGoogleUnreachable(e)) { throw e; } return [];', true],
        ['no check', 'console.warn("failed"); return [];', false],
        ['the check negated', 'if (!isGoogleUnreachable(e)) throw e; return [];', false],
        ['the check after another statement', 'console.warn("failed"); if (isGoogleUnreachable(e)) throw e; return [];', false],
        ['another error thrown', 'if (isGoogleUnreachable(e)) throw new Error("x"); return [];', false],
        ['another variable tested', 'if (isGoogleUnreachable(other)) throw e; return [];', false],
    ])('%s', (_shape, body, rethrows) => {
        expect(inService(body)).toEqual({ site: 'read › google.read', rethrowsUnreachable: rethrows });
    });

    it('ignores catches outside ApiService', () => {
        expect(catchSites('class Other { read() { try { a(); } catch (e) { return []; } } } function f() { try { b(); } catch (e) { return []; } }')).toEqual([]);
    });
});
