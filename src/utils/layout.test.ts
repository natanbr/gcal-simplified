import { describe, it, expect } from 'vitest';
import { groupOverlappingEvents, calculateEventStyles } from './layout';
import { AppEvent } from '../types';

describe('groupOverlappingEvents', () => {
    it('should return empty array for no events', () => {
        expect(groupOverlappingEvents([])).toEqual([]);
    });

    it('should return single group for single event', () => {
        const events: AppEvent[] = [{
            id: '1',
            title: 'Event 1',
            start: new Date('2026-02-04T14:00:00'),
            end: new Date('2026-02-04T15:00:00'),
        }];
        const result = groupOverlappingEvents(events);
        expect(result).toHaveLength(1);
        expect(result[0]).toHaveLength(1);
    });

    it('should NOT group non-overlapping events', () => {
        const events: AppEvent[] = [
            {
                id: '1',
                title: 'Event 1',
                start: new Date('2026-02-04T14:00:00'),
                end: new Date('2026-02-04T15:00:00'),
            },
            {
                id: '2',
                title: 'Event 2',
                start: new Date('2026-02-04T15:00:00'),
                end: new Date('2026-02-04T16:00:00'),
            }
        ];
        const result = groupOverlappingEvents(events);
        expect(result).toHaveLength(2);
        expect(result[0]).toHaveLength(1);
        expect(result[1]).toHaveLength(1);
    });

    it('should group overlapping events', () => {
        const events: AppEvent[] = [
            {
                id: '1',
                title: 'Event 1',
                start: new Date('2026-02-04T14:00:00'),
                end: new Date('2026-02-04T15:00:00'),
            },
            {
                id: '2',
                title: 'Event 2',
                start: new Date('2026-02-04T14:30:00'),
                end: new Date('2026-02-04T15:30:00'),
            }
        ];
        const result = groupOverlappingEvents(events);
        expect(result).toHaveLength(1);
        expect(result[0]).toHaveLength(2);
    });

    it('should handle complex overlapping scenarios correctly', () => {
        const events: AppEvent[] = [
            {
                id: '1',
                title: 'Event 1',
                start: new Date('2026-02-04T14:00:00'),
                end: new Date('2026-02-04T15:00:00'),
            },
            {
                id: '2',
                title: 'Event 2',
                start: new Date('2026-02-04T14:30:00'),
                end: new Date('2026-02-04T15:30:00'),
            },
            {
                id: '3',
                title: 'Event 3',
                start: new Date('2026-02-04T16:00:00'),
                end: new Date('2026-02-04T17:00:00'),
            }
        ];
        const result = groupOverlappingEvents(events);
        expect(result).toHaveLength(2);
        expect(result[0]).toHaveLength(2); // Events 1 and 2 overlap
        expect(result[1]).toHaveLength(1); // Event 3 is separate
    });

    it('should handle events that touch at boundaries (no overlap)', () => {
        const events: AppEvent[] = [
            {
                id: '1',
                title: 'Event 1',
                start: new Date('2026-02-04T14:00:00'),
                end: new Date('2026-02-04T15:00:00'),
            },
            {
                id: '2',
                title: 'Event 2',
                start: new Date('2026-02-04T15:00:00'),
                end: new Date('2026-02-04T16:00:00'),
            }
        ];
        const result = groupOverlappingEvents(events);
        expect(result).toHaveLength(2); // Should NOT group - they just touch
        expect(result[0]).toHaveLength(1);
        expect(result[1]).toHaveLength(1);
    });

    it('should handle three overlapping events', () => {
        const events: AppEvent[] = [
            {
                id: '1',
                title: 'Event 1',
                start: new Date('2026-02-04T14:00:00'),
                end: new Date('2026-02-04T16:00:00'),
            },
            {
                id: '2',
                title: 'Event 2',
                start: new Date('2026-02-04T14:30:00'),
                end: new Date('2026-02-04T15:30:00'),
            },
            {
                id: '3',
                title: 'Event 3',
                start: new Date('2026-02-04T15:00:00'),
                end: new Date('2026-02-04T17:00:00'),
            }
        ];
        const result = groupOverlappingEvents(events);
        expect(result).toHaveLength(1);
        expect(result[0]).toHaveLength(3); // All three overlap
    });
});

describe('calculateEventStyles', () => {
    it('should expand small events (< 1h) more vertically', () => {
        const result = calculateEventStyles(10, 5, 0, 100, 0.5);
        // Small duration: < 1h -> verticalExpandP = 0.8
        // top = 10 - 0.8 = 9.2
        // height = 5 + 1.6 = 6.6
        // left = 0 - 1.5 = -1.5
        // width = 100 + 3 = 103
        // zIndex = 20
        expect(result.top).toBe('9.2%');
        expect(result.height).toBe('6.6%');
        expect(result.left).toBe('-1.5%');
        expect(result.width).toBe('103%');
        expect(result.zIndex).toBe(20);
    });

    it('should expand larger events (>= 1h) less vertically', () => {
        const result = calculateEventStyles(10, 10, 0, 100, 2);
        // Large duration: >= 1h -> verticalExpandP = 0.4
        // top = 10 - 0.4 = 9.6
        // height = 10 + 0.8 = 10.8
        // left = 0 - 1.5 = -1.5
        // width = 100 + 3 = 103
        // zIndex = 10
        expect(result.top).toBe('9.6%');
        expect(result.height).toBe('10.8%');
        expect(result.left).toBe('-1.5%');
        expect(result.width).toBe('103%');
        expect(result.zIndex).toBe(10);
    });

    it('should always expand horizontally by 1.5%', () => {
        const horizontalExpandP = 1.5;
        const result = calculateEventStyles(10, 10, 0, 100, 2);

        // left = 0 - 1.5
        // width = 100 + 3
        expect(parseFloat(result.left)).toBeCloseTo(-horizontalExpandP);
        expect(parseFloat(result.width)).toBeCloseTo(100 + horizontalExpandP * 2);
    });
});
