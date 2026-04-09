import { addMinutes, format as formatDate, differenceInMinutes, isValid } from "date-fns";
import { interpolateExtremeTime } from "./tideMath";
import { SLACK_THRESHOLD, DAYLIGHT_BUFFER_MINS } from "../config";
import { parseSafe } from "./dateUtils";

export interface SlackWindow {
    slackTime: string;
    windowStart: string;
    windowEnd: string;
    duration: number; // minutes
    tideHeight: number;
    isHighTide: boolean;
    currentSpeed: number;
}

const FALLBACK_FORMAT = "yyyy-MM-dd'T'HH:mm";

/**
 * Minimum dive window duration in minutes.
 * Windows shorter than this are discarded — they represent data artifacts
 * from hourly CHS wcp resolution where slack barely clips the threshold.
 */
const MIN_WINDOW_DURATION_MINS = 30;

/**
 * Maximum half-width of any single slack window, in CHS hourly bins.
 * For a 0.5 kn threshold, 4 hours (= 4 bins at 1h resolution) is the
 * physical upper limit before current climbs noticeably even at Race Passage.
 * This guards the first/last slack at dataset edges from over-expanding.
 */
const MAX_WINDOW_HALF_BINS = 4;

/**
 * Safely format a Date. If the Date is invalid, returns the raw ISO
 * from the source index as a fallback so we never pass Invalid Date to formatDate.
 */
function safeFormat(d: Date, fallback: Date): string {
    if (isValid(d)) return formatDate(d, FALLBACK_FORMAT);
    if (isValid(fallback)) return formatDate(fallback, FALLBACK_FORMAT);
    return '';
}

/**
 * Linear interpolation between two time points based on speed crossing a threshold.
 * Guards against division by zero (equal speeds) by snapping to t1.
 */
function interpolateTime(
    t1: Date, t2: Date,
    v1: number, v2: number,
    threshold: number
): Date {
    const dv = v2 - v1;
    if (Math.abs(dv) < 1e-9) return t1; // speeds equal → snap to boundary point
    const fraction = (threshold - v1) / dv;
    const totalDiff = differenceInMinutes(t2, t1);
    const result = addMinutes(t1, Math.round(fraction * totalDiff));
    return isValid(result) ? result : t1;
}

/**
 * Linearly interpolates current speed at a target time from the wcp time series.
 *
 * Used to compute currentAtStart and currentAtEnd for each DiveWindow:
 *   - Finds the surrounding hourly bracket [times[i], times[i+1]]
 *   - Linearly interpolates speed based on the target's fraction within that bracket
 *   - Returns 0 if the target is outside the series range (safe default)
 *
 * This is necessary because windows are defined by interpolated threshold-crossing
 * boundaries, not by exact hourly grid points.
 */
export function interpolateSpeedAt(times: string[], speeds: number[], targetIso: string): number {
    const target = parseSafe(targetIso);
    if (!isValid(target)) return 0;

    // Find surrounding bracket
    for (let i = 0; i < times.length - 1; i++) {
        const t1 = parseSafe(times[i]);
        const t2 = parseSafe(times[i + 1]);
        if (!isValid(t1) || !isValid(t2)) continue;

        if (target >= t1 && target <= t2) {
            const totalMs = t2.getTime() - t1.getTime();
            if (totalMs <= 0) return speeds[i] ?? 0;
            const fraction = (target.getTime() - t1.getTime()) / totalMs;
            return (speeds[i] ?? 0) + fraction * ((speeds[i + 1] ?? 0) - (speeds[i] ?? 0));
        }
    }

    // Out of range — clamp to nearest
    if (target < parseSafe(times[0])) return speeds[0] ?? 0;
    return speeds.at(-1) ?? 0;
}


/**
 * Calculate slack tide windows where current speed is < SLACK_THRESHOLD kn.
 *
 * Hydrographic constraints enforced here:
 *  - Minimum window duration: MIN_WINDOW_DURATION_MINS (30). Shorter windows
 *    are CHS hourly resolution artifacts — not real diver-usable slack periods.
 *  - Daylight rule: window must START before (sunset - DAYLIGHT_BUFFER_MINS).
 *    A 30-min buffer ensures at least 30 min of daylight within the window.
 *    Per CHS safety protocols, night diving is treated as zero-visibility.
 */
