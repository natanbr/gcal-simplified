import { describe, it, expect } from 'vitest';
import { getWeekStartDate, canNavigateToPreviousWeek, isCurrentWeek } from '../weekNavigation';
import { format } from 'date-fns';

describe('weekNavigation', () => {
    describe('getWeekStartDate', () => {
        describe('today mode (default)', () => {
            it('should return the reference date when offset is 0', () => {
                // Wednesday, Feb 4, 2026
                const wednesday = new Date(2026, 1, 4, 18, 41, 50);
                const result = getWeekStartDate(wednesday, 0, 'today');
                expect(format(result, 'yyyy-MM-dd')).toBe('2026-02-04');
            });

            it('should return same day next week when offset is 1', () => {
                const wednesday = new Date(2026, 1, 4, 18, 41, 50);
                const result = getWeekStartDate(wednesday, 1, 'today');
                expect(format(result, 'yyyy-MM-dd')).toBe('2026-02-11');
            });
        });

        describe('monday mode', () => {
            it('should return Monday of the current week when offset is 0', () => {
                // Wednesday, Feb 4, 2026
                const wednesday = new Date(2026, 1, 4, 18, 41, 50);
                const result = getWeekStartDate(wednesday, 0, 'monday');

                // Should return Monday, Feb 2, 2026
                expect(format(result, 'yyyy-MM-dd')).toBe('2026-02-02');
                expect(result.getDay()).toBe(1); // Monday
            });

            it('should return Monday of next week when offset is 1', () => {
                const wednesday = new Date(2026, 1, 4, 18, 41, 50);
                const result = getWeekStartDate(wednesday, 1, 'monday');

                // Should return Monday, Feb 9, 2026
                expect(format(result, 'yyyy-MM-dd')).toBe('2026-02-09');
                expect(result.getDay()).toBe(1); // Monday
            });
        });

        describe('sunday mode', () => {
            it('should return Sunday of the current week when offset is 0', () => {
                // Wednesday, Feb 4, 2026
                const wednesday = new Date(2026, 1, 4, 18, 41, 50);
                const result = getWeekStartDate(wednesday, 0, 'sunday');

                // Should return Sunday, Feb 1, 2026
                expect(format(result, 'yyyy-MM-dd')).toBe('2026-02-01');
                expect(result.getDay()).toBe(0); // Sunday
            });

            it('should return Sunday of next week when offset is 1', () => {
                const wednesday = new Date(2026, 1, 4, 18, 41, 50);
                const result = getWeekStartDate(wednesday, 1, 'sunday');

                // Should return Sunday, Feb 8, 2026
                expect(format(result, 'yyyy-MM-dd')).toBe('2026-02-08');
                expect(result.getDay()).toBe(0); // Sunday
            });
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
