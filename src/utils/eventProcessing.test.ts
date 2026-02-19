import { describe, it, expect } from 'vitest';
import { splitMultiDayEvents, getEventsForDay } from './eventProcessing';
import { AppEvent } from '../types';

const createEvent = (id: string, start: Date, end: Date, allDay = false): AppEvent => ({
    id,
    title: 'Test Event',
    start,
    end,
    allDay
});

describe('splitMultiDayEvents', () => {
    it('should return single day event as is', () => {
        const start = new Date('2023-10-27T10:00:00');
        const end = new Date('2023-10-27T12:00:00');
        const event = createEvent('1', start, end);

        const result = splitMultiDayEvents([event]);

        expect(result).toHaveLength(1);
        expect(result[0].id).toBe('1');
        expect(result[0].start).toEqual(start);
        expect(result[0].end).toEqual(end);
    });

    it('should split event spanning two days', () => {
        const start = new Date('2023-10-27T22:00:00');
        const end = new Date('2023-10-28T05:00:00');
        const event = createEvent('2', start, end);

        const result = splitMultiDayEvents([event]);

        expect(result).toHaveLength(2);

        // Segment 1: 27th 22:00 -> 28th 00:00
        expect(result[0].id).toContain('2_seg_0');
        expect(result[0].start).toEqual(start);
        expect(result[0].end).toEqual(new Date('2023-10-28T00:00:00'));

        // Segment 2: 28th 00:00 -> 28th 05:00
        expect(result[1].id).toContain('2_seg_1');
        expect(result[1].start).toEqual(new Date('2023-10-28T00:00:00'));
        expect(result[1].end).toEqual(end);
    });

    it('should split event spanning three days', () => {
        const start = new Date('2023-10-27T22:00:00');
        const end = new Date('2023-10-29T05:00:00');
        const event = createEvent('3', start, end);

        const result = splitMultiDayEvents([event]);

        expect(result).toHaveLength(3);

        // Segment 1: 27th 22:00 -> 28th 00:00
        expect(result[0].start).toEqual(start);
        expect(result[0].end).toEqual(new Date('2023-10-28T00:00:00'));

        // Segment 2: 28th 00:00 -> 29th 00:00 (Full Day)
        expect(result[1].start).toEqual(new Date('2023-10-28T00:00:00'));
        expect(result[1].end).toEqual(new Date('2023-10-29T00:00:00'));

        // Segment 3: 29th 00:00 -> 29th 05:00
        expect(result[2].start).toEqual(new Date('2023-10-29T00:00:00'));
        expect(result[2].end).toEqual(end);
    });
});

describe('getEventsForDay', () => {
    it('should return events overlapping the day', () => {
        const day = new Date('2023-10-27T00:00:00');
        const event1 = createEvent('1', new Date('2023-10-27T10:00:00'), new Date('2023-10-27T12:00:00'));
        const event2 = createEvent('2', new Date('2023-10-26T10:00:00'), new Date('2023-10-26T12:00:00')); // Previous day

        const result = getEventsForDay([event1, event2], day);

        expect(result).toHaveLength(1);
        expect(result[0].id).toContain('1');
    });

    it('should clip events extending beyond the day', () => {
        // Although splitMultiDayEvents should handle this, getEventsForDay has fail-safe clipping logic
        const day = new Date('2023-10-27T00:00:00');
        const event = createEvent('3', new Date('2023-10-27T22:00:00'), new Date('2023-10-28T02:00:00'));

        const result = getEventsForDay([event], day);

        expect(result).toHaveLength(1);
        expect(result[0].start).toEqual(new Date('2023-10-27T22:00:00'));
        // It clips strictly to end of day (23:59:59.999) or start of next day? 
        // Our logic uses Math.min(eventEnd, dayEnd). dayEnd is 23:59:59.999 per date-fns endOfDay.
        // So expected is roughly end of day.
        // Let's just check start matches and end is clamped.
        expect(result[0].end.getTime()).toBeLessThanOrEqual(new Date('2023-10-27T23:59:59.999').getTime());
    });
});
