// ============================================================
// Mission activity stamp — structural boundary pin (source-reading test,
// streak-writer-boundary style).
//
// What this protects: `Mission.lastActiveAt` is how the scheduler knows
// today's occurrence already ran. `stampMissionActivity` (missionActivity.ts)
// writes it on every start and end of a run, derived from the `activeMission`
// transition, and nothing clears it. A stop records no outcome, so the stamp is
// the only thing between a stopped mission and an instant restart (2026-09-22).
//
// It sits right beside `startedAt`, which every mission-ending path clears. A
// tidy-up that clears or sets the stamp in a reducer case, in CANCEL_MISSION or
// in some NEW action, brings the bug back or splits the one writer in two. A
// new action is by definition not covered by an existing behavioural test,
// hence this guard.
//
// verifiedRedBy: add `lastActiveAt: undefined` to the CANCEL_MISSION case in
// mcReducer.ts — the second test names the case and fails; or write the field
// from missionStreak.ts — the first test names the file and line and fails.
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
 * Files allowed to write the field, each for a stated reason.
 *   types.ts               — the declaration.
 *   store/missionActivity.ts — the one writer.
 *   store/useMCStore.tsx   — hydration keeps a real instant and drops anything else.
 */
const ALLOWED = new Set(['types.ts', 'store/missionActivity.ts', 'store/useMCStore.tsx']);

/** A write in any form: a property in a literal, an assignment (dot or
 *  bracket), a delete, or a rest-destructure that drops the field. */
const WRITE = new RegExp([
    /lastActiveAt\??\s*:/.source,
    /\.lastActiveAt\s*=(?!=)/.source,
    /\[\s*['"`]lastActiveAt['"`]\s*\]\s*=(?!=)/.source,
    /\bdelete\b[^;]*lastActiveAt/.source,
    /\blastActiveAt\s*,\s*\.\.\./.source,
].join('|'));

function isComment(line: string): boolean {
    return /^\s*(\/\/|\*|\/\*)/.test(line);
}

describe('Mission.lastActiveAt has exactly one writer', () => {
    it('recognises every form of write, and not a read', () => {
        const writes = [
            '{ ...m, lastActiveAt: undefined }',
            'm.lastActiveAt = now;',
            "stopped['lastActiveAt'] = undefined;",
            "delete stopped['lastActiveAt'];",
            'delete m.lastActiveAt;',
            'const { lastActiveAt, ...rest } = m;',
        ];
        expect(writes.filter(line => !WRITE.test(line))).toEqual([]);
        expect(WRITE.test('const stamp = m?.lastActiveAt;')).toBe(false);
        expect(WRITE.test('if (m.lastActiveAt === x) return;')).toBe(false);
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
            'These write Mission.lastActiveAt. Only stampMissionActivity may stamp it, and nothing ' +
            'may clear it, or a stopped mission restarts at once:\n  ' + offenders.join('\n  '),
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
