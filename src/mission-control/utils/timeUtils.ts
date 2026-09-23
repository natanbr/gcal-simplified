// ============================================================
// Mission Control - Time Formatting Helpers
// Pure functions for formatting date/time remaining.
// Lives inside mission-control because privilege suspension is an MC concept
// and nothing in the calendar app uses it. Importing it from src/utils/ broke
// the isolation contract (guarded by src/__tests__/mission-control-isolation.test.ts).
// ============================================================

/**
 * The one reading of a suspension's end time: epoch ms, or null for anything
 * that is not a readable date string. A number is refused on purpose:
 * `Date.parse(2030)` is the year 2030 but `new Date(2030)` is 2030 ms after
 * 1970, and the phone payload is untrusted JSON. When two readers parsed it
 * two ways, the card showed hazard stripes with no countdown badge. Every
 * reader of `suspendedUntil` goes through this.
 */
export function parseSuspensionEnd(value: unknown): number | null {
    if (typeof value !== 'string') return null;
    const ms = Date.parse(value);
    return Number.isFinite(ms) ? ms : null;
}

/**
 * Formats the remaining time for a suspended privilege until it expires.
 * Returns e.g. "3d left", "5h left", "45m left", or null if not suspended/expired.
 */
export function formatSuspendedRemainingTime(suspendedUntil: string | null): string | null {
    const endMs = parseSuspensionEnd(suspendedUntil);
    if (endMs === null) return null;
    const diff = endMs - Date.now();
    if (diff <= 0) return null;
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days  = Math.floor(hours / 24);
    if (days >= 1) return `${days}d left`;
    if (hours >= 1) return `${hours}h left`;
    const mins = Math.floor(diff / (1000 * 60));
    return `${mins}m left`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const HOUR_MS = 60 * 60 * 1000;
const plural = (n: number, unit: string) => `${n} ${unit}${n === 1 ? '' : 's'}`;

/**
 * A log-line date, e.g. "23 Sep 10:00", in local time. Month names are fixed
 * rather than locale-formatted so the line reads the same on every machine.
 */
export function formatLogStamp(ms: number): string {
    const d = new Date(ms);
    const hhmm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    return `${d.getDate()} ${MONTHS[d.getMonth()]} ${hhmm}`;
}

/**
 * The activity-log phrase for a new suspension, e.g. "for 1 day (until 23 Sep 10:00)".
 * Rounded to the hour, because the phone computes the end on its own clock and
 * the action is stamped on arrival here.
 */
export function formatSuspensionLength(endMs: number, nowMs: number): string {
    const hours = Math.max(1, Math.round((endMs - nowMs) / HOUR_MS));
    const length = hours >= 24 ? plural(Math.round(hours / 24), 'day') : plural(hours, 'hour');
    return `for ${length} (until ${formatLogStamp(endMs)})`;
}
