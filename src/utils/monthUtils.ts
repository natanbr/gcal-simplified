import { startOfMonth, startOfWeek, addMonths, addDays, isSameMonth, isSameDay } from 'date-fns';

export type WeekStartDay = 'sunday' | 'monday' | 'today';

/**
 * Get the start date for the monthly grid (7x5)
 */
export function getMonthViewStartDate(referenceDate: Date, monthOffset: number, weekStartDay: WeekStartDay = 'sunday'): Date {
    const monthDate = addMonths(referenceDate, monthOffset);
    const firstOfMonth = startOfMonth(monthDate);

    // If weekStartDay is 'today', it doesn't make much sense for monthly view,
    // so we default to Sunday or follow the week start logic.
    // However, the prompt mentions 'sunday' | 'monday' | 'today' in types.
    // For Monthly View, we'll treat 'today' as 'sunday' for the grid alignment if needed,
    // but better to follow standard calendar alignment.

    let weekStartsOn: 0 | 1 | 2 | 3 | 4 | 5 | 6 = 0; // Sunday
    if (weekStartDay === 'monday') {
        weekStartsOn = 1;
    } else if (weekStartDay === 'today') {
        weekStartsOn = referenceDate.getDay() as 0 | 1 | 2 | 3 | 4 | 5 | 6;
    }

    return startOfWeek(firstOfMonth, { weekStartsOn });
}

/**
 * Get all 35 days for a 7x5 monthly grid
 */
export function getMonthViewDates(referenceDate: Date, monthOffset: number, weekStartDay: WeekStartDay = 'sunday'): Date[] {
    const startDate = getMonthViewStartDate(referenceDate, monthOffset, weekStartDay);

    const days: Date[] = [];
    for (let i = 0; i < 35; i++) {
        days.push(addDays(startDate, i));
    }

    return days;
}

/**
 * Check if the offset represents the current month
 */
export function isCurrentMonth(referenceDate: Date, monthOffset: number): boolean {
    const targetMonth = addMonths(referenceDate, monthOffset);
    return isSameMonth(referenceDate, targetMonth);
}

/**
 * Check if we can navigate back (prevent going to past months)
 */
export function canNavigateBackMonth(monthOffset: number): boolean {
    return monthOffset > 0;
}
