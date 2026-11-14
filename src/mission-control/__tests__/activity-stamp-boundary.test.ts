// ============================================================
// Mission activity stamps — structural boundary pin (source-reading test,
// streak-writer-boundary style).
//
// What this protects: two stamps on a mission, each with one writer,
// `stampMissionActivity` (missionActivity.ts), and nothing that clears them.
//   - `Mission.lastActiveAt` is how the scheduler knows today's occurrence
//     already ran: stamped on every start and end of a run, derived from the
//     `activeMission` transition. A stop records no outcome, so the stamp is the
//     only thing between a stopped mission and an instant restart (2026-09-22).
//   - `Mission.startsAtChangedAt` is how the scheduler knows a Settings save
//     moved the start time onto the run the phase already had: stamped from the
//     `startsAt` transition. Cleared (say in freshAttempt, beside the other
//     per-attempt fields) and a save hands the child a fresh full-timer attempt
//     again (2026-11-13).
//
// Both sit right beside fields that every mission-ending or new-attempt path
// clears. A tidy-up that clears or sets a stamp in a reducer case, in
// CANCEL_MISSION, in freshAttempt or in some NEW action, brings the bug back or
// splits the one writer in two. A new action is by definition not covered by
// an existing behavioural test, hence this guard.
//
// verifiedRedBy: add `lastActiveAt: undefined` to the CANCEL_MISSION case in
// mcReducer.ts — the third test names the case and fails; or write the field
// from missionStreak.ts — the second test names the file and line and fails.
// Add `startsAtChangedAt: undefined` to freshAttempt (store/missionAttempt.ts)
// — the second test names store/missionAttempt.ts and fails (proven 2026-11-13).
// ============================================================

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const mcRoot = resolve(here, '..');

function walk(dir: string, out: string[] = []): string[] {
    for (const name of readdirSync(dir)) {
        const full = join(dir, name);
        if (statSync(full).isDirectory()) walk(full, out);
        else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(full);
    }
    return out;
}

/**
 * Files allowed to write either field, each for a stated reason.
 *   types.ts               — the declaration.
 *   store/missionActivity.ts — the one writer.
 *   store/useMCStore.tsx   — hydration keeps a real past instant and drops anything else.
 */
const ALLOWED = new Set(['types.ts', 'store/missionActivity.ts', 'store/useMCStore.tsx']);

/** What breaks when the field is written elsewhere. */
const STAMPS = {
    lastActiveAt: 'a stopped mission restarts at once',
    startsAtChangedAt: 'a Settings save hands out a fresh attempt again',
} as const;

/** A write of `field` in any form: a property in a literal, an assignment
 *  (dot or bracket), a delete, or a rest-destructure that drops the field. */
function writeOf(field: string): RegExp {
    return new RegExp([
        `${field}\\??\\s*:`,
        `\\.${field}\\s*=(?!=)`,
        `\\[\\s*['"\`]${field}['"\`]\\s*\\]\\s*=(?!=)`,
        `\\bdelete\\b[^;]*${field}`,
        `\\b${field}\\s*,\\s*\\.\\.\\.`,
    ].join('|'));
}

function isComment(line: string): boolean {
    return /^\s*(\/\/|\*|\/\*)/.test(line);
}

describe.each(Object.entries(STAMPS))('Mission.%s has exactly one writer', (field, breaks) => {
    const WRITE = writeOf(field);

    it('recognises every form of write, and not a read', () => {
        const writes = [
            `{ ...m, ${field}: undefined }`,
            `m.${field} = now;`,
            `stopped['${field}'] = undefined;`,
            `delete stopped['${field}'];`,
            `delete m.${field};`,
            `const { ${field}, ...rest } = m;`,
        ];
        expect(writes.filter(line => !WRITE.test(line))).toEqual([]);
        expect(WRITE.test(`const stamp = m?.${field};`)).toBe(false);
        expect(WRITE.test(`if (m.${field} === x) return;`)).toBe(false);
    });

    it('is not written anywhere outside the allowed files', () => {
        const offenders: string[] = [];
        for (const file of walk(mcRoot)) {
            const rel = relative(mcRoot, file).split(/[\\/]/).join('/');
            if (ALLOWED.has(rel)) continue;
            readFileSync(file, 'utf-8').split('\n').forEach((line, i) => {
                if (!isComment(line) && WRITE.test(line)) offenders.push(`${rel}:${i + 1} — ${line.trim()}`);
            });
        }
        expect(
            offenders,
            `These write Mission.${field}. Only stampMissionActivity may stamp it, and nothing ` +
            `may clear it, or ${breaks}:\n  ` + offenders.join('\n  '),
        ).toEqual([]);
    });

    it('is written by no case of the reducer, only by the wrapper through stampMissionActivity', () => {
        const source = readFileSync(join(mcRoot, 'store', 'mcReducer.ts'), 'utf-8');
        const lines = source.split('\n');
        const reducerStart = lines.findIndex(l => l.includes('function _mcReducer'));
        expect(reducerStart, 'could not locate _mcReducer').toBeGreaterThan(0);

        const writingCases = new Set<string>();
        let currentCase = '(before any case)';
        for (const line of lines.slice(reducerStart)) {
            const caseMatch = /^\s*case\s+'([A-Z_]+)'/.exec(line);
            if (caseMatch) currentCase = caseMatch[1];
            if (!isComment(line) && WRITE.test(line)) writingCases.add(currentCase);
        }

        expect([...writingCases]).toEqual([]);
        expect(source, 'the exported mcReducer must run every result through stampMissionActivity')
            .toMatch(/stampMissionActivity\(state, _mcReducer\(state, action\)/);
    });
});
