import { startOfWeek, addWeeks } from 'date-fns';

/**
 * Get the start date for a week view (always Monday)
 */
export function getWeekStartDate(referenceDate: Date, weekOffset: number): Date {
    const monday = startOfWeek(referenceDate, { weekStartsOn: 1 }); // 1 = Monday
    return addWeeks(monday, weekOffset);
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
