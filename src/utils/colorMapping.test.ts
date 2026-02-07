import { describe, it, expect } from 'vitest';
import { getEventColorStyles } from './colorMapping';

describe('getEventColorStyles', () => {
    it('returns Google Calendar color when colorId is provided', () => {
        const result = getEventColorStyles('Meeting', undefined, '1');
        expect(result.className).toContain('bg-blue-500');
        expect(result.style).toBeUndefined();
    });

    it('returns hex color style when colorId is missing but hexColor is provided', () => {
        const hex = '#ff0000';
        const result = getEventColorStyles('Meeting', undefined, undefined, hex);
        expect(result.className).toContain('border-l-4');
        expect(result.style).toBeDefined();
        expect(result.style?.backgroundColor).toBe(hex);
        // Expect white text for red background
        expect(result.className).toContain('text-white');
    });

    it('returns name-based color when colorId and hexColor are missing but name matches', () => {
        const result = getEventColorStyles('Meeting with Natan', undefined, undefined);
        expect(result.className).toContain('bg-blue-500');
        expect(result.style).toBeUndefined();
    });

    it('returns default color when no match found', () => {
        const result = getEventColorStyles('Random Event', undefined, undefined);
        expect(result.className).toContain('bg-zinc-800');
        expect(result.style).toBeUndefined();
    });
});
