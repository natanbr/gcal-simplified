// ============================================================
// MissionDepletingBar + progress-bar long-press gesture tests
//
// Bug: Reducing durationMins via ADJUST_MISSION_END caused the
// progress bar to display an *incorrect* width because pct was
// computed as remainingSecs / (durationMins * 60). When both
// numerator and denominator shrink by the same absolute seconds,
// the ratio jumps in the wrong direction.
//
// Fix: pct is now anchored on startedAt:
//   elapsed = now - startedAt
//   pct     = 1 - (elapsed / totalMs)  → depletes left-to-right correctly.
//
// New gesture: long-press (600ms) on the progress bar to adjust time.
//   - Long-press LEFT  half → ADJUST_MISSION_END −5 min
//   - Long-press RIGHT half → ADJUST_MISSION_END +5 min
//
// The old emoji triple-tap / long-press gesture is removed.
// ============================================================

import React from 'react';
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MCStoreProvider, useMCDispatch } from '../store/useMCStore.tsx';

import { MissionDepletingBar } from './MissionTimerDisplay';
import { MissionOverlay } from './MissionOverlay';
import type { Mission } from '../types';

// ── Framer Motion mock ─────────────────────────────────────────────────────────
// motion.div mock merges animate.width into style so getBarFillWidth() works.
vi.mock('framer-motion', async () => {
    const actual = await vi.importActual<typeof import('framer-motion')>('framer-motion');
    return {
        ...actual,
        AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
        motion: new Proxy({} as Record<string, unknown>, {
            get: (_target, prop: string) => {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                return React.forwardRef(({ children: c, animate, style, ...props }: any, ref: any) => {
                    // Merge animate.width → style.width so CSS reads correctly in JSDOM
                    const animateWidth = animate && typeof animate === 'object'
                        ? (animate as Record<string, string>).width
                        : undefined;

                    return React.createElement(
                        prop as string,
                        {
                            ...props,
                            ref,
                            style: { ...style, ...(animateWidth !== undefined ? { width: animateWidth } : {}) },
                        },
                        c,
                    );
                });
            },
        }),
    };
});

