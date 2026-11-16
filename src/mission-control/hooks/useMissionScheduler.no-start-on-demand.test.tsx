// ============================================================
// Mission Control — a Settings save never starts a mission on demand
// ------------------------------------------------------------
// Owner rule of 2026-11-10: only the paired phone starts a mission out of
// schedule. A mission that had not run that day could still be started from MC
// Settings: save its start time as a minute in the past (or lengthen it so a
// window that closed opens again), and the window is open at once with its
// occurrence not run, so the scheduler started it with a full timer.
//
// The rule these pin: a save that puts a window under the clock (one that was
// not open just before it) is stamped on the mission (savedIntoWindowAt,
// store/missionActivity.ts), and the stamp covers the occurrence open at the
// save, no other (store/occurrenceHandled.ts). A start still ahead at the save
// stays automatic, and the phone still starts the mission. DST nights: the .dst
// twin. Real reducer, real dispatch interceptor (schedulerTestKit.ts).
// ============================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { initialState } from '../store/mcReducer';
import { loadPersistedState } from '../store/useMCStore';
import {
    crossing, eveningOnlyAt, jumpTo, ranOnce, renderLiveScheduler, saveAndClose, skippedLines, startLogs, step,
    type Phase,
} from './schedulerTestKit';
import type { MCSettings, MCState } from '../types';

/** A date in November 2026 (fixed, so a test that passes midnight names its days plainly). */
const nov = (day: number, h: number, m: number, s = 0, ms = 0) => new Date(2026, 10, day, h, m, s, ms);

/** What Settings → Save sends to move `phase`'s start time to `startsAt`. */
function retime(phase: Phase, startsAt: string) {
    return { type: 'SET_SETTINGS', settings: phase === 'morning' ? { morningStartsAt: startsAt } : { eveningStartsAt: startsAt } } as const;
}

const save = (settings: Partial<MCSettings>) => ({ type: 'SET_SETTINGS', settings }) as const;

const missionOf = (s: MCState, phase: Phase) => s.missions.find(m => m.phase === phase);

/** Launches at `when` (default: a profile on which nothing ran) with no window open. */
function launchAt(when: Date, state: MCState = initialState, ipc = false) {
    vi.setSystemTime(when);
    const h = renderLiveScheduler(state, { ipc });
    step(1_100);
    expect(h.live.state.activeMission, 'precondition: no window is open at launch').toBe('none');
    return h;
}

const BLOCKED: Array<{ phase: Phase; launch: Date; movedTo: string; closes: Date }> = [
    { phase: 'morning', launch: nov(10, 7, 0), movedTo: '06:59', closes: nov(10, 7, 29) },
    { phase: 'evening', launch: nov(10, 20, 30), movedTo: '20:29', closes: nov(10, 21, 29) },
];

