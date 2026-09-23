import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { formatSuspendedRemainingTime, formatSuspensionLength } from './timeUtils';

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

describe('formatSuspensionLength', () => {
    const NOW = Date.parse('2026-09-22T10:00:00.000Z');
    const plus = (h: number) => NOW + h * 3_600_000;
    it('names each Settings choice in days, with the local end time', () => {
        // The end is 2026-09-23T10:00Z: 22, 23 or 24 Sep (UTC+14) depending on
        // the zone, so the month is fixed while the day and clock follow it.
        expect(formatSuspensionLength(plus(24), NOW)).toMatch(/^for 1 day \(until 2[234] Sep \d{2}:\d{2}\)$/);
        expect(formatSuspensionLength(plus(72), NOW)).toContain('for 3 days');
        expect(formatSuspensionLength(plus(168), NOW)).toContain('for 7 days');
        expect(formatSuspensionLength(plus(336), NOW)).toContain('for 14 days');
    });

    it('absorbs a few minutes of clock skew between the phone and this machine', () => {
        const phoneUntil = plus(24);
        const stampedLater = NOW + 3 * 60_000;
        expect(formatSuspensionLength(phoneUntil, stampedLater)).toContain('for 1 day');
    });

    it('uses hours under a day, never zero', () => {
        expect(formatSuspensionLength(plus(5), NOW)).toContain('for 5 hours');
        expect(formatSuspensionLength(plus(0.2), NOW)).toContain('for 1 hour');
    });
});
