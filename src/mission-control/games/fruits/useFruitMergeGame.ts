// ============================================================
// Fruit Merge — Game Hook
// Manages matter.js engine lifecycle, merge logic, drop mechanic,
// delete-fruit quiz flow, timer, and game-over detection.
// ============================================================

import { useState, useCallback, useEffect, useRef } from 'react';
import Matter from 'matter-js';
import type { FruitMergeGameState, FruitBody, MergeEffect } from './types';
import {
    FRUIT_TYPES, DROP_TIER_WEIGHTS, CONTAINER_WIDTH, WALL_THICKNESS,
    DROP_ZONE_Y, GAME_OVER_LINE_Y, GAME_OVER_GRACE_MS, DROP_COOLDOWN_MS,
    GAME_TIME_MS, PHYSICS_FIXED_DELTA_MS,
} from './types';
import {
    createEngine, createContainerWalls, createFruitBody,
    applyMergeImpulse, selectRandomDropTier,
} from './fruitPhysics';

function createInitialState(): FruitMergeGameState {
    return {
        phase: 'waiting',
        score: 0,
        highestTier: 0,
        currentDropTier: selectRandomDropTier(DROP_TIER_WEIGHTS),
        nextDropTier: selectRandomDropTier(DROP_TIER_WEIGHTS),
        dropX: CONTAINER_WIDTH / 2,
        canDrop: true,
        timeRemainingMs: GAME_TIME_MS,
        fruitCount: 0,
        mergeCount: 0,
        selectedDeleteBodyId: null,
    };
}

