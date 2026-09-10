// ============================================================
// Mission streak shield — structural boundary pin (source-reading
// test, timer-registry / skill-progress style).
//
// What this protects: `applyStreakChange` in store/missionStreak.ts is the
// ONLY place that may move `missedMissionStreak` during a dispatch, because it
// is what notices the lock/unlock CROSSING and writes the activity-log line for
// it. A second writer that sets the field directly unfreezes (or freezes) a
// child's bank with no line in the parent's audit trail.
//
// A behavioural test cannot catch this: any NEW reducer case that assigns the
// field is, by definition, not covered by existing cases. Adding
// `missedMissionStreak: 0` to the SET_MOOD_WIND case unlocks a broken shield
// silently, with 765 of 766 tests still green.
//
// verifiedRedBy: add `missedMissionStreak: 0` to any reducer case in
// mcReducer.ts — this test names the file and line and fails.
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
 * Files allowed to assign the field, each for a stated reason.
 *   missionStreak.ts — the single transition writer itself.
 *   mcReducer.ts     — `initialState` only; the assignment guard below still
 *                      rejects any assignment inside a reducer case.
 *   useMCStore.tsx   — hydration sanitizes the persisted value once at load,
 *                      before any dispatch exists to log about.
 */
const ALLOWED = new Set([
    'store/missionStreak.ts',
    'store/mcReducer.ts',
    'store/useMCStore.tsx',
    // Outbound projection, not a state write — it copies the value into the
    // broadcast payload. It must still sanitize, because the phone would
    // otherwise receive whatever a corrupt persisted blob held.
    'store/useRemoteSync.ts',
]);

/** `missedMissionStreak:` used as an object-literal WRITE, not a read. */
const ASSIGNMENT = /missedMissionStreak\s*:/g;

describe('missedMissionStreak has exactly one transition writer', () => {
    it('is not assigned anywhere outside the allowed files', () => {
        const offenders: string[] = [];

        for (const file of walk(mcRoot)) {
            const rel = relative(mcRoot, file).split(/[\\/]/).join('/');
            if (ALLOWED.has(rel)) continue;
            const src = readFileSync(file, 'utf-8');
            for (const line of src.split('\n')) {
                // A type declaration is a shape, not a write.
                if (/^\s*(\/\/|\*)/.test(line)) continue;
                if (/missedMissionStreak\??\s*:\s*(number|string)/.test(line)) continue;
                if (ASSIGNMENT.test(line)) offenders.push(`${rel} — ${line.trim()}`);
                ASSIGNMENT.lastIndex = 0;
            }
        }

        expect(
            offenders,
            'These write missedMissionStreak directly. Route them through ' +
            'applyStreakChange(state, next, nowIso, cause, source) instead, or the ' +
            'lock/unlock transition goes unlogged:\n  ' + offenders.join('\n  '),
        ).toEqual([]);
    });

    it('is assigned inside mcReducer.ts only by initialState, never by a reducer case', () => {
        const src = readFileSync(join(mcRoot, 'store', 'mcReducer.ts'), 'utf-8');
        const lines = src.split('\n');
        const reducerStart = lines.findIndex(l => l.includes('function _mcReducer'));
        expect(reducerStart, 'could not locate _mcReducer').toBeGreaterThan(0);

        const offenders = lines
            .slice(reducerStart)
            .map((line, i) => ({ line: line.trim(), n: reducerStart + i + 1 }))
            .filter(({ line }) => /missedMissionStreak\s*:/.test(line) && !line.startsWith('//') && !line.startsWith('*'));

        expect(
            offenders.map(o => `mcReducer.ts:${o.n} — ${o.line}`),
            'A reducer case assigns missedMissionStreak directly, bypassing the ' +
            'transition log. Call applyStreakChange instead.',
        ).toEqual([]);
    });

    it('sanitizes the streak on the way out to the phone', () => {
        const src = readFileSync(join(mcRoot, 'store', 'useRemoteSync.ts'), 'utf-8');
        expect(
            /missedMissionStreak:\s*sanitizeMissedStreak\(/.test(src),
            'useRemoteSync must sanitize the streak it broadcasts — a corrupt persisted value would reach the phone raw.',
        ).toBe(true);
    });

    it('names applyStreakChange as the writer it protects, so the rule is discoverable', () => {
        const src = readFileSync(join(mcRoot, 'store', 'missionStreak.ts'), 'utf-8');
        expect(src).toMatch(/export function applyStreakChange/);
    });
});
