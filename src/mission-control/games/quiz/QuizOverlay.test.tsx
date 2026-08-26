import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { QuizOverlay } from './QuizOverlay';
import type { QuizQuestion } from './types';

// Fireworks draws on a canvas — jsdom has no 2D context.
vi.mock('./Fireworks', () => ({
    Fireworks: () => <div data-testid="fireworks-mock" />,
}));

/** Generator returning a fresh, identifiable question per call. */
function makeCountingGenerator() {
    let calls = 0;
    const generator = (): QuizQuestion => {
        calls += 1;
        return {
            kind: 'numeric',
            skill: 'math-add',
            level: 0,
            text: `${calls} + ${calls} = ?`,
            answer: calls + calls,
        };
    };
    return { generator, callCount: () => calls };
}

function renderOverlay(overrides: Partial<React.ComponentProps<typeof QuizOverlay>> = {}) {
    const counting = makeCountingGenerator();
    const onCorrect = vi.fn();
    const onAnswered = vi.fn();
    const props: React.ComponentProps<typeof QuizOverlay> = {
        open: true,
        requiredCorrect: 3,
        currentCorrect: 0,
        generator: counting.generator,
        onCorrect,
        // Required, not decoration: onAnswered is the only thing that clears
        // the engine's pending-question slot. A surface that omits it wedges
        // the engine on one question for the rest of the visit.
        onAnswered,
        ...overrides,
    };
    const utils = render(<QuizOverlay {...props} />);
    return { ...utils, counting, onCorrect, onAnswered, props };
}

function tapDigit(digit: string) {
    fireEvent.click(screen.getByRole('button', { name: digit }));
}

function submit() {
    fireEvent.click(screen.getByRole('button', { name: '✓' }));
}

// Every test here drives framer-motion through fake timers, which is slow:
// individual cases take 0.5-2s in isolation and blow the 5s default when the
// full suite runs in parallel on a loaded machine. The timeout is a file-level
// property of the setup, not a property of any one case, so it lives here.
describe('QuizOverlay — numeric (numpad) behavior guards', { timeout: 20000 }, () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });
    afterEach(() => {
        vi.useRealTimers();
    });

    it('renders nothing when closed', () => {
        const { container } = renderOverlay({ open: false });
        expect(container.firstChild).toBeNull();
    });

    it('shows the question and one progress dot per required answer', () => {
        renderOverlay({ requiredCorrect: 3, currentCorrect: 1 });
        expect(screen.getByText(/=$/)).toBeDefined();
        expect(screen.getByText('1/3')).toBeDefined();
    });

    it('keeps the SAME question after a wrong answer (no regeneration)', () => {
        const { counting } = renderOverlay();
        const callsAfterMount = counting.callCount();

        tapDigit('9');
        tapDigit('9');
        tapDigit('9');
        submit();

        expect(counting.callCount()).toBe(callsAfterMount);
        // Input is cleared and the wrong marker shows; question text still on screen.
        expect(screen.getByText('✗')).toBeDefined();
    });

    it('fires onCorrect only after the 600ms success dwell', () => {
        const { counting, onCorrect } = renderOverlay();
        // The displayed question is the latest generator call.
        const answer = counting.callCount() * 2;

        for (const ch of String(answer)) tapDigit(ch);
        submit();

        expect(onCorrect).not.toHaveBeenCalled();
        act(() => {
            vi.advanceTimersByTime(600);
        });
        expect(onCorrect).toHaveBeenCalledTimes(1);
    });

    it('accepts keyboard digits, Backspace and Enter', () => {
        const { counting, onCorrect } = renderOverlay();
        const answer = counting.callCount() * 2;
        const digits = String(answer);

        fireEvent.keyDown(window, { key: '7' });
        fireEvent.keyDown(window, { key: 'Backspace' });
        for (const ch of digits) fireEvent.keyDown(window, { key: ch });
        fireEvent.keyDown(window, { key: 'Enter' });

        act(() => {
            vi.advanceTimersByTime(600);
        });
        expect(onCorrect).toHaveBeenCalledTimes(1);
    });

    it('caps typed input at 3 digits', () => {
        renderOverlay();
        for (const ch of '12345') tapDigit(ch);
        // Only the first three digits survive in the answer box.
        expect(screen.getByText('123')).toBeDefined();
        expect(screen.queryByText('1234')).toBeNull();
        expect(screen.queryByText('12345')).toBeNull();
    });

    it('regenerates the question when currentCorrect advances', () => {
        const { counting, rerender, props } = renderOverlay();
        const callsAfterMount = counting.callCount();

        rerender(<QuizOverlay {...props} currentCorrect={1} />);
        expect(counting.callCount()).toBe(callsAfterMount + 1);
    });
});

