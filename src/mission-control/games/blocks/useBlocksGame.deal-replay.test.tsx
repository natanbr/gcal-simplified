// ============================================================
// One drop deals one hand, however often React runs the updater.
//
// React may run a state updater more than once: StrictMode runs it twice in
// development (only one of those runs commits), and in production an update
// rendered ahead of a lower-priority one already pending is replayed on top of
// it afterwards — and there BOTH runs commit. Every draw the dealer makes
// inside an updater — which shape, which orientation, the id suffix React keys
// on — must therefore come from a seed rolled OUTSIDE it, or the two runs deal
// different hands.
//
// Two things are asserted together, and neither is enough alone:
//   · the dealer ran TWICE — the sensitivity witness. Committed frames are by
//     construction identical once the fix is in, so only the call count says
//     the replay still happens. Without it the whole suite passes on a harness
//     that has quietly stopped forcing a replay, bug and all (proven by
//     mutation: drop the transition below and restore the bug, still green).
//     Counting calls is safe HERE precisely because this file never uses
//     StrictMode, where the discarded run would be counted too.
//   · the committed frames are IDENTICAL — recorded in a layout effect,
//     because it is the committed frames that the child sees.
//
// A replay whose base state differs — a clear resolving, a reset — SHOULD deal
// a different hand: the deal is a pure function of (grid, level, seed) and the
// grid changed. Every test here uses `cancelRescueQuiz` as the lower-priority
// update, which touches nothing the dealer reads. Do not "harden" this by
// memoising a hand against its seed.
// ============================================================
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { startTransition, useLayoutEffect } from 'react';
import { act, render } from '@testing-library/react';
import { useBlocksGame } from './useBlocksGame';
import { dealStandardTriple, dealRescueShape } from './dealer';
import { HELP_SHAPES, BlocksGameState } from './types';

vi.mock('./dealer', async (importOriginal) => {
    const actual = await importOriginal<typeof import('./dealer')>();
    return {
        ...actual,
        dealStandardTriple: vi.fn(actual.dealStandardTriple),
        dealRescueShape: vi.fn(actual.dealRescueShape),
    };
});

type Game = ReturnType<typeof useBlocksGame>;

const DOT = HELP_SHAPES[0];

/** What one committed render held: enough to tell two deals apart (the ids
 *  carry the dealer's own random suffix) and to find the frames worth reading. */
interface Frame {
    phase: BlocksGameState['phase'];
    bankFull: boolean;
    rescueId: string | null;
    deal: string;
}

const frameOf = ({ standardShapes, rescueShape, phase }: BlocksGameState): Frame => ({
    phase,
    bankFull: standardShapes.every(shape => shape !== null),
    rescueId: rescueShape?.id ?? null,
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

    beforeEach(async () => {
        vi.useFakeTimers();
        let n = 0; // varied, so two independent rolls would deal different hands
        vi.spyOn(Math, 'random').mockImplementation(() => (n++ * 0.6180339887) % 1);
        // Reset the counters AND put the real dealer back: these are module-level
        // vi.fn()s, so what a previous test left on them would otherwise stand.
        const actual = await vi.importActual<typeof import('./dealer')>('./dealer');
        vi.mocked(dealStandardTriple).mockReset().mockImplementation(actual.dealStandardTriple);
        vi.mocked(dealRescueShape).mockReset().mockImplementation(actual.dealRescueShape);
        api = { current: null };
        frames = [];
        render(<BankLog api={api} frames={frames} />);
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    const game = () => api.current as Game;

    /** Arming writes through the committed state object, which works because the
     *  updater reads that same object — the idiom the sibling suites use. */
    const arm = (change: (state: BlocksGameState) => void) => act(() => change(game().gameState));

    it('deals one hand for a drop that empties the bank', () => {
        act(() => game().startGame());
        arm(state => {
            state.grid.forEach(row => row.fill(0));
            state.standardShapes = [DOT, null, null];
        });
        frames.length = 0;
        vi.mocked(dealStandardTriple).mockClear();

        replayed(
            () => game().placeShape(DOT, 4, 4, 'standard', 0),
            () => game().cancelRescueQuiz(),
        );

        expect(dealStandardTriple).toHaveBeenCalledTimes(2);
        const dealt = frames.filter(frame => frame.bankFull);
        expect(dealt.length).toBeGreaterThan(1);
        expect(dealsIn(dealt).size).toBe(1);
    });

    it('deals one hand for a drop that empties the rescue slot', () => {
        act(() => game().startGame());
        arm(state => {
            state.grid.forEach(row => row.fill(0));
            state.rescueShapeLocked = false;
        });
        const played = game().gameState.rescueShape as NonNullable<BlocksGameState['rescueShape']>;
        frames.length = 0;
        vi.mocked(dealRescueShape).mockClear();

        replayed(
            () => game().placeShape(played, 0, 0, 'rescue', 0),
            () => game().cancelRescueQuiz(),
        );

        expect(dealRescueShape).toHaveBeenCalledTimes(2);
        // Only frames holding a NEW rescue shape: the one just played satisfies
        // "has a rescue shape" too, and would hide a slot that never re-dealt.
        const dealt = frames.filter(frame => frame.rescueId !== null && frame.rescueId !== played.id);
        expect(dealt.length).toBeGreaterThan(1);
        expect(dealsIn(dealt).size).toBe(1);
    });

    it('deals one opening hand when the game starts', () => {
        replayed(
            () => game().startGame(),
            () => game().cancelRescueQuiz(),
        );

        expect(dealStandardTriple).toHaveBeenCalledTimes(2);
        const dealt = frames.filter(frame => frame.phase === 'playing');
        expect(dealt.length).toBeGreaterThan(1);
        expect(dealsIn(dealt).size).toBe(1);
    });

    it('rolls one new rescue shape per refresh', () => {
        act(() => game().startGame());
        const before = game().gameState.rescueShape?.id ?? null;
        frames.length = 0;
        vi.mocked(dealRescueShape).mockClear();

        replayed(
            () => game().refreshRescueShape(),
            () => game().cancelRescueQuiz(),
        );

        expect(dealRescueShape).toHaveBeenCalledTimes(2);
        const dealt = frames.filter(frame => frame.rescueId !== before);
        expect(dealt.length).toBeGreaterThan(1);
        expect(dealsIn(dealt).size).toBe(1);
    });

    // The seed is per CALL, not per session: a hand repeated across drops would
    // satisfy every test above while breaking the game (and reusing React keys,
    // which the id suffix exists to prevent).
    it('rolls a new seed for the next drop', () => {
        act(() => game().startGame());
        const emptyBoardWithOneDot = (state: BlocksGameState) => {
            state.grid.forEach(row => row.fill(0));
            state.standardShapes = [DOT, null, null];
        };

        arm(emptyBoardWithOneDot);
        act(() => game().placeShape(DOT, 4, 4, 'standard', 0));
        const first = JSON.stringify(game().gameState.standardShapes);

        arm(emptyBoardWithOneDot);
        act(() => game().placeShape(DOT, 5, 5, 'standard', 0));
        const second = JSON.stringify(game().gameState.standardShapes);

        expect(second).not.toBe(first);
    });
});
