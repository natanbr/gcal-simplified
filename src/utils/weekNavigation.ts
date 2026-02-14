import { startOfWeek, addWeeks } from 'date-fns';

export type WeekStartDay = 'sunday' | 'monday' | 'today';

/**
 * Get the start date for a week view
 */
export function getWeekStartDate(referenceDate: Date, weekOffset: number, weekStartDay: WeekStartDay = 'today'): Date {
    if (weekStartDay === 'today') {
        return addWeeks(referenceDate, weekOffset);
    }

    const weekStartsOn = weekStartDay === 'sunday' ? 0 : 1;
    const startOfThisWeek = startOfWeek(referenceDate, { weekStartsOn });
    return addWeeks(startOfThisWeek, weekOffset);
}

/**
 * Check if we can navigate to a previous week (cannot go before current week)
 */
export function canNavigateToPreviousWeek(currentWeekOffset: number): boolean {
    return currentWeekOffset > 0;
}

/**
 * Check if navigation is at the current week
 */
export function isCurrentWeek(weekOffset: number): boolean {
    return weekOffset === 0;
}
