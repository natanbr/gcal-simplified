import { describe, it, expect } from 'vitest';
import { parseISO } from 'date-fns';

import { interpolateExtremeTime } from './tideMath';

// This is the improved function
function findSlackTimes(times: string[], speeds: number[]) {
    const events: { time: string, speed: number }[] = [];
    let lastTrend = 0;
    const EPSILON = 0.001;

    for (let i = 1; i < speeds.length; i++) {
        const diff = speeds[i] - speeds[i - 1];
        if (diff > EPSILON) {
            if (lastTrend === -1) {
                const idx = i - 1;
                if (speeds[idx] < 1.0) {
                    const preciseTime = interpolateExtremeTime(times, speeds, idx);
                    events.push({ time: preciseTime, speed: speeds[idx] });
                }
            }
            lastTrend = 1;
        } else if (diff < -EPSILON) {
            lastTrend = -1;
        }
    }
    return events;
}

describe('Tide Time Accuracy', () => {
    it('should identify slack water at non-hourly times through interpolation', () => {
        // High current at 13:00, minimum at 13:54, high current at 15:00
        // Hourly samples:
        // 13:00 -> 0.8kn
        // 14:00 -> 0.05kn
        // 15:00 -> 0.7kn
        const times = ['2026-02-05T13:00', '2026-02-05T14:00', '2026-02-05T15:00'];
        const speeds = [0.8, 0.05, 0.7];

        const events = findSlackTimes(times, speeds);

        // The new implementation should return a precise time
        expect(events[0].time).toBe('2026-02-05T14:02');
        // This test will "pass" if we are documenting the CURRENT behavior, 
        // but we will change the expectation to "fail" to demonstrate the need for a fix.

        const eventTime = parseISO(events[0].time);
        const minutes = eventTime.getMinutes();

        // BUG: Minutes should not be 0 if the real peak is between hours
        // (In this case, 0.8 -> 0.05 -> 0.7 is slightly asymmetrical, so peak is not exactly at 14:00)
        expect(minutes).not.toBe(0);
    });
});
