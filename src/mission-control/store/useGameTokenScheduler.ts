// ============================================================
// Mission Control — Game Token Scheduler
// Grants 1 game token per day (if bankCount >= 10, up to 5).
// Fires on mount and again at every midnight boundary.
// ⚠️  Internal to src/mission-control/ only.
// ============================================================

import React, { useEffect } from 'react';
import type { MCAction } from '../types';

function msUntilMidnight(): number {
    const now = new Date();
    const midnight = new Date(now);
    midnight.setHours(24, 0, 0, 0);
    return midnight.getTime() - now.getTime();
}

export function useGameTokenScheduler(dispatch: React.Dispatch<MCAction>): void {
    useEffect(() => {
        // Attempt grant on mount (covers app-open after midnight)
        dispatch({ type: 'GRANT_GAME_TOKEN' });

        // Schedule re-attempt at each midnight boundary
        let timeout: ReturnType<typeof setTimeout>;

        function scheduleNextMidnight() {
            timeout = setTimeout(() => {
                dispatch({ type: 'GRANT_GAME_TOKEN' });
                scheduleNextMidnight();
            }, msUntilMidnight());
        }

        scheduleNextMidnight();

        return () => {
            clearTimeout(timeout);
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
}
