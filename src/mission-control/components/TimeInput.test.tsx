// ============================================================
// TimeInput — a keyboard user can see which time field has focus
// ------------------------------------------------------------
// The adult tabs through Settings with a keyboard. The field used to carry an
// inline `outline: 'none'` and nothing in its place, so focus was invisible.
// An inline style cannot say :focus-visible, so the ring is an mc.css rule on
// the field's class; jsdom does not match :focus-visible, hence the rule is
// read from the stylesheet.
// ============================================================

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { render, screen, cleanup } from '@testing-library/react';
import { describe, it, expect, afterEach } from 'vitest';
import { TimeInput } from './TimeInput';

const mcCss = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '..', 'styles', 'mc.css'), 'utf-8');

/** The declarations of the first rule whose selector list contains `selector`. */
function declarationsOf(selector: string): string | null {
    for (const [, selectors, body] of mcCss.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
        if (selectors.split(',').some(s => s.trim() === selector)) return body;
    }
    return null;
}

afterEach(cleanup);

describe('TimeInput — visible keyboard focus', () => {
    it('the field carries the class the focus rule targets, and no inline outline to override it', () => {
        render(<TimeInput label="Auto-trigger at" value="06:00" onChange={() => {}} />);
        const input = screen.getByDisplayValue('06:00');

        expect(input.classList.contains('mc-time-input')).toBe(true);
        // An inline outline beats any stylesheet rule, :focus-visible included.
        expect(input.style.outline).toBe('');
    });

    it('mc.css draws a :focus-visible ring from an --mc-* token', () => {
        const ring = declarationsOf('.mc-time-input:focus-visible');

        expect(ring, '.mc-time-input:focus-visible rule').not.toBeNull();
        expect(ring).toMatch(/outline:\s*\d+px solid var\(--mc-[\w-]+\)/);
        expect(ring).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    });
});
