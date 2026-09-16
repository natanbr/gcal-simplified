import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BlocksGameOverlay } from './BlocksGameOverlay';
import { stubEngine } from '../quiz/quizTestKit';
import type { GamePhase } from './types';

const mockStartGame = vi.fn();
const mockResetGame = vi.fn();
const mockPlaceShape = vi.fn();
const mockTriggerRescueQuiz = vi.fn();
const mockResolveRescueQuiz = vi.fn();
const mockCancelRescueQuiz = vi.fn();
const mockRefreshRescueShape = vi.fn();

const freshGameState = () => ({
    grid: Array.from({ length: 8 }, () => Array(8).fill(0)),
    standardShapes: [null, null, null],
    rescueShape: null,
    rescueShapeLocked: true,
    altitude: 0,
    score: 0,
    phase: 'waiting' as GamePhase,
    level: 0,
    rescueQuizActive: false,
});

const mockGameState = freshGameState();

vi.mock('./useBlocksGame', () => ({
    useBlocksGame: () => ({
        gameState: mockGameState,
        startGame: mockStartGame,
        resetGame: mockResetGame,
        placeShape: mockPlaceShape,
        triggerRescueQuiz: mockTriggerRescueQuiz,
        resolveRescueQuiz: mockResolveRescueQuiz,
        cancelRescueQuiz: mockCancelRescueQuiz,
        refreshRescueShape: mockRefreshRescueShape,
    })
}));

describe('BlocksGameOverlay', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        Object.assign(mockGameState, freshGameState());
    });

    it('renders null when open is false', () => {
        const { container } = render(<BlocksGameOverlay open={false} onClose={vi.fn()} engine={stubEngine()} />);
        expect(container.firstChild).toBeNull();
    });

    it('renders overlay when open is true', () => {
        render(<BlocksGameOverlay open={true} onClose={vi.fn()} engine={stubEngine()} />);
        expect(screen.getByText('Space Rescue')).toBeDefined();
        expect(screen.getByText('Play Game! 🚀')).toBeDefined();
    });

    it('triggers startGame when clicking Play Game! 🚀', () => {
        render(<BlocksGameOverlay open={true} onClose={vi.fn()} engine={stubEngine()} />);
        const playButton = screen.getByText('Play Game! 🚀');
        fireEvent.click(playButton);
        expect(mockStartGame).toHaveBeenCalled();
    });

    it('renders victory overlay when phase is victory', () => {
        mockGameState.phase = 'victory';
        mockGameState.score = 37;
        const mockClose = vi.fn();
        render(<BlocksGameOverlay open={true} onClose={mockClose} engine={stubEngine()} />);

        expect(screen.getByText('Mission Complete!')).toBeDefined();
        const collectButton = screen.getByText('Collect Bonus! 🏆');
        fireEvent.click(collectButton);
        expect(mockClose).toHaveBeenCalledWith(37);
    });

    it('renders game-over overlay when phase is game-over', () => {
        mockGameState.phase = 'game-over';
        mockGameState.score = 42;
        const mockClose = vi.fn();
        render(<BlocksGameOverlay open={true} onClose={mockClose} engine={stubEngine()} />);

        expect(screen.getByText('Mission Failed')).toBeDefined();
        expect(screen.getByText(/Space debris clogged the path! Score: 42/)).toBeDefined();

        // Opening the overlay already reset the game once; only the click may count.
        mockResetGame.mockClear();
        const tryAgainButton = screen.getByText('Try Again 🔄');
        fireEvent.click(tryAgainButton);
        expect(mockResetGame).toHaveBeenCalledTimes(1);
        expect(mockClose).not.toHaveBeenCalled();

        const closeButton = screen.getByText('Close ✕');
        fireEvent.click(closeButton);
        expect(mockClose).toHaveBeenCalledWith(42);
    });

    it('sets the quiz difficulty from the board level', () => {
        mockGameState.level = 3;
        const engine = stubEngine();
        render(<BlocksGameOverlay open={true} onClose={vi.fn()} engine={engine} />);
        expect(engine.setDifficulty).toHaveBeenCalledWith(3, 3);
    });
});
