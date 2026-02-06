import { describe, it, expect } from 'vitest';
import { groupOverlappingEvents } from './layout';
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
