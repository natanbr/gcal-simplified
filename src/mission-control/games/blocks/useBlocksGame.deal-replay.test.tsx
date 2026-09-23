// ============================================================
// One drop deals one hand, however often React runs the updater.
//
// React may run a state updater more than once: StrictMode runs it twice in
// development, and in production an update rendered ahead of a lower-priority
// one already pending is replayed on top of it afterwards. Every draw the
// dealer makes inside an updater — which shape, which orientation, the id
// suffix — must therefore come from a seed rolled OUTSIDE it, or the two runs
// deal different hands and the child watches the tray change under their
// finger after a single drop.
//
// Each test records what every COMMITTED frame held, in a layout effect. Spy
// call counts would also count the run React discards, and it is precisely the
// committed frames that the child sees.
// ============================================================
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { startTransition, useLayoutEffect } from 'react';
import { act, render } from '@testing-library/react';
import { useBlocksGame } from './useBlocksGame';
import { HELP_SHAPES, BlocksGameState } from './types';

type Game = ReturnType<typeof useBlocksGame>;

const DOT = HELP_SHAPES[0];

/** What one committed render held: enough to tell two deals apart (the ids
 *  carry the dealer's own random suffix) and to find the frames worth reading. */
interface Frame {
    phase: BlocksGameState['phase'];
    bankFull: boolean;
    hasRescue: boolean;
    deal: string;
}

const frameOf = ({ standardShapes, rescueShape, phase }: BlocksGameState): Frame => ({
    phase,
    bankFull: standardShapes.every(shape => shape !== null),
    hasRescue: rescueShape !== null,
    deal: JSON.stringify({ standardShapes, rescueShape }),
});

const dealsIn = (frames: Frame[]) => new Set(frames.map(frame => frame.deal));

function BankLog({ api, frames }: { api: { current: Game | null }; frames: Frame[] }) {
    const game = useBlocksGame();
    api.current = game;
    useLayoutEffect(() => { frames.push(frameOf(game.gameState)); });
    return null;
}

/** The production shape of the race: a finger lift is a discrete, sync-lane
 *  update, rendered ahead of a lower-priority one already pending and then
 *  replayed on top of it. A direct call in a test is default-lane itself, so
 *  the transition supplies the lower lane that forces the replay. */
function replayed(update: () => void, lowerPriority: () => void) {
    act(() => {
        startTransition(lowerPriority);
        update();
    });
}

describe('useBlocksGame — a deal React replays', () => {
    let api: { current: Game | null };
    let frames: Frame[];

    beforeEach(() => {
        vi.useFakeTimers();
        let n = 0; // varied, so two independent rolls would deal different hands
        vi.spyOn(Math, 'random').mockImplementation(() => (n++ * 0.6180339887) % 1);
        api = { current: null };
        frames = [];
        render(<BankLog api={api} frames={frames} />);
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    const game = () => api.current as Game;

    it('deals one hand for a drop that empties the bank', () => {
        act(() => game().startGame());
        act(() => {
            const state = game().gameState;
            state.grid.forEach(row => row.fill(0));
            state.standardShapes = [DOT, null, null];
        });
        frames.length = 0;

        replayed(
            () => game().placeShape(DOT, 4, 4, 'standard', 0),
            () => game().cancelRescueQuiz(),
        );

        // More than one committed frame is what proves React really replayed
        // the drop; without it the equality below would pass vacuously.
        const dealt = frames.filter(frame => frame.bankFull);
        expect(dealt.length).toBeGreaterThan(1);
        expect(dealsIn(dealt).size).toBe(1);
    });

    it('deals one hand for a drop that empties the rescue slot', () => {
        act(() => game().startGame());
        act(() => {
            const state = game().gameState;
            state.grid.forEach(row => row.fill(0));
            state.rescueShapeLocked = false;
        });
        const rescue = game().gameState.rescueShape as NonNullable<BlocksGameState['rescueShape']>;
        frames.length = 0;

        replayed(
            () => game().placeShape(rescue, 4, 4, 'rescue', 0),
            () => game().cancelRescueQuiz(),
        );

        const dealt = frames.filter(frame => frame.hasRescue);
        expect(dealt.length).toBeGreaterThan(1);
        expect(dealsIn(dealt).size).toBe(1);
    });

    it('deals one opening hand when the game starts', () => {
        replayed(
            () => game().startGame(),
            () => game().cancelRescueQuiz(),
        );

        const dealt = frames.filter(frame => frame.phase === 'playing');
        expect(dealt.length).toBeGreaterThan(1);
        expect(dealsIn(dealt).size).toBe(1);
    });

    it('rolls one new rescue shape per refresh', () => {
        act(() => game().startGame());
        frames.length = 0;

        replayed(
            () => game().refreshRescueShape(),
            () => game().cancelRescueQuiz(),
        );

        expect(frames.length).toBeGreaterThan(1);
        expect(dealsIn(frames).size).toBe(1);
    });
});
