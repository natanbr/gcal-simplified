import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BlocksGameOverlay } from './BlocksGameOverlay';
import { stubEngine } from '../quiz/quizTestKit';
import { animationDeclarationOf, stylesheetsUnder } from '../../__tests__/infiniteAnimations';
import type { GamePhase } from './types';

const MC_STYLES = stylesheetsUnder(resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', 'styles'));

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

    // It named `bounce 2s infinite` inline, and no stylesheet defined `bounce`,
    // so the astronaut never moved; a looping one would draw a frame every vsync
    // while the child sits on this screen. It must bounce a few times and stop.
    it('bounces the waiting astronaut a few times through keyframes that exist, then stops', () => {
        render(<BlocksGameOverlay open={true} onClose={vi.fn()} engine={stubEngine()} />);
        const astronaut = screen.getByTestId('blocks-astronaut');
        expect(astronaut.getAttribute('style') ?? '').not.toMatch(/animation/);

        const animated = [...astronaut.classList]
            .map(name => ({ name, declaration: animationDeclarationOf(MC_STYLES, `.${name}`) }))
            .filter(c => c.declaration !== null);
        expect(animated.map(c => c.name), 'one Mission Control class animates the astronaut').toHaveLength(1);

        const declaration = animated[0].declaration ?? '';
        expect(declaration).not.toMatch(/\binfinite\b|var\(/);
        const [keyframes, ...rest] = declaration.split(/\s+/);
        expect(MC_STYLES, `@keyframes ${keyframes} is defined`).toMatch(new RegExp(`@keyframes\\s+${keyframes}\\s*\\{`));
        const counts = rest.filter(token => /^\d+$/.test(token)).map(Number);
        expect(counts).toHaveLength(1);
        expect(counts[0]).toBeGreaterThanOrEqual(1);
        expect(counts[0]).toBeLessThanOrEqual(15);
    });
});