// ── useLiveClock mock — pinned to a fixed time ────────────────────────────────
// MOCK_NOW = 2025-03-06T10:10:00Z
// Our fixture: startedAt = 10:00 → elapsed = 10 min exactly
const MOCK_NOW = new Date('2025-03-06T10:10:00.000Z');
vi.mock('../hooks/useLiveClock', () => ({
    useLiveClock: () => MOCK_NOW,
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeMission(overrides: Partial<Mission> = {}): Mission {
    const startedAt = new Date(MOCK_NOW.getTime() - 10 * 60 * 1000).toISOString(); // 10 min ago
    return {
        phase: 'morning',
        endsAt: '10:30',
        startsAt: '10:00',
        startedAt,
        durationMins: 30,
        active: true,
        tasks: [],
        ...overrides,
    };
}

function BarWrapper({ mission, onAdjust }: { mission: Mission; onAdjust?: (d: number) => void }) {
    return (
        <MCStoreProvider>
            <MissionDepletingBar mission={mission} allDone={false} accent="#a57dff" onAdjust={onAdjust} />
        </MCStoreProvider>
    );
}

function getBarFillWidth(): number {
    const fill = document.querySelector('[data-testid="mc-bar-fill"]') as HTMLElement | null;
    if (!fill) throw new Error('mc-bar-fill not found — bar may have returned null (check timerExpired)');
    return Number.parseFloat(fill.style.width);

}

function mockBarRect(bar: HTMLElement) {
    Object.defineProperty(bar, 'getBoundingClientRect', {
        value: () => ({ left: 0, right: 200, width: 200, top: 0, bottom: 42, height: 42, x: 0, y: 0 } as DOMRect),
        configurable: true,
    });
}

beforeEach(() => { vi.clearAllMocks(); localStorage.clear(); });
afterEach(() => { cleanup(); localStorage.clear(); });

// ── Bug regression: progress bar pct is now anchored on startedAt ─────────────

describe('MissionDepletingBar — progress calculation (bug regression)', () => {
    it('shows ~66% fill 10 min into a 30-min mission (baseline)', () => {
        // elapsed=10min, total=30min → pct = 1 - 10/30 ≈ 66.7%
        render(<BarWrapper mission={makeMission()} />);
        const pct = getBarFillWidth();
        expect(pct).toBeGreaterThanOrEqual(65);
        expect(pct).toBeLessThanOrEqual(68);
    });

    it('reducing duration to 25 min → bar shows more elapsed (~60%)', () => {
        // elapsed=10min, total=25min → pct = 1 - 10/25 = 60%
        // Bug: old remainingSecs/total formula gave same number BUT the direction
        // of change was incorrect when the user reduced time repeatedly.
        const mission = makeMission({ durationMins: 25 });
        render(<BarWrapper mission={mission} />);
        const pct = getBarFillWidth();
        expect(pct).toBeGreaterThanOrEqual(58);
        expect(pct).toBeLessThanOrEqual(62);
    });

    it('increasing duration to 35 min → bar shows less elapsed (~71%)', () => {
        // elapsed=10min, total=35min → pct = 1 - 10/35 ≈ 71.4%
        const mission = makeMission({ durationMins: 35 });
        render(<BarWrapper mission={mission} />);
        const pct = getBarFillWidth();
        expect(pct).toBeGreaterThanOrEqual(70);
        expect(pct).toBeLessThanOrEqual(73);
    });

    it('expired mission (elapsed > duration) — bar element is absent (returns null)', () => {
        const startedAt = new Date(MOCK_NOW.getTime() - 40 * 60 * 1000).toISOString();
        const mission = makeMission({ startedAt, durationMins: 30 });
        render(<BarWrapper mission={mission} />);
        expect(document.querySelector('[data-testid="mc-bar-fill"]')).toBeNull();
    });

    it('shows 100% fill at mission start (elapsed = 0)', () => {
        const mission = makeMission({ startedAt: MOCK_NOW.toISOString(), durationMins: 30 });
        render(<BarWrapper mission={mission} />);
        expect(getBarFillWidth()).toBeCloseTo(100, 0);
    });
});

// ── New gesture: long-press left/right half of the progress bar ────────────────

describe('MissionDepletingBar — long-press gesture (onAdjust)', () => {
    it('bar renders with data-testid="mc-timer-bar"', () => {
        render(<BarWrapper mission={makeMission()} />);
        expect(screen.getByTestId('mc-timer-bar')).toBeInTheDocument();
    });

    it('bar cursor is "pointer" when onAdjust is provided', () => {
        render(<BarWrapper mission={makeMission()} onAdjust={vi.fn()} />);
        expect(screen.getByTestId('mc-timer-bar').style.cursor).toBe('pointer');
    });

    it('bar cursor is "default" when no onAdjust is given', () => {
        render(<BarWrapper mission={makeMission()} />);
        expect(screen.getByTestId('mc-timer-bar').style.cursor).toBe('default');
    });

    it('long-pressing the LEFT half (600ms) calls onAdjust(−5)', async () => {
        vi.useFakeTimers();
        const onAdjust = vi.fn();
        render(<BarWrapper mission={makeMission()} onAdjust={onAdjust} />);

        const bar = screen.getByTestId('mc-timer-bar');
        mockBarRect(bar);
        // clientX = 50 → left half (< 100 = left + width/2)
        fireEvent.pointerDown(bar, { clientX: 50 });
        await act(async () => { vi.advanceTimersByTime(650); });

        expect(onAdjust).toHaveBeenCalledOnce();
        expect(onAdjust).toHaveBeenCalledWith(-5);
        vi.useRealTimers();
    });

    it('long-pressing the RIGHT half (600ms) calls onAdjust(+5)', async () => {
        vi.useFakeTimers();
        const onAdjust = vi.fn();
        render(<BarWrapper mission={makeMission()} onAdjust={onAdjust} />);

        const bar = screen.getByTestId('mc-timer-bar');
        mockBarRect(bar);
        // clientX = 150 → right half (> 100)
        fireEvent.pointerDown(bar, { clientX: 150 });
        await act(async () => { vi.advanceTimersByTime(650); });

        expect(onAdjust).toHaveBeenCalledOnce();
        expect(onAdjust).toHaveBeenCalledWith(5);
        vi.useRealTimers();
    });

    it('releasing before 600ms cancels the gesture (onAdjust NOT called)', async () => {
        vi.useFakeTimers();
        const onAdjust = vi.fn();
        render(<BarWrapper mission={makeMission()} onAdjust={onAdjust} />);

        const bar = screen.getByTestId('mc-timer-bar');
        mockBarRect(bar);
        fireEvent.pointerDown(bar, { clientX: 50 });
        await act(async () => { vi.advanceTimersByTime(200); });
        fireEvent.pointerUp(bar);
        await act(async () => { vi.advanceTimersByTime(600); }); // well past 600ms

        expect(onAdjust).not.toHaveBeenCalled();
        vi.useRealTimers();
    });

    it('pointerLeave also cancels gesture before it fires', async () => {
        vi.useFakeTimers();
        const onAdjust = vi.fn();
        render(<BarWrapper mission={makeMission()} onAdjust={onAdjust} />);

        const bar = screen.getByTestId('mc-timer-bar');
        mockBarRect(bar);
        fireEvent.pointerDown(bar, { clientX: 50 });
        await act(async () => { vi.advanceTimersByTime(300); });
        fireEvent.pointerLeave(bar);
        await act(async () => { vi.advanceTimersByTime(600); });

        expect(onAdjust).not.toHaveBeenCalled();
        vi.useRealTimers();
    });

    it('clears long-press adjustment timeout when component unmounts mid-press to prevent memory leaks', async () => {
        vi.useFakeTimers();
        const clearTimeoutSpy = vi.spyOn(global, 'clearTimeout');
        const setTimeoutSpy = vi.spyOn(global, 'setTimeout');
        const onAdjust = vi.fn();
        
        const { unmount } = render(<BarWrapper mission={makeMission()} onAdjust={onAdjust} />);

        const bar = screen.getByTestId('mc-timer-bar');
        mockBarRect(bar);
        
        // Start long press
        fireEvent.pointerDown(bar, { clientX: 50 });
        
        // Verify timeout was set
        expect(setTimeoutSpy).toHaveBeenCalled();
        
        // Unmount BEFORE the 600ms longpress timeout triggers
        unmount();

        // Should have called clearTimeout to prevent state update on unmounted component
        expect(clearTimeoutSpy).toHaveBeenCalled();

        // Fast forward time just in case... mockAdjust should NOT be called since timeout was cleared
        await act(async () => {
            vi.advanceTimersByTime(1000);
        });

        expect(onAdjust).not.toHaveBeenCalled();
        vi.useRealTimers();
    });
});

// ── MissionOverlay wires up the gesture correctly ─────────────────────────────

describe('MissionOverlay — bar long-press routes to ADJUST_MISSION_END', () => {
    it('emoji span does NOT carry the old secret gesture (no mc-emoji-btn testid)', async () => {
        function Controls() {
            const dispatch = useMCDispatch();
            return (
                <button
                    data-testid="trigger-btn"
                    onClick={() => dispatch({ type: 'SET_ACTIVE_MISSION', phase: 'morning' })}
                >Trigger</button>
            );
        }
        render(
            <MCStoreProvider>
                <Controls />
                <MissionOverlay />
            </MCStoreProvider>,
        );
        await act(async () => { fireEvent.click(screen.getByTestId('trigger-btn')); });
        expect(screen.queryByTestId('mc-emoji-btn')).not.toBeInTheDocument();
    });

    it('bar onAdjust prop correctly calls handler with −5 for left-half long-press', async () => {
        // This verifies the full contract: bar renders → long-press left → onAdjust(-5)
        // The MissionOverlay wires handleBarAdjust → ADJUST_MISSION_END (tested separately
        // via the reducer unit tests). Here we confirm the component API end-to-end.
        vi.useFakeTimers();
        let dispatchedDelta: number | null = null;

        render(
            <MCStoreProvider>
                <MissionDepletingBar
                    mission={makeMission({ durationMins: 30 })}
                    allDone={false}
                    accent="#a57dff"
                    onAdjust={(delta) => { dispatchedDelta = delta; }}
                />
            </MCStoreProvider>,
        );

        const bar = screen.getByTestId('mc-timer-bar');
        mockBarRect(bar);
        fireEvent.pointerDown(bar, { clientX: 50 }); // left half
        await act(async () => { vi.advanceTimersByTime(650); });

        expect(dispatchedDelta).toBe(-5);
        vi.useRealTimers();
    });
});

