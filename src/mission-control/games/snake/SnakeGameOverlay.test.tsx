import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { SnakeGameOverlay } from './SnakeGameOverlay';

// Mock the canvas to avoid rendering issues in JSDOM
vi.mock('./SnakeCanvas', () => ({
    SnakeCanvas: () => <div data-testid="snake-canvas-mock" />
}));

describe('SnakeGameOverlay', () => {
    it('renders null when open is false', () => {
        const { container } = render(<SnakeGameOverlay open={false} onClose={vi.fn()} />);
        expect(container.firstChild).toBeNull();
    });

    it('renders overlay when open is true', () => {
        render(<SnakeGameOverlay open={true} onClose={vi.fn()} />);
        expect(screen.getByText('🐍 Snake Game')).toBeDefined();
        expect(screen.getByTestId('snake-canvas-mock')).toBeDefined();
    });
});
