// ============================================================
// The settle's log line is visible where a parent looks first
// ------------------------------------------------------------
// The line exists so a parent can see that an update removed a game token. It
// was typed 'system', which the log's default "💰 Tokens" filter hides, and the
// summary strip's "Who" row had no chip for its `system` source, so it was
// counted nowhere on screen (review of 985592f, 2026-09-28). It is a token
// movement: typed 'reward', like "Mood token removed".
// ============================================================

import { render, screen, act, fireEvent, cleanup } from '@testing-library/react';
import { describe, it, expect, afterEach } from 'vitest';
import { MCStoreProvider } from '../store/MCStoreProvider';
import { STORAGE_KEY } from '../store/useMCStore';
import { initialState } from '../store/mcReducer';
import { MAX_GAME_TOKENS } from '../store/moodGauge';
import { ActivityLogView } from './ActivityLogView';

function seedOverTheCap() {
    const cases = initialState.cases.map(c =>
        c.id === 0 ? { ...c, status: 'active' as const, reward: 'quick-game' as const, tokenCount: 0 } : c);
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ _migrationVersion: 1, gameTokens: MAX_GAME_TOKENS, cases, activityLogs: [] }));
}

afterEach(() => {
    cleanup();
    localStorage.clear();
});

describe('ActivityLogView — the game-token settle line', () => {
    it('shows under the default filter, and the Who row counts its system source', async () => {
        seedOverTheCap();
        render(<MCStoreProvider><ActivityLogView /></MCStoreProvider>);
        await act(async () => { fireEvent.click(screen.getByTitle('Activity Log')); });

        expect(screen.getByText(/removed at load/)).toBeInTheDocument();
        expect(screen.getByTitle('App lifecycle (startup, resume, update) — 1 today')).toBeInTheDocument();
    });
});
