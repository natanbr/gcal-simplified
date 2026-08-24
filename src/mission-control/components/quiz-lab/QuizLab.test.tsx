// ============================================================
// Quiz Lab — smoke + sampling contract (dev-only surface).
//
// Deliberately structural, never distributional: the generators are
// tuned independently and often, so asserting "level 3 is 30% adds"
// here would turn a legitimate rebalance into a red build. What the
// lab owes its reader is that it calls the REAL generators, stamps
// the level it was asked for, and renders without a store.
//
// Self-contained by necessity: mission-control-isolation.test.ts
// forbids anything under src/mission-control/ (test files included)
// from importing src/__tests__ helpers.
//
// verifiedRedBy: pointing generateLabQuestion at a local stub
// generator failed the "real generator" pins; dropping the remount
// key from LabSamplePanel failed the reroll test.
// ============================================================

import { render, screen, fireEvent, within } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { GAME_LEVEL_MAPS } from '../../games/quizLevelMap';
import { LabSamplePanel } from './LabSamplePanel';
import { QuizLab } from './QuizLab';
import {
    generateLabQuestion,
    levelsFor,
    maxLevelFor,
    sampleDistribution,
} from './labSampling';

// Fireworks draws on a canvas — jsdom has no 2D context.
vi.mock('../../games/quiz/Fireworks', () => ({
    Fireworks: () => <div data-testid="fireworks-mock" />,
}));

const READING_SKILLS = ['read-word-pic', 'read-pic-word', 'read-missing-letter'];
const MATH_SKILLS = ['math-add', 'math-sub', 'math-mul'];

/** Deterministic-ish rng so a sampling run cannot flake the suite. */
function seededRng(seed: number): () => number {
    let state = seed;
    return () => {
        state = (state * 1664525 + 1013904223) % 4294967296;
        return state / 4294967296;
    };
}

describe('lab sampling', () => {
    it('offers the documented ladders: reading L0–L6, math L0–L3', () => {
        expect(maxLevelFor('reading')).toBe(6);
        expect(maxLevelFor('math')).toBe(3);
        expect(levelsFor('math')).toEqual([0, 1, 2, 3]);
        expect(levelsFor('reading')).toHaveLength(7);
    });

    it('serves a real reading question at every rung, stamped with that level', () => {
        for (const level of levelsFor('reading')) {
            const question = generateLabQuestion('reading', level, seededRng(level + 7));
            expect(question.kind).toBe('choice');
            expect(question.level).toBe(level);
            expect(READING_SKILLS).toContain(question.skill);
            if (question.kind !== 'choice') throw new Error('unreachable');
            expect(question.choices).toHaveLength(4);
            expect(question.wordId).toBeTruthy();
            expect(question.choices[question.correctIndex]).toBeDefined();
        }
    });

    it('serves a real math question at every rung, stamped with that level', () => {
        for (const level of levelsFor('math')) {
            const question = generateLabQuestion('math', level, seededRng(level + 11));
            expect(question.kind).toBe('numeric');
            expect(question.level).toBe(level);
            expect(MATH_SKILLS).toContain(question.skill);
            if (question.kind !== 'numeric') throw new Error('unreachable');
            expect(Number.isInteger(question.answer)).toBe(true);
        }
    });

    it('measures a math distribution without inventing the numbers', () => {
        const distribution = sampleDistribution('math', 3, 200, seededRng(42));
        expect(distribution.total).toBe(200);
        expect(distribution.skills.reduce((sum, b) => sum + b.count, 0)).toBe(200);
        expect(distribution.skills.every(b => MATH_SKILLS.includes(b.key))).toBe(true);
        // Bins partition the sample: every draw lands in exactly one.
        expect(distribution.detail.reduce((sum, b) => sum + b.count, 0)).toBe(200);
        expect(distribution.stats).not.toBeNull();
        expect(distribution.stats!.min).toBeLessThanOrEqual(distribution.stats!.max);
    });

    it('measures a reading distribution by shape and by word', () => {
        const distribution = sampleDistribution('reading', 3, 120, seededRng(9));
        expect(distribution.total).toBe(120);
        expect(distribution.skills.every(b => READING_SKILLS.includes(b.key))).toBe(true);
        expect(distribution.detail.reduce((sum, b) => sum + b.count, 0)).toBe(120);
        expect(distribution.distinctWords).toBe(distribution.detail.length);
        expect(distribution.distinctWords!).toBeGreaterThan(1);
    });
});

describe('QuizLab view', () => {
    it('renders a playable question and its metadata on first paint', () => {
        render(<QuizLab />);

        expect(screen.getByRole('heading', { name: /Quiz Lab/ })).toBeInTheDocument();
        expect(screen.getByText('DEV ONLY')).toBeInTheDocument();
        // The metadata readout only fills in once the REAL QuizOverlay has
        // pulled a question through the lab's generator.
        expect(screen.getByText('wordId')).toBeInTheDocument();
        expect(screen.getByText('read-word-pic')).toBeInTheDocument();
    });

    it('switches family and level, and the served question follows', () => {
        render(<QuizLab />);

        fireEvent.click(screen.getByRole('button', { name: /Math/ }));
        fireEvent.click(screen.getByRole('button', { name: 'Level 3' }));

        const meta = screen.getByText('kind').parentElement!.parentElement!;
        expect(within(meta).getByText('numeric')).toBeInTheDocument();
        expect(within(meta).getByText('3')).toBeInTheDocument();
        // Math questions have no word to report.
        expect(screen.queryByText('wordId')).not.toBeInTheDocument();
    });

    it('clamps the level when switching to the shorter ladder', () => {
        render(<QuizLab />);

        fireEvent.click(screen.getByRole('button', { name: 'Level 6' }));
        fireEvent.click(screen.getByRole('button', { name: /Math/ }));

        expect(screen.queryByRole('button', { name: 'Level 6' })).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Level 3' })).toHaveAttribute('aria-pressed', 'true');
    });

    // Panel-level rather than page-level: a reroll re-renders the whole lab,
    // and eight full-page passes blow the 5s test budget on framer-motion alone.
    it('rerolls a fresh question at the same setting', () => {
        render(<LabSamplePanel family="reading" level={0} />);

        const promptCell = () => screen.getByText('prompt').nextElementSibling!.textContent;
        const seen = new Set<string>();
        seen.add(promptCell()!);
        for (let i = 0; i < 8; i++) {
            fireEvent.click(screen.getByRole('button', { name: /Reroll/ }));
            seen.add(promptCell()!);
        }
        // Eight rerolls landing on one prompt every time would mean the overlay
        // was never remounted — the exact failure QuizOverlay's key-guard causes
        // when only the generator reference changes.
        expect(seen.size).toBeGreaterThan(1);
    });

    it('shows the distribution and the per-game level map', () => {
        render(<QuizLab />);

        expect(screen.getByText(/Distribution · 200 draws/)).toBeInTheDocument();
        // Asserted against the computed map, never against a hard-coded ramp:
        // snake's step was retuned from 120s to 45s while this was being built,
        // and a pinned "4:00" would have gone red for a legitimate change.
        expect(GAME_LEVEL_MAPS).toHaveLength(3);
        for (const map of GAME_LEVEL_MAPS) {
            expect(screen.getByText(map.title)).toBeInTheDocument();
            expect(map.rows.length).toBeGreaterThan(1);
            for (const row of map.rows) {
                expect(screen.getByText(`L${row.level} · ${row.trigger}`)).toBeInTheDocument();
            }
        }
    });
});
