// ============================================================
// Mission Control — a covered start stays covered across the upgrade from PR
// 207, through the real scheduler (review of PR 209, found by Codex)
// ------------------------------------------------------------
// PR 207 stamped a save that moves a start time onto the run and decided the
// occurrence ahead at every read; this branch stores that decision beside the
// stamp (retimeCoversDay). A profile PR 207 saved has the stamp alone: an
// evening at 23:30 moved at 23:50 to 00:10, the app closed, reopened at 00:11
// on this build, read the missing decision as "none" and started the evening at
// once. Hydration decides such a stamp once at load. Store-level cases:
// store/persistence-retime-decision.test.ts.
// ============================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { STORAGE_KEY, loadPersistedStateWithRepairs } from '../store/useMCStore';
import { crossing, eveningOnlyAt, jumpTo, renderLiveScheduler, saveAndClose, startLogs, step } from './schedulerTestKit';
import type { MCState } from '../types';

const nov = (day: number, h: number, m: number) => new Date(2026, 10, day, h, m);

/** What the last launch saved, its evening as PR 207 wrote it (no retimeCoversDay), and only the evening. */
function reopenAsPr207Saved(): MCState {
    const blob = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as MCState;
    const missions = blob.missions.map(m => Object.fromEntries(Object.entries(m).filter(([key]) => key !== 'retimeCoversDay')));
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...blob, missions }));
    const { state } = loadPersistedStateWithRepairs();
    return { ...state, missions: state.missions.filter(m => m.phase === 'evening') };
}

describe('a covered start across the upgrade from PR 207', () => {
    beforeEach(() => { vi.useFakeTimers(); localStorage.clear(); });
    afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); localStorage.clear(); });

    it('an evening at 23:30 moved at 23:50 to 00:10 and closed, reopened at 00:11: nothing starts; the night after does', () => {
        vi.setSystemTime(nov(10, 23, 25));
        const first = renderLiveScheduler(eveningOnlyAt('23:30', 60));
        step(1_100);
        crossing(nov(10, 23, 30));
        expect(first.live.state.activeMission, 'precondition: the scheduler started 23:30').toBe('evening');
        jumpTo(nov(10, 23, 50));
        first.dispatch({ type: 'SET_SETTINGS', settings: { eveningStartsAt: '00:10' } });
        expect(first.live.state.activeMission, 'precondition: the save ended the run').toBe('none');
        saveAndClose(first);

        vi.setSystemTime(nov(11, 0, 11));
        const loaded = reopenAsPr207Saved();
        expect(loaded.missions[0].startsAtChangedAt, 'precondition: the stamp survived').toBe(nov(10, 23, 50).toISOString());
        const h = renderLiveScheduler(loaded);
        step(2_000);
        expect(h.live.state.activeMission, 'the missing decision read as "none": the evening started at once').toBe('none');
        expect(startLogs(h.live.state, 'evening')).toBe(1);

        crossing(nov(12, 0, 10));
        expect(h.live.state.activeMission, 'the night after is a new occurrence').toBe('evening');
        h.unmount();
    });
});
