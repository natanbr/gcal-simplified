// ============================================================
// Mission Control — the Settings footer's reason for refusing Save
// Kept out of TimeInput.tsx: a component file exporting a plain function
// breaks React Fast Refresh (react-refresh/only-export-components).
// ⚠️  Internal to src/mission-control/ only.
// ============================================================

import { isValidHhmm } from '../store/hhmm';

/** Why Save is refused, naming the empty time(s) and where they are; null when both are set. */
export function missingTimesHint(morningStartsAt: string, eveningStartsAt: string): string | null {
    const missing = [
        ...(isValidHhmm(morningStartsAt) ? [] : ['Morning']),
        ...(isValidHhmm(eveningStartsAt) ? [] : ['Evening']),
    ];
    if (missing.length === 0) return null;
    const times = missing.length === 1 ? `${missing[0]} auto-trigger time` : 'Morning and Evening auto-trigger times';
    return `Set the ${times} (🕒 Missions Time tab) to save.`;
}
