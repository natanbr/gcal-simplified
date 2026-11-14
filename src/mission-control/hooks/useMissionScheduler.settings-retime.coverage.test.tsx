// ============================================================
// Mission Control — which occurrence a Settings save covers (review of e260d77)
// ------------------------------------------------------------
// The 2026-11-13 rule (store/occurrenceHandled.ts): a save that moves a start
// time covers the moved occurrence only when the run covered its occurrence at
// the OLD time (it was running at the save, or it had run or concluded that
// occurrence), and then covers the occurrence of the run's own day or the one
// its last activity is nearer to. These pin the holes the review proved:
//   A  a move past midnight during the run (23:30 moved to 00:10 at 23:50; 19:00
//      moved to 00:05 at 19:10) started a fresh attempt that night;
//   B  a phone run that ended BEFORE the old window, then a save, covered the
//      whole day: the moved window never started and logged no ⏭️ line;
//   C  a save made with the clock set back was stamped before the last run, so
//      the moved window started once the clock was right again.
// And E: after a save, a phone start that then expires is a logged miss, and
// only that outcome date stops the scheduler starting the moved window; and the
// gate: a phone run after a kept save is judged as if no save had been made.
// Real reducer, real dispatch interceptor (schedulerTestKit.ts).
// ============================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { initialState, mcReducer } from '../store/mcReducer';
import { loadPersistedState } from '../store/useMCStore';
import {
    crossing, eveningOnlyAt, jumpTo, loadEveningOnly, renderLiveScheduler, saveAndClose, skippedLines, startLogs, step,
    type Phase,
} from './schedulerTestKit';
import type { MCState } from '../types';

/** What Settings → Save sends to move `phase`'s start time to `startsAt`. */
function retime(phase: Phase, startsAt: string) {
    return { type: 'SET_SETTINGS', settings: phase === 'morning' ? { morningStartsAt: startsAt } : { eveningStartsAt: startsAt } } as const;
}

/** A date in November 2026 (fixed, so a test that passes midnight names its days plainly). */
const nov = (day: number, h: number, m: number, s = 0) => new Date(2026, 10, day, h, m, s);

/** Only the morning, 06:00 for `durationMins`. */
function morningFor(durationMins: number): MCState {
    const s = mcReducer(initialState, { type: 'SET_SETTINGS', settings: { morningDurationMins: durationMins } });
    return { ...s, missions: s.missions.filter(m => m.phase === 'morning') };
}

const loadMorningOnly = (): MCState => {
    const loaded = loadPersistedState();
    return { ...loaded, missions: loaded.missions.filter(m => m.phase === 'morning') };
};

/** The scheduler starts the evening at `startsAt` (60 min) on the 10th; at `savedAt` Settings → Save moves it to `movedTo`. */
function eveningRetimedMidRun(startsAt: [number, number], savedAt: Date, movedTo: string) {
    vi.setSystemTime(nov(10, startsAt[0], startsAt[1] - 1, 59));
    const h = renderLiveScheduler(eveningOnlyAt(`${startsAt[0]}:${String(startsAt[1]).padStart(2, '0')}`, 60));
    step(1_100);
    expect(h.live.state.activeMission, 'precondition: the scheduler started the evening').toBe('evening');
    jumpTo(savedAt);
    h.dispatch(retime('evening', movedTo));
    expect(h.live.state.activeMission, 'precondition: the save ended the run').toBe('none');
    return h;
}

