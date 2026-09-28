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
 * @param resetKey      When it changes, a press in flight is dropped: the thing it
 *                      began on is gone (MissionOverlay passes the mission phase).
 */
export function useLongPress(
    onShortPress: () => void,
    onLongPress:  () => void,
    thresholdMs = 2000,
    resetKey?: unknown,
): UseLongPressResult {
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const isPressedRef = useRef(false);
    const firedRef = useRef(false);

    const onPointerDown = useCallback(() => {
        isPressedRef.current = true;
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
        if (isPressedRef.current && !firedRef.current) {
            onShortPress();
        }
        isPressedRef.current = false;
    }, [onShortPress]);

    const onPointerLeave = useCallback(() => {
        if (timerRef.current) {
            clearTimeout(timerRef.current);
            timerRef.current = null;
        }
        isPressedRef.current = false;
    }, []);

    // On unmount, and when resetKey changes. A hold that outlived its mission
    // once reset a mission that had already ended, making it active again.
    useEffect(() => () => {
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = null;
        isPressedRef.current = false;
    }, [resetKey]);

    return { onPointerDown, onPointerUp, onPointerLeave };
}
