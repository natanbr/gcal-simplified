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
// minutes or hours in milliseconds added to something named midnight or day.
// A heuristic, not a proof. Known gaps: `setTime(…)`; milliseconds added to a
// timestamp named otherwise; a unit held in a named constant (`mins * MS_PER_MIN`);
// a date parsed from a built string ('2026-10-06T23:30'); a date library. Test
// kits are skipped: they build the clock a test runs at. Scope is
// src/mission-control/.
//
// Four other files do date sums for other rules and are allowed by name, with
// the reason and the exact moves they make today: one more move of a pinned
// kind in one of them (a mission-time sum in behaviorSync.ts) fails, as does a
// new file. Either is a reviewed edit here.
//
// verifiedRedBy: see the rule registry entry (src/__tests__/rule-registry.test.ts).
// ============================================================

import { describe, it, expect } from 'vitest';
import ts from 'typescript';
import { productionSources, readSource, toRepoPath } from './helpers/sourceFiles';

// The moves the guard names (see arithmeticIn).
const BUILT = 'new Date(y, m, d …): a date built from its parts';
const UTC = 'Date.UTC: a date built from its parts';
const DAY = 'a day in milliseconds';
const ADDED = 'minutes or hours added to a midnight or a day';

/** The one file for mission occurrences (any moves), and the other date sums: why they are not one, and their moves, sorted. */
const ALLOWED: Record<string, { why: string; moves: string[] | 'any' }> = {
    'src/mission-control/store/missionOccurrence.ts': { why: 'the mission occurrences: this rule', moves: 'any' },
    'src/mission-control/store/schoolDays.ts': {
        why: 'calendar days for the School Bag: dates with no time of day, stepped by calendar day',
        moves: [BUILT, BUILT], // parseLocalDate, addLocalDays
    },
    'src/mission-control/store/behaviorSync.ts': {
        why: 'the mood gauge\'s waking-hours overlap: the accrual divisor, kept apart from the mission windows on purpose (CLAUDE.md → Quick-game window)',
        moves: [DAY, ADDED, ADDED], // activeWindowOverlapMs: DAY_MS, and the window's start and end on a midnight
    },
    'src/mission-control/skills/progressSelectors.ts': {
        why: 'skill-progress day buckets: UTC date keys',
        moves: [UTC, UTC, UTC, DAY], // daysBetween, shiftDate
    },
    'src/mission-control/hooks/useQuizEngine.ts': {
        why: 'the quiz\'s skill-weighting look-back: a date some days back, no time of day',
        moves: [DAY], // currentReadingShare
    },
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

/** `x * 60_000`, `x * 60 * 1000`, `x * 3_600_000`, or a fixed `6 * 3_600_000`: a time of day in milliseconds. */
function timeInMs(node: ts.Expression): boolean {
    const parts = factors(node);
    const literal = parts.map(numeric).filter((n): n is number => n !== null);
    const unit = literal.reduce((a, b) => a * b, 1);
    if (literal.length === parts.length) return unit > 0 && unit < DAY_MS && unit % 60_000 === 0;
    return unit === 60_000 || unit === 3_600_000;
}

interface Move { line: number; what: string }

/** Each arithmetic move in `source`. */
function arithmeticIn(source: string, fileName = 'probe.ts'): Move[] {
    const kind = fileName.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
    const file = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, kind);
    const hits: Move[] = [];
    const hit = (node: ts.Node, what: string) => hits.push({ line: file.getLineAndCharacterOfPosition(node.getStart()).line + 1, what });
    const visit = (node: ts.Node): void => {
        if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
            const name = node.expression.name.text;
            const midnight = /Hours$/.test(name) && node.arguments.length > 0 && node.arguments.every(a => numeric(a) === 0);
            if (TIME_SETTER.test(name) && !midnight) hit(node, `${name}: a time of day put on a date`);
            if (DAY_SETTER.test(name)) hit(node, `${name}: a date stepped`);
            if (name === 'UTC' && ts.isIdentifier(node.expression.expression) && node.expression.expression.text === 'Date') hit(node, UTC);
        }
        if (ts.isNewExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'Date' && (node.arguments?.length ?? 0) >= 2) {
            hit(node, BUILT);
        }
        if (numeric(node) === DAY_MS && !(node.parent && numeric(node.parent) !== null)) hit(node, DAY);
        if (ts.isBinaryExpression(node) && [ts.SyntaxKind.PlusToken, ts.SyntaxKind.MinusToken].includes(node.operatorToken.kind)) {
            const [l, r] = [node.left, node.right];
            const anchored = (side: ts.Expression) => /midnight|day/i.test(side.getText(file));
            if ((timeInMs(r) && anchored(l)) || (timeInMs(l) && anchored(r))) hit(node, ADDED);
        }
        ts.forEachChild(node, visit);
    };
    visit(file);
    return hits;
}

function missionControlSources(): Array<{ rel: string; hits: Move[] }> {
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
            'const start = midnightMs + h * 3_600_000;',
            'const six = midnightMs + 6 * 3_600_000;',
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
            .flatMap(({ rel, hits }) => hits.map(h => `${rel}:${h.line}: ${h.what}`));
        expect(offenders, 'ask store/missionOccurrence.ts (openOccurrence, occurrenceOn, …) instead').toEqual([]);
    });

    it('each allowed file makes exactly the moves pinned for it (a new sum, or a moved one, must update this list)', () => {
        const byFile = new Map(missionControlSources().map(({ rel, hits }) => [rel, hits]));
        const mismatches = Object.entries(ALLOWED).flatMap(([rel, { why, moves }]) => {
            const found = byFile.get(rel) ?? [];
            const kinds = found.map(h => h.what).sort();
            const ok = moves === 'any' ? found.length > 0 : JSON.stringify(kinds) === JSON.stringify(moves);
            return ok ? [] : [`${rel} (${why}): pinned ${JSON.stringify(moves)}, found ${JSON.stringify(kinds)} at lines ${found.map(h => h.line).join(', ')}`];
        });
        expect(mismatches).toEqual([]);
    });
});
