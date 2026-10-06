// ============================================================
// Mission Control — mission times repaired at load, and their log line
// ------------------------------------------------------------
// Hydration repairs what would stop a mission from running or ending: a
// cleared "Auto-trigger at" field saved as '' (v0.0.42) or a NaN duration
// (saved as null) becomes the default (sanitizeMissionTimes, hhmm.ts), and a
// mission saved RUNNING with no readable duration gets its window's length
// (hydrateMissionTimes). Both moved the child's mission with no line and no
// attribution. The repairs stay in hydration (the first render must already
// have a real time, window and length); this names what they changed, read
// from their own before and after, never from a second copy of their rules,
// and MCStoreProvider writes one `system` line just after load, where the
// audit trail sees it.
// ⚠️  Internal to src/mission-control/ only.
// ============================================================

import type { ActivityLogEntry, MCSettings, Mission } from '../types';

type Reason = 'empty' | 'unreadable' | 'unreal';

export type MissionTimeRepair =
    | { kind: 'setting'; field: keyof MCSettings; reason: Reason; reset: unknown }
    | { kind: 'run'; phase: 'morning' | 'evening'; reset: number };

const LABEL: Partial<Record<keyof MCSettings, string>> = {
    morningStartsAt: 'the morning start time',
    eveningStartsAt: 'the evening start time',
    morningDurationMins: 'the morning duration',
    eveningDurationMins: 'the evening duration',
};

const BECAUSE: Record<Reason, string> = {
    empty: 'was empty',
    unreadable: 'could not be read',
    unreal: 'was not a real length',
};

const isDuration = (field: keyof MCSettings) => field.endsWith('DurationMins');

function reasonFor(field: keyof MCSettings, saved: unknown): Reason {
    if (saved === '') return 'empty';
    return isDuration(field) && typeof saved === 'number' && Number.isFinite(saved) ? 'unreal' : 'unreadable';
}

/**
 * Every setting the load's sanitizer changed, from its input (the saved
 * settings over the defaults) and its output. A field absent from an older
 * blob takes its default before the sanitizer runs, so it is not a repair.
 */
export function settingRepairs(before: MCSettings, after: MCSettings): MissionTimeRepair[] {
    const fields = new Set([...Object.keys(before), ...Object.keys(after)]) as Set<keyof MCSettings>;
    return [...fields]
        .filter(field => !Object.is(before[field], after[field]))
        .map(field => ({ kind: 'setting', field, reason: reasonFor(field, before[field]), reset: after[field] }));
}

/** The length hydration gave a mission saved running without one, or nothing. */
export function runLengthRepair(before: Mission, after: Mission): MissionTimeRepair[] {
    const phase = after.phase;
    if (phase === 'none' || before.durationMins === after.durationMins || after.durationMins === undefined) return [];
    return [{ kind: 'run', phase, reset: after.durationMins }];
}

function describe(r: MissionTimeRepair): string {
    if (r.kind === 'run') return `the running ${r.phase} mission had no length, set to its window's ${r.reset} min`;
    const reset = isDuration(r.field) ? `${String(r.reset)} min` : String(r.reset);
    return `${LABEL[r.field] ?? r.field} ${BECAUSE[r.reason]}, reset to ${reset}`;
}

/**
 * One line for everything reset at this load, or null when nothing was. Built
 * by hand: no action describes it, so createLogEntry never derives it; it logs
 * no action, so the shield lock, which refuses actions, has nothing to re-check.
 * Written once: the provider's ref is the guard (ADD_LOG's own de-dup only
 * drops a replay of the newest entry).
 */
export function missionTimeRepairLogEntry(repairs: readonly MissionTimeRepair[], instantIso: string): ActivityLogEntry | null {
    if (repairs.length === 0) return null;
    return {
        id: `mission-time-repair-${instantIso}`,
        timestamp: instantIso,
        icon: '🔧',
        message: `Mission settings repaired at startup: ${repairs.map(describe).join('; ')}`,
        type: 'system',
        colorKey: 'system',
        source: 'system',
    };
}
