// ============================================================
// Mission Control — Remote Connection Indicator
// Small brow chip showing whether the phone remote is online.
// Extracted from MissionControl.tsx.
// ⚠️  Internal to src/mission-control/ only.
// ============================================================

import { useEffect, useRef, useState } from 'react';
import { useRemoteStatus } from '../contexts/RemoteStatusContext';

/**
 * A status change replays the pulse (3 x 2 s, mc.css 9) only if the last one
 * started this long ago. A remote that keeps reconnecting (Supabase retries
 * about every 10 s) would otherwise pulse most of the time, and a pulsing dot
 * costs about a fifth of a CPU core while it runs. The colour still changes at
 * once. 30 s caps the pulse at a fifth of the time under any flapping.
 */
export const REMOTE_PULSE_GAP_MS = 30_000;

/**
 * A new key whenever the dot should pulse again. Mounting the dot is a pulse.
 * Monotonic time: a wall clock stepped backwards would stop the pulses.
 */
function usePulseKey(status: string): number {
    const [pulseKey, setPulseKey] = useState(0);
    const lastPulseAt = useRef<number | null>(null);
    useEffect(() => {
        const now = performance.now();
        if (lastPulseAt.current !== null && now - lastPulseAt.current < REMOTE_PULSE_GAP_MS) return;
        if (lastPulseAt.current !== null) setPulseKey(k => k + 1);
        lastPulseAt.current = now;
    }, [status]);
    return pulseKey;
}

export function RemoteIndicator() {
    const status = useRemoteStatus();
    const isOnline = status === 'online';
    const pulseKey = usePulseKey(status);
    const label = isOnline ? 'Remote: connected' : 'Remote: offline';

    return (
        <div
            title={label}
            style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                background: 'rgba(255, 255, 255, 0.03)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: 12,
                padding: '6px 12px',
                fontSize: 13,
                fontWeight: 800,
                color: 'var(--mc-text-muted)',
            }}
        >
            {/* Connected: a filled green dot. Offline: a hollow red ring, so the
                two differ in shape, not only in colour. The pulse is finite and
                must never loop: a loop here cost 20-25 % of one CPU core for as
                long as Mission Control was open (docs/performance.md, 2026-10-04). */}
            <span
                key={pulseKey}
                role="img"
                aria-label={label}
                data-testid="mc-remote-dot"
                data-status={status}
                className="mc-anim-remote-pulse"
                style={{
                    width: 8,
                    height: 8,
                    boxSizing: 'border-box',
                    borderRadius: '50%',
                    backgroundColor: isOnline ? 'var(--mc-green)' : 'transparent',
                    border: isOnline ? 'none' : '2px solid var(--mc-red)',
                    boxShadow: isOnline ? '0 0 8px var(--mc-green)' : 'none',
                }}
            />
            <span style={{ color: 'var(--mc-text)' }}>Remote</span>
        </div>
    );
}
