// ============================================================
// useLongPress — tap vs hold, and a hold does not outlive its component
// ------------------------------------------------------------
// It once took a reset key: MissionOverlay's Reset hold outlived the mission it
// began on and made an ended mission active again (review of 985592f,
// 2026-09-28). The overlay's Reset is gone since 2026-10-07 (Reset is
// phone-only), and with it the key's only caller; the reducer still refuses a
// stale Reset (staleMissionAction.ts).
// ============================================================

import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useLongPress } from './useLongPress';

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

function setup() {
    const onShort = vi.fn();
    const onLong = vi.fn();
    const hook = renderHook(() => useLongPress(onShort, onLong, 2000));
    return { onShort, onLong, hook };
}

describe('useLongPress', () => {
    it('a hold fires the long press at the threshold, and its release is no short press', () => {
        const { onShort, onLong, hook } = setup();
        act(() => { hook.result.current.onPointerDown(); });
        act(() => { vi.advanceTimersByTime(2000); });
        act(() => { hook.result.current.onPointerUp(); });
        expect(onLong).toHaveBeenCalledTimes(1);
        expect(onShort).not.toHaveBeenCalled();
    });

    it('a release before the threshold is a short press', () => {
        const { onShort, onLong, hook } = setup();
        act(() => { hook.result.current.onPointerDown(); });
        act(() => { vi.advanceTimersByTime(1000); });
        act(() => { hook.result.current.onPointerUp(); });
        expect(onShort).toHaveBeenCalledTimes(1);
        expect(onLong).not.toHaveBeenCalled();
    });

    it('a hold in flight when the component unmounts never fires', () => {
        const { onLong, hook } = setup();
        act(() => { hook.result.current.onPointerDown(); });
        act(() => { vi.advanceTimersByTime(1000); });
        hook.unmount();
        act(() => { vi.advanceTimersByTime(5000); });
        expect(onLong).not.toHaveBeenCalled();
    });
});
