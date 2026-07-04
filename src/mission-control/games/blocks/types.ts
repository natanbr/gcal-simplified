// ============================================================
// Space Rescue Blocks Game — Types & Constants
// ⚠️  Internal to src/mission-control/games/blocks/ only.
// ============================================================

export interface Position {
    x: number;
    y: number;
}

export interface GameShape {
    id: string;
    /** Relative grid coordinates offsets from anchor (0,0) */
    cells: Position[];
    color: string;
    name: string;
}

export type GamePhase = 'waiting' | 'playing' | 'quiz' | 'game-over' | 'victory';

export interface BlocksGameState {
    grid: number[][]; // 8x8 grid: 0 = empty, 1 = debris/filled, 2 = meteor, 3 = satellite, 4 = exploding, 5 = electricity
    standardShapes: (GameShape | null)[]; // 3 shapes generated
    rescueShape: GameShape | null; // 4th rescue shape
    rescueShapeLocked: boolean;
    altitude: number; // 0m to 200m+
    score: number;
    phase: GamePhase;
    level: number;
    quizQuestion: { text: string; answer: number } | null;
    clearedFeedback: { text: string; stars: number; id: string } | null;
}

export const GRID_SIZE = 8;
export const CELL_DISPLAY_SIZE = 48; // pixels for render size
export const ALTITUDE_TARGET = 200; // altitude in meters to win/rescue astronaut

// Altitude events
export const ALTITUDE_LEVELS = {
    0: { label: 'Earth Launch', threshold: 0 },
    1: { label: 'Asteroid Belt', threshold: 50 }, // triggers asteroid hole
    2: { label: 'Satellite Orbit', threshold: 120 }, // triggers satellite repair
    3: { label: 'Space Storm', threshold: 180 }, // triggers complex shapes + electricity
};

// ── Shape Templates ──────────────────────────────────────────
export const SHAPE_POOL: GameShape[] = [
    { id: '1x3-h', name: 'Tromino H', cells: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }], color: '#22c55e' }, // green
    { id: '1x3-v', name: 'Tromino V', cells: [{ x: 0, y: 0 }, { x: 0, y: 1 }, { x: 0, y: 2 }], color: '#22c55e' },
    { id: '1x4-h', name: 'Bar H', cells: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 3, y: 0 }], color: '#a78bfa' }, // purple
    { id: '1x4-v', name: 'Bar V', cells: [{ x: 0, y: 0 }, { x: 0, y: 1 }, { x: 0, y: 2 }, { x: 0, y: 3 }], color: '#a78bfa' },
    { id: '2x2', name: 'Block', cells: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }], color: '#f59e0b' }, // orange
    { id: 'L-1', name: 'L Shape', cells: [{ x: 0, y: 0 }, { x: 0, y: 1 }, { x: 0, y: 2 }, { x: 1, y: 2 }], color: '#ec4899' }, // pink
    { id: 'T-1', name: 'T Shape', cells: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 1, y: 1 }], color: '#14b8a6' }, // teal
];

// Helper shapes for Rescue / Fallback
export const HELP_SHAPES: GameShape[] = [
    { id: '1x1', name: 'Monomino', cells: [{ x: 0, y: 0 }], color: '#38bdf8' }, // sky blue
    { id: '1x2-h', name: 'Domino H', cells: [{ x: 0, y: 0 }, { x: 1, y: 0 }], color: '#38bdf8' },
    { id: '1x2-v', name: 'Domino V', cells: [{ x: 0, y: 0 }, { x: 0, y: 1 }], color: '#38bdf8' },
];

// Progressive complex shapes per level
export const LEVEL_COMPLEX_SHAPES: Record<number, GameShape[]> = {
    1: [
        { id: 'staircase', name: 'Staircase', cells: [{ x: 1, y: 0 }, { x: 2, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 2 }, { x: 1, y: 2 }], color: '#fbbf24' }, // amber (78523)
        { id: 'u-shape', name: 'U-Shape', cells: [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }, { x: 2, y: 1 }], color: '#818cf8' }, // indigo (14563)
    ],
    2: [
        { id: 'giant-l', name: 'Giant L', cells: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 1 }, { x: 2, y: 2 }], color: '#f43f5e' }, // rose (96321)
        { id: 'cross', name: 'Cross', cells: [{ x: 1, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }, { x: 2, y: 1 }, { x: 1, y: 2 }], color: '#fb7185' }, // (45862)
    ],
    3: [
        { id: '1x5-h', name: 'Long Bar H', cells: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 3, y: 0 }, { x: 4, y: 0 }], color: '#e11d48' },
        { id: '1x5-v', name: 'Long Bar V', cells: [{ x: 0, y: 0 }, { x: 0, y: 1 }, { x: 0, y: 2 }, { x: 0, y: 3 }, { x: 0, y: 4 }], color: '#e11d48' },
        { id: '3x3', name: 'Giant Block', cells: [
            { x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 },
            { x: 0, y: 1 }, { x: 1, y: 1 }, { x: 2, y: 1 },
            { x: 0, y: 2 }, { x: 1, y: 2 }, { x: 2, y: 2 }
        ], color: '#be123c' }
    ]
};

