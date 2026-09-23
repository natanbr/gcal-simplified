import { useState, useCallback, useEffect } from 'react';
import { flushSync } from 'react-dom';
import { isPlaceable, hasAnyPlacement } from './placement';
import { GameShape, BlocksGameState, INITIAL_LAYOUTS, altitudeLevel } from './types';
import { CLEAR_DELAY_MS, PendingClear, clearFeedback, markCompletedLines, resolvePendingClear } from './lineClear';
import { seededRandom } from './rng';
import { dealStandardTriple, dealRescueShape, anyPoolShapeFits } from './dealer';

/** The game the board renders, plus the clear still exploding on it — kept in
 *  state so its timer is scheduled from what React committed (see lineClear.ts). */
interface HookState { game: BlocksGameState; pendingClear: PendingClear | null }

/**
 * The seed for one deal, rolled OUTSIDE the state updater that spends it.
 *
 * React may run an updater more than once — StrictMode twice in development
 * (only one of which commits), and in production a sync-lane update replayed on
 * top of a pending lower-priority one, where BOTH runs commit. A re-roll deals a
 * different hand on the second run, so the tray would change shapes under the
 * child's finger after a single drop. No lower-priority writer on this hook's
 * state exists today, which is why nobody has seen it; one new deferred update
 * is all it would take.
 *
 * Only the number is rolled out here. The generator must be built INSIDE the
 * updater: a `seededRandom` closure captured outside is stateful, so the second
 * run would continue its sequence rather than repeat it — which is why
 * `refillBank` and `refreshRescue` take the seed rather than an `Rng`.
 */
const rollSeed = () => Math.random() * 2 ** 32;

/** Lifts an updater of the game alone; a no-op stays the same reference. */
const onGame = (update: (game: BlocksGameState) => BlocksGameState) => (prev: HookState): HookState => {
    const game = update(prev.game);
    return game === prev.game ? prev : { ...prev, game };
};

/**
 * Deals whatever the bank is missing: a full hand once all three slots are
 * used, and a fresh locked rescue shape once the rescue slot is.
 *
 * Only ever called on a board with nothing exploding on it. While a clear is
 * pending, an emptied slot stays empty and is dealt when the clear resolves,
 * against the board as it really is then: lines gone, meteors landed. Dealing
 * any earlier plans against a board that is about to change. Against the
 * painted board it plans around lines about to vanish; against a forecast
 * without them it hands the child a shape that can be refused everywhere until
 * the explosion ends, and whose space a meteor can then take.
 *
 * Every draw comes from `seed` (see `rollSeed`), so the hand is a pure function
 * of the state and the seed, and a replayed updater deals it again unchanged.
 */
function refillBank(game: BlocksGameState, seed: number): BlocksGameState {
    const bankEmpty = game.standardShapes.every(s => s === null);
    const rescueEmpty = game.rescueShape === null;
    if (!bankEmpty && !rescueEmpty) return game;
    const rng = seededRandom(seed);
    return {
        ...game,
        standardShapes: bankEmpty ? dealStandardTriple(game.grid, game.level, rng) : game.standardShapes,
        rescueShape: rescueEmpty ? dealRescueShape(game.grid, rng) : game.rescueShape,
        rescueShapeLocked: rescueEmpty ? true : game.rescueShapeLocked,
    };
}

/** A fresh, locked rescue shape. Takes the seed for the same reason
 *  `refillBank` does: no call site should be in a position to build the
 *  generator on a line that a tidy-up could hoist out of the updater. */
function refreshRescue(game: BlocksGameState, seed: number): BlocksGameState {
    return {
        ...game,
        rescueShape: dealRescueShape(game.grid, seededRandom(seed)),
        rescueShapeLocked: true,
    };
}

