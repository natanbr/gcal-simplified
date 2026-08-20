import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { SnakeGameOverlay } from './SnakeGameOverlay';
import type { QuizEngineApi } from '../quiz/types';

// Mock the canvas to avoid rendering issues in JSDOM
vi.mock('./SnakeCanvas', () => ({
    SnakeCanvas: () => <div data-testid="snake-canvas-mock" />
}));

function stubEngine(): QuizEngineApi {
    return {
        generator: () => ({ kind: 'numeric', skill: 'math-add', level: 0, text: '1 + 1 = ?', answer: 2 }),
        beginSession: vi.fn(),
        setDifficulty: vi.fn(),
        onAnswered: vi.fn(),
        notifyQuizClosed: vi.fn(),
    };
}

describe('SnakeGameOverlay', () => {
    it('renders null when open is false', () => {
        const { container } = render(<SnakeGameOverlay open={false} onClose={vi.fn()} engine={stubEngine()} />);
        expect(container.firstChild).toBeNull();
    });

    it('renders overlay when open is true', () => {
        render(<SnakeGameOverlay open={true} onClose={vi.fn()} engine={stubEngine()} />);
        expect(screen.getByText('🐍 Snake Game')).toBeDefined();
        expect(screen.getByTestId('snake-canvas-mock')).toBeDefined();
    });
});