// ---- Choice (reading) flow ----

import type { ChoiceQuizQuestion } from './types';

function choiceQuestion(): ChoiceQuizQuestion {
    return {
        kind: 'choice',
        skill: 'read-pic-word',
        level: 3,
        wordId: 'dog',
        prompt: { display: 'emoji', emoji: '🐶' },
        choices: [
            { label: 'dig', render: 'word' },
            { label: 'dog', render: 'word' },
            { label: 'dot', render: 'word' },
            { label: 'dug', render: 'word' },
        ],
        correctIndex: 1,
    };
}

function renderChoiceOverlay(overrides: Partial<React.ComponentProps<typeof QuizOverlay>> = {}) {
    let generated = 0;
    const generator = () => {
        generated += 1;
        return choiceQuestion();
    };
    const onCorrect = vi.fn();
    const onAnswered = vi.fn();
    const props: React.ComponentProps<typeof QuizOverlay> = {
        open: true,
        requiredCorrect: 3,
        currentCorrect: 0,
        generator,
        onCorrect,
        onAnswered,
        ...overrides,
    };
    const utils = render(<QuizOverlay {...props} />);
    return { ...utils, onCorrect, onAnswered, generatedCount: () => generated, props };
}

describe('QuizOverlay — choice (reading) behavior', { timeout: 20000 }, () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });
    afterEach(() => {
        vi.useRealTimers();
    });

    it('a clean first tap records firstTry=true and fills the dot after the dwell', () => {
        const { onCorrect, onAnswered } = renderChoiceOverlay();

        fireEvent.click(screen.getByRole('button', { name: 'dog' }));
        expect(onAnswered).toHaveBeenCalledTimes(1);
        expect(onAnswered.mock.calls[0][1]).toBe(true);

        expect(onCorrect).not.toHaveBeenCalled();
        act(() => {
            vi.advanceTimersByTime(600);
        });
        expect(onCorrect).toHaveBeenCalledTimes(1);
    });

    it('a wrong first tap records firstTry=false ONCE, locks the choice, and freezes the grid', () => {
        const { onCorrect, onAnswered } = renderChoiceOverlay();

        fireEvent.click(screen.getByRole('button', { name: 'dig' }));
        expect(onAnswered).toHaveBeenCalledTimes(1);
        expect(onAnswered.mock.calls[0][1]).toBe(false);
        expect((screen.getByRole('button', { name: /dig/ }) as HTMLButtonElement).disabled).toBe(true);

        // Grid frozen for 1.5s — a tap-spam on the right answer does nothing.
        fireEvent.click(screen.getByRole('button', { name: 'dog' }));
        expect(onAnswered).toHaveBeenCalledTimes(1);
        expect(onCorrect).not.toHaveBeenCalled();

        act(() => {
            vi.advanceTimersByTime(1500);
        });

        // Now the kid finds it: soft success, NO dot, a fresh question follows.
        fireEvent.click(screen.getByRole('button', { name: 'dog' }));
        expect(onAnswered).toHaveBeenCalledTimes(1); // never re-recorded
        act(() => {
            vi.advanceTimersByTime(600);
        });
        expect(onCorrect).not.toHaveBeenCalled();
    });

    it('serves a NEW question after a found-late answer', () => {
        const { generatedCount } = renderChoiceOverlay();
        const afterMount = generatedCount();

        fireEvent.click(screen.getByRole('button', { name: 'dig' }));
        act(() => {
            vi.advanceTimersByTime(1500);
        });
        fireEvent.click(screen.getByRole('button', { name: 'dog' }));
        act(() => {
            vi.advanceTimersByTime(600);
        });

        expect(generatedCount()).toBe(afterMount + 1);
    });

    it('answers with the 1-4 keys', () => {
        const { onAnswered } = renderChoiceOverlay();
        fireEvent.keyDown(window, { key: '2' }); // index 1 = 'dog'
        expect(onAnswered).toHaveBeenCalledTimes(1);
        expect(onAnswered.mock.calls[0][1]).toBe(true);
    });

    it('shows a cancel button only when onCancel is provided, and it fires', () => {
        const { rerender, props } = renderChoiceOverlay();
        expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull();

        const onCancel = vi.fn();
        rerender(<QuizOverlay {...props} onCancel={onCancel} />);
        fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
        expect(onCancel).toHaveBeenCalledTimes(1);
    });

    it('notifies onClosed when the overlay closes', () => {
        const onClosed = vi.fn();
        const { rerender, props } = renderChoiceOverlay({ onClosed });
        rerender(<QuizOverlay {...props} onClosed={onClosed} open={false} />);
        expect(onClosed).toHaveBeenCalledTimes(1);
    });
});
