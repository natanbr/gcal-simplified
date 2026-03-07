import { describe, it, expect } from 'vitest';
import {
    getWeekStartDate,
    canNavigateToPreviousWeek,
    isCurrentWeek,
} from './weekNavigation';
import { startOfWeek, addWeeks, format } from 'date-fns';

// Fixed reference date: Wednesday 2025-03-05
const REF = new Date(2025, 2, 5); // March 5, 2025 (Wednesday)
const fmt = (d: Date) => format(d, 'yyyy-MM-dd');

// ── getWeekStartDate ──────────────────────────────────────────────────────────

describe('getWeekStartDate — mode: today', () => {
    it('offset 0 returns the reference date itself', () => {
        expect(fmt(getWeekStartDate(REF, 0, 'today'))).toBe('2025-03-05');
    });

    it('offset +1 returns one week later', () => {
        expect(fmt(getWeekStartDate(REF, 1, 'today'))).toBe('2025-03-12');
    });

    it('offset +2 returns two weeks later', () => {
        expect(fmt(getWeekStartDate(REF, 2, 'today'))).toBe('2025-03-19');
    });

    it('defaults to today mode when weekStartDay is omitted', () => {
        expect(fmt(getWeekStartDate(REF, 0))).toBe('2025-03-05');
    });
});

describe('getWeekStartDate — mode: monday', () => {
    it('offset 0 returns Monday of the reference week', () => {
        // REF is Wednesday Mar 5 → Monday should be Mar 3
        const monday = startOfWeek(REF, { weekStartsOn: 1 });
        expect(fmt(getWeekStartDate(REF, 0, 'monday'))).toBe(fmt(monday));
    });

    it('offset +1 returns Monday of the following week', () => {
        const monday = startOfWeek(REF, { weekStartsOn: 1 });
        const nextMonday = addWeeks(monday, 1);
        expect(fmt(getWeekStartDate(REF, 1, 'monday'))).toBe(fmt(nextMonday));
    });
});

describe('getWeekStartDate — mode: sunday', () => {
    it('offset 0 returns Sunday of the reference week', () => {
        const sunday = startOfWeek(REF, { weekStartsOn: 0 });
        expect(fmt(getWeekStartDate(REF, 0, 'sunday'))).toBe(fmt(sunday));
    });

    it('offset +1 returns Sunday of the following week', () => {
        const sunday = startOfWeek(REF, { weekStartsOn: 0 });
        const nextSunday = addWeeks(sunday, 1);
        expect(fmt(getWeekStartDate(REF, 1, 'sunday'))).toBe(fmt(nextSunday));
    });
});

describe('getWeekStartDate — on a Monday reference', () => {
    const MON = new Date(2025, 2, 3); // Monday March 3, 2025
    it('monday mode offset 0 returns itself when ref is already Monday', () => {
        expect(fmt(getWeekStartDate(MON, 0, 'monday'))).toBe('2025-03-03');
    });
    it('sunday mode offset 0 returns the preceding Sunday', () => {
        expect(fmt(getWeekStartDate(MON, 0, 'sunday'))).toBe('2025-03-02');
    });
});

// ── canNavigateToPreviousWeek ─────────────────────────────────────────────────

describe('canNavigateToPreviousWeek', () => {
    it('returns false at offset 0 (current week — no going back)', () => {
        expect(canNavigateToPreviousWeek(0)).toBe(false);
    });

    it('returns true at offset 1', () => {
        expect(canNavigateToPreviousWeek(1)).toBe(true);
    });

    it('returns true at offset 5', () => {
        expect(canNavigateToPreviousWeek(5)).toBe(true);
    });
});

// ── isCurrentWeek ─────────────────────────────────────────────────────────────

describe('isCurrentWeek', () => {
    it('returns true at offset 0', () => {
        expect(isCurrentWeek(0)).toBe(true);
    });

    it('returns false at offset 1', () => {
        expect(isCurrentWeek(1)).toBe(false);
    });

    it('returns false at offset 3', () => {
        expect(isCurrentWeek(3)).toBe(false);
    });
});
