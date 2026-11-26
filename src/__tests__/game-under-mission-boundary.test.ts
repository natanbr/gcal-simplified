// ============================================================
// No quick game stays open under a running mission — structural half.
// ------------------------------------------------------------
// Every game overlay is z-[1000] and the mission banner z-100, so a game that is
// still `open` while a mission runs covers it, and the child can let the
// mission's timer run out (a streak miss). The window is judged when a game
// OPENS (isQuickGameWindowOpen); nothing used to end one that was already open.
// useQuickGameSession now ends it and exposes `gameShowing`, the only value a
// game overlay's `open` and the selector may be built from. A raw
// `state.snakeGameActive` there is the bug coming back, and a new game (Microbe
// Patrol) copying the neighbour's line would reintroduce it without any test
// failing, since the behavioural test sees only the hook.
// The behavioural half is src/mission-control/hooks/useQuickGameSession.test.ts.
// ============================================================

import { describe, it, expect } from 'vitest';
import { readSource, stripComments } from './helpers/sourceFiles';

const FILE = 'src/mission-control/MissionControl.tsx';

/** Every `open={...}` and the selector's gate, as written. */
const OPEN_PROPS = /\bopen=\{([^}]*)\}/g;
const SELECTOR_GATE = /\{\s*([^{}]*?)\s*&&\s*activeGameType\s*===\s*null/;

describe('a quick game never stays open under a running mission', () => {
    const src = stripComments(readSource(FILE));
    const gameOverlayOpens = [...src.matchAll(OPEN_PROPS)]
        .map(m => m[1])
        .filter(expr => /activeGameType/.test(expr));

    it('finds the game overlays (the guard is looking at something)', () => {
        expect(gameOverlayOpens.length).toBeGreaterThanOrEqual(3);
        expect(SELECTOR_GATE.test(src)).toBe(true);
    });

    it('builds every overlay open from gameShowing, never the raw store flag', () => {
        for (const expr of gameOverlayOpens) {
            expect(expr, `open={${expr}} must start from gameShowing`).toMatch(/^\s*gameShowing\b/);
            expect(expr).not.toMatch(/snakeGameActive/);
        }
    });

    it('gates the game selector on gameShowing too', () => {
        const gate = SELECTOR_GATE.exec(src)?.[1] ?? '';
        expect(gate).toMatch(/^gameShowing$/);
    });

    it('reads snakeGameActive nowhere else in MissionControl', () => {
        expect(src).not.toMatch(/snakeGameActive/);
    });
});
