import { describe, it, expect } from 'vitest';
import { getContrastColor, adjustColorBrightness } from './colors';

describe('colors', () => {
    describe('getContrastColor', () => {
        // Standard Cases
        it('should return black for white background', () => {
            expect(getContrastColor('#ffffff')).toBe('black');
        });

        it('should return white for black background', () => {
            expect(getContrastColor('#000000')).toBe('white');
        });

        it('should handle hex codes without hash', () => {
            expect(getContrastColor('ffffff')).toBe('black');
            expect(getContrastColor('000000')).toBe('white');
        });

        // 3-digit Hex
        it('should expand 3-digit hex correctly', () => {
            expect(getContrastColor('#fff')).toBe('black'); // #ffffff
            expect(getContrastColor('#000')).toBe('white'); // #000000
        });

        // Threshold Logic (YIQ = 128)
        // YIQ = ((r * 299) + (g * 587) + (b * 114)) / 1000
        // Gray #808080 => 128 (128 * 1000 = 128000)
        // Let's test precisely around 128.
        it('should switch at the threshold', () => {
            // #808080 -> YIQ = 128 -> returns black
            expect(getContrastColor('#808080')).toBe('black');

            // #7F7F7F -> YIQ = 127 -> returns white
            expect(getContrastColor('#7F7F7F')).toBe('white');
        });

        // Edge Cases
        it('should return black for empty input', () => {
            expect(getContrastColor('')).toBe('black');
        });

        it('should return black for invalid hex length', () => {
            expect(getContrastColor('#12345')).toBe('black'); // 5 chars
            expect(getContrastColor('#1234567')).toBe('black'); // 7 chars
        });

        it('should return white for invalid hex characters', () => {
            // parseInt('zz', 16) -> NaN. Calculations result in NaN. NaN >= 128 is false.
            expect(getContrastColor('#zzzzzz')).toBe('white');
        });
    });

    describe('adjustColorBrightness', () => {
        // Standard Cases
        it('should lighten color', () => {
            // #000000 + 10 -> #0a0a0a
            expect(adjustColorBrightness('#000000', 10)).toBe('#0a0a0a');
        });

        it('should darken color', () => {
            // #ffffff - 10 -> #f5f5f5 (255 - 10 = 245 = 0xF5)
            expect(adjustColorBrightness('#ffffff', -10)).toBe('#f5f5f5');
        });

        it('should handle hex codes without hash', () => {
            expect(adjustColorBrightness('000000', 10)).toBe('#0a0a0a');
        });

        // 3-digit Hex
        it('should expand 3-digit hex correctly', () => {
            // #000 -> #000000 + 10 -> #0a0a0a
            expect(adjustColorBrightness('#000', 10)).toBe('#0a0a0a');
        });

        // Clamping
        it('should clamp values to 255', () => {
            // #ffffff + 10 -> #ffffff (cannot go above 255)
            expect(adjustColorBrightness('#ffffff', 10)).toBe('#ffffff');
        });

        it('should clamp values to 0', () => {
            // #000000 - 10 -> #000000 (cannot go below 0)
            expect(adjustColorBrightness('#000000', -10)).toBe('#000000');
        });

        // Edge Cases
        it('should return #000000 for empty input', () => {
            expect(adjustColorBrightness('', 10)).toBe('#000000');
        });

        it('should return original hex for invalid length', () => {
            expect(adjustColorBrightness('#12345', 10)).toBe('#12345');
        });

        it('should treat invalid hex chars as black', () => {
            // parseInt('zzzzzz', 16) -> NaN. Bitwise ops treat NaN as 0.
            // So it behaves like #000000 + 10 -> #0a0a0a
            expect(adjustColorBrightness('#zzzzzz', 10)).toBe('#0a0a0a');
        });
    });
});
