// ============================================================
// useLongPress — a hold does not outlive the thing it began on
// ------------------------------------------------------------
// MissionOverlay is always mounted, so its Reset hold's timer used to survive
// the mission it began on: a hold in progress when the mission expired or the
// phone stopped it fired RESET_MISSION_WITH_TIMER for the ended mission and made
// it active again, hidden and never expiring (review of 985592f, 2026-09-28).
// The reducer now refuses that too (staleMissionAction.ts); this is the hook's half.
// ============================================================

import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useLongPress } from './useLongPress';

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

function setup() {
    const onShort = vi.fn();
    const onLong = vi.fn();
    const hook = renderHook(({ resetKey }: { resetKey: string }) => useLongPress(onShort, onLong, 2000, resetKey), {
        initialProps: { resetKey: 'morning' },
    });
    return { onShort, onLong, hook };
}

describe('useLongPress', () => {
    it('a hold fires the long press at the threshold', () => {
        const { onLong, hook } = setup();
        act(() => { hook.result.current.onPointerDown(); });
        act(() => { vi.advanceTimersByTime(2000); });
        expect(onLong).toHaveBeenCalledTimes(1);
    });

    it('a hold in flight when the reset key changes never fires, and its release is no short press', () => {
        const { onShort, onLong, hook } = setup();
        act(() => { hook.result.current.onPointerDown(); });
        act(() => { vi.advanceTimersByTime(1000); });
        hook.rerender({ resetKey: 'none' });
        act(() => { vi.advanceTimersByTime(5000); });
        act(() => { hook.result.current.onPointerUp(); });

        expect(onLong).not.toHaveBeenCalled();
        expect(onShort).not.toHaveBeenCalled();
    });

    it('a re-render with the same key keeps the hold', () => {
        const { onLong, hook } = setup();
        act(() => { hook.result.current.onPointerDown(); });
        hook.rerender({ resetKey: 'morning' });
        act(() => { vi.advanceTimersByTime(2000); });
        expect(onLong).toHaveBeenCalledTimes(1);
    });
});
