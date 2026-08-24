// ============================================================
// Top-level routing + the Quiz Lab dev gate.
//
// The gate is the thing that must not silently break: the Quiz Lab
// is a debug surface that shows answers, skill ids and levels, and
// this app runs on a child's device. "It only exists in dev" has to
// be enforced, not asserted in a comment.
//
// verifiedRedBy: dropping `isDev &&` from resolveInitialView failed
// the negative case; replacing `import.meta.env.DEV &&` in App.tsx
// with a bare `view === 'quiz-lab'` failed the source pin.
// ============================================================

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveInitialView } from './appRoutes';

const appSource = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'App.tsx'), 'utf-8');

describe('resolveInitialView', () => {
    it('defaults to the calendar', () => {
        expect(resolveInitialView('', true)).toBe('calendar');
        expect(resolveInitialView('?something=else', true)).toBe('calendar');
    });

    it('routes ?mc=1 to mission control in dev and in production alike', () => {
        expect(resolveInitialView('?mc=1', true)).toBe('mission-control');
        expect(resolveInitialView('?mc=1', false)).toBe('mission-control');
    });

    it('routes ?lab=1 to the Quiz Lab in dev', () => {
        expect(resolveInitialView('?lab=1', true)).toBe('quiz-lab');
    });

    it('makes ?lab=1 do NOTHING outside dev', () => {
        expect(resolveInitialView('?lab=1', false)).toBe('calendar');
        // Not even smuggled in alongside another param.
        expect(resolveInitialView('?lab=1&mc=1', false)).toBe('mission-control');
        expect(resolveInitialView('?LAB=1', true)).toBe('calendar');
        expect(resolveInitialView('?lab=true', true)).toBe('calendar');
    });
});

describe('Quiz Lab dev gate (source pin)', () => {
    it('feeds the real import.meta.env.DEV into the router', () => {
        expect(appSource).toContain('resolveInitialView(window.location.search, import.meta.env.DEV)');
    });

    it('also gates the render site, so a production build cannot even bundle it', () => {
        // Vite replaces import.meta.env.DEV with the literal `false` at build
        // time; without this second gate QuizLab would ship as dead-but-present
        // code. Same pattern as BlocksCanvas.tsx's dev-only PerformanceHUD.
        expect(appSource).toMatch(/if\s*\(\s*import\.meta\.env\.DEV\s*&&\s*view === 'quiz-lab'\s*\)/);
    });

    it('mounts the lab outside MCStoreProvider — no store, scheduler or bridges', () => {
        const gateAt = appSource.indexOf("view === 'quiz-lab'");
        const providerAt = appSource.indexOf('<MCStoreProvider>');
        expect(gateAt).toBeGreaterThan(-1);
        expect(providerAt).toBeGreaterThan(-1);
        expect(gateAt).toBeLessThan(providerAt);
    });
});
