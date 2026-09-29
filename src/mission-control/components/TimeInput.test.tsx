// ============================================================
// TimeInput — a keyboard user can see which time field has focus
// ------------------------------------------------------------
// The adult tabs through Settings with a keyboard. The field used to carry an
// inline `outline: 'none'` and nothing in its place, so focus was invisible.
// An inline style cannot say :focus-visible, so the ring is the .mc-field rule
// in mc.css; MCSettingsOverlay.focus-ring.test.tsx checks that rule and every
// other Settings field.
// ============================================================

import { render, screen, cleanup } from '@testing-library/react';
import { describe, it, expect, afterEach } from 'vitest';
import { TimeInput } from './TimeInput';

afterEach(cleanup);

describe('TimeInput — visible keyboard focus', () => {
    it('the field carries the class the focus rule targets, and no inline outline to override it', () => {
        render(<TimeInput label="Auto-trigger at" value="06:00" onChange={() => {}} />);
        const input = screen.getByDisplayValue('06:00');

        expect(input.classList.contains('mc-field')).toBe(true);
        // An inline outline beats any stylesheet rule, :focus-visible included.
        expect(input.style.outline).toBe('');
    });
});
