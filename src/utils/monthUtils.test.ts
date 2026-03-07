import { describe, it, expect } from 'vitest';
import {
    getMonthViewStartDate,
    getMonthViewDates,
    isCurrentMonth,
    canNavigateBackMonth,
} from './monthUtils';
import { format } from 'date-fns';

// Fixed reference: March 15, 2025 (Saturday)
const REF = new Date(2025, 2, 15);
const fmt = (d: Date) => format(d, 'yyyy-MM-dd');

// ── getMonthViewStartDate ─────────────────────────────────────────────────────

describe('getMonthViewStartDate — sunday mode (default)', () => {
    it('offset 0 returns Sunday of the week containing March 1, 2025', () => {
        // March 1, 2025 is a Saturday → week starts Sunday Feb 23
        const result = getMonthViewStartDate(REF, 0, 'sunday');
        expect(fmt(result)).toBe('2025-02-23');
    });

    it('offset +1 returns the grid start for April 2025', () => {
        // April 1, 2025 is a Tuesday → week starts Sunday Mar 30
        const result = getMonthViewStartDate(REF, 1, 'sunday');
        expect(fmt(result)).toBe('2025-03-30');
    });

    it('defaults to sunday when weekStartDay is omitted', () => {
        const explicit = getMonthViewStartDate(REF, 0, 'sunday');
        const implicit = getMonthViewStartDate(REF, 0);
        expect(fmt(implicit)).toBe(fmt(explicit));
    });
});

describe('getMonthViewStartDate — monday mode', () => {
    it('offset 0 returns Monday of the week containing March 1, 2025', () => {
        // March 1, 2025 is a Saturday → Mon week starts Feb 24
        const result = getMonthViewStartDate(REF, 0, 'monday');
        expect(fmt(result)).toBe('2025-02-24');
    });

    it('offset +1 returns Monday of the week containing April 1, 2025', () => {
        // April 1, 2025 is a Tuesday → Mon week starts Mar 31
        const result = getMonthViewStartDate(REF, 1, 'monday');
        expect(fmt(result)).toBe('2025-03-31');
    });
});

// ── getMonthViewDates ─────────────────────────────────────────────────────────

describe('getMonthViewDates', () => {
    it('always returns exactly 35 dates', () => {
        const dates = getMonthViewDates(REF, 0, 'sunday');
        expect(dates).toHaveLength(35);
    });

    it('first date equals getMonthViewStartDate', () => {
        const start = getMonthViewStartDate(REF, 0, 'sunday');
        const dates = getMonthViewDates(REF, 0, 'sunday');
        expect(fmt(dates[0])).toBe(fmt(start));
    });

    it('dates are consecutive days (no gaps, DST-tolerant)', () => {
        const dates = getMonthViewDates(REF, 0, 'sunday');
        for (let i = 1; i < dates.length; i++) {
            const diffMs = dates[i].getTime() - dates[i - 1].getTime();
            const diffHrs = diffMs / (60 * 60 * 1000);
            // Allow 23h (spring-forward) or 25h (fall-back) for DST transitions
            expect(diffHrs).toBeGreaterThanOrEqual(23);
            expect(diffHrs).toBeLessThanOrEqual(25);
        }
    });

    it('grid for March 2025 contains at least 28 March days (grid may not include all 31)', () => {
        // March 2025 starts on a Saturday → Sunday-mode grid starts Feb 23.
        // The 35-slot grid (Feb 23 – Mar 29) contains 29 March days.
        const dates = getMonthViewDates(REF, 0, 'sunday');
        const marchDays = dates.filter(d => d.getMonth() === 2 && d.getFullYear() === 2025);
        expect(marchDays.length).toBeGreaterThanOrEqual(28);
        expect(marchDays.length).toBeLessThanOrEqual(31);
    });

    it('works for february (short month) — still 35 days', () => {
        const feb = new Date(2025, 1, 15); // Feb 15, 2025
        const dates = getMonthViewDates(feb, 0, 'sunday');
        expect(dates).toHaveLength(35);
    });

    it('positive offset advances the month', () => {
        const marchdates = getMonthViewDates(REF, 0, 'sunday');
        const aprildates = getMonthViewDates(REF, 1, 'sunday');
        // First date of April grid must be later than first date of March grid
        expect(aprildates[0].getTime()).toBeGreaterThan(marchdates[0].getTime());
    });
});

// ── isCurrentMonth ────────────────────────────────────────────────────────────

describe('isCurrentMonth', () => {
    it('returns true at offset 0', () => {
        expect(isCurrentMonth(REF, 0)).toBe(true);
    });

    it('returns false at offset +1', () => {
        expect(isCurrentMonth(REF, 1)).toBe(false);
    });

    it('returns false at offset +12', () => {
        expect(isCurrentMonth(REF, 12)).toBe(false);
    });
});

// ── canNavigateBackMonth ──────────────────────────────────────────────────────

describe('canNavigateBackMonth', () => {
    it('returns false at offset 0 (current month)', () => {
        expect(canNavigateBackMonth(0)).toBe(false);
    });

    it('returns true at offset 1', () => {
        expect(canNavigateBackMonth(1)).toBe(true);
    });

    it('returns true at offset 6', () => {
        expect(canNavigateBackMonth(6)).toBe(true);
    });
});
