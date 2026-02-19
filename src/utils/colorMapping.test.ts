import { describe, it, expect } from 'vitest';
import { getEventColorStyles, getEventTitleStyle } from './colorMapping';

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

    it('returns default color when no match found', () => {
        const result = getEventColorStyles('Random Event', undefined, undefined);
        expect(result.className).toContain('bg-zinc-800');
        expect(result.style).toBeUndefined();
    });
});


describe('getEventTitleStyle', () => {
    it('returns tailored title text class when colorId is provided', () => {
        const result = getEventTitleStyle('1');
        expect(result.className).toContain('text-blue-600');
        expect(result.style).toBeUndefined();
    });

    it('returns inline style color when hexColor is provided', () => {
        const hex = '#ff0000';
        const result = getEventTitleStyle(undefined, hex);
        expect(result.className).toBeUndefined();
        expect(result.style).toEqual({ color: hex });
    });

    it('returns default title class when no color is provided', () => {
        const result = getEventTitleStyle();
        expect(result.className).toContain('text-zinc-900');
        expect(result.style).toBeUndefined();
    });
});
