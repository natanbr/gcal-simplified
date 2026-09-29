// ============================================================
// HH:MM parsing — structural boundary pin (source-reading test).
//
// What this protects: every Mission Control reader of an "HH:MM" time asks
// store/hhmm.ts. Four parsers once followed three rules — the Save check wanted
// two-digit hours, the quick-game window took one, and the mood gauge and the
// scheduler split on ':' with no check, so a cleared time ('') got past them
// only because every comparison with NaN is false. A NEW reader that parses a
// time by hand is by definition not covered by an existing behavioural test
// (hhmm.test.ts proves the current readers agree), hence this guard.
//
// It looks for the two shapes a hand parser takes: a split on ':' and a regex
// literal for digits-colon-digits (`\d` or any character class such as [0-5]).
// A heuristic, not a proof. Known gaps (none exists today): slice/indexOf
// parsing, whitespace around the colon in a regex (`/(\d+)\s*:\s*(\d+)/`), a
// regex built from a string (`new RegExp('^(\\d{2}):…')`), and pulling the
// numbers out with `.match(/\d+/g)`. Scope is src/mission-control/ — the Calendar
// app reads Google's ISO timestamps and never an HH:MM setting. It lives here,
// not under src/mission-control/, because it uses the shared source walk and
// Mission Control may not import from outside itself, tests included.
//
// verifiedRedBy: see the rule registry entry (src/__tests__/rule-registry.test.ts).
// ============================================================

import { describe, it, expect } from 'vitest';
import { productionSources, readSource, toRepoPath } from './helpers/sourceFiles';

/** The one file allowed to parse a time. */
const ALLOWED = 'src/mission-control/store/hhmm.ts';

const HAND_PARSE = new RegExp([
    // .split(':'), .split(":"), .split(`:`), .split(':', 2), and a split on any
    // regex containing a colon: .split(/:/), .split(/\s*:\s*/)
    /\.split\(\s*(['"`]:['"`]\s*[,)]|\/[^/\n]*:[^/\n]*\/)/.source,
    // A digit token, a colon, a digit token, in a regex: /^\d{1,2}:\d{2}$/,
    // /(\d+):(\d+)/, /([0-9]{2}):([0-9]{2})/, /^([01]\d|2[0-3]):([0-5]\d)$/ …
    /(\\d|\[[^\]\n]*\])(\{[\d,]+\}|[+*?])?\)?:\(?(\\d|\[[^\]\n]*\])/.source,
].join('|'));

function isComment(line: string): boolean {
    return /^\s*(\/\/|\*|\/\*)/.test(line);
}

describe('HH:MM parsing lives in store/hhmm.ts', () => {
    it('recognises every hand-parse shape, and not an unrelated split', () => {
        const parses = [
            "const [h, m] = hhmm.split(':').map(Number);",
            'const [h, m] = value.split(":").map(Number);',
            'const parts = t.split(`:`);',
            'const parts = t.split(/:/);',
            "if (!/^\\d{1,2}:\\d{2}$/.test(hhmm ?? '')) return NaN;",
            'const match = /(\\d+):(\\d+)/.exec(value);',
            "const [h, m] = hhmm.split(':', 2).map(Number);",
            'const match = /^([0-9]{2}):([0-9]{2})$/.exec(value);',
            'const strict = /^([01]\\d|2[0-3]):([0-5]\\d)$/;',
            'const [h, m] = t.split(/\\s*:\\s*/).map(Number);',
        ];
        expect(parses.filter(line => !HAND_PARSE.test(line))).toEqual([]);
        expect(HAND_PARSE.test("const [date] = iso.split('T');")).toBe(false);
        expect(HAND_PARSE.test("const label = `${h}:${m}`;")).toBe(false);
        expect(HAND_PARSE.test('const mins = hhmmToMins(settings.morningStartsAt);')).toBe(false);
    });

    it('happens nowhere in Mission Control outside store/hhmm.ts', () => {
        const offenders: string[] = [];
        for (const file of productionSources(['src/mission-control'])) {
            const rel = toRepoPath(file);
            if (rel === ALLOWED) continue;
            readSource(file).split(/\r?\n/).forEach((line, i) => {
                if (!isComment(line) && HAND_PARSE.test(line)) offenders.push(`${rel}:${i + 1}  ${line.trim()}`);
            });
        }
        expect(offenders, 'parse the time through store/hhmm.ts instead').toEqual([]);
    });
});
