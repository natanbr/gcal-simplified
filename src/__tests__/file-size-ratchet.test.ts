// ============================================================
// File Size Ratchet — CLAUDE.md → Conventions → "Keep files under 300 lines"
// ------------------------------------------------------------
// The rule has been declared for a long time and is currently broken in twelve
// places. A plain "fail if over 300" guard would fail the build on day one and
// be deleted by the end of the week, so this is a RATCHET instead:
//
//   * a file already over the limit is pinned at its CURRENT size — it may
//     shrink, never grow
//   * a file under the limit may not cross it
//   * a new oversized file fails outright
//
// That stops the bleeding today and lets the backlog be paid down deliberately
// rather than in one big-bang refactor nobody asked for.
//
// Raising a baseline entry is allowed — but it is an explicit edit in the same
// commit, which makes it a reviewable decision instead of a silent drift.
// ============================================================

import { describe, it, expect } from 'vitest';
import { productionSources, readSource, countLines, toRepoPath, formatBaseline } from './helpers/sourceFiles';

const LIMIT = 300;

/**
 * Files that already exceeded the limit when this guard was introduced
 * (2026-08-19), pinned at their size on that day.
 *
 * Ordered worst-first. `mcReducer.ts` is the top split candidate: it is more
 * than three times the limit and it grew by ~77 lines in the same session that
 * added this guard (the token-economy rework), which is precisely the kind of
 * quiet growth the ratchet exists to stop.
 */
const OVERSIZED_BASELINE: Record<string, number> = {
    // Lowered 1033 → 804 on 2026-08-20: the behavior-sync/token-economy block
    // (the "top split candidate" named below) moved verbatim to
    // store/behaviorSync.ts, with mcReducer re-exporting the public names.
    'src/mission-control/store/mcReducer.ts': 804,
    'src/mission-control/components/MCSettingsOverlay.tsx': 767,
    'src/mission-control/components/GoalPedestal.tsx': 629,
    'src/components/Dashboard.tsx': 504,
    'src/mission-control/components/MissionOverlay.tsx': 493,
    'src/mission-control/components/GlobalBank.tsx': 400,
    'src/mission-control/games/blocks/BlocksCanvas.tsx': 376,
    'src/mission-control/games/fruits/useFruitMergeGame.ts': 361,
    'src/mission-control/games/fruits/FruitMergeCanvas.tsx': 360,
    'src/mission-control/games/blocks/useBlocksGame.ts': 329,
    'src/mission-control/components/ResponsibilityPanel.tsx': 311,
};

interface Measured {
    file: string;
    lines: number;
}

function measureAll(): Measured[] {
    return productionSources().map(absolute => ({
        file: toRepoPath(absolute),
        lines: countLines(readSource(absolute)),
    }));
}

describe('file size ratchet', () => {
    const measured = measureAll();

    it('is actually scanning the codebase', () => {
        expect(measured.length).toBeGreaterThan(80);
    });

    it('allows no NEW file to be born over the limit', () => {
        const newlyOversized = measured
            .filter(m => m.lines > LIMIT && !(m.file in OVERSIZED_BASELINE))
            .map(m => `  ${m.file} — ${m.lines} lines (limit ${LIMIT})`);

        expect(
            newlyOversized,
            `New file(s) over the ${LIMIT}-line limit (CLAUDE.md → Conventions).\n` +
            `Split into composable units. If the size is genuinely justified, add the file to\n` +
            `OVERSIZED_BASELINE in this test in the same commit — that is a reviewable act,\n` +
            `not a workaround.\n\n${newlyOversized.join('\n')}`
        ).toEqual([]);
    });

    it('never lets an already-oversized file grow further', () => {
        const grown: string[] = [];

        for (const [file, baseline] of Object.entries(OVERSIZED_BASELINE)) {
            const current = measured.find(m => m.file === file);
            if (!current) continue; // handled by the staleness test below
            if (current.lines > baseline) {
                grown.push(`  ${file} — ${current.lines} lines, baseline ${baseline} (+${current.lines - baseline})`);
            }
        }

        expect(
            grown,
            `File(s) already over the limit grew further.\n` +
            `These are on the cleanup backlog; adding to them makes the eventual split harder.\n` +
            `Move the new code into a new module, or shrink something else in the same file.\n\n${grown.join('\n')}`
        ).toEqual([]);
    });

    it('keeps the baseline honest — entries that improved must be tightened', () => {
        // Without this, a file could be split down to 200 lines and then quietly
        // regrow to its old baseline. Progress has to be locked in.
        const slack: Array<[string, number]> = [];

        for (const [file, baseline] of Object.entries(OVERSIZED_BASELINE)) {
            const current = measured.find(m => m.file === file);
            if (!current) continue;
            if (current.lines < baseline) slack.push([file, current.lines]);
        }

        expect(
            slack.map(([f, n]) => `  ${f} — now ${n}, baseline still ${OVERSIZED_BASELINE[f]}`),
            `Nice — file(s) shrank. Lock the win in by lowering the baseline:\n\n${formatBaseline(slack)}`
        ).toEqual([]);
    });

    it('has no stale baseline entries for files that no longer exist', () => {
        const known = new Set(measured.map(m => m.file));
        const stale = Object.keys(OVERSIZED_BASELINE).filter(f => !known.has(f));

        expect(
            stale,
            `Baseline lists file(s) that no longer exist — delete these entries:\n  ${stale.join('\n  ')}`
        ).toEqual([]);
    });

    it('records how much debt is outstanding, so it stays visible', () => {
        // Not an assertion about quality — a deliberate, greppable statement of
        // the size of the backlog. If this number climbs, the ratchet is being
        // raised too readily.
        const outstanding = Object.keys(OVERSIZED_BASELINE).length;
        expect(outstanding).toBeLessThanOrEqual(12);
    });
});