// Handcrafted layouts: 0 is empty, 1 is debris
export const INITIAL_LAYOUTS: number[][][] = [
    // 0: Clean slate
    Array.from({ length: 8 }, () => Array(8).fill(0)),
    // 1: Center Cross
    [
        [0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0],
        [0,0,0,1,1,0,0,0],
        [0,0,1,1,1,1,0,0],
        [0,0,1,1,1,1,0,0],
        [0,0,0,1,1,0,0,0],
        [0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0],
    ],
    // 2: Four Corners
    [
        [1,1,0,0,0,0,1,1],
        [1,0,0,0,0,0,0,1],
        [0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0],
        [1,0,0,0,0,0,0,1],
        [1,1,0,0,0,0,1,1],
    ],
    // 3: Checkerboard Frame
    [
        [1,0,1,0,1,0,1,0],
        [0,0,0,0,0,0,0,1],
        [1,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,1],
        [1,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,1],
        [1,0,0,0,0,0,0,0],
        [0,1,0,1,0,1,0,1],
    ],
    // 4: The Pillars
    [
        [0,0,1,0,0,1,0,0],
        [0,0,1,0,0,1,0,0],
        [0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0],
        [0,0,1,0,0,1,0,0],
        [0,0,1,0,0,1,0,0],
        [0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0],
    ],
    // 5: Space Maze
    [
        [0,0,0,0,0,0,0,0],
        [0,1,1,1,1,1,0,0],
        [0,1,0,0,0,1,0,0],
        [0,1,0,1,0,1,0,0],
        [0,0,0,1,0,1,0,0],
        [0,1,1,1,0,1,0,0],
        [0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0],
    ],
    // 6: Left Wing
    [
        [1,1,1,0,0,0,0,0],
        [1,1,0,0,0,0,0,0],
        [1,0,0,0,0,0,0,0],
        [1,1,0,0,0,0,0,0],
        [1,1,1,0,0,0,0,0],
        [1,1,0,0,0,0,0,0],
        [1,0,0,0,0,0,0,0],
        [1,1,0,0,0,0,0,0],
    ],
    // 7: Anchor
    [
        [0,0,0,1,1,0,0,0],
        [0,0,0,1,1,0,0,0],
        [0,0,0,1,1,0,0,0],
        [0,1,1,1,1,1,1,0],
        [1,1,0,1,1,0,1,1],
        [1,0,0,1,1,0,0,1],
        [0,0,0,1,1,0,0,0],
        [0,0,0,1,1,0,0,0],
    ],
    // 8: Ring of Fire
    [
        [0,0,0,0,0,0,0,0],
        [0,1,1,1,1,1,1,0],
        [0,1,0,0,0,0,1,0],
        [0,1,0,0,0,0,1,0],
        [0,1,0,0,0,0,1,0],
        [0,1,0,0,0,0,1,0],
        [0,1,1,1,1,1,1,0],
        [0,0,0,0,0,0,0,0],
    ],
    // 9: Scattered Space Junk
    [
        [0,0,1,0,0,0,0,0],
        [0,0,0,0,1,0,0,0],
        [1,0,0,0,0,0,1,0],
        [0,0,0,0,0,0,0,0],
        [0,1,0,0,0,1,0,0],
        [0,0,0,0,0,0,0,1],
        [0,0,1,0,0,0,0,0],
        [1,0,0,0,1,0,0,0],
    ],
];

export function transformShape(cells: Position[]): Position[] {
    const rotation = Math.floor(Math.random() * 4);
    const mirror = Math.random() < 0.5;

    const transformed = cells.map(({ x, y }) => {
        let nx: number, ny: number;
        switch (rotation) {
            case 1: nx = -y; ny = x; break;
            case 2: nx = -x; ny = -y; break;
            case 3: nx = y; ny = -x; break;
            default: nx = x; ny = y;
        }
        if (mirror) nx = -nx;
        return { x: nx, y: ny };
    });

    const minX = Math.min(...transformed.map(p => p.x));
    const minY = Math.min(...transformed.map(p => p.y));
    return transformed.map(p => ({ x: p.x - minX, y: p.y - minY }));
}

export function applyClearEffects(
    grid: number[][],
    clearedCells: { r: number; c: number }[],
    originalValues: Map<string, number>,
): void {
    clearedCells.forEach(({ r, c }) => {
        const origVal = originalValues.get(`${r}-${c}`);
        if (origVal === 3) {
            const diags = [[-1,-1],[-1,1],[1,-1],[1,1]];
            for (const [dr, dc] of diags) {
                const nr = r + dr;
                const nc = c + dc;
                if (nr >= 0 && nr < GRID_SIZE && nc >= 0 && nc < GRID_SIZE && grid[nr][nc] === 1) {
                    grid[nr][nc] = 0;
                }
            }
        }
        if (origVal === 5) {
            let spawned = 0;
            for (let i = 0; i < 20 && spawned < 2; i++) {
                const sr = Math.floor(Math.random() * GRID_SIZE);
                const sc = Math.floor(Math.random() * GRID_SIZE);
                if (grid[sr][sc] === 0) {
                    grid[sr][sc] = 2;
                    spawned++;
                }
            }
        }
    });
}

function spawnRandomCell(grid: number[][], value: number, count: number): void {
    let placed = 0;
    for (let i = 0; i < 20 && placed < count; i++) {
        const r = Math.floor(Math.random() * GRID_SIZE);
        const c = Math.floor(Math.random() * GRID_SIZE);
        if (grid[r][c] === 0) {
            grid[r][c] = value;
            placed++;
        }
    }
}

export function spawnObstacles(grid: number[][], level: number): void {
    if (level >= 1 && !grid.some(row => row.includes(2))) {
        spawnRandomCell(grid, 2, 2);
    }
    if (level >= 2 && !grid.some(row => row.includes(3))) {
        spawnRandomCell(grid, 3, 1);
    }
    if (level >= 3 && !grid.some(row => row.includes(5))) {
        spawnRandomCell(grid, 5, 1);
    }
}
