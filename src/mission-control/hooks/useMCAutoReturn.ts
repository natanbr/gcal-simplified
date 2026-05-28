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
 *  - Timer resets on every user interaction (pointerdown, keydown, click).
 */
export function useMCAutoReturn(onReturn: () => void): void {
    const { activeMission, settings } = useMCState();
    const timeoutMins = settings.autoReturnMins ?? 5;
    const onReturnRef = useRef(onReturn);
    onReturnRef.current = onReturn;

    useEffect(() => {
        // Disabled explicitly or mission is running — do not schedule a return.
        if (timeoutMins === 0 || activeMission !== 'none') return;

        let timerId: NodeJS.Timeout;

        const resetTimer = () => {
            if (timerId) clearTimeout(timerId);
            timerId = setTimeout(() => {
                onReturnRef.current();
            }, timeoutMins * 60 * 1000);
        };

        // Initialize timer
        resetTimer();

        // Listen for user interaction events to reset the idle timer
        const events = ['pointerdown', 'keydown', 'click'];
        const eventOptions = { passive: true };

        events.forEach(event => {
            window.addEventListener(event, resetTimer, eventOptions);
        });

        return () => {
            if (timerId) clearTimeout(timerId);
            events.forEach(event => {
                window.removeEventListener(event, resetTimer);
            });
        };
    }, [timeoutMins, activeMission]);
}
