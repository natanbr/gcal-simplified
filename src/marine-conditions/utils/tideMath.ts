import { addMinutes, format as formatDate } from "date-fns";
import { parseSafe } from "./dateUtils";

/**
 * Finds the vertex of a parabola passing through three points (-1, y1), (0, y2), (1, y3)
 * @returns The offset in hours from the middle point (index 0).
 */
export function findVertexOffset(y1: number, y2: number, y3: number): number {
    const denom = 2 * (y1 + y3 - 2 * y2);
    if (Math.abs(denom) < 0.0001) return 0;
    return -(y3 - y1) / denom;
}

/**
 * Interpolates a precise time for a peak/trough in a time series.
 * @param times - Array of ISO strings
 * @param values - Array of values (speeds, heights, etc.)
 * @param index - The index of the local extreme in the array
 * @returns ISO string of the interpolated time
 */
export function interpolateExtremeTime(times: string[], values: number[], index: number): string {
    if (index <= 0 || index >= values.length - 1) return times[index];

    const y1 = values[index - 1];
    const y2 = values[index];
    const y3 = values[index + 1];

    const offsetHours = findVertexOffset(y1, y2, y3);

    // Clamp offset to +/- 0.5 hours to stay within the peak's neighborhood
    const clampedOffset = Math.max(-0.5, Math.min(0.5, offsetHours));

    const baseTime = parseSafe(times[index]);
    if (!baseTime || baseTime.getTime() === 0) return times[index]; // guard bad parse
    const interpolatedTime = addMinutes(baseTime, Math.round(clampedOffset * 60));

    // Return in same format as input (usually ISO-like local string YYYY-MM-DDTHH:mm)
    return formatDate(interpolatedTime, "yyyy-MM-dd'T'HH:mm");
}

/**
 * Derives smooth hourly tide heights from High/Low tide extremes (hilo data)
 * using the standard cosine interpolation method used in tide tables.
 *
 * Formula (for each pair of consecutive extremes h0 at t0 → h1 at t1):
 *   h(t) = (h0 + h1) / 2  +  (h0 - h1) / 2  *  cos( π * (t - t0) / (t1 - t0) )
 *
 * This is the same approach used by CHS and NOAA for tidal publishing.
 * Use as a fallback when the CHS wlp hourly series fetch fails (returns all zeros).
 *
 * @param hilo  - Array of { time, value, type } from TideData.hilo
 * @param hourlyTimes - Array of ISO-like time strings (from Open-Meteo hourly.time)
 * @returns Array of tide heights (metres), one per hourly slot
 */
export function cosineTideFromHilo(
    hilo: { time: string; value: number; type: string }[],
    hourlyTimes: string[]
): number[] {
    if (!hilo?.length || !hourlyTimes?.length) return hourlyTimes.map(() => 0);

    // Only use High/Low tide events that have a value
    const extremes = hilo
        .filter(h =>
            (h.type === 'High Tide' || h.type === 'Low Tide' ||
             h.type === 'High' || h.type === 'Low') &&
            typeof h.value === 'number' && isFinite(h.value)
        )
        .map(h => ({ ms: parseSafe(h.time).getTime(), value: h.value }))
        .filter(h => h.ms !== 0) // discard parse failures
        .sort((a, b) => a.ms - b.ms);

    if (extremes.length < 2) return hourlyTimes.map(() => extremes[0]?.value ?? 0);

    return hourlyTimes.map(t => {
        const ts = parseSafe(t).getTime();
        if (ts === 0) return 0;

        // Before first known extreme: hold first value
        if (ts <= extremes[0].ms) return extremes[0].value;
        // After last known extreme: hold last value
        if (ts >= extremes[extremes.length - 1].ms) return extremes[extremes.length - 1].value;

        // Find surrounding pair
        let i = 0;
        while (i < extremes.length - 1 && extremes[i + 1].ms <= ts) i++;

        const { ms: t0, value: h0 } = extremes[i];
        const { ms: t1, value: h1 } = extremes[i + 1];

        const fraction = (ts - t0) / (t1 - t0); // 0..1
        return (h0 + h1) / 2 + (h0 - h1) / 2 * Math.cos(Math.PI * fraction);
    });
}
