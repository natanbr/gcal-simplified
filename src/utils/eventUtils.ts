import { AppEvent } from '../types';

/**
 * deeply compares two AppEvent objects.
 * Useful for React.memo to avoid re-renders when event objects are recreated but content is identical.
 */
export function areEventsEqual(prev: AppEvent, next: AppEvent): boolean {
    if (prev === next) return true;
    if (!prev || !next) return false;

    return (
        prev.id === next.id &&
        prev.title === next.title &&
        prev.start.getTime() === next.start.getTime() &&
        prev.end.getTime() === next.end.getTime() &&
        prev.allDay === next.allDay &&
        prev.isHoliday === next.isHoliday &&
        prev.description === next.description &&
        prev.location === next.location &&
        prev.colorId === next.colorId &&
        prev.color === next.color
    );
}

/**
 * Comparison function for React.memo on components that take an AppEvent.
 * Ignores function prop changes (onClick, onEventClick) as they are typically stable or
 * shouldn't trigger re-render if the data hasn't changed.
 */
export function areEventCardPropsEqual(
    prev: { event: AppEvent; className?: string; onClick?: () => void; onEventClick?: (event: AppEvent) => void },
    next: { event: AppEvent; className?: string; onClick?: () => void; onEventClick?: (event: AppEvent) => void }
): boolean {
    // If className changes, we must re-render
    if (prev.className !== next.className) return false;

    // Compare event data deeply
    return areEventsEqual(prev.event, next.event);
}
