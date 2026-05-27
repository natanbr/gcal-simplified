// ============================================================
// Shared Time Formatting Helpers
// Pure functions for formatting date/time remaining.
// ============================================================

/**
 * Formats the remaining time for a suspended privilege until it expires.
 * Returns e.g. "3d left", "5h left", "45m left", or null if not suspended/expired.
 */
export function formatSuspendedRemainingTime(suspendedUntil: string | null): string | null {
    if (!suspendedUntil) return null;
    const diff = new Date(suspendedUntil).getTime() - Date.now();
    if (diff <= 0) return null;
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days  = Math.floor(hours / 24);
    if (days >= 1) return `${days}d left`;
    if (hours >= 1) return `${hours}h left`;
    const mins = Math.floor(diff / (1000 * 60));
    return `${mins}m left`;
}
