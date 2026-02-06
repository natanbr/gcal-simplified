import { addMinutes, parseISO, format as formatDate } from "date-fns";

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

    const baseTime = parseISO(times[index]);
    const interpolatedTime = addMinutes(baseTime, Math.round(clampedOffset * 60));

    // Return in same format as input (usually ISO-like local string YYYY-MM-DDTHH:mm)
    return formatDate(interpolatedTime, "yyyy-MM-dd'T'HH:mm");
}
