// ============================================================
// The start-change log line — structural boundary pin (source-reading test).
//
// What this protects: a Settings save that changes a mission's start time writes
// one attributed line (owner decision 2026-11-16), so a start can never be moved
// with no trace. The line is built in one place, store/startTimeChangeLog.ts,
// and asked by createLogEntry's SET_SETTINGS case, folded into the "ended" and
// "not started" lines that case already writes (createLogEntry returns ONE
// entry per action). Three things would silently bring the gap back:
//   1. a second place that words the change (a hand-built ADD_LOG entry skips
//      createLogEntry's refusals, source and snapshots; CLAUDE.md lists the four
//      hand-built sites, and this is not a fifth);
//   2. createLogEntry's SET_SETTINGS case no longer asking for it;
//   3. the helper deciding "changed" with its own comparison instead of the
//      reducer's `startTimeChanged` (missionReschedule.ts), which is the check
//      that refuses a time that is not HH:MM, so line and reducer disagree.
//
// verifiedRedBy: put `message: 'Evening start changed'` in a file other than
// store/startTimeChangeLog.ts — the first test names it; delete the
// `withStartChanges` call from the SET_SETTINGS case in activityLog.ts — the
// second fails; replace `startTimeChanged(` in startTimeChangeLog.ts by a direct
// `!==` on the two times — the third fails (all proven 2026-11-16).
// ============================================================

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const mcRoot = resolve(here, '..');
const HELPER = 'store/startTimeChangeLog.ts';

function walk(dir: string, out: string[] = []): string[] {
    for (const name of readdirSync(dir)) {
        const full = join(dir, name);
        if (statSync(full).isDirectory()) walk(full, out);
        else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(full);
    }
    return out;
}

const rel = (file: string) => relative(mcRoot, file).split('\\').join('/');
const read = (path: string) => readFileSync(join(mcRoot, path), 'utf8');
/** Code without comments, so a comment that explains the line does not count as wording it. */
const code = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

describe('the start-change line', () => {
    it('is worded in one file only', () => {
        const wording = walk(mcRoot).filter(f => /start changed/i.test(code(readFileSync(f, 'utf8')))).map(rel);
        expect(wording).toEqual([HELPER]);
    });

    it("is asked by createLogEntry's SET_SETTINGS case", () => {
        const source = code(read('store/activityLog.ts'));
        const start = source.indexOf("case 'SET_SETTINGS'");
        const end = source.indexOf("case 'MARK_MISSION_TIMEOUT'");
        expect(start, 'the SET_SETTINGS case is found').toBeGreaterThan(-1);
        expect(end, 'the case after it is found').toBeGreaterThan(start);
        const body = source.slice(start, end);
        expect(body).toMatch(/startTimeChanges\(/);
        expect(body).toMatch(/withStartChanges\(/);
    });

    it("decides 'changed' with the reducer's own check", () => {
        const source = code(read(HELPER));
        expect(source).toMatch(/import \{[^}]*\bstartTimeChanged\b[^}]*\} from '\.\/missionReschedule'/);
        expect(source).toMatch(/\bstartTimeChanged\(/);
    });
});
