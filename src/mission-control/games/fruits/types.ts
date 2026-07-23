// ============================================================
// Fruit Merge Game — Types & Constants
// Suika-style drop-and-merge physics game.
// ============================================================

export interface FruitType {
    tier: number;
    name: string;
    emoji: string;
    radius: number;
    color: string;
    strokeColor: string;
    points: number;
    density: number;
}

export const FRUIT_TYPES: FruitType[] = [
    { tier: 0, name: 'Cherry',      emoji: '🍒', radius: 16, color: '#DC2626', strokeColor: '#991B1B', points: 1,  density: 0.0010 },
    { tier: 1, name: 'Strawberry',  emoji: '🍓', radius: 20, color: '#E11D48', strokeColor: '#9F1239', points: 3,  density: 0.0012 },
    { tier: 2, name: 'Grape',       emoji: '🍇', radius: 24, color: '#7C3AED', strokeColor: '#5B21B6', points: 6,  density: 0.0014 },
    { tier: 3, name: 'Orange',      emoji: '🍊', radius: 30, color: '#EA580C', strokeColor: '#C2410C', points: 10, density: 0.0015 },
    { tier: 4, name: 'Apple',       emoji: '🍎', radius: 36, color: '#EF4444', strokeColor: '#B91C1C', points: 15, density: 0.0016 },
    { tier: 5, name: 'Pear',        emoji: '🍐', radius: 46, color: '#84CC16', strokeColor: '#4D7C0F', points: 21, density: 0.0017 },
    { tier: 6, name: 'Peach',       emoji: '🍑', radius: 54, color: '#FB923C', strokeColor: '#C2410C', points: 28, density: 0.0020 },
    { tier: 7, name: 'Pineapple',   emoji: '🍍', radius: 60, color: '#FACC15', strokeColor: '#CA8A04', points: 36, density: 0.0022 },
    { tier: 8, name: 'Melon',       emoji: '🍈', radius: 70, color: '#4ADE80', strokeColor: '#16A34A', points: 45, density: 0.0024 },
    { tier: 9, name: 'Watermelon',  emoji: '🍉', radius: 80, color: '#22C55E', strokeColor: '#15803D', points: 55, density: 0.0028 },
];

// Only tiers 0-4 can be dropped — Cherry 28%, Strawberry 30%, Grape 25%, Orange 10%, Apple 7%
export const DROP_TIER_WEIGHTS = [28, 30, 25, 10, 7];

// Container
export const CONTAINER_WIDTH = 380;
export const CONTAINER_HEIGHT = 550;
export const WALL_THICKNESS = 20;

// Thickness of the *collision* boundary bodies (walls + floor). This is much
// larger than the 20px WALL_THICKNESS the container is *drawn* with, and the
// extra material extends OUTWARD from the play area so the interior and visuals
// are unchanged. Matter.js uses discrete collision detection: a body that moves
// more than roughly (its radius + half the boundary thickness) in a single step
// can skip past a thin boundary entirely ("tunnelling"). A fruit dropped into an
// empty container falls the full height and reaches ~28px/step at the floor —
// enough to punch through a thin 20px floor and vanish off-screen. A thick
// boundary makes the capture window far larger than any per-step displacement.
export const BOUNDARY_THICKNESS = 120;
export const CANVAS_WIDTH = CONTAINER_WIDTH + WALL_THICKNESS * 2;
export const CANVAS_HEIGHT = CONTAINER_HEIGHT + WALL_THICKNESS + 120;

// Drop zone
export const DROP_ZONE_Y = 80;
export const GAME_OVER_LINE_Y = 120;
export const GAME_OVER_GRACE_MS = 2000;
export const DROP_COOLDOWN_MS = 600;

// Physics
export const GRAVITY_Y = 2.8;
// Zero restitution: fruits should *plant* where they land, not bounce. The tiny
// rebound a non-zero value gives is the only thing that can make a fruit hop or
// twitch sideways after touching down on an empty floor, so removing it makes
// landings settle firmly and straight (this is the standard Suika-style value).
export const FRUIT_RESTITUTION = 0;
export const FRUIT_FRICTION = 0.3;
export const MERGE_IMPULSE_STRENGTH = 0.02;

// Solver quality — matter.js defaults are 6 / 4. Cranking iterations pulls
// overlapping bodies apart more firmly each step, so a resting pile shows far
// less visible penetration and a freshly-merged (larger) fruit separates from
// its neighbours before it can fall asleep mid-overlap. Cheap at this body
// count (~30-50 fruits).
export const POSITION_ITERATIONS = 16;
export const VELOCITY_ITERATIONS = 8;

// Per-body contact slop — the penetration matter.js tolerates at rest before
// it bothers to correct. Default is 0.05; tightening it trims the last bit of
// resting overlap. Kept modest so settled piles still reach sleep cleanly
// instead of micro-jittering.
export const FRUIT_SLOP = 0.02;

// Fixed physics timestep — decouples the sim from monitor refresh rate and
// keeps matter.js's solver stable (variable deltas inject energy → jitter).
export const PHYSICS_FIXED_DELTA_MS = 1000 / 60;

// Timer
export const GAME_TIME_MS = 5 * 60 * 1000;

// Game phases
export type FruitGamePhase =
    | 'waiting'
    | 'playing'
    | 'selecting-delete'
    | 'quiz-delete'
    | 'game-over'
    | 'time-up';

export interface FruitBody {
    id: number;
    tier: number;
    merging?: boolean;
}

export interface FruitMergeGameState {
    phase: FruitGamePhase;
    score: number;
    highestTier: number;
    currentDropTier: number;
    nextDropTier: number;
    dropX: number;
    canDrop: boolean;
    timeRemainingMs: number;
    fruitCount: number;
    mergeCount: number;
    selectedDeleteBodyId: number | null;
}

export interface MergeEffect {
    x: number;
    y: number;
    startTime: number;
    tier: number;
}

export const COLORS = {
    bg: '#0f172a',
    containerWall: '#334155',
    containerFill: 'rgba(30, 41, 59, 0.6)',
    dropGuide: 'rgba(148, 163, 184, 0.18)',
    dangerLine: 'rgba(239, 68, 68, 0.4)',
    dangerLinePulse: 'rgba(239, 68, 68, 0.8)',
    mergeFlash: 'rgba(255, 255, 255, 0.8)',
    deleteHighlight: 'rgba(239, 68, 68, 0.5)',
    deleteGlow: 'rgba(239, 68, 68, 0.3)',
} as const;
