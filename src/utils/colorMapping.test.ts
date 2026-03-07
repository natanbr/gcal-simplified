import { describe, it, expect } from 'vitest';
import {
    getEventColorStyles,
    getEventTitleStyle,
    getColorFromGoogleCalendar,
} from './colorMapping';

// ── getColorFromGoogleCalendar ────────────────────────────────────────────────

describe('getColorFromGoogleCalendar', () => {
    it('returns null for undefined input', () => {
        expect(getColorFromGoogleCalendar(undefined)).toBeNull();
    });

    it('returns null for empty string', () => {
        expect(getColorFromGoogleCalendar('')).toBeNull();
    });

    it('returns null for an out-of-range colorId', () => {
        expect(getColorFromGoogleCalendar('99')).toBeNull();
    });

    it('returns a ColorClasses object for each valid colorId (1–11)', () => {
        for (let id = 1; id <= 11; id++) {
            const result = getColorFromGoogleCalendar(String(id));
            expect(result).not.toBeNull();
            expect(result?.bg).toBeTruthy();
            expect(result?.text).toBeTruthy();
            expect(result?.border).toBeTruthy();
            expect(result?.titleText).toBeTruthy();
        }
    });
});

// ── All 11 Google Calendar colorIds — bg and contrast classes ─────────────────

const GOOGLE_COLOR_EXPECTATIONS: Record<string, { bg: string; text: string }> = {
    '1': { bg: 'bg-blue-500', text: 'text-white' },
    '2': { bg: 'bg-green-500', text: 'text-white' },
    '3': { bg: 'bg-purple-500', text: 'text-white' },
    '4': { bg: 'bg-pink-500', text: 'text-white' },
    '5': { bg: 'bg-yellow-400', text: 'text-black' },
    '6': { bg: 'bg-orange-500', text: 'text-white' },
    '7': { bg: 'bg-cyan-500', text: 'text-white' },
    '8': { bg: 'bg-gray-400', text: 'text-black' },
    '9': { bg: 'bg-blue-500', text: 'text-white' },
    '10': { bg: 'bg-green-500', text: 'text-white' },
    '11': { bg: 'bg-red-600', text: 'text-white' },
};

describe('getEventColorStyles — all 11 Google Calendar colorIds', () => {
    Object.entries(GOOGLE_COLOR_EXPECTATIONS).forEach(([colorId, { bg, text }]) => {
        it(`colorId ${colorId}: bg class contains "${bg}", text contrast is "${text}"`, () => {
            const result = getEventColorStyles('Test Event', undefined, colorId);
            expect(result.className).toContain(bg);
            expect(result.className).toContain(text);
            expect(result.style).toBeUndefined();
        });
    });

    it('all colorIds produces border-l-4 class', () => {
        for (let id = 1; id <= 11; id++) {
            const result = getEventColorStyles('Event', undefined, String(id));
            expect(result.className).toContain('border-l-4');
        }
    });
});

// ── getEventColorStyles — priority & fallback ─────────────────────────────────

describe('getEventColorStyles — priority & fallback', () => {
    it('returns Google Calendar color when colorId is provided', () => {
        const result = getEventColorStyles('Meeting', undefined, '1');
        expect(result.className).toContain('bg-blue-500');
        expect(result.style).toBeUndefined();
    });

    it('colorId takes priority over hexColor when both are provided', () => {
        const result = getEventColorStyles('Meeting', undefined, '1', '#ff0000');
        // Should use the Google color, not the hex
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

    it('returns white text for a dark hex color (#0000ff)', () => {
        const result = getEventColorStyles('Event', undefined, undefined, '#0000ff');
        expect(result.className).toContain('text-white');
    });

    it('returns black text for a light hex color (#ffffff)', () => {
        const result = getEventColorStyles('Event', undefined, undefined, '#ffffff');
        expect(result.className).toContain('text-black');
    });

    it('returns default color when no colorId or hexColor is given', () => {
        const result = getEventColorStyles('Random Event', undefined, undefined);
        expect(result.className).toContain('bg-zinc-800');
        expect(result.style).toBeUndefined();
    });

    it('description param is ignored for color selection (no crash)', () => {
        const result = getEventColorStyles('Event', 'some description', undefined);
        expect(result.className).toContain('bg-zinc-800');
    });
});

// ── getEventTitleStyle ────────────────────────────────────────────────────────

describe('getEventTitleStyle — colorId priority', () => {
    it('returns tailored title text class for colorId 1 (blue)', () => {
        const result = getEventTitleStyle('1');
        expect(result.className).toContain('text-blue-600');
        expect(result.style).toBeUndefined();
    });

    it('returns green title class for colorId 2', () => {
        const result = getEventTitleStyle('2');
        expect(result.className).toContain('text-green-600');
    });

    it('returns red title class for colorId 11 (Tomato)', () => {
        const result = getEventTitleStyle('11');
        expect(result.className).toContain('text-red-600');
    });

    it('returns inline style color when hexColor is provided', () => {
        const hex = '#ff0000';
        const result = getEventTitleStyle(undefined, hex);
        expect(result.className).toBeUndefined();
        expect(result.style).toEqual({ color: hex });
    });

    it('colorId takes priority over hexColor in title style too', () => {
        const result = getEventTitleStyle('1', '#ff0000');
        expect(result.className).toContain('text-blue-600');
        expect(result.style).toBeUndefined();
    });

    it('returns default title class when no color is provided', () => {
        const result = getEventTitleStyle();
        expect(result.className).toContain('text-zinc-900');
        expect(result.style).toBeUndefined();
    });
});

