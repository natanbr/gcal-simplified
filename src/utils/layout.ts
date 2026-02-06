import { AppEvent } from '../types';

export type EventGroup = AppEvent[];

export const groupOverlappingEvents = (events: AppEvent[]): EventGroup[] => {
    if (events.length === 0) return [];

    // Sort by start time
    const sorted = [...events].sort((a, b) => a.start.getTime() - b.start.getTime());
    const groups: EventGroup[] = [];
    let currentGroup: AppEvent[] = [sorted[0]];

    for (let i = 1; i < sorted.length; i++) {
        const currentEvent = sorted[i];

        // Check if current event overlaps with ANY event in the current group
        // Two events overlap if: eventA.start < eventB.end AND eventB.start < eventA.end
        const overlapsWithGroup = currentGroup.some(groupEvent =>
            currentEvent.start < groupEvent.end && groupEvent.start < currentEvent.end
        );

        if (overlapsWithGroup) {
            currentGroup.push(currentEvent);
        } else {
            groups.push(currentGroup);
            currentGroup = [currentEvent];
        }
    }
    groups.push(currentGroup);
    return groups;
};
