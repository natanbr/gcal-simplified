import { useEffect, useRef, useMemo } from 'react';
import React from 'react';

import { useLiveClock } from '../hooks/useLiveClock';
import type { Mission } from '../types';

interface MissionTimerDisplayProps {
    mission: Mission | null;
    allDone: boolean;
    onTimerExpiredWithAllDone: () => void;
    onTimerExpiredInfo?: () => void;
}

export function MissionTimerDisplay({ mission, allDone, onTimerExpiredWithAllDone, onTimerExpiredInfo }: MissionTimerDisplayProps) {
    const now = useLiveClock();

    // ⚡ Bolt Performance: Memoize parsing of mission.startedAt to avoid new Date() allocations every second
    const startMs = useMemo(() => {
        if (!mission?.startedAt) return null;
        return mission.startedAt instanceof Date ? mission.startedAt.getTime() : new Date(mission.startedAt).getTime();
    }, [mission?.startedAt]);

    // ⚡ Bolt Performance: Consolidate timer metric calculations inside useMemo
    const timerMetrics = (() => {
        if (startMs === null || mission?.durationMins == null) {
            return { remainingSecs: null, timerExpired: false, timerCritical: false };
        }
        const endMs = startMs + mission.durationMins * 60 * 1000;
        const remaining = Math.floor((endMs - now.getTime()) / 1000);
        return {
            remainingSecs: remaining,
            timerExpired: remaining <= 0,
            timerCritical: remaining > 0 && remaining < 5 * 60,
        };
    })();
    const { remainingSecs, timerExpired, timerCritical } = timerMetrics;
    const timerDisplay = (() => {
        if (remainingSecs === null) return '--:--';
        if (timerExpired) return "Time's up! \uD83D\uDD14";
        const s = Math.abs(remainingSecs);
        const totalMins = Math.floor(s / 60);
        const sec = s % 60;
        if (totalMins >= 60) {
            // Show  "Xh Ym" for long timers
            const h = Math.floor(totalMins / 60);
            const m = totalMins % 60;
            return m > 0 ? `${h}h ${m}m` : `${h}h`;
        }
        return `${String(totalMins).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
    })();

    // Auto-collect when timer expires with all tasks done
    useEffect(() => {
        if (timerExpired) {
            if (allDone) onTimerExpiredWithAllDone();
            else if (onTimerExpiredInfo) onTimerExpiredInfo();
        }
    }, [timerExpired, allDone, onTimerExpiredWithAllDone, onTimerExpiredInfo]);

    return (
        <span
            className={!allDone && timerCritical ? "mc-anim-timer-critical" : ""}
            style={{
                fontSize: 42,
                fontWeight: 900,
                fontVariantNumeric: 'tabular-nums',
                fontFamily: "'Nunito', sans-serif",
                lineHeight: 1,
                letterSpacing: '-0.02em',
                textAlign: 'center',
                display: 'inline-block',
                color: allDone
                    ? '#27ae60'         // green — all tasks complete
                    : timerExpired
                    ? '#e74c3c'
                    : timerCritical
                    ? '#e67e22'
                    : 'var(--mc-text)',
            }}
        >
            {timerDisplay}
        </span>
    );
}

// ── Depleting Bar Display ───────────────────────────────────────────────────────────
interface MissionDepletingBarProps {
    mission: Mission | null;
    allDone: boolean;
    accent: string;
    /** Called when the user long-presses the bar. delta > 0 = add time, < 0 = reduce. */
    onAdjust?: (deltaMinutes: number) => void;
}

export function MissionDepletingBar({ mission, allDone, accent, onAdjust }: MissionDepletingBarProps) {
    const now = useLiveClock();
    const longPressRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // ⚡ Bolt Performance: Memoize parsing of mission.startedAt to avoid new Date() allocations every second
    const startMs = useMemo(() => {
        if (!mission?.startedAt) return null;
        return mission.startedAt instanceof Date ? mission.startedAt.getTime() : new Date(mission.startedAt).getTime();
    }, [mission?.startedAt]);

    // ⚡ Bolt Performance: Consolidate timer metric calculations
    const timerMetrics = (() => {
        if (startMs === null || mission?.durationMins == null) {
            return { remainingSecs: null, timerExpired: false, timerCritical: false, pct: 0 };
        }
        const endMs = startMs + mission.durationMins * 60 * 1000;
        const remaining = Math.floor((endMs - now.getTime()) / 1000);

        // ── Fixed pct calculation ────────────────────────────────────────────────
        // BUG (old): pct = remainingSecs / (durationMins * 60)
        //   → when durationMins changes, both numerator & denominator jump, causing
        //     the bar to go the wrong direction (appears fuller after reducing time).
        //
        // FIX: pct = 1 - elapsed / totalMs, anchored on startedAt.
        //   elapsed is stable regardless of durationMins adjustments, so the bar
        //   correctly shows how much of the NEW total has been consumed already.
        const totalMs = mission.durationMins * 60 * 1000;
        const elapsedMs = now.getTime() - startMs;
        const pctValue = totalMs > 0 ? Math.max(0, Math.min(100, (1 - elapsedMs / totalMs) * 100)) : 0;

        return {
            remainingSecs: remaining,
            timerExpired: remaining <= 0,
            timerCritical: remaining > 0 && remaining < 5 * 60,
            pct: pctValue
        };
    })();
    const { remainingSecs, timerExpired, timerCritical, pct } = timerMetrics;

    // ── Long-press handlers ──────────────────────────────────────────────────
    const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
        if (!onAdjust) return;
        const rect = e.currentTarget.getBoundingClientRect();
        const isLeftHalf = e.clientX < rect.left + rect.width / 2;
        longPressRef.current = setTimeout(() => {
            onAdjust(isLeftHalf ? -5 : 5);
            longPressRef.current = null;
        }, 600);
    };

    const handlePointerUp = () => {
        if (longPressRef.current) {
            clearTimeout(longPressRef.current);
            longPressRef.current = null;
        }
    };

    useEffect(() => {
        return () => {
            if (longPressRef.current) {
                clearTimeout(longPressRef.current);
            }
        };
    }, []);

    if (remainingSecs === null || timerExpired) return null;

    return (
        <div
            data-testid="mc-timer-bar"
            onPointerDown={handlePointerDown}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerUp}
            title="Long-press left half to reduce 5 min · Long-press right half to add 5 min"
            style={{
                height: 42,
                background: 'rgba(160,150,230,0.18)',
                overflow: 'hidden',
                margin: '0 400px',
                borderRadius: 99,
                cursor: onAdjust ? 'pointer' : 'default',
            }}
        >
            <div
                data-testid="mc-bar-fill"
                style={{
                    width: `${pct}%`,
                    transition: 'width 1s linear, background 1s ease',
                    height: '100%',
                    background: allDone
                        ? 'linear-gradient(90deg,#27ae60,#2ecc71)'
                        : timerCritical
                        ? 'linear-gradient(90deg,#e74c3c,#c0392b)'
                        : `linear-gradient(90deg,${accent},${accent}bb)`,
                }}
            />
        </div>
    );
}