export function useBlocksGame() {
    const [{ game, pendingClear }, setState] = useState<HookState>(() => ({
        game: createInitialState(), pendingClear: null,
    }));

    function createInitialState(): BlocksGameState {
        const layoutIndex = Math.floor(Math.random() * INITIAL_LAYOUTS.length);
        const gridCopy = INITIAL_LAYOUTS[layoutIndex].map(row => [...row]);
        return {
            grid: gridCopy,
            standardShapes: [null, null, null],
            rescueShape: null,
            rescueShapeLocked: true,
            altitude: 0,
            score: 0,
            phase: 'waiting',
            level: 0,
            rescueQuizActive: false,
            clearedFeedback: null,
        };
    }

    const resetGame = useCallback(() => {
        setState({ game: createInitialState(), pendingClear: null });
    }, []);

    const startGame = useCallback(() => {
        const dealSeed = rollSeed();
        setState(onGame(prev => refillBank({ ...prev, phase: 'playing' as const }, dealSeed)));
    }, []);

    const triggerRescueQuiz = useCallback(() => {
        setState(onGame(prev => ({ ...prev, rescueQuizActive: true })));
    }, []);

    /** The engine-driven overlay confirmed a counted correct answer. */
    const resolveRescueQuiz = useCallback(() => {
        setState(onGame(prev => ({
            ...prev,
            rescueShapeLocked: false,
            rescueQuizActive: false,
        })));
    }, []);

    /** Opt-in quiz: backing out costs nothing but the unlock. */
    const cancelRescueQuiz = useCallback(() => {
        setState(onGame(prev => ({ ...prev, rescueQuizActive: false })));
    }, []);

    const refreshRescueShape = useCallback(() => {
        const dealSeed = rollSeed();
        setState(onGame(prev => refreshRescue(prev, dealSeed)));
    }, []);

    /** Returns nothing on purpose: the updater decides against the latest state,
     *  which can be newer than the caller's render (a clear landing in the same
     *  frame as the lift), so no answer computed out here could be trusted. */
    const placeShape = useCallback((
        shape: GameShape, gridX: number, gridY: number,
        slotType: 'standard' | 'rescue', slotIndex: number
    ): void => {
        const feedbackId = Date.now().toString();
        const dealSeed = rollSeed();
        setState(prevState => {
            const prev = prevState.game;
            if (prev.phase !== 'playing') return prevState;
            if (slotType === 'rescue' && prev.rescueShapeLocked) return prevState;
            if (!isPlaceable(prev.grid, shape, { r: gridY, c: gridX })) return prevState;

            const gridCopy = prev.grid.map(row => [...row]);
            
            // Place cells
            for (const cell of shape.cells) {
                const r = gridY + cell.y;
                const c = gridX + cell.x;
                gridCopy[r][c] = 1; // 1 = standard block
            }

            // Remove shape from slot
            const standardShapes = [...prev.standardShapes];
            let rescueShape = prev.rescueShape;
            let rescueShapeLocked = prev.rescueShapeLocked;

            if (slotType === 'standard') {
                standardShapes[slotIndex] = null;
            } else {
                rescueShape = null;
                rescueShapeLocked = true; // relock slot
            }

            // Full lines explode now and are emptied by the effect below.
            const { linesCleared, pendingClear } = markCompletedLines(gridCopy, prevState.pendingClear);

            // Scoring & Altitude progression
            const pointsGained = linesCleared * 10 + (linesCleared > 1 ? linesCleared * 5 : 0);
            const nextScore = prev.score + pointsGained;
            const nextAltitude = prev.altitude + linesCleared * 10;
            
            // Level / threshold events. max() pins the rule that a level, once
            // reached, is never taken back.
            const nextLevel = Math.max(prev.level, altitudeLevel(nextAltitude));

            // If victory reached
            const phase = nextAltitude >= 200 ? ('victory' as const) : prev.phase;

            const next: BlocksGameState = {
                ...prev,
                grid: gridCopy,
                standardShapes,
                rescueShape,
                rescueShapeLocked,
                score: nextScore,
                altitude: nextAltitude,
                level: nextLevel,
                phase,
                clearedFeedback: linesCleared > 0 ? clearFeedback(linesCleared, feedbackId) : prev.clearedFeedback,
            };
            // A pending clear deals the slots this drop emptied, when it resolves.
            return { game: pendingClear ? next : refillBank(next, dealSeed), pendingClear };
        });
    }, []);

    // One timer per COMMITTED clear, however often React ran its updater. A
    // joining line or a new game replaces `pendingClear` and unmounting drops it
    // (closing the game only hides it); the identity check covers a fired timer.
    useEffect(() => {
        if (!pendingClear) return;
        const timer = setTimeout(() => {
            // Both out here: a replayed updater must roll the same meteors, and
            // deal the same hand into the slots the clear left empty.
            const seed = rollSeed();
            const dealSeed = rollSeed();
            // Sync, so the cleared board commits in this task: a lift landing first
            // would render on the old board, then be refused on the new one.
            flushSync(() => setState(prev => prev.pendingClear !== pendingClear ? prev : {
                game: refillBank({
                    ...prev.game,
                    grid: resolvePendingClear(prev.game.grid, pendingClear, prev.game.level, seed),
                    clearedFeedback: null,
                }, dealSeed),
                pendingClear: null,
            }));
        }, CLEAR_DELAY_MS);
        return () => clearTimeout(timer);
    }, [pendingClear]);

    // Check game over on grid change — never mid-explosion: those cells are about to be free.
    useEffect(() => {
        if (game.phase !== 'playing' || pendingClear) return;

        // Game is over if standard shapes cannot fit, AND the rescue shape cannot fit, AND no shape in the pool fits
        const hasStandardPlacement = game.standardShapes.some(s => s && hasAnyPlacement(game.grid, s.cells));
        const hasRescuePlacement = !!game.rescueShape && hasAnyPlacement(game.grid, game.rescueShape.cells);

        if (!hasStandardPlacement && !hasRescuePlacement && !anyPoolShapeFits(game.grid, game.level)) {
            setState(onGame(prev => ({ ...prev, phase: 'game-over' as const })));
        }
    }, [game.grid, game.standardShapes, game.rescueShape, game.phase, game.level, pendingClear]);

    return {
        gameState: game,
        startGame,
        resetGame,
        placeShape,
        triggerRescueQuiz,
        resolveRescueQuiz,
        cancelRescueQuiz,
        refreshRescueShape,
    };
}
