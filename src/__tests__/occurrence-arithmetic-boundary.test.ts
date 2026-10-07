// ============================================================
// Mission occurrences — structural boundary pin (source-reading test).
//
// What this protects: "which occurrence of a mission is open now" has one
// answer, store/missionOccurrence.ts. Until 2026-10-06 the scheduler placed a
// start time on today's date itself, and so did the hand-start rule and the
// legacy run dating in occurrenceDay.ts, each its own way: at 00:10 a late
// timer started last night's 23:30 evening, while a relaunch aimed at
// tonight's and last night's still-open window never started. A NEW place
// that does that arithmetic is by definition not covered by the behavioural
// tests of the current ones, hence this guard.
//
// It reads the code with the TypeScript parser (comments and strings are not
// code) and looks for the moves that arithmetic needs: a time of day put on a
// date (setHours/setMinutes/setSeconds/setMilliseconds, UTC too, anything but
// midnight's zeros), a date stepped (setDate/setMonth/setFullYear, UTC too), a
// date built from its parts (`new Date(y, m, d …)`, `Date.UTC(…)`), a day in
// milliseconds (a literal or a product of literals equal to 86 400 000), and
// minutes in milliseconds added to something named midnight or day.
// A heuristic, not a proof. Known gaps: `setTime(…)`; milliseconds added to a
// timestamp named otherwise; a date parsed from a built string
// ('2026-10-06T23:30'); a date library. Test kits are skipped: they build the
// clock a test runs at. Scope is src/mission-control/.
//
// Four other files do date sums for other rules and are allowed by name, with
// the reason, below. A new file joins them only by a reviewed edit here; a new
// mission-time sum inside one of them is a gap (the allowance is per file).
//
// verifiedRedBy: see the rule registry entry (src/__tests__/rule-registry.test.ts).
// ============================================================

import { describe, it, expect } from 'vitest';
import ts from 'typescript';
import { productionSources, readSource, toRepoPath } from './helpers/sourceFiles';

/** The one file for mission occurrences, and the other date sums with why they are not one. */
const ALLOWED: Record<string, string> = {
    'src/mission-control/store/missionOccurrence.ts': 'the mission occurrences: this rule',
    'src/mission-control/store/schoolDays.ts': 'calendar days for the School Bag: dates with no time of day, stepped by calendar day',
    'src/mission-control/store/behaviorSync.ts': 'the mood gauge\'s waking-hours overlap: the accrual divisor, kept apart from the mission windows on purpose (CLAUDE.md → Quick-game window)',
    'src/mission-control/skills/progressSelectors.ts': 'skill-progress day buckets: UTC date keys',
    'src/mission-control/hooks/useQuizEngine.ts': 'the quiz\'s skill-weighting look-back: a date some days back, no time of day',
};

/** Test support beside the code it fakes (CLAUDE.md → Testing → Fixtures). */
const TEST_KIT = /(TestKit|Fixtures)\.tsx?$/;

const TIME_SETTER = /^set(?:UTC)?(?:Hours|Minutes|Seconds|Milliseconds)$/;
const DAY_SETTER = /^set(?:UTC)?(?:Date|Month|FullYear)$/;
const DAY_MS = 86_400_000;

/** The value of a numeric literal or a product of them, else null. */
function numeric(node: ts.Node): number | null {
    if (ts.isNumericLiteral(node)) return Number(node.text.replace(/_/g, ''));
    if (ts.isParenthesizedExpression(node)) return numeric(node.expression);
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.AsteriskToken) {
        const [l, r] = [numeric(node.left), numeric(node.right)];
        return l === null || r === null ? null : l * r;
    }
    return null;
}

/** The factors of a product chain (`a * 60 * 1000` → a, 60, 1000). */
function factors(node: ts.Expression): ts.Expression[] {
    const inner = ts.isParenthesizedExpression(node) ? node.expression : node;
    return ts.isBinaryExpression(inner) && inner.operatorToken.kind === ts.SyntaxKind.AsteriskToken
        ? [...factors(inner.left), ...factors(inner.right)] : [inner];
}

/** `x * 60_000` or `x * 60 * 1000`: some minutes in milliseconds. */
function minutesInMs(node: ts.Expression): boolean {
    const parts = factors(node);
    const literal = parts.map(numeric).filter((n): n is number => n !== null);
    return literal.length < parts.length && literal.reduce((a, b) => a * b, 1) === 60_000;
}