export function useFruitMergeGame(open: boolean) {
    const [state, setState] = useState<FruitMergeGameState>(createInitialState);

    const engineRef = useRef<Matter.Engine | null>(null);
    const fruitMapRef = useRef<Map<number, FruitBody>>(new Map());
    const mergeEffectsRef = useRef<MergeEffect[]>([]);
    const physicsFrameRef = useRef<number>(0);
    const stateRef = useRef(state);
    stateRef.current = state;

    const overLineTimerRef = useRef<number | null>(null);
    const lastDropTimeRef = useRef<number>(0);

    // ── Collision handler ──────────────────────────────────────
    const handleCollisions = useCallback((event: Matter.IEventCollision<Matter.Engine>) => {
        const toRemove: Matter.Body[] = [];
        const toCreate: { tier: number; x: number; y: number }[] = [];
        let scoreGained = 0;
        let mergesThisFrame = 0;
        let maxTier = stateRef.current.highestTier;

        for (const pair of event.pairs) {
            const { bodyA, bodyB } = pair;
            if (bodyA.isStatic || bodyB.isStatic) continue;

            const tierA = (bodyA.plugin as { fruitTier?: number })?.fruitTier;
            const tierB = (bodyB.plugin as { fruitTier?: number })?.fruitTier;
            if (tierA === undefined || tierB === undefined || tierA !== tierB) continue;

            const fruitA = fruitMapRef.current.get(bodyA.id);
            const fruitB = fruitMapRef.current.get(bodyB.id);
            if (!fruitA || !fruitB || fruitA.merging || fruitB.merging) continue;

            fruitA.merging = true;
            fruitB.merging = true;
            toRemove.push(bodyA, bodyB);

            const mergeX = (bodyA.position.x + bodyB.position.x) / 2;
            const mergeY = (bodyA.position.y + bodyB.position.y) / 2;
            const nextTier = tierA + 1;

            if (nextTier < FRUIT_TYPES.length) {
                toCreate.push({ tier: nextTier, x: mergeX, y: mergeY });
            }

            const pointsTier = nextTier < FRUIT_TYPES.length ? nextTier : tierA;
            scoreGained += FRUIT_TYPES[pointsTier].points;
            mergesThisFrame++;
            maxTier = Math.max(maxTier, nextTier);

            mergeEffectsRef.current.push({
                x: mergeX, y: mergeY,
                startTime: performance.now(),
                tier: nextTier < FRUIT_TYPES.length ? nextTier : tierA,
            });
        }

        if (toRemove.length === 0) return;
        const engine = engineRef.current;
        if (!engine) return;

        for (const body of toRemove) {
            fruitMapRef.current.delete(body.id);
            Matter.Composite.remove(engine.world, body);
        }

        for (const { tier, x, y } of toCreate) {
            const newBody = createFruitBody(tier, x, y);
            Matter.Composite.add(engine.world, newBody);
            fruitMapRef.current.set(newBody.id, { id: newBody.id, tier });
            applyMergeImpulse(engine, x, y, newBody.id);
        }

        setState(prev => ({
            ...prev,
            score: prev.score + scoreGained,
            mergeCount: prev.mergeCount + mergesThisFrame,
            highestTier: Math.max(prev.highestTier, maxTier),
            fruitCount: fruitMapRef.current.size,
        }));
    }, []);

    // ── Engine lifecycle ───────────────────────────────────────
    const initEngine = useCallback(() => {
        if (engineRef.current) {
            Matter.Engine.clear(engineRef.current);
        }
        const engine = createEngine();
        const walls = createContainerWalls();
        Matter.Composite.add(engine.world, walls);
        Matter.Events.on(engine, 'collisionStart', handleCollisions);
        // Also merge on collisionActive so any same-tier pair that ends up
        // resting in contact (e.g. a merge skipped it while a body was still
        // flagged `merging`) merges the moment their perimeters touch, instead
        // of sitting overlapped. The merging-flag + fruitMap guards make
        // re-processing an already-merged pair a no-op.
        Matter.Events.on(engine, 'collisionActive', handleCollisions);
        engineRef.current = engine;
        fruitMapRef.current.clear();
        mergeEffectsRef.current = [];
        overLineTimerRef.current = null;
    }, [handleCollisions]);

    const destroyEngine = useCallback(() => {
        if (engineRef.current) {
            Matter.Events.off(engineRef.current, 'collisionStart', handleCollisions);
            Matter.Events.off(engineRef.current, 'collisionActive', handleCollisions);
            Matter.Engine.clear(engineRef.current);
            engineRef.current = null;
        }
        fruitMapRef.current.clear();
        mergeEffectsRef.current = [];
        cancelAnimationFrame(physicsFrameRef.current);
    }, [handleCollisions]);

    // ── Game-over check ────────────────────────────────────────
    const checkGameOver = useCallback(() => {
        const engine = engineRef.current;
        if (!engine) return;
        const cur = stateRef.current;
        if (cur.phase !== 'playing' && cur.phase !== 'selecting-delete') return;

        const bodies = Matter.Composite.allBodies(engine.world);
        let anySettledAbove = false;

        for (const body of bodies) {
            if (body.isStatic) continue;
            if (!fruitMapRef.current.has(body.id)) continue;
            if (body.position.y < GAME_OVER_LINE_Y && body.speed < 0.5) {
                anySettledAbove = true;
                break;
            }
        }

        if (anySettledAbove) {
            if (overLineTimerRef.current === null) {
                overLineTimerRef.current = Date.now();
            } else if (Date.now() - overLineTimerRef.current > GAME_OVER_GRACE_MS) {
                setState(prev => ({ ...prev, phase: 'game-over' }));
            }
        } else {
            overLineTimerRef.current = null;
        }
    }, []);

    // ── Physics stepping ───────────────────────────────────────
    useEffect(() => {
        if (!open) return;
        const phase = state.phase;
        if (phase !== 'playing' && phase !== 'selecting-delete' && phase !== 'quiz-delete') return;
        if (!engineRef.current) return;

        // Fixed-timestep accumulator: step the engine in constant slices so the
        // solver stays stable (variable deltas cause the endless "rocking") and
        // the sim runs at the same speed on 60 Hz and 120 Hz displays.
        let lastTime = performance.now();
        let accumulator = 0;
        const step = (time: number) => {
            physicsFrameRef.current = requestAnimationFrame(step);

            let frameTime = time - lastTime;
            lastTime = time;
            // Clamp big gaps (tab was backgrounded) so we don't spiral catching up.
            if (frameTime > 100) frameTime = 100;
            accumulator += frameTime;

            const engine = engineRef.current;
            if (engine) {
                while (accumulator >= PHYSICS_FIXED_DELTA_MS) {
                    Matter.Engine.update(engine, PHYSICS_FIXED_DELTA_MS);
                    accumulator -= PHYSICS_FIXED_DELTA_MS;
                }
            }
            checkGameOver();
        };
        physicsFrameRef.current = requestAnimationFrame(step);
        return () => cancelAnimationFrame(physicsFrameRef.current);
    }, [open, state.phase, checkGameOver]);

    // ── Timer ──────────────────────────────────────────────────
    useEffect(() => {
        if (!open) return;
        const phase = state.phase;
        if (phase !== 'playing' && phase !== 'selecting-delete') return;

        const TICK = 200;
        const interval = setInterval(() => {
            setState(prev => {
                if (prev.phase !== 'playing' && prev.phase !== 'selecting-delete') return prev;
                const next = prev.timeRemainingMs - TICK;
                if (next <= 0) {
                    return { ...prev, timeRemainingMs: 0, phase: 'time-up' };
                }
                return { ...prev, timeRemainingMs: next };
            });
        }, TICK);
        return () => clearInterval(interval);
    }, [open, state.phase]);

    // ── Cleanup on close ───────────────────────────────────────
    useEffect(() => {
        if (!open) destroyEngine();
    }, [open, destroyEngine]);

    // ── Public actions ─────────────────────────────────────────
    const startGame = useCallback(() => {
        initEngine();
        setState({
            ...createInitialState(),
            phase: 'playing',
        });
    }, [initEngine]);

    const resetGame = useCallback(() => {
        destroyEngine();
        setState(createInitialState());
    }, [destroyEngine]);

    const setDropX = useCallback((x: number) => {
        setState(prev => ({ ...prev, dropX: x }));
    }, []);

    const dropFruit = useCallback(() => {
        const cur = stateRef.current;
        if (cur.phase !== 'playing' || !cur.canDrop) return;

        const now = Date.now();
        if (now - lastDropTimeRef.current < DROP_COOLDOWN_MS) return;

        const engine = engineRef.current;
        if (!engine) return;

        lastDropTimeRef.current = now;
        const tier = cur.currentDropTier;
        const r = FRUIT_TYPES[tier].radius;
        const x = WALL_THICKNESS + Math.max(r, Math.min(CONTAINER_WIDTH - r, cur.dropX));

        const body = createFruitBody(tier, x, DROP_ZONE_Y - 10);
        Matter.Composite.add(engine.world, body);
        fruitMapRef.current.set(body.id, { id: body.id, tier });

        setState(prev => ({
            ...prev,
            currentDropTier: prev.nextDropTier,
            nextDropTier: selectRandomDropTier(DROP_TIER_WEIGHTS),
            fruitCount: fruitMapRef.current.size,
            canDrop: false,
        }));

        setTimeout(() => {
            // Re-enable the drop regardless of the current phase. If the player
            // opened delete-mode (or its quiz) during the 600ms cooldown, phase is
            // no longer 'playing' when this fires; gating on 'playing' here would
            // strand canDrop=false forever (a soft-lock — no more drops that round).
            // dropFruit itself is still gated on phase==='playing', so flipping
            // canDrop back on mid-delete is safe.
            setState(prev => prev.canDrop ? prev : { ...prev, canDrop: true });
        }, DROP_COOLDOWN_MS);
    }, []);

    // ── Delete-fruit flow ──────────────────────────────────────
    const enterDeleteMode = useCallback(() => {
        setState(prev => {
            if (prev.phase !== 'playing') return prev;
            return { ...prev, phase: 'selecting-delete', selectedDeleteBodyId: null };
        });
    }, []);

    const cancelDeleteMode = useCallback(() => {
        setState(prev => {
            if (prev.phase !== 'selecting-delete') return prev;
            return { ...prev, phase: 'playing', selectedDeleteBodyId: null };
        });
    }, []);

    const selectFruitForDelete = useCallback((bodyId: number) => {
        if (!fruitMapRef.current.has(bodyId)) return;
        setState(prev => {
            if (prev.phase !== 'selecting-delete') return prev;
            return { ...prev, phase: 'quiz-delete', selectedDeleteBodyId: bodyId };
        });
    }, []);

    const onDeleteQuizCorrect = useCallback(() => {
        const bodyId = stateRef.current.selectedDeleteBodyId;
        const engine = engineRef.current;
        if (bodyId === null || !engine) return;

        const bodies = Matter.Composite.allBodies(engine.world);
        const target = bodies.find(b => b.id === bodyId);
        if (target) {
            Matter.Composite.remove(engine.world, target);
            fruitMapRef.current.delete(bodyId);
        }

        setState(prev => ({
            ...prev,
            phase: 'playing',
            selectedDeleteBodyId: null,
            fruitCount: fruitMapRef.current.size,
        }));
    }, []);

    const getDeleteTier = useCallback((): number => {
        const bodyId = stateRef.current.selectedDeleteBodyId;
        if (bodyId === null) return 0;
        const fruit = fruitMapRef.current.get(bodyId);
        return fruit?.tier ?? 0;
    }, []);

    return {
        gameState: state,
        engineRef,
        fruitMapRef,
        mergeEffectsRef,
        startGame,
        resetGame,
        dropFruit,
        setDropX,
        enterDeleteMode,
        cancelDeleteMode,
        selectFruitForDelete,
        onDeleteQuizCorrect,
        getDeleteTier,
    };
}
