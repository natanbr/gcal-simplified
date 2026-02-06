import { describe, it, expect } from 'vitest';
import { getColorFromGoogleCalendar, getEventColorClass } from './colorMapping';

describe('colorMapping', () => {
    describe('getColorFromGoogleCalendar', () => {
        it('should map colorId 1 (Lavender) to blue', () => {
            const result = getColorFromGoogleCalendar('1');
            expect(result.bg).toBe('bg-blue-500');
            expect(result.text).toBe('text-white');
            expect(result.border).toBe('border-blue-700');
        });

        it('should map colorId 2 (Sage) to green', () => {
            const result = getColorFromGoogleCalendar('2');
            expect(result.bg).toBe('bg-green-500');
            expect(result.text).toBe('text-white');
            expect(result.border).toBe('border-green-700');
        });

        it('should map colorId 3 (Grape) to purple', () => {
            const result = getColorFromGoogleCalendar('3');
            expect(result.bg).toBe('bg-purple-500');
            expect(result.text).toBe('text-white');
            expect(result.border).toBe('border-purple-700');
        });

        it('should map colorId 4 (Flamingo) to pink', () => {
            const result = getColorFromGoogleCalendar('4');
            expect(result.bg).toBe('bg-pink-500');
            expect(result.text).toBe('text-white');
            expect(result.border).toBe('border-pink-700');
        });

        it('should map colorId 5 (Banana) to yellow', () => {
            const result = getColorFromGoogleCalendar('5');
            expect(result.bg).toBe('bg-yellow-400');
            expect(result.text).toBe('text-black');
            expect(result.border).toBe('border-yellow-600');
        });

        it('should map colorId 6 (Tangerine) to orange', () => {
            const result = getColorFromGoogleCalendar('6');
            expect(result.bg).toBe('bg-orange-500');
            expect(result.text).toBe('text-white');
            expect(result.border).toBe('border-orange-700');
        });

        it('should map colorId 7 (Peacock) to cyan', () => {
            const result = getColorFromGoogleCalendar('7');
            expect(result.bg).toBe('bg-cyan-500');
            expect(result.text).toBe('text-white');
            expect(result.border).toBe('border-cyan-700');
        });

        it('should map colorId 8 (Graphite) to gray', () => {
            const result = getColorFromGoogleCalendar('8');
            expect(result.bg).toBe('bg-gray-400');
            expect(result.text).toBe('text-black');
            expect(result.border).toBe('border-gray-600');
        });

        it('should map colorId 9 (Blueberry) to blue', () => {
            const result = getColorFromGoogleCalendar('9');
            expect(result.bg).toBe('bg-blue-500');
            expect(result.text).toBe('text-white');
            expect(result.border).toBe('border-blue-700');
        });

        it('should map colorId 10 (Basil) to green', () => {
            const result = getColorFromGoogleCalendar('10');
            expect(result.bg).toBe('bg-green-500');
            expect(result.text).toBe('text-white');
            expect(result.border).toBe('border-green-700');
        });

        it('should map colorId 11 (Tomato) to red', () => {
            const result = getColorFromGoogleCalendar('11');
            expect(result.bg).toBe('bg-red-600');
            expect(result.text).toBe('text-white');
            expect(result.border).toBe('border-red-800');
        });

        it('should return null for undefined colorId', () => {
            const result = getColorFromGoogleCalendar(undefined);
            expect(result).toBeNull();
        });

        it('should return null for invalid colorId', () => {
            const result = getColorFromGoogleCalendar('99');
            expect(result).toBeNull();
        });
    });

    describe('getEventColorClass', () => {
        it('should prioritize Google Calendar color over name-based color', () => {
            const result = getEventColorClass('Meeting with Natan', undefined, '3');
            // colorId 3 (purple) should override name-based blue for Natan
            expect(result).toContain('bg-purple-500');
        });

        it('should fall back to name-based color when no colorId', () => {
            const result = getEventColorClass('Meeting with Natan', undefined, undefined);
            expect(result).toContain('bg-blue-500');
        });

        it('should use name-based color for Alon', () => {
            const result = getEventColorClass('Lunch with Alon', undefined, undefined);
            expect(result).toContain('bg-green-500');
        });

        it('should use name-based color for Uval', () => {
            const result = getEventColorClass('Call with Uval', undefined, undefined);
            expect(result).toContain('bg-purple-500');
        });

        it('should use name-based color for Marta', () => {
            const result = getEventColorClass('Dinner with Marta', undefined, undefined);
            expect(result).toContain('bg-pink-500');
        });

        it('should use default color when no colorId or name match', () => {
            const result = getEventColorClass('Random Meeting', undefined, undefined);
            expect(result).toContain('bg-zinc-800');
        });

        it('should check description for name-based colors', () => {
            const result = getEventColorClass('Meeting', 'Discussion with Natan', undefined);
            expect(result).toContain('bg-blue-500');
        });

        it('should ensure good contrast with light backgrounds', () => {
            const result = getEventColorClass('Event', undefined, '5'); // Yellow
            expect(result).toContain('text-black');
        });

        it('should ensure good contrast with dark backgrounds', () => {
            const result = getEventColorClass('Event', undefined, '1'); // Blue
            expect(result).toContain('text-white');
        });
    });
});