describe('a save that puts a window under the clock starts nothing', () => {
    beforeEach(() => { vi.useFakeTimers(); localStorage.clear(); });
    afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); localStorage.clear(); delete window.ipcRenderer; });

    it.each(BLOCKED)('the $phase that has not run, saved to start a minute ago, does not start', ({ phase, launch, movedTo, closes }) => {
        const h = launchAt(launch);
        h.dispatch(retime(phase, movedTo));
        step(2_000);
        expect(h.live.state.activeMission, 'the save started the mission on demand').toBe('none');

        crossing(closes);
        expect(h.live.state.activeMission).toBe('none');
        expect(startLogs(h.live.state, phase)).toBe(0);
        h.unmount();
    });

    it('a save that moves the start ahead of the clock still starts it there, automatically', () => {
        const h = launchAt(nov(10, 7, 0));
        h.dispatch(retime('morning', '07:10'));
        crossing(nov(10, 7, 10));
        expect(h.live.state.activeMission).toBe('morning');
        expect(h.live.state.activityLogs.find(l => l.message.startsWith('morning mission started'))?.source).toBe('scheduler');
        h.unmount();
    });

    it('holds back that occurrence only: the evening that day and the next morning start', () => {
        const h = launchAt(nov(10, 7, 0));
        h.dispatch(retime('morning', '06:59'));
        step(2_000);
        expect(h.live.state.activeMission, 'precondition: the save started nothing').toBe('none');

        crossing(nov(10, 19, 0));
        expect(h.live.state.activeMission, 'the other phase').toBe('evening');
        crossing(nov(10, 20, 0));
        crossing(nov(11, 6, 59));
        expect(h.live.state.activeMission, 'the next day is a new occurrence').toBe('morning');
        expect(missionOf(h.live.state, 'morning')?.occurrenceDate).toBe('2026-11-11');
        h.unmount();
    });

    it('the phone still starts the held-back morning right after the save', () => {
        const h = launchAt(nov(10, 7, 0), initialState, true);
        h.dispatch(retime('morning', '06:59'));
        step(1_000);
        expect(h.live.state.activeMission, 'precondition: the save started nothing').toBe('none');

        h.emit('remote-control:action', { type: 'SET_ACTIVE_MISSION', phase: 'morning' });
        expect(h.live.state.activeMission).toBe('morning');
        expect(h.live.state.activityLogs.filter(l => l.message.startsWith('morning mission started')).map(l => l.source)).toEqual(['remote']);
        h.unmount();
    });

    it('a save at the very instant the new start begins is held back (the tie counts as under the clock)', () => {
        vi.setSystemTime(nov(10, 7, 0));
        const h = renderLiveScheduler(initialState);
        h.dispatch(retime('morning', '07:00'));
        step(2_000);
        expect(h.live.state.activeMission, 'saved at 07:00:00.000 for 07:00').toBe('none');
        h.unmount();
    });

    it('a save 1 ms before the new start is a start ahead: it starts automatically', () => {
        vi.setSystemTime(nov(10, 6, 59, 59, 999));
        const h = renderLiveScheduler(initialState);
        h.dispatch(retime('morning', '07:00'));
        step(1_100);
        expect(h.live.state.activeMission).toBe('morning');
        h.unmount();
    });

    it('a save into the window, then a save that moves the start ahead: the later start is automatic', () => {
        const h = launchAt(nov(10, 7, 0));
        h.dispatch(retime('morning', '06:59'));
        step(1_000);
        expect(h.live.state.activeMission, 'precondition: the save started nothing').toBe('none');
        jumpTo(nov(10, 7, 5));
        h.dispatch(retime('morning', '07:30'));

        crossing(nov(10, 7, 30));
        expect(h.live.state.activeMission).toBe('morning');
        h.unmount();
    });

    it('past midnight: an evening moved at 00:10 onto last night\'s open 23:30 window does not start, and tonight\'s does', () => {
        const h = launchAt(nov(11, 0, 5), eveningOnlyAt('19:00', 60)); // no 06:00 morning inside the long jump below
        jumpTo(nov(11, 0, 10));
        h.dispatch(retime('evening', '23:30'));
        step(2_000);
        expect(h.live.state.activeMission, "last night's 23:30–00:30 started on demand").toBe('none');

        crossing(nov(11, 23, 30));
        expect(h.live.state.activeMission).toBe('evening');
        expect(missionOf(h.live.state, 'evening')?.occurrenceDate).toBe('2026-11-11');
        h.unmount();
    });
});

