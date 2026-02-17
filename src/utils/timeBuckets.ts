import { AppEvent } from '../types';

export interface HourlyBuckets {
    before: AppEvent[];
    hourly: AppEvent[];
    after: AppEvent[];
}

export const partitionEventsIntoHourlySlots = (
    events: AppEvent[],
    startHour: number = 7,
    endHour: number = 21
): HourlyBuckets => {
    const buckets: HourlyBuckets = {
        before: [],
        hourly: [],
        after: []
    };

    events.forEach(event => {
        const eventStart = event.start.getTime();
        const eventEnd = event.end.getTime();

        // Create Date objects for active hours boundaries on the event's day
        const dayStart = new Date(event.start);
        dayStart.setHours(startHour, 0, 0, 0);

        const dayEnd = new Date(event.start);
        dayEnd.setHours(endHour, 0, 0, 0);

        if (eventEnd <= dayStart.getTime()) {
            buckets.before.push(event);
        } else if (eventStart >= dayEnd.getTime()) {
            buckets.after.push(event);
        } else {
            // It overlaps with active hours (or is contained)
            buckets.hourly.push(event);
        }
    });

    return buckets;
};
