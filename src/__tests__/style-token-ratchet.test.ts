// ============================================================
// Styling Ratchet — CLAUDE.md → Conventions → Styling
//   "No raw hex in DOM-styled surfaces. Use the token from whichever system
//    owns the surface. Canvas draw palettes are exempt."
// ------------------------------------------------------------
// ⚠️  READ THIS BEFORE TRUSTING THE RULE.
//
// When this guard was written the rule was violated in 32 files / 366 values —
// including files written that same day, because new code correctly matched the
// idiom around it (CLAUDE.md also demands that). A rule broken that widely is not
// a rule the codebase follows, so it was frozen as a RATCHET and the rule-or-code
// question was left to a human.
//
// THE HUMAN DECIDED (2026-08-22) and the rule NARROWED to DOM surfaces:
//   • Canvas palettes are EXEMPT — 5 files, 54 values. ctx.fillStyle cannot consume
//     var(--mc-*), so the palette constant IS that surface's token source below.
//   • The DOM half stays RATCHETED — 27 files, 312 values outstanding. Frozen: may
//     improve, never regress; a new violation in a non-exempt file fails outright.
//
// So `ratcheted` in rule-registry.test.ts is a backlog of known size now, not a
// shrug about an undecided rule.
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

/** Repo-relative path → source text, read once. */
const SOURCES = new Map(productionSources(STYLED_ROOTS).map(a => [toRepoPath(a), readSource(a)]));

/** `drawnBy` = the file that actually paints with this palette. Defaults to itself. */
interface CanvasExemption { drawnBy?: string; why: string }

/**
 * CANVAS DRAW PALETTES — exempt from the raw-hex rule (owner decision, 2026-08-22).
 *
 * `ctx.fillStyle = 'var(--mc-apple)'` does not work: Canvas 2D takes a CSS *color
 * string*, and a custom-property reference has no element to resolve against, so it
 * is discarded and the shape keeps the previous fill. For a canvas surface the
 * palette constant therefore IS the token source — routing it through mc.css would
 * be a downgrade, not a cleanup.
 *
 * `drawnBy` is CHECKED, not decorative (see `canvas palette exemptions` below). An
 * exemption is a permanent licence to keep raw hex, so it must prove a real 2D
 * context does the painting — otherwise "exempt" is the cheapest place to hide a new
 * DOM violation. That is exactly how BlocksCanvas.tsx was wrongly classified on the
 * first pass: despite the name it has no canvas at all.
 */
const CANVAS_PALETTE_EXEMPT: Record<string, CanvasExemption> = {
    'src/mission-control/games/fruits/types.ts': {
        drawnBy: 'src/mission-control/games/fruits/FruitMergeCanvas.tsx',
        why: '22 values: FRUIT_TYPES color/strokeColor + the COLORS container palette. The DOM overlay imports FRUIT_TYPES for .emoji/.name only — never a colour field.',
    },
    'src/mission-control/games/snake/types.ts': {
        drawnBy: 'src/mission-control/games/snake/SnakeCanvas.tsx',
        why: '13 values: the COLORS map (snake, apple, grid, HUD text); the canvas is snake\'s only renderer.',
    },
    // Self-drawing renderers — drawnBy is the file itself, so it is left implicit.
    'src/mission-control/games/quiz/Fireworks.tsx': { why: '10 values: the particle colour wheel, assigned straight to ctx.fillStyle per particle.' },
    'src/mission-control/games/snake/SnakeCanvas.tsx': { why: '5 values: literals inline in the waiting / game-over draw calls, not routed through COLORS.' },
    'src/mission-control/games/fruits/FruitMergeCanvas.tsx': { why: '4 values: literals inline in the game-over and delete-prompt draw calls.' },
};

