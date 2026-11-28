// ============================================================
// Mission Control — hydration keeps the windows a save covered as the writer
// keeps them: once per window, eight at most (review of PR 209, Codex and Opus)
// ------------------------------------------------------------
// The writer (missionActivity.ts) keeps each window once, by its start, and the
// eight that start latest. A saved profile is not bound by that: an older build
// or a damaged write can hold a window twice, or thousands of entries. Codex
// built one of 10,000 (803 KB): every Settings save then compared pairs of them
// (50 M comparisons, 483 ms). Hydration applies the writer's rule (keptWindows).
// The entry-by-entry checks are in persistence-time.test.ts.
// ============================================================

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { initialState } from './mcReducer';
import { loadPersistedState, STORAGE_KEY } from './useMCStore';
import type { SavedWindow } from '../types';

const NOW = new Date(2026, 10, 20, 12, 0);
const minsAgo = (mins: number) => new Date(NOW.getTime() - mins * 60_000).toISOString();

function reloadMorningWith(savedIntoWindows: unknown): SavedWindow[] | undefined {
    const missions = initialState.missions.map(m => (m.phase === 'morning' ? { ...m, savedIntoWindows } : m));
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...initialState, missions }));
    return loadPersistedState().missions.find(m => m.phase === 'morning')?.savedIntoWindows;
}

describe('hydration — the windows a save covered, as the writer keeps them', () => {
    beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(NOW); localStorage.removeItem(STORAGE_KEY); });
    afterEach(() => { vi.useRealTimers(); localStorage.removeItem(STORAGE_KEY); });

    it('a window saved twice is kept once', () => {
        const windowStart = minsAgo(60);
        const kept = reloadMorningWith([{ savedAt: minsAgo(50), windowStart }, { savedAt: minsAgo(40), windowStart }]);
        expect(kept?.map(w => w.windowStart)).toEqual([windowStart]);
    });

    it('10,000 entries load as the eight that start latest, in order of start', () => {
        const many = Array.from({ length: 10_000 }, (_, i) => ({ savedAt: minsAgo(i), windowStart: minsAgo(i + 1) }));
        const kept = reloadMorningWith(many);
        expect(kept).toEqual(many.slice(0, 8).reverse());
    });
});
