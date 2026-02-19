import { AppEvent } from '../types';

export interface HourlyBuckets {
    allDay: AppEvent[];
    hourly: AppEvent[];
}

export const partitionEventsIntoHourlySlots = (
    events: AppEvent[],
    startHour: number = 7,
    endHour: number = 21
): HourlyBuckets => {
    const buckets: HourlyBuckets = {
        allDay: [],
        hourly: []
    };

    events.forEach(event => {
        // Explicit all-day events go to allDay bucket
        if (event.allDay) {
            buckets.allDay.push(event);
            return;
        }

        const eventStart = event.start.getTime();
        const eventEnd = event.end.getTime();

        // Create Date objects for active hours boundaries on the event's day
        // Note: We use the event's start date to clearer active hours. 
        // Since the events passed here are already single-day segments (from Dashboard),
        // we can safely assume they belong to the day they are being rendered on.
        const dayStart = new Date(event.start);
        dayStart.setHours(startHour, 0, 0, 0);

        const dayEnd = new Date(event.start);
        dayEnd.setHours(endHour, 0, 0, 0);

        // Check if event is strictly outside active hours
        // Case 1: Ends before or at active start
        // Case 2: Starts after or at active end
        if (eventEnd <= dayStart.getTime() || eventStart >= dayEnd.getTime()) {
            buckets.allDay.push(event);
        } else {
            // It overlaps with active hours so it goes to the grid
            buckets.hourly.push(event);
        }
    });

    return buckets;
};
