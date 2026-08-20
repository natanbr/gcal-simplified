// ============================================================
// Mission Control — Quick Game Session
// Owns the lifecycle of one paid game session: which game is
// showing, the start/end log entries, and the START/END_GAME
// dispatches. Extracted from MissionControl.tsx.
// ⚠️  Internal to src/mission-control/ only.
// ============================================================

import { useCallback, useRef, useState } from 'react';
import { useMCDispatch } from '../store/useMCStore';

export type QuickGameType = 'snake' | 'blocks' | 'fruits';

export function useQuickGameSession() {
    const dispatch = useMCDispatch();
    const [activeGameType, setActiveGameType] = useState<QuickGameType | null>(null);
    const gameStartRef = useRef<string | null>(null);

    const handleQuickGameOpen = useCallback(() => {
        gameStartRef.current = new Date().toISOString();
        dispatch({ type: 'START_GAME' });
        dispatch({
            type: 'ADD_LOG',
            log: {
                id: `game-start-${Date.now()}`,
                timestamp: new Date().toISOString(),
                icon: '🕹️',
                message: 'Quick Game started',
                type: 'reward',
                colorKey: 'system',
            },
        });
    }, [dispatch]);

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
            },
        });
        gameStartRef.current = null;
        setActiveGameType(null);
    }, [dispatch]);

    return { activeGameType, setActiveGameType, handleQuickGameOpen, handleQuickGameClose };
}
