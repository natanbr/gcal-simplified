import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BlocksGameOverlay } from './BlocksGameOverlay';

const mockStartGame = vi.fn();
const mockResetGame = vi.fn();
const mockPlaceShape = vi.fn();
const mockTriggerRescueQuiz = vi.fn();
const mockSubmitQuizAnswer = vi.fn();
const mockRefreshRescueShape = vi.fn();

const mockGameState = {
    grid: Array.from({ length: 8 }, () => Array(8).fill(0)),
    standardShapes: [null, null, null],
    rescueShape: null,
    rescueShapeLocked: true,
    altitude: 0,
    score: 0,
    phase: 'waiting' as const,
    level: 0,
    quizQuestion: null,
};

vi.mock('./useBlocksGame', () => ({
    useBlocksGame: () => ({
        gameState: mockGameState,
        startGame: mockStartGame,
        resetGame: mockResetGame,
        placeShape: mockPlaceShape,
        triggerRescueQuiz: mockTriggerRescueQuiz,
        submitQuizAnswer: mockSubmitQuizAnswer,
        refreshRescueShape: mockRefreshRescueShape,
    })
}));

describe('BlocksGameOverlay', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockGameState.phase = 'waiting';
        mockGameState.score = 0;
        mockGameState.altitude = 0;
        mockGameState.level = 0;
    });

    it('renders null when open is false', () => {
        const { container } = render(<BlocksGameOverlay open={false} onClose={vi.fn()} />);
        expect(container.firstChild).toBeNull();
    });

    it('renders overlay when open is true', () => {
        render(<BlocksGameOverlay open={true} onClose={vi.fn()} />);
        expect(screen.getByText('Space Rescue')).toBeDefined();
        expect(screen.getByText('Play Game! 🚀')).toBeDefined();
    });

    it('triggers startGame when clicking Play Game! 🚀', () => {
        render(<BlocksGameOverlay open={true} onClose={vi.fn()} />);
        const playButton = screen.getByText('Play Game! 🚀');
        fireEvent.click(playButton);
        expect(mockStartGame).toHaveBeenCalled();
    });

    it('renders victory overlay when phase is victory', () => {
        mockGameState.phase = 'victory';
        const mockClose = vi.fn();
        render(<BlocksGameOverlay open={true} onClose={mockClose} />);
        
        expect(screen.getByText('Mission Complete!')).toBeDefined();
        const collectButton = screen.getByText('Collect Bonus! 🏆');
        fireEvent.click(collectButton);
        expect(mockClose).toHaveBeenCalledWith(mockGameState.score);
    });

    it('renders game-over overlay when phase is game-over', () => {
        mockGameState.phase = 'game-over';
        mockGameState.score = 42;
        const mockClose = vi.fn();
        render(<BlocksGameOverlay open={true} onClose={mockClose} />);
        
        expect(screen.getByText('Mission Failed')).toBeDefined();
        expect(screen.getByText(/Space debris clogged the path! Score: 42/)).toBeDefined();
        
        const tryAgainButton = screen.getByText('Try Again 🔄');
        fireEvent.click(tryAgainButton);
        expect(mockResetGame).toHaveBeenCalled();

        const closeButton = screen.getByText('Close ✕');
        fireEvent.click(closeButton);
        expect(mockClose).toHaveBeenCalledWith(42);
    });
});
