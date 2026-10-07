// ============================================================
// Mission occurrences — structural boundary pin (source-reading test, the
// hhmm-parse-boundary shape).
//
// What this protects: "which occurrence of a mission is open now" has one
// answer, store/missionOccurrence.ts. Until 2026-10-06 the scheduler placed a
// start time on today's date itself, and so did the hand-start rule and the
// legacy run dating in occurrenceDay.ts, each its own way: at 00:10 a late
// timer started last night's 23:30 evening, while a relaunch aimed at
// tonight's and last night's still-open window never started. A NEW place
// that does the arithmetic is by definition not covered by the behavioural
// tests of the current ones, hence this guard.
//
// It looks for the two moves the arithmetic needs: putting a time of day on a
// date (setHours or setMinutes with anything but midnight's 0, 0, 0, 0) and
// stepping a date by days (setDate). A heuristic, not a proof: adding
// 24 * 60 * 60 * 1000 to a timestamp is a gap (it is also wrong on a DST
// night). Test kits are skipped: they build the clock a test runs at. Scope is
// src/mission-control/; the Calendar app does its own date work.
//
// verifiedRedBy: see the rule registry entry (src/__tests__/rule-registry.test.ts).
// ============================================================

import { describe, it, expect } from 'vitest';
import { productionSources, readSource, toRepoPath } from './helpers/sourceFiles';

/** The one file allowed to place a time of day on a date. */
const ALLOWED = 'src/mission-control/store/missionOccurrence.ts';

/** Test support beside the code it fakes (CLAUDE.md → Testing → Fixtures). */
const TEST_KIT = /(TestKit|Fixtures)\.tsx?$/;

const ARITHMETIC = new RegExp([
    // setHours / setMinutes with any argument list but midnight's (0, 0, 0, 0)
    /\.set(?:Hours|Minutes)\((?!\s*0\s*,\s*0\s*,\s*0\s*,\s*0\s*\))/.source,
    // stepping a date by days
    /\.setDate\(/.source,
].join('|'));

function isComment(line: string): boolean {
    return /^\s*(\/\/|\*|\/\*)/.test(line);
}

describe('mission occurrence arithmetic lives in store/missionOccurrence.ts', () => {
    it('recognises every shape, and not midnight', () => {
        const shapes = [
            'target.setHours(0, mins, 0, 0);',
            'todayStart.setHours(0, startMins, 0, 0);',
            'd.setHours(h, m);',
            'd.setMinutes(d.getMinutes() + duration);',
            'target.setDate(target.getDate() + 1);',
            'start.setDate(start.getDate() - 1);',
        ];
        expect(shapes.filter(line => !ARITHMETIC.test(line))).toEqual([]);
        expect(ARITHMETIC.test('today.setHours(0, 0, 0, 0);')).toBe(false);
        expect(ARITHMETIC.test('midnight.setHours( 0, 0, 0, 0 );')).toBe(false);
        expect(ARITHMETIC.test('const day = getLocalDateString(start);')).toBe(false);
    });

    it('happens nowhere in Mission Control outside store/missionOccurrence.ts', () => {
        const offenders: string[] = [];
        for (const file of productionSources(['src/mission-control'])) {
            const rel = toRepoPath(file);
            if (rel === ALLOWED || TEST_KIT.test(rel)) continue;
            readSource(file).split(/\r?\n/).forEach((line, i) => {
                if (!isComment(line) && ARITHMETIC.test(line)) offenders.push(`${rel}:${i + 1}  ${line.trim()}`);
            });
        }
        expect(offenders, 'ask store/missionOccurrence.ts (openOccurrence, nextOccurrence, …) instead').toEqual([]);
    });

    it('the allowed file still does it (a moved decision must update this guard)', () => {
        const file = productionSources(['src/mission-control']).find(f => toRepoPath(f) === ALLOWED);
        expect(file, `${ALLOWED} is gone`).toBeDefined();
        const lines = readSource(file ?? '').split(/\r?\n/).filter(l => !isComment(l));
        expect(lines.filter(l => ARITHMETIC.test(l)).length).toBeGreaterThan(0);
    });
});
