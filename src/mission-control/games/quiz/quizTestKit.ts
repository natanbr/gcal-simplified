// ============================================================
// Quiz Module — shared test stubs for any game that takes a QuizEngineApi.
//
// Not a test file, so the style-token and file-size ratchets scan it like
// production code: keep it small and free of raw hex. It stays `.ts` because a
// `.tsx` exporting only helpers trips react-refresh/only-export-components.
// ============================================================

import { vi } from 'vitest';
import type { QuizEngineApi } from './types';

/** An engine that always serves "1 + 1 = ?" and records every call. */
export function stubEngine(): QuizEngineApi {
    return {
        generator: () => ({ kind: 'numeric', skill: 'math-add', level: 0, text: '1 + 1 = ?', answer: 2 }),
        beginSession: vi.fn(),
        setDifficulty: vi.fn(),
        onAnswered: vi.fn(),
        notifyQuizClosed: vi.fn(),
    };
}