export function calculateSlackWindows(
    times: string[],
    speeds: number[],
    tideHeights: number[],
    slackIndices: number[],
    sunrises?: string[],
    sunsets?: string[]
): SlackWindow[] {
    const windows: SlackWindow[] = [];

    for (let si = 0; si < slackIndices.length; si++) {
        const slackIdx = slackIndices[si];

        // ── Territory bounds: each slack owns the space up to the midpoint
        //    between itself and its neighbours. This prevents adjacent calm
        //    periods from merging into one enormous window (the 12–17h bug).
        const prevSlackIdx = si > 0 ? slackIndices[si - 1] : 0;
        const nextSlackIdx = si < slackIndices.length - 1
            ? slackIndices[si + 1]
            : speeds.length - 1;

        const leftBound  = si > 0
            ? Math.floor((prevSlackIdx + slackIdx) / 2)
            : Math.max(0, slackIdx - MAX_WINDOW_HALF_BINS);
        const rightBound = si < slackIndices.length - 1
            ? Math.ceil((slackIdx + nextSlackIdx) / 2)
            : Math.min(speeds.length - 1, slackIdx + MAX_WINDOW_HALF_BINS);

        // ── Find boundary where speed drops below threshold (start) ───────────
        let startIdx = slackIdx;
        while (startIdx > leftBound && speeds[startIdx - 1] < SLACK_THRESHOLD) {
            startIdx--;
        }

        let preciseStart: Date;
        if (startIdx > leftBound) {
            const t1 = parseSafe(times[startIdx - 1]);
            const t2 = parseSafe(times[startIdx]);
            preciseStart = isValid(t1) && isValid(t2)
                ? interpolateTime(t1, t2, speeds[startIdx - 1], speeds[startIdx], SLACK_THRESHOLD)
                : parseSafe(times[startIdx]);
        } else {
            preciseStart = parseSafe(times[leftBound]);
        }

        // ── Find boundary where speed rises above threshold (end) ─────────────
        let endIdx = slackIdx;
        while (endIdx < rightBound && speeds[endIdx + 1] < SLACK_THRESHOLD) {
            endIdx++;
        }

        let preciseEnd: Date;
        if (endIdx < rightBound) {
            const t1 = parseSafe(times[endIdx]);
            const t2 = parseSafe(times[endIdx + 1]);
            preciseEnd = isValid(t1) && isValid(t2)
                ? interpolateTime(t1, t2, speeds[endIdx], speeds[endIdx + 1], SLACK_THRESHOLD)
                : parseSafe(times[endIdx]);
        } else {
            preciseEnd = parseSafe(times[rightBound]);
        }

        // Skip this window entirely if we still can't get valid boundaries
        if (!isValid(preciseStart) || !isValid(preciseEnd)) continue;

        const duration = differenceInMinutes(preciseEnd, preciseStart);

        // ── Minimum duration gate ─────────────────────────────────────────────
        // CHS wcp is hourly resolution. When slack barely clips the threshold,
        // interpolation can produce very short or zero-duration windows.
        // A 30-min minimum matches real-world practical diving constraints.
        if (duration < MIN_WINDOW_DURATION_MINS) continue;

        const preciseSlackTime = interpolateExtremeTime(times, speeds, slackIdx);

        // ── isHighTide classification ─────────────────────────────────────────
        const validHeights = tideHeights.filter(h => h != null && !Number.isNaN(h));
        const tideHeight = tideHeights[slackIdx] ?? 0;
        const maxTide = validHeights.length ? Math.max(...validHeights) : 0;
        const minTide = validHeights.length ? Math.min(...validHeights) : 0;
        const tideRange = maxTide - minTide;
        const isHighTide = tideRange > 0.5 && tideHeight > (minTide + tideRange * 0.75);

        windows.push({
            slackTime: preciseSlackTime,
            windowStart: safeFormat(preciseStart, preciseStart),
            windowEnd:   safeFormat(preciseEnd,   preciseEnd),
            duration,
            tideHeight,
            isHighTide,
            currentSpeed: speeds[slackIdx] ?? 0,
        });
    }

    // ── Daylight filter ───────────────────────────────────────────────────────
    // Rule: window must START after sunrise AND at least DAYLIGHT_BUFFER_MINS before sunset.
    // This is a two-bound filter — previously only the sunset bound existed,
    // allowing windows starting at 00:30 AM to pass through (Q4 bug).
    //
    // Safety-first: if no solar data exists for a given day, the window is EXCLUDED.
    // It is safer to show too few windows than to show potentially dark windows.
    if (!sunrises?.length || !sunsets?.length) return [];

    return windows.filter(window => {
        const windowStart = parseSafe(window.windowStart);
        if (!isValid(windowStart)) return false;

        const dayStr = formatDate(windowStart, 'yyyy-MM-dd');
        const sunriseStr = sunrises.find(s => s.startsWith(dayStr));
        const sunsetStr  = sunsets.find(s  => s.startsWith(dayStr));

        // No solar data for this specific day → exclude (safe-side)
        if (!sunriseStr || !sunsetStr) return false;

        const sunrise = parseSafe(sunriseStr);
        const sunset  = parseSafe(sunsetStr);
        if (!isValid(sunrise) || !isValid(sunset)) return false;

        const latestAllowedStart = addMinutes(sunset, -DAYLIGHT_BUFFER_MINS);
        // ✅ The fix: window must START after sunrise (lower bound added)
        //            AND start before (sunset - buffer) (upper bound — was the only check before)
        return windowStart >= sunrise && windowStart <= latestAllowedStart;
    });

}
