import { describe, it } from 'vitest';
import { partitionEventsIntoHourlySlots } from './timeBuckets';
import { groupOverlappingEvents } from './layout';
import { AppEvent } from '../types';
import { isSameDay } from 'date-fns';

const generateEvents = (count: number): AppEvent[] => {
    const events: AppEvent[] = [];
    const baseDate = new Date('2026-02-04T00:00:00');
    for (let i = 0; i < count; i++) {
        const dayOffset = Math.floor(Math.random() * 7);
        const startHour = 6 + Math.floor(Math.random() * 16);
        const start = new Date(baseDate.getTime());
        start.setDate(start.getDate() + dayOffset);
        start.setHours(startHour, Math.floor(Math.random() * 60));

        const end = new Date(start.getTime() + (30 + Math.random() * 120) * 60 * 1000);
        events.push({
            id: i.toString(),
            title: `Event ${i}`,
            start,
            end
        });
    }
    return events;
};

describe('Performance Benchmark', () => {
    it('measures layout calculation time', () => {
        const events = generateEvents(100);
        const days = Array.from({ length: 7 }, (_, i) => {
            const d = new Date('2026-02-04T00:00:00');
            d.setDate(d.getDate() + i);
            return d;
        });
        const config = { activeHoursStart: 7, activeHoursEnd: 21 };

        const start = performance.now();
        const iterations = 1000;

        for (let iter = 0; iter < iterations; iter++) {
            days.map(day => {
                const dayEvents = events.filter(e => isSameDay(e.start, day));
                const standardEvents = dayEvents.filter(e => !e.isHoliday);

                const startHour = config.activeHoursStart ?? 7;
                const endHour = config.activeHoursEnd ?? 21;
                const buckets = partitionEventsIntoHourlySlots(standardEvents, startHour, endHour);

                // Simulate Before Bucket group
                groupOverlappingEvents(buckets.before);

                // Simulate Hourly events
                const activeStart = startHour;
                const activeEnd = endHour;
                const totalHours = activeEnd - activeStart;

                const hourlyEvents = standardEvents.filter(e => {
                    const s = e.start.getHours() + e.start.getMinutes()/60;
                    const end = e.end.getHours() + e.end.getMinutes()/60;
                    return s < activeEnd && end > activeStart;
                }).sort((a,b) => a.start.getTime() - b.start.getTime());

                const groups = groupOverlappingEvents(hourlyEvents);

                groups.flatMap(group => {
                    return group.map((event, idx) => {
                       const s = event.start.getHours() + event.start.getMinutes()/60;
                       const e = event.end.getHours() + event.end.getMinutes()/60;

                       const visualsStart = Math.max(s, activeStart);
                       const visualsEnd = Math.min(e, activeEnd);

                       const topP = ((visualsStart - activeStart) / totalHours) * 100;
                       const duration = visualsEnd - visualsStart;
                       const heightP = (duration / totalHours) * 100;

                       const widthP = 100 / group.length;
                       const leftP = idx * widthP;
                       return { topP, heightP, leftP, widthP };
                    });
                });

                // Simulate After Bucket group
                groupOverlappingEvents(buckets.after);
                return null;
            });
        }
        const end = performance.now();
        console.log(`Total time for ${iterations} iterations: ${end - start}ms`);
        console.log(`Average time per iteration: ${(end - start) / iterations}ms`);
    });
});
