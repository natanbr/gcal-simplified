// ============================================================
// Mission Control — a mission time repaired at load, and its log line
// ------------------------------------------------------------
// A cleared "Auto-trigger at" field saved as '' (v0.0.42), or a NaN duration
// (saved as null), is reset to the default at load by sanitizeMissionTimes
// (hhmm.ts), so the mission runs at all. That repair moved the child's mission
// with no line and no attribution. The repair stays in hydration (the first
// render must already have a real time and window); this names what it reset,
// and MCStoreProvider writes one `system` line after load
// (useMissionTimeRepairLog), where the audit trail sees it.
// ⚠️  Internal to src/mission-control/ only.
// ============================================================

import type { ActivityLogEntry, MCSettings } from '../types';
import { isValidDurationMins, isValidHhmm } from './hhmm';

const FIELDS = ['morningStartsAt', 'eveningStartsAt', 'morningDurationMins', 'eveningDurationMins'] as const;
type MissionTimeField = typeof FIELDS[number];

/** empty: a cleared time ('') · unreadable: not a time or a number (JSON saves NaN as null) · unreal: a number that is no length. */
export interface MissionTimeRepair {
    field: MissionTimeField;
    reason: 'empty' | 'unreadable' | 'unreal';
    reset: string | number;
}

const LABEL: Record<MissionTimeField, string> = {
    morningStartsAt: 'the morning start time',
    eveningStartsAt: 'the evening start time',
    morningDurationMins: 'the morning duration',
    eveningDurationMins: 'the evening duration',
};

const BECAUSE: Record<MissionTimeRepair['reason'], string> = {
    empty: 'was empty',
    unreadable: 'could not be read',
    unreal: 'was not a real length',
};

function isStartField(field: MissionTimeField): boolean {
    return field === 'morningStartsAt' || field === 'eveningStartsAt';
}

/**
 * The fields of the SAVED settings that hydration reset, with what it reset them
 * to (read from `repaired`, the settings it produced). A field absent from the
 * blob is not a repair: an older blob simply takes the default, as every new
 * setting does.
 */
export function missionTimeRepairs(saved: Partial<MCSettings>, repaired: MCSettings): MissionTimeRepair[] {
    return FIELDS.flatMap((field): MissionTimeRepair[] => {
        if (!(field in saved)) return [];
        const value: unknown = saved[field];
        if (isStartField(field) ? isValidHhmm(value) : isValidDurationMins(value)) return [];
        const reason = value === '' ? 'empty'
            : typeof value === 'number' && Number.isFinite(value) && !isStartField(field) ? 'unreal'
            : 'unreadable';
        return [{ field, reason, reset: repaired[field] }];
    });
}

/**
 * One line for every field reset at this load, or null when nothing was.
 * Built by hand (no action describes it, so createLogEntry never derives it);
 * it logs no action, so the shield lock, which refuses actions, has nothing to
 * re-check. The id is derived from the load instant, so a replay is dropped by
 * ADD_LOG's own de-dup.
 */
export function missionTimeRepairLogEntry(repairs: readonly MissionTimeRepair[], instantIso: string): ActivityLogEntry | null {
    if (repairs.length === 0) return null;
    const parts = repairs.map(r =>
        `${LABEL[r.field]} ${BECAUSE[r.reason]}, reset to ${isStartField(r.field) ? r.reset : `${r.reset} min`}`);
    return {
        id: `mission-time-repair-${instantIso}`,
        timestamp: instantIso,
        icon: '🔧',
        message: `Mission settings repaired at startup: ${parts.join('; ')}`,
        type: 'system',
        colorKey: 'system',
        source: 'system',
    };
}
