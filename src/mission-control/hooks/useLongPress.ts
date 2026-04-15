// ============================================================
// useLongPress — Pointer-based long-press interaction hook
// Returns handlers for onPointerDown / onPointerUp / onPointerLeave.
// Short press (<threshold) fires onShortPress.
// Long press (≥threshold) fires onLongPress.
// ⚠️  Internal to src/mission-control/ only.
// ============================================================

import { useCallback, useEffect, useRef } from 'react';

interface UseLongPressResult {
    onPointerDown: () => void;
    onPointerUp:   () => void;
    onPointerLeave: () => void;
}

/**
 * Dual-action press hook: short tap vs long hold.
 *
 * @param onShortPress  Fired when the pointer is released before the threshold.
 * @param onLongPress   Fired when the pointer is held for ≥ `thresholdMs`.
 * @param thresholdMs   Hold duration in milliseconds (default 2000).
 */
export function useLongPress(
    onShortPress: () => void,
    onLongPress:  () => void,
    thresholdMs = 2000,
): UseLongPressResult {
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const firedRef = useRef(false);

    const onPointerDown = useCallback(() => {
        firedRef.current = false;
        timerRef.current = setTimeout(() => {
            firedRef.current = true;
            onLongPress();
        }, thresholdMs);
    }, [onLongPress, thresholdMs]);

    const onPointerUp = useCallback(() => {
        if (timerRef.current) {
            clearTimeout(timerRef.current);
            timerRef.current = null;
        }
        if (!firedRef.current) {
            onShortPress();
        }
    }, [onShortPress]);

    const onPointerLeave = onPointerUp; // cancel on leave = same as release

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (timerRef.current) clearTimeout(timerRef.current);
        };
    }, []);

    return { onPointerDown, onPointerUp, onPointerLeave };
}
