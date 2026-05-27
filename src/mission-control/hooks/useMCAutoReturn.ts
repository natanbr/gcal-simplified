// ============================================================
// Mission Control — useMCAutoReturn
// Automatically switches back to the Calendar view after a
// configurable idle timeout. Paused while a mission is active.
//
// ⚠️  Internal to src/mission-control/ only.
// ============================================================

import { useEffect, useRef } from 'react';
import { useMCState } from '../store/useMCStore';

/**
 * Fires `onReturn` after `settings.autoReturnMins` minutes of inactivity
 * on the Mission Control screen.
 *
 * Rules:
 *  - Does nothing if `autoReturnMins` is 0 (disabled).
 *  - Does nothing while `activeMission !== 'none'` (mission in progress).
 *  - Timer resets on any DOM interaction events (pointerdown, keydown, click) on window.
 */
export function useMCAutoReturn(onReturn: () => void): void {
    const { activeMission, settings } = useMCState();
    const timeoutMins = settings.autoReturnMins ?? 5;
    const timeoutIdRef = useRef<NodeJS.Timeout | null>(null);

    useEffect(() => {
        // Disabled explicitly or mission is running — do not schedule a return.
        if (timeoutMins === 0 || activeMission !== 'none') {
            if (timeoutIdRef.current) {
                clearTimeout(timeoutIdRef.current);
                timeoutIdRef.current = null;
            }
            return;
        }

        const resetTimer = () => {
            if (timeoutIdRef.current) {
                clearTimeout(timeoutIdRef.current);
            }
            timeoutIdRef.current = setTimeout(onReturn, timeoutMins * 60 * 1000);
        };

        // Start initial timer
        resetTimer();

        // Listen for true DOM user interaction events on window
        window.addEventListener('pointerdown', resetTimer);
        window.addEventListener('keydown', resetTimer);
        window.addEventListener('click', resetTimer);

        return () => {
            if (timeoutIdRef.current) {
                clearTimeout(timeoutIdRef.current);
                timeoutIdRef.current = null;
            }
            window.removeEventListener('pointerdown', resetTimer);
            window.removeEventListener('keydown', resetTimer);
            window.removeEventListener('click', resetTimer);
        };
    }, [timeoutMins, activeMission, onReturn]);
}
