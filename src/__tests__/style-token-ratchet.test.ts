// ============================================================
// Styling Ratchet — CLAUDE.md → Conventions → Styling
//   "No raw hex values in components. Use the token from whichever system
//    owns the surface."
// ------------------------------------------------------------
// ⚠️  READ THIS BEFORE TRUSTING THE RULE.
//
// When this guard was written the rule was violated in 34 files across both
// apps — including files written the same day, because new code correctly
// matched the idiom of the code around it (CLAUDE.md also demands that).
// A rule broken that widely is not a rule the codebase actually follows.
//
// So this is a RATCHET, not an enforcement: the current state is frozen, new
// violations are blocked, and the question of whether the RULE changes or the
// CODE changes is left to a human. It is recorded as `ratcheted` (not
// `guarded`) in rule-registry.test.ts for exactly that reason.
// ============================================================

import { describe, it, expect } from 'vitest';
import { productionSources, readSource, toRepoPath, formatBaseline } from './helpers/sourceFiles';

/** Surfaces the styling rule governs: components, not pure logic modules. */
const STYLED_ROOTS = [
    'src/components',
    'src/features',
    'src/mission-control/components',
    'src/mission-control/games',
];

/** #rgb, #rrggbb, #rrggbbaa — anywhere in the source, including inside strings. */
const HEX_PATTERN = /#[0-9a-fA-F]{3,8}\b/g;

/**
 * Raw hex counts as of 2026-08-19, when this guard was introduced.
 * A file may go DOWN, never up. Delete an entry when it reaches zero.
 */
const RAW_HEX_BASELINE: Record<string, number> = {
    'src/components/PerformanceHud.tsx': 4,
    'src/mission-control/components/CelebrationOverlay.tsx': 9,
    'src/mission-control/components/GameSelectorOverlay.tsx': 11,
    'src/mission-control/components/GameTokenPanel.tsx': 9,
    'src/mission-control/components/GlobalBank.tsx': 20,
    'src/mission-control/components/GoalPedestal.tsx': 19,
    'src/mission-control/components/MCSettingsOverlay.tsx': 49,
    'src/mission-control/components/MissionOverlay.tsx': 28,
    'src/mission-control/components/MissionTimerDisplay.tsx': 7,
    'src/mission-control/components/MoodWindNotification.tsx': 9,
    'src/mission-control/components/PrivilegeCardButton.tsx': 20,
    'src/mission-control/components/PrivilegesPanel.tsx': 11,
    'src/mission-control/components/ResponsibilityPanel.tsx': 19,
    'src/mission-control/components/TaskCard/TaskCard.tsx': 6,
    'src/mission-control/components/Token.tsx': 1,
    'src/mission-control/components/activity-log/LogSummaryStrip.tsx': 5,
    'src/mission-control/components/activity-log/logSources.ts': 5,
    'src/mission-control/components/activity-log/renderHighlightedMessage.tsx': 1,
    'src/mission-control/games/blocks/Altimeter.tsx': 8,
    'src/mission-control/games/blocks/BlocksCanvas.tsx': 2,
    'src/mission-control/games/blocks/BlocksGameOverlay.tsx': 24,
    'src/mission-control/games/blocks/BlocksGrid.tsx': 1,
    'src/mission-control/games/blocks/ClearedFeedbackOverlay.tsx': 1,
    'src/mission-control/games/blocks/GridCell.tsx': 16,
    'src/mission-control/games/blocks/PerformanceHUD.tsx': 11,
    'src/mission-control/games/blocks/RescueSlot.tsx': 3,
    'src/mission-control/games/blocks/types.ts': 17,
    'src/mission-control/games/fruits/FruitMergeCanvas.tsx': 4,
    'src/mission-control/games/fruits/types.ts': 22,
    'src/mission-control/games/quiz/Fireworks.tsx': 10,
    'src/mission-control/games/quiz/NumpadButton.tsx': 1,
    'src/mission-control/games/quiz/QuizOverlay.tsx': 11,
    'src/mission-control/games/snake/SnakeCanvas.tsx': 5,
    'src/mission-control/games/snake/types.ts': 13,
};