describe('A: a move past midnight during the run covers that night only', () => {
    beforeEach(() => { vi.useFakeTimers(); localStorage.clear(); });
    afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); localStorage.clear(); });

    it('a 23:30 evening moved at 23:50 to 00:10 starts nothing at 00:10, and starts the night after', () => {
        const h = eveningRetimedMidRun([23, 30], nov(10, 23, 50), '00:10');
        crossing(nov(11, 0, 10));
        expect(h.live.state.activeMission, 'a fresh attempt started at 00:10, 20 min after the run the save ended').toBe('none');
        expect(skippedLines(h.live.state, 'evening'), 'it ran minutes ago: not a missed window').toBe(0);

        crossing(nov(12, 0, 10));
        expect(h.live.state.activeMission, 'the night after is a new occurrence').toBe('evening');
        expect(startLogs(h.live.state, 'evening'), 'the 23:30 start and this one').toBe(2);
        h.unmount();
    });

    it('a 19:00 evening moved at 19:10 to 00:05 starts nothing at 00:05', () => {
        const h = eveningRetimedMidRun([19, 0], nov(10, 19, 10), '00:05');
        crossing(nov(11, 0, 5));
        expect(h.live.state.activeMission, 'a fresh attempt started at 00:05, the night of the run').toBe('none');
        expect(startLogs(h.live.state, 'evening'), 'the 19:00 start only').toBe(1);
        h.unmount();
    });

    it('a relaunch inside the moved window, and one after it closed, start nothing and log no ⏭️ line', () => {
        saveAndClose(eveningRetimedMidRun([23, 30], nov(10, 23, 50), '00:10'));

        vi.setSystemTime(nov(11, 0, 30));
        const inside = renderLiveScheduler(loadEveningOnly());
        step(1_000);
        expect(inside.live.state.activeMission, 'a relaunch inside 00:10–01:10').toBe('none');
        saveAndClose(inside);

        vi.setSystemTime(nov(11, 1, 30));
        const after = renderLiveScheduler(loadEveningOnly());
        step(1_000);
        expect(skippedLines(after.live.state, 'evening'), 'the run covered it: not a missed window').toBe(0);
        after.unmount();
    });
});

describe('B: a save covers nothing the run did not cover at the old time', () => {
    beforeEach(() => { vi.useFakeTimers(); localStorage.clear(); });
    afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); localStorage.clear(); delete window.ipcRenderer; });

    it('a phone run 17:00–17:15 (before the 19:00 window), then a save to 19:30 at 18:00: 19:30 starts', () => {
        vi.setSystemTime(nov(10, 17, 0));
        const h = renderLiveScheduler(eveningOnlyAt('19:00', 60), { ipc: true });
        h.emit('remote-control:action', { type: 'SET_ACTIVE_MISSION', phase: 'evening' });
        jumpTo(nov(10, 17, 15));
        h.emit('remote-control:action', { type: 'CANCEL_MISSION', missionPhase: 'evening' });
        expect(h.live.state.activeMission, 'precondition: the phone stopped its early run').toBe('none');
        jumpTo(nov(10, 18, 0));
        h.dispatch(retime('evening', '19:30'));

        crossing(nov(10, 19, 30));
        expect(h.live.state.activeMission, 'the run ended before 19:00, so it never covered the evening (2026-09-22)').toBe('evening');
        expect(startLogs(h.live.state, 'evening'), 'the phone start and the scheduled one').toBe(2);
        expect(skippedLines(h.live.state, 'evening')).toBe(0);
        h.unmount();
    });

    it('the same early phone run still RUNNING when the save lands at 18:40 is kept: 19:30 starts nothing', () => {
        vi.setSystemTime(nov(10, 18, 30));
        const h = renderLiveScheduler(eveningOnlyAt('19:00', 60), { ipc: true });
        h.emit('remote-control:action', { type: 'SET_ACTIVE_MISSION', phase: 'evening' });
        jumpTo(nov(10, 18, 40));
        h.dispatch(retime('evening', '19:30'));
        expect(h.live.state.activeMission, 'precondition: the save ended the run').toBe('none');

        crossing(nov(10, 19, 30));
        expect(h.live.state.activeMission, 'the save ended a run in progress: no fresh attempt').toBe('none');
        expect(startLogs(h.live.state, 'evening'), 'the phone start only').toBe(1);
        h.unmount();
    });
});

