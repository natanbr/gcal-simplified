import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LearningProgressPanel } from './LearningProgressPanel';
import { getLocalDateString } from '../../store/behaviorSync';
import { createDefaultSkillProgress, type SkillProgress } from '../../skills/types';

let mockProgress: SkillProgress;

vi.mock('../../store/useMCStore', () => ({
    useMCState: () => ({ skillProgress: mockProgress }),
}));

describe('LearningProgressPanel', () => {
    beforeEach(() => {
        mockProgress = createDefaultSkillProgress();
    });

    it('shows the designed empty state before any practice', () => {
        render(<LearningProgressPanel />);
        expect(screen.getByText('No practice yet')).toBeDefined();
        expect(screen.queryByText('📈 Learning Progress')).toBeNull();
    });

    it('renders charts, level-up log, hardest words and the gated callout with data', () => {
        const today = getLocalDateString();
        mockProgress = {
            ...createDefaultSkillProgress(),
            readingLevel: 2,
            levelHistory: [
                { date: '2026-08-01', level: 0, attempts: 0, correct: 0 },
                { date: '2026-08-10', level: 1, attempts: 5, correct: 5 },
                { date: today, level: 2, attempts: 18, correct: 16 },
            ],
            missedWords: { ship: 4, dog: 1 },
            days: {
                ...createDefaultSkillProgress().days,
                // Weak skill with enough volume to clear the callout gate.
                'read-pic-word': [{ date: today, attempts: 12, firstTry: 6, offAttempts: 2, offFirstTry: 1 }],
                'read-word-pic': [{ date: today, attempts: 8, firstTry: 7, offAttempts: 0, offFirstTry: 0 }],
                'math-add': [{ date: today, attempts: 5, firstTry: 4, offAttempts: 0, offFirstTry: 0 }],
            },
        };

        render(<LearningProgressPanel />);
        expect(screen.getByText('📈 Learning Progress')).toBeDefined();
        expect(screen.getByText(/reading level L2/)).toBeDefined();
        // Level-up log with duration + window evidence.
        expect(screen.getByText(/16\/18 first-try/)).toBeDefined();
        // Hardest words, worst first.
        expect(screen.getByText('ship')).toBeDefined();
        expect(screen.getByText('4 ✗')).toBeDefined();
        // Callout: picture→word at 50% over 12 attempts clears the ≥10 gate.
        expect(screen.getByText('NEEDS WORK')).toBeDefined();
        // Appears in both the callout and the accuracy legend.
        expect(screen.getAllByText(/picture → word/).length).toBeGreaterThanOrEqual(2);
    });

    it('keeps the callout silent under the minimum sample', () => {
        const today = getLocalDateString();
        mockProgress = {
            ...createDefaultSkillProgress(),
            days: {
                ...createDefaultSkillProgress().days,
                'read-pic-word': [{ date: today, attempts: 3, firstTry: 0, offAttempts: 0, offFirstTry: 0 }],
            },
        };
        render(<LearningProgressPanel />);
        expect(screen.queryByText('NEEDS WORK')).toBeNull();
    });
});
