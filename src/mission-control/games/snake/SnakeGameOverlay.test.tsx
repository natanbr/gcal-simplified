import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { SnakeGameOverlay } from './SnakeGameOverlay';
import { stubEngine } from '../quiz/quizTestKit';
import { snakeQuizLevel } from './types';

// Mock the canvas to avoid rendering issues in JSDOM
vi.mock('./SnakeCanvas', () => ({
    SnakeCanvas: () => <div data-testid="snake-canvas-mock" />
}));

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

    it('sets the quiz difficulty from elapsed play time', () => {
        const engine = stubEngine();
        render(<SnakeGameOverlay open={true} onClose={vi.fn()} engine={engine} />);
        const level = snakeQuizLevel(0);
        expect(engine.setDifficulty).toHaveBeenCalledWith(level, level);
    });
});
