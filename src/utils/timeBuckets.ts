import { AppEvent } from '../types';

export interface HourlyBuckets {
    before: AppEvent[];
    hourly: { [hour: number]: AppEvent[] };
    after: AppEvent[];
}

export const partitionEventsIntoHourlySlots = (
    events: AppEvent[],
    startHour: number = 7,
    endHour: number = 21
): HourlyBuckets => {
    const buckets: HourlyBuckets = {
        before: [],
        hourly: {},
        after: []
    };

    // Initialize hourly slots
    for (let i = startHour; i < endHour; i++) {
        buckets.hourly[i] = [];
    }

    events.forEach(event => {
        const eventStartHour = event.start.getHours();
        // eventEndHour is not used currently

        // Check overlap with active hours
        // Simple logic: if it starts before active hours, put in before (unless it drags into active)
        // Actually, we want to know WHICH slots it occupies.
        // Google Cal style: an event is rendered in the slots it overlaps.
        // However, for this specific "Before/After" bucket requirement:
        // "leave some space (bucket) to contain all events if any for anything happening before start time (7am) and something that happens afer active hours (9pm)"

        // Logic:
        // 1. If ends before startHour -> BEFORE bucket
        // 2. If starts after endHour -> AFTER bucket
        // 3. Otherwise, it belongs to the hourly grid.
        //    AND if it starts before startHour but ends inside, it partially belongs to BEFORE? 
        //    Let's keep it simple: matching the user request "bucket to contain ALL events ... happening before start time".

        // Refined Logic considering "Visuals":
        // - Events completely before startHour go to 'before'.
        // - Events completely after endHour go to 'after'.
        // - Events overlapping the grid go into the specific hourly slots they touch.
        // - NOTE: what about an event starting at 6am and ending at 8am? 
        //   It should probably show up in "Before" AND "7am-8am" slot? Or just visually clip?
        //   Standard calendar apps usually scroll. Here we have a fixed view with buckets.
        //   Let's put it in the "Hourly" slots if it overlaps, and maybe duplicate in "Before" if it starts there?
        //   Let's stick to: 
        //   - ANY overlap with active hours -> Render in hourly slots.
        //   - NO overlap, completely before -> Before bucket.
        //   - NO overlap, completely after -> After bucket.

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
            // It overlaps with active hours.
            // We need to place it in every hour slot it touches.
            // But wait, standard implementation usually creates one card and positions it absolutely.
            // This app seems to use a grid/flex layout (based on previous code).
            // The previous code had "Morning", "Noon", "Evening" flex containers.
            // If we want "1 hour slots", we can render a div for each hour.
            // If an event spans multiple hours, we might need to render it in the first slot and let it overflow?
            // OR render it in each slot?
            // "Let's do active hours... break it down to 1 hour slots"
            // If I render 1 div per hour, and put the event in the 7am div...
            // If it goes to 9am, it needs height to span.
            // If using standard flow layout, it's hard to make it span across 7am and 8am divs.
            // 
            // APPROACH: The `hourly` object will map `hour -> events that START in that hour`.
            // AND we will handle rendering height/overlap in the UI component.
            // So here, we just need to assign it to its START hour, IF that hour is within the range.
            // If it starts before the range (e.g. 6am-8am), and we decided it belongs to the grid,
            // we should probably clamp it to the start of the grid (7am) for placement purposes?

            // Let's rely on the previous logic style:
            // "Morning" had all events starting in morning.
            // So `hourly[7]` should have events starting at 7.
            // If event starts at 6am but ends at 8am, and we treat it as "Hourly", 
            // we should probably clamp it to 7am for the sake of the bucket key?

            let startH = eventStartHour;
            if (startH < startHour) startH = startHour;

            // Just push to the start hour bucket.
            if (buckets.hourly[startH]) {
                buckets.hourly[startH].push(event);
            } else {
                // Fallback if something weird happens, or if it strictly starts before but we clamped it.
                // If startH (clamped) is valid, it goes there.
            }

            // Wait, what if active hours are 7-21 (9pm).
            // Slots available: 7, 8, ..., 20. (20:00 - 21:00).
            // If event is at 20:30, it goes to 20.
            // If event is at 21:00, it's "After".
            // Implementation looks correct.
        }
    });

    return buckets;
};
