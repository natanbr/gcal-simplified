// ============================================================
// Mission Control — Quick Game Session
// Owns the lifecycle of one paid game session: which game is
// showing, the start/end log entries, and the START/END_GAME
// dispatches. Extracted from MissionControl.tsx.
// ⚠️  Internal to src/mission-control/ only.
// ============================================================

import { useCallback, useRef, useState } from 'react';
import { useMCDispatch, useMCStore } from '../store/useMCStore';
import { isEconomyLocked } from '../store/missionStreak';
import { isQuickGameWindowOpen } from '../store/gameWindow';
import type { GameId } from '../skills/types';

export function useQuickGameSession() {
    const dispatch = useMCDispatch();
    const { state } = useMCStore();
    const [activeGameType, setActiveGameType] = useState<GameId | null>(null);
    const gameStartRef = useRef<string | null>(null);

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
        let durationLabel = '';
        if (startedAt) {
            const durationMs = new Date(endedAt).getTime() - new Date(startedAt).getTime();
            const mins = Math.floor(durationMs / 60000);
            const secs = Math.floor((durationMs % 60000) / 1000);
            durationLabel = mins > 0 ? ` (${mins}m ${secs}s)` : ` (${secs}s)`;
        }
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

    return { activeGameType, setActiveGameType, handleQuickGameOpen, handleQuickGameClose };
}
