// ============================================================
// Mission Control — Activity Log Source Metadata + Daily Roll-up
// ------------------------------------------------------------
// Pure helpers, no React, so the summary math is unit-testable on its own.
// ⚠️  Internal to src/mission-control/ only.
// ============================================================

import { sourceOf, type LogSource } from '../../store/activityLog';
import { getLocalDateString } from '../../store/behaviorSync';
import type { ActivityLogEntry } from '../../types';

// Single source of truth lives in store/activityLog.ts so the durable audit
// trail and this view can never disagree; re-exported for existing consumers.
export { sourceOf };
export type { LogSource };

export interface SourceMeta {
    icon: string;
    label: string;
    /** Tooltip shown on the badge — plain language, for a parent, not a dev. */
    title: string;
    color: string;
    bg: string;
}

export const SOURCE_META: Record<LogSource, SourceMeta> = {
    local: {
        icon: '👤',
        label: 'Here',
        title: 'Someone pressed this on the computer',
        color: '#334155',
        bg: 'rgba(51,65,85,0.08)',
    },
    remote: {
        icon: '📱',
        label: 'Phone',
        title: 'Sent from the phone remote',
        color: '#7c3aed',
        bg: 'rgba(124,58,237,0.10)',
    },
    scheduler: {
        icon: '⏰',
        label: 'Clock',
        title: 'Fired automatically at its scheduled time',
        color: '#0891b2',
        bg: 'rgba(8,145,178,0.10)',
    },
    auto: {
        icon: '⚙️',
        label: 'Auto',
        title: 'The app did this on its own (mood gauge, timers)',
        color: '#ca8a04',
        bg: 'rgba(202,138,4,0.12)',
    },
    system: {
        icon: '💻',
        label: 'System',
        title: 'App lifecycle (startup, resume, update)',
        color: '#64748b',
        bg: 'rgba(100,116,139,0.10)',
    },
};


export interface DaySummary {
    /** Bank tokens gained today (sum of positive deltas). */
    earned: number;
    /** Bank tokens spent today (absolute sum of negative deltas). */
    spent: number;
    /** Net bank movement today. */
    net: number;
    /** Event count per source. */
    bySource: Record<LogSource, number>;
    /** Total events today. */
    total: number;
    /** Token movements today with no human behind them (clock or app). */
    unattended: number;
    /** Cheat-trap trips today. */
    cheatAttempts: number;
}

const EMPTY_BY_SOURCE = (): Record<LogSource, number> =>
    ({ local: 0, remote: 0, scheduler: 0, auto: 0, system: 0 });

/** Same canonical day boundary as the token economy (getLocalDateString) —
 *  the summary strip must count the same "today" the grants do. */
function isSameLocalDay(iso: string, reference: Date): boolean {
    return getLocalDateString(new Date(iso)) === getLocalDateString(reference);
}

/**
 * Rolls today's entries into the numbers a parent actually wants at a glance:
 * how many tokens moved, and how many of those movements nobody was present for.
 */
export function summariseDay(logs: ActivityLogEntry[], reference: Date = new Date()): DaySummary {
    const summary: DaySummary = {
        earned: 0,
        spent: 0,
        net: 0,
        bySource: EMPTY_BY_SOURCE(),
        total: 0,
        unattended: 0,
        cheatAttempts: 0,
    };

    for (const log of logs) {
        if (!isSameLocalDay(log.timestamp, reference)) continue;

        summary.total += 1;
        const source = sourceOf(log);
        summary.bySource[source] += 1;

        if (log.type === 'cheat-attempt') summary.cheatAttempts += 1;

        const delta = log.delta ?? 0;
        if (delta > 0) summary.earned += delta;
        else if (delta < 0) summary.spent += -delta;

        if (delta !== 0 && (source === 'scheduler' || source === 'auto')) {
            summary.unattended += 1;
        }
    }

    summary.net = summary.earned - summary.spent;
    return summary;
}
