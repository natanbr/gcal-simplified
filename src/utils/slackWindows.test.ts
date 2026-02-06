import { describe, it, expect } from 'vitest';
import { calculateSlackWindows, SlackWindow } from './slackWindows';

describe('Slack Tide Window Calculation', () => {
    it('should calculate slack window boundaries correctly', () => {
        const times = [
            '2026-02-05T00:00',
            '2026-02-05T01:00',
            '2026-02-05T02:00', // Slack at index 2
            '2026-02-05T03:00',
            '2026-02-05T04:00',
            '2026-02-05T05:00',
        ];
        const speeds = [0.8, 0.4, 0.2, 0.3, 0.6, 1.0]; // Slack window from idx 1-3
        const tideHeights = [2.0, 2.5, 3.0, 3.2, 3.0, 2.5];
        const slackIndices = [2]; // Slack detected at index 2

        const windows = calculateSlackWindows(times, speeds, tideHeights, slackIndices);

        expect(windows).toHaveLength(1);
        expect(windows[0].slackTime).toBe('2026-02-05T02:10');
        expect(windows[0].windowStart).toBe('2026-02-05T00:45');
        expect(windows[0].windowEnd).toBe('2026-02-05T03:40');
        expect(windows[0].duration).toBe(175); // Roughly (3:40 - 0:45) = 175 mins
        expect(windows[0].currentSpeed).toBe(0.2);
    });

    it('should identify high tide slack correctly', () => {
        const times = [
            '2026-02-05T00:00',
            '2026-02-05T01:00',
            '2026-02-05T02:00', // Low tide slack
            '2026-02-05T03:00',
            '2026-02-05T04:00',
            '2026-02-05T05:00', // High tide slack
        ];
        const speeds = [0.6, 0.3, 0.1, 0.8, 0.4, 0.2];
        const tideHeights = [2.0, 1.5, 1.0, 2.5, 3.5, 4.0]; // Range: 1.0 to 4.0
        const slackIndices = [2, 5];

        const windows = calculateSlackWindows(times, speeds, tideHeights, slackIndices);

        expect(windows).toHaveLength(2);

        // Low tide slack (1.0m is in lower 25%)
        expect(windows[0].tideHeight).toBe(1.0);
        expect(windows[0].isHighTide).toBe(false);

        // High tide slack (4.0m is in upper 25%)
        expect(windows[1].tideHeight).toBe(4.0);
        expect(windows[1].isHighTide).toBe(true);
    });

    it('should handle multiple slack windows', () => {
        const times = Array.from({ length: 24 }, (_, i) =>
            `2026-02-05T${String(i).padStart(2, '0')}:00`
        );
        const speeds = [
            0.8, 0.3, 0.1, 0.4, 0.9, 1.2, // Slack at idx 2
            1.5, 1.2, 0.8, 0.4, 0.2, 0.3, // Slack at idx 10
            0.6, 1.0, 1.3, 1.5, 1.2, 0.7,
            0.4, 0.1, 0.2, 0.5, 0.9, 1.1  // Slack at idx 19
        ];
        const tideHeights = Array(24).fill(2.5);
        const slackIndices = [2, 10, 19];

        const windows = calculateSlackWindows(times, speeds, tideHeights, slackIndices);

        expect(windows).toHaveLength(3);
        expect(windows[0].slackTime).toBe('2026-02-05T01:54');
        expect(windows[1].slackTime).toBe('2026-02-05T10:10');
        expect(windows[2].slackTime).toBe('2026-02-05T19:15');
    });

    it('should handle edge case where slack is at array boundary', () => {
        const times = ['2026-02-05T00:00', '2026-02-05T01:00', '2026-02-05T02:00'];
        const speeds = [0.2, 0.6, 1.0]; // Slack at start
        const tideHeights = [2.0, 2.5, 3.0];
        const slackIndices = [0];

        const windows = calculateSlackWindows(times, speeds, tideHeights, slackIndices);

        expect(windows).toHaveLength(1);
        expect(windows[0].windowStart).toBe('2026-02-05T00:00');
        expect(windows[0].windowEnd).toBe('2026-02-05T00:45'); // Interpolated end boundary
        expect(windows[0].duration).toBe(45);
    });

    it('should filter out slack windows that occur during dark hours', () => {
        const times = [
            '2026-02-05T06:00', // Before sunrise (7:30)
            '2026-02-05T07:00',
            '2026-02-05T08:00', // After sunrise - SAFE
            '2026-02-05T12:00',
            '2026-02-05T18:00', // Before sunset (17:30) - SAFE
            '2026-02-05T19:00', // After sunset
            '2026-02-05T20:00'
        ];
        const speeds = [0.2, 0.3, 0.2, 0.8, 0.2, 0.3, 0.2];
        const tideHeights = [2.0, 2.5, 3.0, 3.5, 3.0, 2.5, 2.0];
        const slackIndices = [0, 2, 4, 6]; // Slacks at 06:00, 08:00, 18:00, 20:00

        // Sunrise at 07:30, sunset at 17:30
        const sunrise = new Date('2026-02-05T07:30:00');
        const sunset = new Date('2026-02-05T17:30:00');

        const windows = calculateSlackWindows(times, speeds, tideHeights, slackIndices, sunrise, sunset);

        // Should only include windows at 08:00 (after sunrise) and exclude 06:00, 18:00, 20:00
        expect(windows.length).toBeLessThan(slackIndices.length);

        // Verify all returned windows are during daylight
        windows.forEach(window => {
            const windowTime = new Date(window.slackTime);
            expect(windowTime.getTime()).toBeGreaterThanOrEqual(sunrise.getTime());
            expect(windowTime.getTime()).toBeLessThanOrEqual(sunset.getTime());
        });
    });
});
