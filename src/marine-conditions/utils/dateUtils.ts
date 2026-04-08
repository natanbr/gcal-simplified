/**
 * Safe date parsing utilities for marine module.
 *
 * Open-Meteo returns: "2026-04-02T14:00"         (no tz suffix → local)
 * CHS returns:        "2026-04-02T14:30:00.000Z"  (UTC, with Z)
 * CHS also returns:   "2026-04-02 14:00"           (space instead of T)
 *
 * date-fns parseISO works with all valid ISO strings, but throws
 * RangeError: Invalid time value if passed undefined / null / empty / 
 * a non-ISO format. Use parseSafe() everywhere instead.
 */

import { parseISO, isValid, format } from 'date-fns';

const EPOCH = new Date(0); // Fallback sentinel — Jan 1 1970

/**
 * Parses an ISO-like date string safely.
 * Normalizes spaces to T, handles UTC Z suffix, local-only strings.
 * Returns EPOCH if input is missing or unparseable.
 */
export function parseSafe(dateStr: string | undefined | null): Date {
    if (!dateStr) return EPOCH;
    // Normalize: "2026-04-02 14:00" → "2026-04-02T14:00"
    const normalized = dateStr.replace(' ', 'T');
    const d = parseISO(normalized);
    return isValid(d) ? d : EPOCH;
}

/**
 * Returns true if the date string parses to a valid date (not epoch sentinel).
 */
export function isValidDateStr(dateStr: string | undefined | null): boolean {
    if (!dateStr) return false;
    const normalized = dateStr.replace(' ', 'T');
    return isValid(parseISO(normalized));
}

/**
 * Formats a date string safely. Returns fallback on parse error.
 */
export function formatSafe(
    dateStr: string | undefined | null,
    fmt: string,
    fallback = '--:--'
): string {
    const d = parseSafe(dateStr);
    if (d === EPOCH) return fallback;
    try {
        return format(d, fmt);
    } catch {
        return fallback;
    }
}