function measureHex(): Array<[string, number]> {
    return productionSources(STYLED_ROOTS)
        .map(absolute => {
            const matches = readSource(absolute).match(HEX_PATTERN);
            return [toRepoPath(absolute), matches ? matches.length : 0] as [string, number];
        })
        .filter(([, count]) => count > 0);
}

describe('raw hex ratchet', () => {
    const measured = measureHex();
    const byFile = new Map(measured);

    it('is actually scanning the styled surfaces', () => {
        expect(productionSources(STYLED_ROOTS).length).toBeGreaterThan(30);
    });

    it('introduces no raw hex in a file that had none', () => {
        const fresh = measured
            .filter(([file]) => !(file in RAW_HEX_BASELINE))
            .map(([file, count]) => `  ${file} — ${count} raw hex value(s)`);

        expect(
            fresh,
            `Raw hex in a file that previously had none (CLAUDE.md → Conventions → Styling).\n` +
            `Mission Control surfaces use the --mc-* custom properties in styles/mc.css;\n` +
            `calendar surfaces use the Tailwind tokens in tailwind.config.js.\n\n${fresh.join('\n')}`
        ).toEqual([]);
    });

    it('adds no further raw hex to files that already have some', () => {
        const grown: string[] = [];

        for (const [file, baseline] of Object.entries(RAW_HEX_BASELINE)) {
            const current = byFile.get(file);
            if (current === undefined) continue;
            if (current > baseline) {
                grown.push(`  ${file} — ${current} now, baseline ${baseline} (+${current - baseline})`);
            }
        }

        expect(
            grown,
            `Raw hex count increased in file(s) already on the cleanup backlog:\n\n${grown.join('\n')}`
        ).toEqual([]);
    });

    it('tightens the baseline whenever a file improves', () => {
        const improved: Array<[string, number]> = [];

        for (const [file, baseline] of Object.entries(RAW_HEX_BASELINE)) {
            const current = byFile.get(file) ?? 0;
            if (current < baseline) improved.push([file, current]);
        }

        expect(
            improved.map(([f, n]) => `  ${f} — now ${n}, baseline still ${RAW_HEX_BASELINE[f]}`),
            `File(s) moved toward tokens. Lock the win in — update or delete these entries:\n\n` +
            `${formatBaseline(improved.filter(([, n]) => n > 0))}\n` +
            `(entries now at 0 should be deleted outright)`
        ).toEqual([]);
    });

    it('has no stale entries for files that no longer exist', () => {
        const known = new Set(productionSources(STYLED_ROOTS).map(toRepoPath));
        const stale = Object.keys(RAW_HEX_BASELINE).filter(f => !known.has(f));

        expect(stale, `Delete baseline entries for removed files:\n  ${stale.join('\n  ')}`).toEqual([]);
    });
});

describe('design system separation', () => {
    // This half of the styling rule IS cleanly followed, so it is enforced
    // outright rather than ratcheted.
    it('keeps calendar-app Tailwind tokens out of Mission Control', () => {
        const violations: string[] = [];

        for (const absolute of productionSources(['src/mission-control'])) {
            const matches = readSource(absolute).match(/\b(?:bg|text|border|ring|from|to)-family-[a-z-]+/g);
            if (matches) {
                violations.push(`  ${toRepoPath(absolute)} — ${[...new Set(matches)].join(', ')}`);
            }
        }

        expect(
            violations,
            `Mission Control used calendar-app Tailwind tokens. The two design systems are\n` +
            `disjoint by rule — use the --mc-* properties from styles/mc.css instead.\n\n${violations.join('\n')}`
        ).toEqual([]);
    });

    it('keeps the mc.css stylesheet out of the calendar app', () => {
        const violations: string[] = [];

        for (const absolute of productionSources(['src/components', 'src/features', 'src/hooks'])) {
            if (/styles\/mc\.css|mc-root/.test(readSource(absolute))) {
                violations.push(`  ${toRepoPath(absolute)}`);
            }
        }

        expect(
            violations,
            `The calendar app reached for the Mission Control stylesheet:\n${violations.join('\n')}`
        ).toEqual([]);
    });
});
