import { AppEvent } from '../types';

export type EventGroup = AppEvent[];

export const groupOverlappingEvents = (events: AppEvent[]): EventGroup[] => {
    if (events.length === 0) return [];

    // Sort by start time
    const sorted = [...events].sort((a, b) => a.start.getTime() - b.start.getTime());
    const groups: EventGroup[] = [];
    let currentGroup: AppEvent[] = [sorted[0]];
    let maxGroupEnd = sorted[0].end.getTime();

    for (let i = 1; i < sorted.length; i++) {
        const currentEvent = sorted[i];

        // Optimized overlap check: O(1)
        // Since events are sorted by start time, if the current event starts before
        // the latest end time of the current group, it MUST overlap with at least one event in the group.
        if (currentEvent.start.getTime() < maxGroupEnd) {
            currentGroup.push(currentEvent);
            maxGroupEnd = Math.max(maxGroupEnd, currentEvent.end.getTime());
        } else {
            groups.push(currentGroup);
            currentGroup = [currentEvent];
            maxGroupEnd = currentEvent.end.getTime();
        }
    }
    groups.push(currentGroup);
    return groups;
};

export const calculateEventStyles = (
    topP: number,
    heightP: number,
    leftP: number,
    widthP: number,
    durationHours: number
) => {
    const isSmallDuration = durationHours < 1;
    // Vertical expansion as % of total container height
    // 0.8% is approx 7-8 mins on a 14h day
    // 0.4% is approx 3-4 mins
    const verticalExpandP = isSmallDuration ? 0.8 : 0.4;
    // Horizontal expansion as % of column width
    const horizontalExpandP = 1.5;

    const finalTopP = topP - verticalExpandP;
    const finalHeightP = heightP + (verticalExpandP * 2);
    const finalLeftP = leftP - horizontalExpandP;
    const finalWidthP = widthP + (horizontalExpandP * 2);

    return {
        top: `${finalTopP}%`,
        height: `${finalHeightP}%`,
        left: `${finalLeftP}%`,
        width: `${finalWidthP}%`,
        zIndex: isSmallDuration ? 20 : 10
    };
};
