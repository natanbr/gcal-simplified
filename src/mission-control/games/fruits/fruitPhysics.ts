// ============================================================
// Fruit Merge — Pure Physics Helpers
// Stateless functions for matter.js engine setup and body creation.
// ============================================================

import Matter from 'matter-js';
import {
    FRUIT_TYPES, CONTAINER_WIDTH, CONTAINER_HEIGHT, WALL_THICKNESS, BOUNDARY_THICKNESS,
    GRAVITY_Y, FRUIT_RESTITUTION, FRUIT_FRICTION, MERGE_IMPULSE_STRENGTH,
    DROP_ZONE_Y, POSITION_ITERATIONS, VELOCITY_ITERATIONS, FRUIT_SLOP,
} from './types';

export function createEngine(): Matter.Engine {
    return Matter.Engine.create({
        gravity: { x: 0, y: GRAVITY_Y, scale: 0.001 },
        // Sleeping lets a settled pile go fully static instead of endlessly
        // re-resolving micro-contacts — this is what kills the perpetual
        // "rocking" and the idle CPU cost. Bodies auto-wake on new collisions.
        enableSleeping: true,
        // Higher-than-default solver iterations so overlapping fruits get
        // pushed apart firmly each step → much smaller visible overlaps.
        positionIterations: POSITION_ITERATIONS,
        velocityIterations: VELOCITY_ITERATIONS,
    });
}

export function createContainerWalls(): Matter.Body[] {
    // Interior play-area edges. These stay exactly where the container is drawn
    // (left edge, right edge, floor top). The collision bodies below are
    // BOUNDARY_THICKNESS thick and grow OUTWARD from these edges, so the visible
    // 20px walls and the interior are unchanged — only tunnelling is prevented.
    const interiorLeft = WALL_THICKNESS;
    const interiorRight = WALL_THICKNESS + CONTAINER_WIDTH;
    const floorTop = DROP_ZONE_Y + CONTAINER_HEIGHT;
    const midY = DROP_ZONE_Y + CONTAINER_HEIGHT / 2;
    const wallHeight = CONTAINER_HEIGHT + WALL_THICKNESS;

    const leftWall = Matter.Bodies.rectangle(
        interiorLeft - BOUNDARY_THICKNESS / 2, // inner (right) edge stays at interiorLeft
        midY,
        BOUNDARY_THICKNESS,
        wallHeight,
        { isStatic: true, label: 'wall-left', friction: 0.8, frictionStatic: 1.0, restitution: 0 },
    );

    const rightWall = Matter.Bodies.rectangle(
        interiorRight + BOUNDARY_THICKNESS / 2, // inner (left) edge stays at interiorRight
        midY,
        BOUNDARY_THICKNESS,
        wallHeight,
        { isStatic: true, label: 'wall-right', friction: 0.8, frictionStatic: 1.0, restitution: 0 },
    );

    const floor = Matter.Bodies.rectangle(
        interiorLeft + CONTAINER_WIDTH / 2,
        floorTop + BOUNDARY_THICKNESS / 2, // top edge stays at floorTop
        CONTAINER_WIDTH + BOUNDARY_THICKNESS * 2,
        BOUNDARY_THICKNESS,
        { isStatic: true, label: 'wall-floor', friction: 1.0, frictionStatic: 1.0, restitution: 0 },
    );

    return [leftWall, rightWall, floor];
}

export function createFruitBody(tier: number, x: number, y: number): Matter.Body {
    const ft = FRUIT_TYPES[tier];
    return Matter.Bodies.circle(x, y, ft.radius, {
        restitution: FRUIT_RESTITUTION,
        friction: FRUIT_FRICTION,
        frictionStatic: 0.8,
        density: ft.density,
        // Tighter contact tolerance than the 0.05 default → less resting overlap.
        slop: FRUIT_SLOP,
        // Settle to sleep a little faster than the default 60 ticks so piles
        // stop micro-jittering sooner once they come to rest.
        sleepThreshold: 40,
        label: `fruit-${tier}`,
        plugin: { fruitTier: tier },
    });
}

export function applyMergeImpulse(
    engine: Matter.Engine,
    mergeX: number,
    mergeY: number,
    excludeBodyId: number,
): void {
    const bodies = Matter.Composite.allBodies(engine.world);
    for (const body of bodies) {
        if (body.isStatic || body.id === excludeBodyId) continue;
        const dx = body.position.x - mergeX;
        const dy = body.position.y - mergeY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > 0 && dist < 150) {
            const force = MERGE_IMPULSE_STRENGTH * (1 - dist / 150);
            // Wake sleeping neighbors first — applyForce is a no-op on a sleeping
            // body, so without this the impulse wouldn't disturb a settled pile.
            if (body.isSleeping) Matter.Sleeping.set(body, false);
            Matter.Body.applyForce(body, body.position, {
                x: (dx / dist) * force,
                y: (dy / dist) * force,
            });
        }
    }
}

export function selectRandomDropTier(weights: number[]): number {
    const total = weights.reduce((a, b) => a + b, 0);
    let rand = Math.random() * total;
    for (let i = 0; i < weights.length; i++) {
        rand -= weights[i];
        if (rand <= 0) return i;
    }
    return 0;
}