describe('what the stamp leaves alone', () => {
    beforeEach(() => { vi.useFakeTimers(); localStorage.clear(); });
    afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); localStorage.clear(); delete window.ipcRenderer; });

    it('a longer duration that reopens a window that closed unseen does not start it; its ⏭️ line stays the one line', () => {
        const h = launchAt(nov(10, 19, 45), ranOnce(eveningOnlyAt('19:00', 30), 'evening', nov(9, 19, 0)));
        expect(skippedLines(h.live.state, 'evening'), 'precondition: the launch reports the 19:00 window that closed unseen').toBe(1);
        h.dispatch(save({ eveningDurationMins: 60 }));
        step(2_000);
        expect(h.live.state.activeMission, 'the save reopened 19:00–20:00 and it started').toBe('none');

        crossing(nov(10, 20, 0));
        expect(startLogs(h.live.state, 'evening')).toBe(0);
        expect(skippedLines(h.live.state, 'evening')).toBe(1);
        h.unmount();
    });

    it.each<[string, Partial<MCSettings>]>([
        ['a save that changes no window (the Cream task)', { creamTaskEnabled: true }],
        ['a longer duration for the window already open', { eveningDurationMins: 90 }],
    ])('%s, while the evening waits behind a running morning, is not stamped: the evening starts when the morning ends', (_name, settings) => {
        const h = launchAt(nov(10, 18, 55), initialState, true);
        h.emit('remote-control:action', { type: 'SET_ACTIVE_MISSION', phase: 'morning' });
        jumpTo(nov(10, 19, 5));
        expect(h.live.state.activeMission, 'precondition: the evening window opened behind the running morning').toBe('morning');
        h.dispatch(save(settings));
        expect(missionOf(h.live.state, 'evening')?.savedIntoWindowAt).toBeUndefined();

        jumpTo(nov(10, 19, 10));
        h.emit('remote-control:action', { type: 'CANCEL_MISSION', missionPhase: 'morning' });
        step(1_100);
        expect(h.live.state.activeMission, 'the evening was pending, not put under the clock by the save').toBe('evening');
        h.unmount();
    });

    it('the save covers only the window it opened: an earlier window that closed unseen still gets its ⏭️ line', () => {
        // The launch's report is cancelled by the save before it fires (a change to
        // `missions`), so the re-arm looks back again, at the moved time.
        vi.setSystemTime(nov(10, 18, 0));
        const h = renderLiveScheduler(ranOnce(eveningOnlyAt('19:00', 60), 'evening', nov(8, 19, 0)));
        h.dispatch(retime('evening', '17:50'));
        step(1_100);
        expect(h.live.state.activeMission, 'the save opened 17:50–18:50 and it started').toBe('none');
        expect(h.live.state.activityLogs.filter(l => l.id === 'mission-skipped-evening-2026-11-09'), "the 9th's window closed unseen").toHaveLength(1);
        h.unmount();
    });

    it('a save into the window is not a run: a second save that moves the start ahead still starts there (saveKeepsRun)', () => {
        // Moved to 17:18, after the phone run ended at 17:15: a window that run never
        // covered (one at 17:10 it would cover itself, by ending inside it).
        const h = launchAt(nov(10, 17, 0), eveningOnlyAt('19:00', 60), true);
        h.emit('remote-control:action', { type: 'SET_ACTIVE_MISSION', phase: 'evening' });
        jumpTo(nov(10, 17, 15));
        h.emit('remote-control:action', { type: 'CANCEL_MISSION', missionPhase: 'evening' });
        jumpTo(nov(10, 17, 20));
        h.dispatch(retime('evening', '17:18'));
        step(1_000);
        expect(h.live.state.activeMission, 'precondition: the save started nothing').toBe('none');

        jumpTo(nov(10, 17, 25));
        h.dispatch(retime('evening', '18:00'));
        expect(missionOf(h.live.state, 'evening')?.startsAtChangedAt, 'the first save was not a run for the second to keep').toBeUndefined();
        crossing(nov(10, 18, 0));
        expect(h.live.state.activeMission, 'the 18:00 start was still ahead at the save').toBe('evening');
        h.unmount();
    });
});

describe('a relaunch after the save', () => {
    beforeEach(() => { vi.useFakeTimers(); localStorage.clear(); });
    afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); localStorage.clear(); });

    it('inside the window the save opened, starts nothing', () => {
        const h = launchAt(nov(10, 7, 0));
        h.dispatch(retime('morning', '06:59'));
        saveAndClose(h);

        vi.setSystemTime(nov(10, 7, 10));
        const next = renderLiveScheduler(loadPersistedState());
        step(2_000);
        expect(next.live.state.activeMission, 'the relaunch started the window the save opened').toBe('none');
        next.unmount();
    });

    it('after that window closed, logs no ⏭️ line for it (the mission ran the day before: lines are owed)', () => {
        const h = launchAt(nov(10, 5, 0), ranOnce(initialState, 'morning', nov(9, 6, 0)));
        h.dispatch(retime('morning', '04:59'));
        step(2_000);
        expect(h.live.state.activeMission, 'precondition: the save started nothing').toBe('none');
        saveAndClose(h);

        vi.setSystemTime(nov(10, 5, 40));
        const next = renderLiveScheduler(loadPersistedState());
        step(1_100);
        expect(skippedLines(next.live.state, 'morning'), 'the save covered 04:59–05:29: not a missed window').toBe(0);
        next.unmount();
    });
});
