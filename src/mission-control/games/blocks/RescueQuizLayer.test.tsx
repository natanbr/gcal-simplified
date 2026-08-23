// ============================================================
// Blocks Game — Rescue Quiz Layer guard
// Regression guard for the frame-0 cover: the shell must paint a
// STATIC dim the instant `rescueQuizActive` flips. QuizOverlay
// cannot do this job — it returns null until a passive effect
// generates a question, then fades its own backdrop in over
// ~300ms. Without the shell's dim the full-colour Space Rescue
// board flashes into view behind the incoming quiz card.
//
// Form: a rendering test on the shell's computed style. The dim
// is an INLINE style, which jsdom's getComputedStyle reflects
// faithfully (it is stylesheet cascade that jsdom cannot resolve),
// so this is the honest form — no source-reading fallback needed.
// Asserted on container.firstChild specifically: a looser query
// would also match QuizOverlay's own rgba(15,23,42,0.88) backdrop
// and pass vacuously.
// ============================================================

import { render } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { RescueQuizLayer } from './RescueQuizLayer';
import type { QuizEngineApi } from '../quiz/types';

function stubEngine(): QuizEngineApi {
    return {
        generator: () => ({ kind: 'numeric', skill: 'math-add', level: 0, text: '1 + 1 = ?', answer: 2 }),
        beginSession: vi.fn(),
        setDifficulty: vi.fn(),
        onAnswered: vi.fn(),
        notifyQuizClosed: vi.fn(),
    };
}

function renderShell(): HTMLElement {
    const { container } = render(
        <RescueQuizLayer engine={stubEngine()} onSolved={vi.fn()} onCancel={vi.fn()} />
    );
    return container.firstChild as HTMLElement;
}

describe('RescueQuizLayer', () => {
    it('paints a static dim over the board so frame 0 is never uncovered', () => {
        const shell = renderShell();
        expect(getComputedStyle(shell).backgroundColor).toBe('rgba(15, 23, 42, 0.6)');
    });

    it('keeps the dim un-animated — a fade-in would reintroduce the flash', () => {
        const shell = renderShell();
        // A plain inline background on a plain div: present on the first
        // painted frame, with no opacity ramp of its own.
        expect(shell.style.opacity).toBe('');
    });

    it('carries no backdrop-filter — the single-blur win must survive', () => {
        const shell = renderShell();
        // jsdom's cssstyle does not implement backdrop-filter, so an absent
        // one reads as `undefined` and getPropertyValue/computed are always
        // ''. React assigns non-custom properties straight onto the style
        // object, so a re-added blur DOES show up here as a plain property —
        // proven by temporarily setting backdropFilter on the shell.
        // `|| ''` keeps the guard correct either way.
        expect(shell.style.backdropFilter || '').toBe('');
    });

    it('still positions the quiz above the tray, outset past the board', () => {
        const shell = renderShell();
        expect(shell.style.position).toBe('absolute');
        expect(shell.style.zIndex).toBe('1000');
        expect(shell.style.inset).toBe('-12px');
    });
});
