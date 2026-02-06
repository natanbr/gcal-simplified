import { addMinutes, parseISO, format as formatDate, differenceInMinutes } from "date-fns";
import { interpolateExtremeTime } from "./tideMath";

export interface SlackWindow {
    slackTime: string;
    windowStart: string;
    windowEnd: string;
    duration: number; // minutes
    tideHeight: number;
    isHighTide: boolean;
    currentSpeed: number;
}

/**
 * Calculate slack tide windows where current speed is < 0.5kn
 */
export function calculateSlackWindows(
    times: string[],
    speeds: number[],
    tideHeights: number[],
    slackIndices: number[],
    sunrise?: Date,
    sunset?: Date
): SlackWindow[] {
    const SLACK_THRESHOLD = 0.5; // knots
    const windows: SlackWindow[] = [];

    for (const slackIdx of slackIndices) {
        // Find precise start time (where speed drops below threshold)
        let preciseStart: Date;
        let startIdx = slackIdx;
        while (startIdx > 0 && speeds[startIdx - 1] < SLACK_THRESHOLD) {
            startIdx--;
        }

        if (startIdx > 0) {
            const v1 = speeds[startIdx - 1];
            const v2 = speeds[startIdx];
            const t1 = parseISO(times[startIdx - 1]);
            const t2 = parseISO(times[startIdx]);
            // Linear interpolation: v = SLACK_THRESHOLD
            const fraction = (v1 - SLACK_THRESHOLD) / (v1 - v2);
            const totalDiff = differenceInMinutes(t2, t1);
            preciseStart = addMinutes(t1, Math.round(fraction * totalDiff));
        } else {
            preciseStart = parseISO(times[0]);
        }

        // Find precise end time (where speed rises above threshold)
        let preciseEnd: Date;
        let endIdx = slackIdx;
        while (endIdx < speeds.length - 1 && speeds[endIdx + 1] < SLACK_THRESHOLD) {
            endIdx++;
        }

        if (endIdx < speeds.length - 1) {
            const v1 = speeds[endIdx];
            const v2 = speeds[endIdx + 1];
            const t1 = parseISO(times[endIdx]);
            const t2 = parseISO(times[endIdx + 1]);
            const fraction = (SLACK_THRESHOLD - v1) / (v2 - v1);
            const totalDiff = differenceInMinutes(t2, t1);
            preciseEnd = addMinutes(t1, Math.round(fraction * totalDiff));
        } else {
            preciseEnd = parseISO(times.at(-1)!);
        }

        const duration = differenceInMinutes(preciseEnd, preciseStart);
        const preciseSlackTime = interpolateExtremeTime(times, speeds, slackIdx);

        // Determine if this is high tide slack
        const tideHeight = tideHeights[slackIdx] || 0;
        const maxTide = Math.max(...tideHeights.filter(h => h !== undefined && !Number.isNaN(h)));
        const minTide = Math.min(...tideHeights.filter(h => h !== undefined && !Number.isNaN(h)));
        const tideRange = maxTide - minTide;
        const isHighTide = tideHeight > (minTide + tideRange * 0.75);

        windows.push({
            slackTime: preciseSlackTime,
            windowStart: formatDate(preciseStart, "yyyy-MM-dd'T'HH:mm"),
            windowEnd: formatDate(preciseEnd, "yyyy-MM-dd'T'HH:mm"),
            duration,
            tideHeight,
            isHighTide,
            currentSpeed: speeds[slackIdx]
        });
    }

    // Filter out windows during dark hours if sunrise/sunset provided
    if (sunrise && sunset) {
        return windows.filter(window => {
            const windowTime = parseISO(window.slackTime);
            return windowTime >= sunrise && windowTime <= sunset;
        });
    }

    return windows;
}