/** Each arithmetic move in `source`, as "line: what". */
export function arithmeticIn(source: string, fileName = 'probe.ts'): string[] {
    const kind = fileName.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
    const file = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, kind);
    const hits: string[] = [];
    const hit = (node: ts.Node, what: string) => hits.push(`${file.getLineAndCharacterOfPosition(node.getStart()).line + 1}: ${what}`);
    const visit = (node: ts.Node): void => {
        if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
            const name = node.expression.name.text;
            const midnight = /Hours$/.test(name) && node.arguments.length > 0 && node.arguments.every(a => numeric(a) === 0);
            if (TIME_SETTER.test(name) && !midnight) hit(node, `${name}: a time of day put on a date`);
            if (DAY_SETTER.test(name)) hit(node, `${name}: a date stepped`);
            if (name === 'UTC' && ts.isIdentifier(node.expression.expression) && node.expression.expression.text === 'Date') hit(node, 'Date.UTC: a date built from its parts');
        }
        if (ts.isNewExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'Date' && (node.arguments?.length ?? 0) >= 2) {
            hit(node, 'new Date(y, m, d …): a date built from its parts');
        }
        if (numeric(node) === DAY_MS && !(node.parent && numeric(node.parent) !== null)) hit(node, 'a day in milliseconds');
        if (ts.isBinaryExpression(node) && [ts.SyntaxKind.PlusToken, ts.SyntaxKind.MinusToken].includes(node.operatorToken.kind)) {
            const [l, r] = [node.left, node.right];
            const anchored = (side: ts.Expression) => /midnight|day/i.test(side.getText(file));
            if ((minutesInMs(r) && anchored(l)) || (minutesInMs(l) && anchored(r))) hit(node, 'minutes added to a midnight or a day');
        }
        ts.forEachChild(node, visit);
    };
    visit(file);
    return hits;
}

function missionControlSources(): Array<{ rel: string; hits: string[] }> {
    return productionSources(['src/mission-control'])
        .map(file => ({ file, rel: toRepoPath(file) }))
        .filter(({ rel }) => !TEST_KIT.test(rel))
        .map(({ file, rel }) => ({ rel, hits: arithmeticIn(readSource(file), rel) }));
}

describe('mission occurrence arithmetic lives in store/missionOccurrence.ts', () => {
    it('recognises every shape, and not midnight, a comment or a string', () => {
        const shapes = [
            'target.setHours(0, mins, 0, 0);',
            'd.setHours(h, m);',
            'd.setUTCHours(6);',
            'd.setMinutes(d.getMinutes() + 5);',
            'target.setDate(target.getDate() + 1);',
            'd.setUTCDate(1);',
            'const t = new Date(y, m - 1, d, 6, 0);',
            'const t = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1);',
            'const t = Date.UTC(y, m, d);',
            'const DAY_MS = 24 * 60 * 60_000;',
            'const DAY = 24 * 60 * 60 * 1000;',
            'const days = span / 86_400_000;',
            'const start = midnight.getTime() + startMins * 60_000;',
            'const start = dayMs + mins * 60 * 1000;',
            '/* a note */ d.setHours(0, m);',
        ];
        expect(shapes.filter(line => arithmeticIn(line).length === 0)).toEqual([]);
        const notArithmetic = [
            'today.setHours(0, 0, 0, 0);',
            'today.setHours(0, 0, 0);',
            'today.setHours(0);',
            '// d.setHours(0, mins, 0, 0);',
            'const s = "d.setHours(0, mins)";',
            'x.setHours(0, 0, 0, 0); // then d.setDate(d.getDate() + 1)',
            'const d = new Date(iso);',
            'const d = new Date();',
            'const end = started + length * 60_000;',
        ];
        expect(notArithmetic.filter(line => arithmeticIn(line).length > 0)).toEqual([]);
    });

    it('happens nowhere in Mission Control outside the allowed files', () => {
        const offenders = missionControlSources()
            .filter(({ rel }) => !(rel in ALLOWED))
            .flatMap(({ rel, hits }) => hits.map(h => `${rel}:${h}`));
        expect(offenders, 'ask store/missionOccurrence.ts (openOccurrence, occurrenceOn, …) instead').toEqual([]);
    });

    it('every allowed file still does it (a moved sum must update this list)', () => {
        const byFile = new Map(missionControlSources().map(({ rel, hits }) => [rel, hits]));
        for (const [rel, why] of Object.entries(ALLOWED)) {
            expect(byFile.get(rel)?.length ?? 0, `${rel} (${why}) does no date sum any more`).toBeGreaterThan(0);
        }
    });
});
