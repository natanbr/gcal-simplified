// ============================================================
// Docs integrity — CLAUDE.md → Docs
// ------------------------------------------------------------
// docs/requirements.md was accidentally duplicated THREE times: the entire
// document, top-level heading and all, at lines 1, 193 and 388 of a 709-line
// file. It went unnoticed long enough that CLAUDE.md stopped treating it as a
// bug and started documenting the workaround — "append to the last copy; do not
// add a fourth".
//
// The real damage was not the duplication, it was the drift. Each copy was
// edited independently, so by the time it was merged (2026-08-20) the newest
// changelog lived in copy 3 while a whole feature section — the Space Rescue
// game rules — survived only in copy 1, and copy 3 had silently dropped it.
// Anyone reading the file from the top got an out-of-date document and had no
// way to know.
//
// A guard is worth it precisely because the failure was silent: nothing about a
// duplicated markdown file breaks a build, and the second copy is exactly as
// plausible-looking as the first.
// ============================================================

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { repoRoot } from './helpers/sourceFiles';

const REQUIREMENTS = join(repoRoot, 'docs', 'requirements.md');

function requirements(): string[] {
    return readFileSync(REQUIREMENTS, 'utf-8').split(/\r?\n/);
}

describe('docs/requirements.md integrity', () => {
    const lines = requirements();

    it('is actually reading the document', () => {
        expect(lines.length).toBeGreaterThan(100);
    });

    it('contains exactly one copy of the document', () => {
        const titles = lines
            .map((line, i) => ({ line, n: i + 1 }))
            .filter(({ line }) => /^# \S/.test(line));

        expect(
            titles.map(t => `  line ${t.n}: ${t.line}`),
            `docs/requirements.md has ${titles.length} top-level headings — the document has been\n` +
            `duplicated again. This happened before and the copies drifted apart, so one section\n` +
            `existed only in copy 1 while the newest changelog was in copy 3.\n\n` +
            `Do NOT "append to the last copy". Merge as a UNION — each copy may hold content the\n` +
            `others lost — then delete the duplicates.\n`
        ).toHaveLength(1);
    });

    it('has no repeated section heading', () => {
        // A partial duplicate is harder to spot than a whole-document one and
        // does the same damage.
        const seen = new Map<string, number>();
        const repeated: string[] = [];

        lines.forEach((line, i) => {
            if (!/^#{2,3} \S/.test(line)) return;
            const key = line.trim();
            const first = seen.get(key);
            if (first !== undefined) repeated.push(`  "${key}" — line ${first} and line ${i + 1}`);
            else seen.set(key, i + 1);
        });

        expect(
            repeated,
            `Section heading(s) appear more than once. Either a copy crept back in, or two\n` +
            `changelog entries were given the same title — both make the document ambiguous to\n` +
            `read and to append to.\n\n${repeated.join('\n')}`
        ).toEqual([]);
    });

    it('keeps the changelog in ascending date order', () => {
        // The whole point of the changelog is that the bottom is the newest
        // thing. Out-of-order entries are the first symptom of a merge going
        // wrong, which is how the triplication survived so long.
        const dated = lines
            .map((line, i) => ({ match: /^### (\d{4}-\d{2}-\d{2})\b/.exec(line), line, n: i + 1 }))
            .filter((e): e is { match: RegExpExecArray; line: string; n: number } => e.match !== null);

        expect(dated.length, 'no dated changelog entries found — has the format changed?')
            .toBeGreaterThan(5);

        const outOfOrder: string[] = [];
        for (let i = 1; i < dated.length; i++) {
            if (dated[i].match[1] < dated[i - 1].match[1]) {
                outOfOrder.push(`  line ${dated[i].n}: ${dated[i].match[1]} follows ${dated[i - 1].match[1]}`);
            }
        }

        expect(
            outOfOrder,
            `Changelog entries are out of date order:\n\n${outOfOrder.join('\n')}`
        ).toEqual([]);
    });
});
