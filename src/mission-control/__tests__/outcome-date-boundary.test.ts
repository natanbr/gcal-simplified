// ============================================================
// Outcome dates — structural boundary pin (source-reading test, the
// activity-stamp-boundary shape).
//
// What this protects: `lastCompletedOrFailed{Morning,Evening}Date` says "that
// day's occurrence is done". The writer dated it by the clock at the outcome
// and the reader compared it with today; both agreed on every daytime window,
// so nothing noticed that an evening ending at 00:30 marked the NEXT day done
// (fixed 2026-10-05: the day is stored when the run starts, occurrenceDay.ts).
// A new writer that dates it some other way, or a new reader that compares it
// with something other than an occurrence's own day, brings that back, and a
// new code path is by definition not covered by an existing behavioural test.
//
// Writes are allowed only where they are listed below, by block, not by file:
// the declaration, the initial state, the one outcome writer, and the phone
// payload's copy. Comparisons only in the scheduler (with the occurrence's
// start day) and the quick-game window (with the morning of the day it is
// asked about). e2e/helpers/missionClock.ts writes the fields too, in a test
// profile, outside this tree on purpose.
//
// verifiedRedBy: write `lastCompletedOrFailedEveningDate: null` into the
// CANCEL_MISSION case in mcReducer.ts — the write case names it; compare the
// field with getLocalDateString() in a new file — the reader case names it.
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

const FIELD = /lastCompletedOrFailed(?:Morning|Evening)Date/;

/** A write in any form: a property in a literal or a type, an assignment (dot or bracket), a delete. */
const WRITE = new RegExp([
    /lastCompletedOrFailed(?:Morning|Evening)Date\??\s*:/.source,
    /\.lastCompletedOrFailed(?:Morning|Evening)Date\s*=(?!=)/.source,
    /\[\s*['"`]lastCompletedOrFailed(?:Morning|Evening)Date['"`]\s*\]\s*=(?!=)/.source,
    /\bdelete\b[^;]*lastCompletedOrFailed/.source,
].join('|'));

/** A comparison with either operand the field. */
const COMPARE = /lastCompletedOrFailed(?:Morning|Evening)Date\s*[!=]==?|[!=]==?\s*[\w.?]*lastCompletedOrFailed(?:Morning|Evening)Date/;

/**
 * Where a write may stand: the file, and the block it must sit in (the first
 * line matching `opens`, up to the first line after it matching `closes`).
 */
const WRITERS: Record<string, { opens: RegExp; closes: RegExp; why: string } | null> = {
    'types.ts': null, // the declaration
    'store/mcReducer.ts': { opens: /^export const initialState/, closes: /^};/, why: 'the initial state' },
    'store/missionStreak.ts': { opens: /^function outcomeDatePatch/, closes: /^}/, why: 'the one outcome writer' },
    'store/useRemoteSync.ts': null, // the phone payload's copy, read by the phone's "Done Today"
};

/** Readers that compare: each with the day it must compare against. */
const COMPARERS = new Set([
    'hooks/useMissionScheduler.ts', // occurrenceHandled: the occurrence's own start day
    'store/gameWindow.ts', // isQuickGameWindowOpen: the morning of the day it is asked about
]);

function isComment(line: string): boolean {
    return /^\s*(\/\/|\*|\/\*)/.test(line);
}

function sourceLines(): Array<{ rel: string; lines: string[] }> {
    return walk(mcRoot).map(file => ({
        rel: relative(mcRoot, file).split(/[\\/]/).join('/'),
        lines: readFileSync(file, 'utf-8').split('\n'),
    }));
}

/** 1-based line numbers inside the allowed block, or every line when the whole file is allowed. */
function allowedLines(lines: string[], block: { opens: RegExp; closes: RegExp } | null): Set<number> {
    if (!block) return new Set(lines.map((_, i) => i + 1));
    const start = lines.findIndex(l => block.opens.test(l));
    if (start < 0) return new Set();
    const end = lines.findIndex((l, i) => i > start && block.closes.test(l));
    const out = new Set<number>();
    for (let i = start; i <= (end < 0 ? lines.length - 1 : end); i++) out.add(i + 1);
    return out;
}

describe('outcome dates have one writer and two comparing readers', () => {
    it('recognises every form of write and comparison, and not a plain read', () => {
        const writes = [
            '{ ...s, lastCompletedOrFailedEveningDate: null }',
            's.lastCompletedOrFailedMorningDate = today;',
            "state['lastCompletedOrFailedEveningDate'] = today;",
            'delete s.lastCompletedOrFailedMorningDate;',
        ];
        expect(writes.filter(line => !WRITE.test(line))).toEqual([]);
        expect(WRITE.test('const d = s.lastCompletedOrFailedMorningDate;')).toBe(false);
        expect(COMPARE.test('s.lastCompletedOrFailedMorningDate === today')).toBe(true);
        expect(COMPARE.test('today !== state.lastCompletedOrFailedEveningDate')).toBe(true);
        expect(COMPARE.test('payload: s.lastCompletedOrFailedEveningDate ?? null')).toBe(false);
    });

    it('is written only in the listed blocks', () => {
        const offenders: string[] = [];
        for (const { rel, lines } of sourceLines()) {
            const allowed = rel in WRITERS ? allowedLines(lines, WRITERS[rel]) : new Set<number>();
            lines.forEach((line, i) => {
                if (!isComment(line) && WRITE.test(line) && !allowed.has(i + 1)) offenders.push(`${rel}:${i + 1} — ${line.trim()}`);
            });
        }
        expect(
            offenders,
            'These write an outcome date outside its one writer (missionStreak.ts outcomeDatePatch, which dates ' +
            'it by the occurrence stored at the run\'s start). Route the write through it:\n  ' + offenders.join('\n  '),
        ).toEqual([]);
    });

    it('each listed block still writes the fields (a moved writer must update this list)', () => {
        const files = new Map(sourceLines().map(f => [f.rel, f.lines]));
        for (const [rel, block] of Object.entries(WRITERS)) {
            const lines = files.get(rel);
            expect(lines, `${rel} is gone`).toBeDefined();
            const allowed = allowedLines(lines ?? [], block);
            const writes = (lines ?? []).filter((l, i) => allowed.has(i + 1) && !isComment(l) && WRITE.test(l));
            expect(writes, `${rel}${block ? ` (${block.why})` : ''} no longer writes the outcome dates`).toHaveLength(2);
        }
    });

    it('is compared only by the scheduler and the quick-game window', () => {
        const offenders: string[] = [];
        for (const { rel, lines } of sourceLines()) {
            if (COMPARERS.has(rel)) continue;
            lines.forEach((line, i) => {
                if (!isComment(line) && FIELD.test(line) && COMPARE.test(line)) offenders.push(`${rel}:${i + 1} — ${line.trim()}`);
            });
        }
        expect(
            offenders,
            'These compare an outcome date. It names the day an occurrence STARTED, so compare it with an ' +
            'occurrence\'s own day (useMissionScheduler occurrenceHandled), never with "today" at some other moment:\n  ' +
            offenders.join('\n  '),
        ).toEqual([]);
    });
});
