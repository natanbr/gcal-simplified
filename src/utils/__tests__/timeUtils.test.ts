import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { formatSuspendedRemainingTime } from '../timeUtils';

describe('formatSuspendedRemainingTime', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('returns null if suspendedUntil is null or empty', () => {
        expect(formatSuspendedRemainingTime(null)).toBeNull();
        expect(formatSuspendedRemainingTime('')).toBeNull();
    });

    it('returns null if the suspended date is in the past', () => {
        vi.setSystemTime(new Date('2026-05-27T12:00:00Z'));
        const pastDate = new Date('2026-05-27T11:00:00Z').toISOString();
        expect(formatSuspendedRemainingTime(pastDate)).toBeNull();
    });

    it('formats days remaining if >= 24 hours', () => {
        vi.setSystemTime(new Date('2026-05-27T12:00:00Z'));
        const futureDate = new Date('2026-05-28T13:00:00Z').toISOString(); // 25 hours
        expect(formatSuspendedRemainingTime(futureDate)).toBe('1d left');
    });

    it('formats hours remaining if >= 1 hour and < 24 hours', () => {
        vi.setSystemTime(new Date('2026-05-27T12:00:00Z'));
        const futureDate = new Date('2026-05-27T14:30:00Z').toISOString(); // 2.5 hours
        expect(formatSuspendedRemainingTime(futureDate)).toBe('2h left');
    });

    it('formats minutes remaining if < 1 hour', () => {
        vi.setSystemTime(new Date('2026-05-27T12:00:00Z'));
        const futureDate = new Date('2026-05-27T12:45:00Z').toISOString(); // 45 minutes
        expect(formatSuspendedRemainingTime(futureDate)).toBe('45m left');
    });
});
