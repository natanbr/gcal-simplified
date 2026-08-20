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
        return { text: `${calls} + ${calls} = ?`, answer: calls + calls };
    };
    return { generator, callCount: () => calls };
}

function renderOverlay(overrides: Partial<React.ComponentProps<typeof QuizOverlay>> = {}) {
    const counting = makeCountingGenerator();
    const onCorrect = vi.fn();
    const props: React.ComponentProps<typeof QuizOverlay> = {
        open: true,
        requiredCorrect: 3,
        currentCorrect: 0,
        generator: counting.generator,
        onCorrect,
        ...overrides,
    };
    const utils = render(<QuizOverlay {...props} />);
    return { ...utils, counting, onCorrect, props };
}

function tapDigit(digit: string) {
    fireEvent.click(screen.getByRole('button', { name: digit }));
}

function submit() {
    fireEvent.click(screen.getByRole('button', { name: '✓' }));
}

describe('QuizOverlay — numeric (numpad) behavior guards', () => {
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