/** Evidence a file really draws: it holds a 2D context, AND paints a colour with it. */
const CANVAS_CONTEXT = /getContext\(|CanvasRenderingContext2D/;
const CANVAS_PAINT = /\.(?:fillStyle|strokeStyle|shadowColor)\s*=/;

/**
 * Raw hex counts as of 2026-08-19, when this guard was introduced, minus the
 * canvas palettes exempted on 2026-08-22. DOM surfaces only.
 * A file may go DOWN, never up. Delete an entry when it reaches zero.
 */
const RAW_HEX_BASELINE: Record<string, number> = {
    'src/components/PerformanceHud.tsx': 4,
    'src/mission-control/components/CelebrationOverlay.tsx': 9,
    'src/mission-control/components/GameSelectorOverlay.tsx': 11,
    'src/mission-control/components/GameTokenPanel.tsx': 9,
    'src/mission-control/components/GlobalBank.tsx': 20,
    'src/mission-control/components/GoalPedestal.tsx': 19,
    'src/mission-control/components/MCSettingsOverlay.tsx': 45,
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
    // NOT a canvas despite the name — zero getContext/fillStyle/<canvas>; these 2 are drag-projection colours.
    'src/mission-control/games/blocks/BlocksCanvas.tsx': 2,
    'src/mission-control/games/blocks/BlocksGameOverlay.tsx': 24,
    'src/mission-control/games/blocks/BlocksGrid.tsx': 1,
    'src/mission-control/games/blocks/ClearedFeedbackOverlay.tsx': 1,
    'src/mission-control/games/blocks/GridCell.tsx': 16,
    'src/mission-control/games/blocks/PerformanceHUD.tsx': 11,
    'src/mission-control/games/blocks/RescueSlot.tsx': 3,
    // Blocks is the one game with no canvas: shape `color` fields rendered as DOM
    // backgrounds (ShapeItem.tsx → `background: shape.color`).
    'src/mission-control/games/blocks/types.ts': 17,
};

const hexCount = (source: string): number => (source.match(HEX_PATTERN) ?? []).length;

function measureHex(): Array<[string, number]> {
    return [...SOURCES.entries()]
        .map(([file, source]) => [file, hexCount(source)] as [string, number])
        .filter(([file, count]) => count > 0 && !(file in CANVAS_PALETTE_EXEMPT));
}

describe('raw hex ratchet', () => {
    const measured = measureHex();
    const byFile = new Map(measured);

    it('is actually scanning the styled surfaces', () => {
        expect(SOURCES.size).toBeGreaterThan(30);
    });

    it('introduces no raw hex in a file that had none', () => {
        const fresh = measured
            .filter(([file]) => !(file in RAW_HEX_BASELINE))
            .map(([file, count]) => `  ${file} — ${count} raw hex value(s)`);

        expect(
            fresh,
            `Raw hex in a file that previously had none (CLAUDE.md → Conventions → Styling).\n` +
            `Mission Control surfaces use the --mc-* custom properties in styles/mc.css;\n` +
            `calendar surfaces use the Tailwind tokens in tailwind.config.js. If the file really\n` +
            `draws to a canvas, add it to CANVAS_PALETTE_EXEMPT — but the drawnBy it names must\n` +
            `actually paint, so the exemption is not a way round this.\n\n${fresh.join('\n')}`
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
        const stale = Object.keys(RAW_HEX_BASELINE).filter(f => !SOURCES.has(f));

        expect(stale, `Delete baseline entries for removed files:\n  ${stale.join('\n  ')}`).toEqual([]);
    });
});

describe('canvas palette exemptions', () => {
    const entries = Object.entries(CANVAS_PALETTE_EXEMPT);

    it('only exempts files that a real canvas renderer paints with', () => {
        // THE ANTI-LOOPHOLE CHECK. The named drawnBy must both hold a 2D context and
        // assign a colour to it. A DOM file merely named "...Canvas" does not qualify
        // — that exact mistake is why this test exists.
        const bogus: string[] = [];

        for (const [file, exemption] of entries) {
            const drawnBy = exemption.drawnBy ?? file;
            const source = SOURCES.get(drawnBy);
            if (source === undefined) {
                bogus.push(`  ${file}\n    → drawnBy names a file that does not exist: ${drawnBy}`);
                continue;
            }
            const missing: string[] = [];
            if (!CANVAS_CONTEXT.test(source)) missing.push('no getContext( / CanvasRenderingContext2D');
            if (!CANVAS_PAINT.test(source)) missing.push('no fillStyle/strokeStyle/shadowColor assignment');
            if (missing.length > 0) {
                bogus.push(`  ${file}\n    → drawnBy ${drawnBy} does not draw: ${missing.join('; ')}`);
            }
        }

        expect(
            bogus,
            `Canvas exemption claimed for a surface that is not canvas. The exemption exists only\n` +
            `because ctx.fillStyle cannot resolve var(--mc-*); it does NOT apply to a DOM-styled\n` +
            `file. Remove the entry and put the file on RAW_HEX_BASELINE — or, better, convert it\n` +
            `to tokens.\n\n${bogus.join('\n')}`
        ).toEqual([]);
    });

    it('links every palette module to the sibling renderer that imports it', () => {
        const orphaned: string[] = [];

        for (const [file, { drawnBy }] of entries) {
            if (drawnBy === undefined || drawnBy === file) continue; // self-drawing, nothing to import
            const dir = file.slice(0, file.lastIndexOf('/'));
            const basename = file.slice(dir.length + 1).replace(/\.tsx?$/, '');
            const source = SOURCES.get(drawnBy) ?? '';
            // Directory equality matters: every game has a types.ts and every renderer
            // imports its own './types', so the substring alone would let one game's
            // renderer vouch for another game's palette.
            if (drawnBy.slice(0, drawnBy.lastIndexOf('/')) !== dir || !source.includes(`'./${basename}'`)) {
                orphaned.push(`  ${file}\n    → ${drawnBy} is not a sibling that imports './${basename}'`);
            }
        }

        expect(
            orphaned,
            `A palette module is exempt because a canvas renderer consumes it. If the renderer no\n` +
            `longer imports it, the link is broken and the exemption unproven. (Same-directory\n` +
            `siblings only — a palette that moved should fail here loudly.)\n\n${orphaned.join('\n')}`
        ).toEqual([]);
    });

    it('never lets a file be both exempt and baselined', () => {
        const both = Object.keys(CANVAS_PALETTE_EXEMPT).filter(f => f in RAW_HEX_BASELINE);

        expect(
            both,
            `File(s) listed as an exempt canvas palette AND on the DOM cleanup backlog. One of the\n` +
            `two is wrong — a file cannot be both forgiven and owed:\n  ${both.join('\n  ')}`
        ).toEqual([]);
    });

    it('drops exemptions that no longer hold raw hex', () => {
        const pointless = entries
            .filter(([file]) => hexCount(SOURCES.get(file) ?? '') === 0)
            .map(([file]) => `  ${file}${SOURCES.has(file) ? '' : ' (file is gone)'}`);

        expect(
            pointless,
            `Exemption(s) for a file that was deleted or now has zero raw hex. Delete the entry —\n` +
            `a dead exemption is a place for a future violation to land unnoticed:\n\n${pointless.join('\n')}`
        ).toEqual([]);
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
