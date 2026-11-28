// ============================================================
// Mission Control — hydration keeps the windows a save covered as the writer
// keeps them: once per window, those of the four latest days, 64 at most
// (review of PR 209, Codex and Opus)
// ------------------------------------------------------------
// The writer (missionActivity.ts) keeps each window once, by its start, and the
// four latest days that have one (64 at most). A saved profile is not bound by
// that: an older build or a damaged write can hold a window twice, or
// thousands of entries. Codex
// built one of 10,000 (803 KB): every Settings save then compared pairs of them
// (50 M comparisons, 483 ms). Hydration applies the writer's rule (keptWindows).
// The entry-by-entry checks are in persistence-time.test.ts.
// ============================================================

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { initialState } from './mcReducer';
import { loadPersistedState, STORAGE_KEY } from './useMCStore';
import type { SavedWindow } from '../types';

const NOW = new Date(2026, 10, 20, 12, 0);
/** The real clock, taken before vi.useFakeTimers() fakes performance.now too: a faked one measured a 2.1 s load as 0 ms (Codex). */
const realNow = performance.now.bind(performance);
const minsAgo = (mins: number) => new Date(NOW.getTime() - mins * 60_000).toISOString();

function reloadMorningWith(savedIntoWindows: unknown): SavedWindow[] | undefined {
    const missions = initialState.missions.map(m => (m.phase === 'morning' ? { ...m, savedIntoWindows } : m));
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...initialState, missions }));
    return loadPersistedState().missions.find(m => m.phase === 'morning')?.savedIntoWindows;
}

describe('hydration — the windows a save covered, as the writer keeps them', () => {
    beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(NOW); localStorage.removeItem(STORAGE_KEY); });
    afterEach(() => { vi.useRealTimers(); localStorage.removeItem(STORAGE_KEY); });

    it('a window saved twice is kept once, with its earlier save, whichever is listed first', () => {
        const windowStart = minsAgo(60);
        const earlier = { savedAt: minsAgo(50), windowStart };
        const later = { savedAt: minsAgo(40), windowStart };
        expect(reloadMorningWith([earlier, later])).toEqual([earlier]);
        expect(reloadMorningWith([later, earlier])).toEqual([earlier]);
    });

    it('10,000 entries load as 64 at most, the latest to start, in order of start', () => {
        const many = Array.from({ length: 10_000 }, (_, i) => ({ savedAt: minsAgo(i), windowStart: minsAgo(i + 1) }));
        const startedAt = realNow();
        const kept = reloadMorningWith(many);
        const elapsedMs = realNow() - startedAt;
        expect(kept).toEqual(many.slice(0, 64).reverse());
        expect(elapsedMs, 'bounded work: the load takes about 70 ms alone on the real clock, so 2 s is generous for a loaded machine').toBeLessThan(2_000);
    });

    it('every window of the four latest days is kept, however many a day has (Codex: nine on two days)', () => {
        // Eight windows on the 19th (07:00 … 07:07), saved at 07:08, and the 20th's 07:00, saved at 07:30.
        const day19 = Array.from({ length: 8 }, (_, m) => ({ savedAt: new Date(2026, 10, 19, 7, 8).toISOString(), windowStart: new Date(2026, 10, 19, 7, m).toISOString() }));
        const day20 = { savedAt: new Date(2026, 10, 20, 7, 30).toISOString(), windowStart: new Date(2026, 10, 20, 7, 0).toISOString() };
        expect(reloadMorningWith([...day19, day20])).toEqual([...day19, day20]);
    });

    it('windows on a fifth day back are dropped', () => {
        const at7 = (day: number) => ({ savedAt: new Date(2026, 10, day, 7, 10).toISOString(), windowStart: new Date(2026, 10, day, 7, 0).toISOString() });
        expect(reloadMorningWith([15, 16, 17, 18, 19].map(at7))).toEqual([16, 17, 18, 19].map(at7));
    });
});
