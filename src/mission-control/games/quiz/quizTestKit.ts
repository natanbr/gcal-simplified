// ============================================================
// Quiz Module — shared test stubs for any game that takes a QuizEngineApi.
//
// Not a test file, so the style-token and file-size ratchets scan it like
// production code: keep it small and free of raw hex. Import it from tests
// only — enforced by src/__tests__/test-kit-boundary.test.ts.
// ============================================================

import { vi } from 'vitest';
import type { QuizEngineApi } from './types';

/**
 * An engine that always serves "1 + 1 = ?". Every method except `generator`
 * is a spy. Each call builds a new engine, whereas the real one keeps its
 * identity across renders — a test that rerenders should create it once.
 */
export function stubEngine(): QuizEngineApi {
    return {
        generator: () => ({ kind: 'numeric', skill: 'math-add', level: 0, text: '1 + 1 = ?', answer: 2 }),
        beginSession: vi.fn(),
        setDifficulty: vi.fn(),
        onAnswered: vi.fn(),
        notifyQuizClosed: vi.fn(),
    };
}
