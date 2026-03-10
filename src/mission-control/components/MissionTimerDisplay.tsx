import { useEffect, useRef } from 'react';
import React from 'react';
import { motion } from 'framer-motion';

import { useLiveClock } from '../hooks/useLiveClock';
import type { Mission } from '../types';

interface MissionTimerDisplayProps {
    mission: Mission | null;
    allDone: boolean;
    onTimerExpiredWithAllDone: () => void;
}

export function MissionTimerDisplay({ mission, allDone, onTimerExpiredWithAllDone }: MissionTimerDisplayProps) {
    const now = useLiveClock();

    const remainingSecs = (() => {
        if (!mission || !mission.startedAt || mission.durationMins == null) return null;
        const endMs = new Date(mission.startedAt).getTime() + mission.durationMins * 60 * 1000;
        return Math.floor((endMs - now.getTime()) / 1000);
    })();

    const timerExpired = remainingSecs !== null && remainingSecs <= 0;
    const timerCritical = remainingSecs !== null && remainingSecs > 0 && remainingSecs < 5 * 60; // < 5 min
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
        if (timerExpired && allDone) {
            onTimerExpiredWithAllDone();
        }
    }, [timerExpired, allDone, onTimerExpiredWithAllDone]);

    return (
        <motion.span
            animate={
                allDone
                    ? {} // all done — no animation, stays green
                    : timerCritical
                    ? {
                        scale: [1, 1.06, 1],
                        color: ['#e74c3c', '#c0392b', '#e74c3c'],
                        // ⚡ Bolt Performance: Place infinite transitions inside the animate object
                        // to prevent Framer Motion from running a constant 60fps loop at the root level.
                        transition: { repeat: Infinity, duration: 1 }
                    }
                    : {}
            }
            style={{
                fontSize: 42,
                fontWeight: 900,
                fontVariantNumeric: 'tabular-nums',
                fontFamily: "'Nunito', sans-serif",
                lineHeight: 1,
                letterSpacing: '-0.02em',
                textAlign: 'center',
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
        </motion.span>
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

    const remainingSecs = (() => {
        if (!mission || !mission.startedAt || mission.durationMins == null) return null;
        const endMs = new Date(mission.startedAt).getTime() + mission.durationMins * 60 * 1000;
        return Math.floor((endMs - now.getTime()) / 1000);
    })();

    const timerExpired = remainingSecs !== null && remainingSecs <= 0;
    const timerCritical = remainingSecs !== null && remainingSecs > 0 && remainingSecs < 5 * 60; // < 5 min

    if (remainingSecs === null || timerExpired) return null;

    // ── Fixed pct calculation ────────────────────────────────────────────────
    // BUG (old): pct = remainingSecs / (durationMins * 60)
    //   → when durationMins changes, both numerator & denominator jump, causing
    //     the bar to go the wrong direction (appears fuller after reducing time).
    //
    // FIX: pct = 1 - elapsed / totalMs, anchored on startedAt.
    //   elapsed is stable regardless of durationMins adjustments, so the bar
    //   correctly shows how much of the NEW total has been consumed already.
    const totalMs  = (mission!.durationMins ?? 0) * 60 * 1000;
    const elapsedMs = now.getTime() - new Date(mission!.startedAt!).getTime();
    const pct = totalMs > 0 ? Math.max(0, Math.min(100, (1 - elapsedMs / totalMs) * 100)) : 0;

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
            <motion.div
                data-testid="mc-bar-fill"
                animate={{ width: `${pct}%` }}
                transition={{ duration: 1, ease: 'linear' }}
                style={{
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
