import { describe, it, expect } from 'vitest';
import { partitionEventsIntoHourlySlots } from './timeBuckets';
import { AppEvent } from '../types';

const createEvent = (id: string, start: Date, end: Date): AppEvent => ({
    id,
    title: 'Test Event',
    start,
    end,
    allDay: false
});

describe('partitionEventsIntoHourlySlots', () => {
    it('should place events completely before active hours in the "before" bucket', () => {
        // Active hours 7-21
        const start = new Date('2023-10-27T05:00:00');
        const end = new Date('2023-10-27T06:00:00');
        const event = createEvent('1', start, end);

        const buckets = partitionEventsIntoHourlySlots([event], 7, 21);

        expect(buckets.before).toHaveLength(1);
        expect(buckets.before[0].id).toBe('1');
        expect(buckets.after).toHaveLength(0);
        expect(Object.values(buckets.hourly).flat()).toHaveLength(0);
    });

    it('should place events completely after active hours in the "after" bucket', () => {
        const start = new Date('2023-10-27T22:00:00');
        const end = new Date('2023-10-27T23:00:00');
        const event = createEvent('2', start, end);

        const buckets = partitionEventsIntoHourlySlots([event], 7, 21);

        expect(buckets.after).toHaveLength(1);
        expect(buckets.after[0].id).toBe('2');
        expect(buckets.before).toHaveLength(0);
        expect(Object.values(buckets.hourly).flat()).toHaveLength(0);
    });

    it('should place events starting within active hours in the corresponding hourly slot', () => {
        const start = new Date('2023-10-27T10:30:00');
        const end = new Date('2023-10-27T11:30:00');
        const event = createEvent('3', start, end);

        const buckets = partitionEventsIntoHourlySlots([event], 7, 21);

        expect(buckets.hourly[10]).toHaveLength(1);
        expect(buckets.hourly[10][0].id).toBe('3');
        expect(buckets.before).toHaveLength(0);
        expect(buckets.after).toHaveLength(0);
    });

    it('should handle events that overlap the start boundary (start before, end inside)', () => {
        // Starts at 6:30, ends at 7:30. Active start at 7.
        // Should be clamped to 7 and put in hourly[7]
        const start = new Date('2023-10-27T06:30:00');
        const end = new Date('2023-10-27T07:30:00');
        const event = createEvent('4', start, end);

        const buckets = partitionEventsIntoHourlySlots([event], 7, 21);

        expect(buckets.hourly[7]).toHaveLength(1);
        expect(buckets.hourly[7][0].id).toBe('4');
        expect(buckets.before).toHaveLength(0);
    });

    it('should handle events that overlap the end boundary (start inside, end after)', () => {
        // Starts at 20:30, ends at 21:30. Active end at 21.
        // Starts inside active hours (20 < 21), so should be in hourly[20].
        const start = new Date('2023-10-27T20:30:00');
        const end = new Date('2023-10-27T21:30:00');
        const event = createEvent('5', start, end);

        const buckets = partitionEventsIntoHourlySlots([event], 7, 21);

        expect(buckets.hourly[20]).toHaveLength(1);
        expect(buckets.hourly[20][0].id).toBe('5');
        expect(buckets.after).toHaveLength(0);
    });

    it('should default to active hours 7-21 if not specified', () => {
        const start = new Date('2023-10-27T06:00:00'); // Before 7
        const end = new Date('2023-10-27T06:30:00');
        const event = createEvent('6', start, end);

        const buckets = partitionEventsIntoHourlySlots([event]);

        expect(buckets.before).toHaveLength(1);
    });
});
