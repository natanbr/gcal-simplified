import { describe, it, expect } from 'vitest';
import { getWeekStartDate, canNavigateToPreviousWeek, isCurrentWeek } from '../weekNavigation';
import { format, addWeeks } from 'date-fns';

describe('weekNavigation', () => {
    describe('getWeekStartDate', () => {
        describe('today mode (default)', () => {
            it('should return the reference date when offset is 0', () => {
                // Wednesday, Feb 4, 2026
                const wednesday = new Date(2026, 1, 4, 18, 41, 50);
                const result = getWeekStartDate(wednesday, 0, 'today');
                expect(format(result, 'yyyy-MM-dd')).toBe('2026-02-04');
            });

            it('should return Monday of next week when offset is 1', () => {
                // Wednesday, Feb 4, 2026 -> next week Monday should be Feb 9, 2026
                const wednesday = new Date(2026, 1, 4, 18, 41, 50);
                const result = getWeekStartDate(wednesday, 1, 'today');
                expect(format(result, 'yyyy-MM-dd')).toBe('2026-02-09');
            });

            it('should return Monday of two weeks later when offset is 2', () => {
                // Wednesday, Feb 4, 2026 -> two weeks later Monday should be Feb 16, 2026
                const wednesday = new Date(2026, 1, 4, 18, 41, 50);
                const result = getWeekStartDate(wednesday, 2, 'today');
                expect(format(result, 'yyyy-MM-dd')).toBe('2026-02-16');
            });
        });

        // Regression guard for the weekday dependency that let three specs in
        // e2e/week-navigation.spec.ts sit red for months: they asserted a rolling
        // today+7 window, which coincides with the real behaviour on Mondays only.
        //
        // 'today' anchors the FIRST view (offset 0) and nothing else. Every navigated
        // week is Monday-anchored — docs/requirements.md, "Week Start". Established
        // deliberately in 1f3c771; do not revert to addWeeks(referenceDate, offset).
        describe('today mode anchors navigation to Monday from every weekday', () => {
            // Mon 2026-02-02 .. Sun 2026-02-08 — one full week, so no weekday is untested.
            const WEEK = [2, 3, 4, 5, 6, 7, 8].map(day => new Date(2026, 1, day, 18, 41, 50));

            it.each(WEEK)('offset 0 returns the reference date itself (%s)', (reference) => {
                expect(format(getWeekStartDate(reference, 0, 'today'), 'yyyy-MM-dd'))
                    .toBe(format(reference, 'yyyy-MM-dd'));
            });

            it.each(WEEK)('offset 1 returns Monday 2026-02-09 (%s)', (reference) => {
                const result = getWeekStartDate(reference, 1, 'today');
                expect(format(result, 'yyyy-MM-dd')).toBe('2026-02-09');
                expect(result.getDay()).toBe(1);
            });

            it.each(WEEK)('offset 2 returns Monday 2026-02-16 (%s)', (reference) => {
                const result = getWeekStartDate(reference, 2, 'today');
                expect(format(result, 'yyyy-MM-dd')).toBe('2026-02-16');
                expect(result.getDay()).toBe(1);
            });

            it('is not a rolling today+7 window when today is not a Monday', () => {
                const tuesday = new Date(2026, 1, 3, 18, 41, 50);
                expect(format(getWeekStartDate(tuesday, 1, 'today'), 'yyyy-MM-dd'))
                    .not.toBe(format(addWeeks(tuesday, 1), 'yyyy-MM-dd'));
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
