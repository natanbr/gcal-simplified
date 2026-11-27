// ============================================================
// Mission Control — Quick Game Session
// Owns the lifecycle of one paid game session: which game is
// showing, the start/end log entries, and the START/END_GAME
// dispatches. Extracted from MissionControl.tsx.
// ⚠️  Internal to src/mission-control/ only.
// ============================================================

import { useCallback, useEffect, useRef, useState } from 'react';
import { useMCDispatch, useMCStore } from '../store/useMCStore';
import { isEconomyLocked } from '../store/missionStreak';
import { isQuickGameWindowOpen } from '../store/gameWindow';
import type { GameId } from '../skills/types';

/** "3m 12s", or "5s" under a minute. */
function playedFor(durationMs: number): string {
    const mins = Math.floor(durationMs / 60000);
    const secs = Math.floor((durationMs % 60000) / 1000);
    return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
}

export function useQuickGameSession() {
    const dispatch = useMCDispatch();
    const { state } = useMCStore();
    const [activeGameType, setActiveGameType] = useState<GameId | null>(null);
    const gameStartRef = useRef<string | null>(null);
    const [missionEndedGame, setMissionEndedGame] = useState(false);
    const endedByMissionRef = useRef(false);

    /**
     * What every overlay's `open` and the selector are built from, never the raw
     * `snakeGameActive`: a game must not stay on screen under a running mission
     * (every game overlay is z-[1000], the mission banner z-100). Derived, so the
     * game is gone in the SAME render the mission starts; the effect below then
     * closes the session properly. Guarded by game-under-mission-boundary.test.ts.
     */
    const gameShowing = state.snakeGameActive && state.activeMission === 'none';
    const gameUnderMission = state.snakeGameActive && state.activeMission !== 'none';

    /**
     * @param at The instant the child actually tapped. Redeeming a quick-game
     * goal is TWO dispatches (CONSUME_CASE then START_GAME) against a
     * time-based window, so one instant is threaded through both: read the
     * clock twice and a tap at 18:59:59.999 spends the goal and is then refused
     * the game at 19:00:00.001.
     */
    const handleQuickGameOpen = useCallback((at?: string) => {
        const instant = at ?? new Date().toISOString();
        // START_GAME is refusable (shield lock, closed window) and sits in
        // UNLOGGED_ACTIONS, so createLogEntry's mirror never sees it: without
        // this check the hand-built entry below records a game that never ran,
        // straight into the append-only audit trail.
        if (isEconomyLocked(state) || !isQuickGameWindowOpen(state, instant)) return;
        gameStartRef.current = instant;
        // Stamped, so the reducer judges the window against the SAME instant
        // the caller already judged CONSUME_CASE against.
        dispatch({ type: 'START_GAME', timestamp: instant });
        dispatch({
            type: 'ADD_LOG',
            log: {
                id: `game-start-${Date.now()}`,
                timestamp: instant,
                icon: '🕹️',
                message: 'Quick Game started',
                type: 'reward',
                colorKey: 'system',
                // Hand-built entry: it skips `createLogEntry`, so it must set
                // `source` itself. The child tapped a game on this machine.
                source: 'local',
            },
        });
    }, [dispatch, state]);

    const handleQuickGameClose = useCallback((score: number) => {
        const startedAt = gameStartRef.current;
        const endedAt = new Date().toISOString();
        const durationLabel = startedAt
            ? ` (${playedFor(new Date(endedAt).getTime() - new Date(startedAt).getTime())})`
            : '';
        dispatch({ type: 'END_GAME' });
        dispatch({
            type: 'ADD_LOG',
            log: {
                id: `game-end-${Date.now()}`,
                timestamp: endedAt,
                icon: '🏁',
                message: `Quick Game ended — Score: ${score}${durationLabel}`,
                type: 'reward',
                colorKey: 'system',
                // Same as the start entry — hand-built, so `source` is manual.
                source: 'local',
            },
        });
        gameStartRef.current = null;
        setActiveGameType(null);
    }, [dispatch]);

    // A mission started (the scheduler, or the phone) while a game or the game
    // selector was open: end the session once. END_GAME is not refusable, and it
    // moves no tokens (what the child paid for the game is not refunded; open
    // decision in the PR). The line is hand-built, so it sets `source` itself:
    // the app ended it, not the child. No score: the overlays hold it, and a
    // "Score: 0" for a game that was played would be false data in the audit trail.
    useEffect(() => {
        if (!gameUnderMission) {
            endedByMissionRef.current = false;
            return;
        }
        if (endedByMissionRef.current) return;
        endedByMissionRef.current = true;
        const startedAt = gameStartRef.current;
        const endedAt = new Date().toISOString();
        const played = startedAt
            ? ` (${playedFor(new Date(endedAt).getTime() - new Date(startedAt).getTime())})`
            : '';
        dispatch({ type: 'END_GAME' });
        dispatch({
            type: 'ADD_LOG',
            log: {
                id: `game-end-mission-${Date.now()}`,
                timestamp: endedAt,
                icon: '🏁',
                message: `Quick Game ended — a mission started${played}`,
                type: 'reward',
                colorKey: 'system',
                source: 'system',
            },
        });
        gameStartRef.current = null;
        setActiveGameType(null);
        setMissionEndedGame(true);
    }, [gameUnderMission, dispatch]);

    const dismissMissionEndedGame = useCallback(() => setMissionEndedGame(false), []);

    return {
        activeGameType, setActiveGameType, handleQuickGameOpen, handleQuickGameClose,
        gameShowing, missionEndedGame, dismissMissionEndedGame,
    };
}
