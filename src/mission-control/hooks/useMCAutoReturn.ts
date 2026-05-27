// ============================================================
// Mission Control — useMCAutoReturn
// Automatically switches back to the Calendar view after a
// configurable idle timeout. Paused while a mission is active.
//
// ⚠️  Internal to src/mission-control/ only.
// ============================================================

import { useEffect } from 'react';
import { useMCState } from '../store/useMCStore';

/**
 * Fires `onReturn` after `settings.autoReturnMins` minutes of inactivity
 * on the Mission Control screen.
 *
 * Rules:
 *  - Does nothing if `autoReturnMins` is 0 (disabled).
 *  - Does nothing while `activeMission !== 'none'` (mission in progress).
 *  - Timer resets on every MCState change (any dispatch re-renders this hook).
 */
export function useMCAutoReturn(onReturn: () => void): void {
    const { activeMission, settings } = useMCState();
    const timeoutMins = settings.autoReturnMins ?? 5;

    useEffect(() => {
        // Disabled explicitly or mission is running — do not schedule a return.
        if (timeoutMins === 0 || activeMission !== 'none') return;

        const id = setTimeout(onReturn, timeoutMins * 60 * 1000);
        return () => clearTimeout(id);

        // NOTE: `onReturn` identity is stable (useCallback in App.tsx).
        // `activeMission` and `timeoutMins` changes correctly reset the timer
        // because useEffect re-fires and clears + restarts the timeout.
    }, [timeoutMins, activeMission, onReturn]);
}
