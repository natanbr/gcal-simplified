import { describe, it, expect } from 'vitest';
import { getWeekStartDate, canNavigateToPreviousWeek, isCurrentWeek } from '../weekNavigation';
import { addDays, format } from 'date-fns';

describe('weekNavigation', () => {
    describe('getWeekStartDate', () => {
        it('should return Monday of the current week when offset is 0', () => {
            // Wednesday, Feb 5, 2026
            const wednesday = new Date(2026, 1, 4, 18, 41, 50); // Month is 0-indexed
            const result = getWeekStartDate(wednesday, 0);

            // Should return Monday, Feb 2, 2026
            expect(format(result, 'yyyy-MM-dd')).toBe('2026-02-02');
            expect(result.getDay()).toBe(1); // Monday
        });

        it('should return Monday of next week when offset is 1', () => {
            const wednesday = new Date(2026, 1, 4, 18, 41, 50);
            const result = getWeekStartDate(wednesday, 1);

            // Should return Monday, Feb 9, 2026
            expect(format(result, 'yyyy-MM-dd')).toBe('2026-02-09');
            expect(result.getDay()).toBe(1); // Monday
        });

        it('should return Monday of previous week when offset is -1', () => {
            const wednesday = new Date(2026, 1, 4, 18, 41, 50);
            const result = getWeekStartDate(wednesday, -1);

            // Should return Monday, Jan 26, 2026
            expect(format(result, 'yyyy-MM-dd')).toBe('2026-01-26');
            expect(result.getDay()).toBe(1); // Monday
        });

        it('should always return Monday even when reference date is Sunday', () => {
            const sunday = new Date(2026, 1, 8); // Sunday, Feb 8, 2026
            const result = getWeekStartDate(sunday, 0);

            // Should return Monday, Feb 2, 2026 (start of the week containing this Sunday)
            expect(format(result, 'yyyy-MM-dd')).toBe('2026-02-02');
            expect(result.getDay()).toBe(1); // Monday
        });

        it('should always return Monday even when reference date is Monday', () => {
            const monday = new Date(2026, 1, 2); // Monday, Feb 2, 2026
            const result = getWeekStartDate(monday, 0);

            // Should return the same Monday
            expect(format(result, 'yyyy-MM-dd')).toBe('2026-02-02');
            expect(result.getDay()).toBe(1); // Monday
        });
    });

    describe('canNavigateToPreviousWeek', () => {
        it('should return false when at current week (offset 0)', () => {
            expect(canNavigateToPreviousWeek(0)).toBe(false);
        });

        it('should return true when at future week (offset > 0)', () => {
            expect(canNavigateToPreviousWeek(1)).toBe(true);
            expect(canNavigateToPreviousWeek(2)).toBe(true);
            expect(canNavigateToPreviousWeek(10)).toBe(true);
        });

        it('should return false for negative offsets (should not happen but defensive)', () => {
            expect(canNavigateToPreviousWeek(-1)).toBe(false);
        });
    });

    describe('isCurrentWeek', () => {
        it('should return true when offset is 0', () => {
            expect(isCurrentWeek(0)).toBe(true);
        });

        it('should return false when offset is not 0', () => {
            expect(isCurrentWeek(1)).toBe(false);
            expect(isCurrentWeek(-1)).toBe(false);
            expect(isCurrentWeek(5)).toBe(false);
        });
    });
});