describe('C: a save with the clock set back', () => {
    beforeEach(() => { vi.useFakeTimers(); localStorage.clear(); });
    afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); localStorage.clear(); delete window.ipcRenderer; });

    it('stopped at 06:10, clock set to 05:00, moved to 06:30: never older than the run, and 06:30 starts nothing', () => {
        vi.setSystemTime(nov(10, 5, 59, 59));
        const h = renderLiveScheduler(morningFor(30), { ipc: true });
        step(1_100);
        jumpTo(nov(10, 6, 10));
        h.emit('remote-control:action', { type: 'CANCEL_MISSION', missionPhase: 'morning' });
        expect(h.live.state.activeMission, 'precondition: the phone stopped the 06:00 run').toBe('none');

        vi.setSystemTime(nov(10, 5, 0)); // the child sets the Windows clock back
        h.dispatch(retime('morning', '06:30'));
        const m = h.live.state.missions[0];
        expect(Date.parse(m.startsAtChangedAt ?? ''), 'the save looks older than the run it follows')
            .toBeGreaterThanOrEqual(Date.parse(m.lastActiveAt ?? ''));

        vi.setSystemTime(nov(10, 6, 20)); // the clock is right again
        saveAndClose(h);
        const next = renderLiveScheduler(loadMorningOnly());
        crossing(nov(10, 6, 30));
        expect(next.live.state.activeMission, 'a fresh attempt once the clock was right again').toBe('none');
        expect(startLogs(next.live.state, 'morning'), 'the 06:00 start only').toBe(1);
        next.unmount();
    });
});

describe('E: after a save, a phone start that expires is concluded by its outcome date', () => {
    beforeEach(() => { vi.useFakeTimers(); localStorage.clear(); });
    afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); localStorage.clear(); delete window.ipcRenderer; });

    it('run moved 06:00 → 06:30 at 06:08, phone start 06:09 that times out at 06:19: 06:30 starts nothing', () => {
        vi.setSystemTime(nov(10, 5, 59, 59));
        const h = renderLiveScheduler(morningFor(10), { ipc: true });
        step(1_100);
        jumpTo(nov(10, 6, 8));
        h.dispatch(retime('morning', '06:30'));
        jumpTo(nov(10, 6, 9));
        h.emit('remote-control:action', { type: 'SET_ACTIVE_MISSION', phase: 'morning' });
        expect(h.live.state.activeMission, 'precondition: the phone started a run after the save').toBe('morning');

        crossing(nov(10, 6, 19));
        expect(h.live.state.activeMission, 'precondition: the phone run timed out').toBe('none');
        expect(h.live.state.lastCompletedOrFailedMorningDate, 'precondition: the miss is logged for the 10th').toBe('2026-11-10');

        crossing(nov(10, 6, 30));
        expect(h.live.state.activeMission, 'the 10th concluded with a miss: no third attempt').toBe('none');
        expect(startLogs(h.live.state, 'morning'), 'the 06:00 start and the phone start').toBe(2);
        h.unmount();
    });
});

describe('a phone run after a kept save is judged as if no save had been made (the gate)', () => {
    beforeEach(() => { vi.useFakeTimers(); localStorage.clear(); });
    afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); localStorage.clear(); delete window.ipcRenderer; });

    it('morning ended by a move to 06:30 at 06:08, phone run 06:10–06:15: the 06:30 start still comes (2026-09-22)', () => {
        vi.setSystemTime(nov(10, 5, 59, 59));
        const h = renderLiveScheduler(morningFor(10), { ipc: true });
        step(1_100);
        jumpTo(nov(10, 6, 8));
        h.dispatch(retime('morning', '06:30'));
        expect(h.live.state.missions[0].startsAtChangedAt, 'precondition: the save kept the 06:00 run').toBeDefined();
        jumpTo(nov(10, 6, 10));
        h.emit('remote-control:action', { type: 'SET_ACTIVE_MISSION', phase: 'morning' });
        jumpTo(nov(10, 6, 15));
        h.emit('remote-control:action', { type: 'CANCEL_MISSION', missionPhase: 'morning' });
        expect(h.live.state.activeMission, 'precondition: the phone stopped its run').toBe('none');

        crossing(nov(10, 6, 30));
        expect(h.live.state.activeMission, 'a phone run that ended before the window covers none of it').toBe('morning');
        expect(startLogs(h.live.state, 'morning'), 'the 06:00 start, the phone start and this one').toBe(3);
        h.unmount();
    });
});
