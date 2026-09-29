// ============================================================
// Mission Control — a mission window that crosses midnight
// ------------------------------------------------------------
// An evening at 23:30 for 60 min stores `endsAt: '24:30'`: the end is start +
// duration, not wrapped, and the scheduler reads it as 00:30 the next day. The
// strict HH:MM rule for entered times rejects '24:30', so reading the end with
// it (or wrapping it to '00:30') loses tonight's mission without a word. Every
// other scheduler suite uses daytime windows, so nothing else would notice
// (review of the 2026-09-26 parser consolidation, found by mutation).
// ============================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { initialState, mcReducer } from '../store/mcReducer';
import { at, jumpTo, renderLiveScheduler, startLogs, step } from './schedulerTestKit';
import type { MCState } from '../types';

/** Evening 23:30 for 60 min, derived the way Settings → Save derives it. */
function lateEvening(): MCState {
    const s = mcReducer(initialState, { type: 'SET_SETTINGS', settings: { eveningStartsAt: '23:30', eveningDurationMins: 60 } });
    expect(s.missions.find(m => m.phase === 'evening')?.endsAt, 'precondition').toBe('24:30');
    return s;
}

const skippedLogs = (s: MCState) => s.activityLogs.filter(l => l.message.startsWith('Evening mission skipped')).length;

describe('an evening window that crosses midnight', () => {
    beforeEach(() => { vi.useFakeTimers(); });
    afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

    it('a launch at 23:40 starts tonight’s mission, not tomorrow’s', () => {
        vi.setSystemTime(at(23, 40));
        const { live, unmount } = renderLiveScheduler(lateEvening());
        step(100);

        expect(live.state.activeMission).toBe('evening');
        expect(startLogs(live.state, 'evening')).toBe(1);
        unmount();
    });

    it('a timer that fires 30 min late, inside the window before midnight, still starts it', () => {
        vi.setSystemTime(at(23, 20));
        const { live, unmount } = renderLiveScheduler(lateEvening());
        step(100);
        expect(live.state.activeMission, 'precondition: armed, not started').toBe('none');

        // The machine sleeps through 23:30. vi.setSystemTime keeps the pending
        // timer's remaining delay, so it fires at about 23:59:59.9: before
        // midnight, but past the 5 min tolerance, so only the window end read
        // from '24:30' keeps it on time. (After midnight the scheduler aims at
        // tonight's occurrence and does not start it; an older limit.)
        vi.setSystemTime(at(23, 50));
        jumpTo(at(0, 0, 1));
        step(100);

        expect(live.state.activeMission).toBe('evening');
        expect(skippedLogs(live.state), 'logged as skipped').toBe(0);
        unmount();
    });
});
