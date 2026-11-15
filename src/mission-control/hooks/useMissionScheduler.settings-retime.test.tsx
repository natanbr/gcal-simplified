// ============================================================
// Mission Control — a Settings save does not hand out a second attempt
// ------------------------------------------------------------
// Found reviewing PR 206, closed 2026-11-13 (owner decision). Saving a new start
// time for the RUNNING mission in MC Settings ends the run with no outcome, and
// the end stamp (lastActiveAt) lies before the new time, so the scheduler read
// the occurrence at the new time as "not run" and started a fresh attempt with
// a full timer. A child at the touchscreen could repeat it and never be charged
// a miss. Past midnight, after a miss in an overnight evening, a move to just
// after midnight pulled the next day's occurrence forward the same way.
//
// The rule these pin (store/occurrenceHandled.ts): a save stamped at or after
// the phase last ran, made when the run covered its occurrence at the old
// time, keeps that run covering the occurrence of its stored day and the next
// one when its last activity is nearer that start than the window behind.
// The phone can still start it (useRemoteControl.ts). The review's holes (past
// midnight, a run before the old window, a clock set back): the .coverage
// twin. Real reducer, real dispatch interceptor (schedulerTestKit.ts).
// ============================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { initialState, mcReducer } from '../store/mcReducer';
import { loadPersistedState } from '../store/useMCStore';
import {
    at, crossing, eveningOnlyAt, jumpTo, loadEveningOnly, ranOnce, renderLiveScheduler, saveAndClose, skippedLines, startLogs, step,
    type Phase,
} from './schedulerTestKit';
import type { MCState } from '../types';

/** What Settings → Save sends to move `phase`'s start time to `startsAt`. */
function retime(phase: Phase, startsAt: string) {
    return { type: 'SET_SETTINGS', settings: phase === 'morning' ? { morningStartsAt: startsAt } : { eveningStartsAt: startsAt } } as const;
}

/** Only the morning, 06:00 for 10 min (no start-time change: nothing stamped). */
function morningOnly(): MCState {
    const s = mcReducer(initialState, { type: 'SET_SETTINGS', settings: { morningDurationMins: 10 } });
    return { ...s, missions: s.missions.filter(m => m.phase === 'morning') };
}

const loadMorningOnly = (): MCState => {
    const loaded = loadPersistedState();
    return { ...loaded, missions: loaded.missions.filter(m => m.phase === 'morning') };
};

/** 06:00: the scheduler starts the morning; 06:08: Settings → Save moves it to `startsAt`, which ends the run. */
function morningRetimedMidRun(startsAt: string, ipc = false) {
    vi.setSystemTime(at(6, 0));
    const h = renderLiveScheduler(morningOnly(), { ipc });
    step(100);
    expect(h.live.state.activeMission, 'precondition: the scheduler started the 06:00 morning').toBe('morning');
    jumpTo(at(6, 8));
    h.dispatch(retime('morning', startsAt));
    expect(h.live.state.activeMission, 'precondition: the save ended the run').toBe('none');
    return h;
}

/** A date in November 2026 (fixed, so a test that passes midnight names its days plainly). */
const nov = (day: number, h: number, m: number, s = 0) => new Date(2026, 10, day, h, m, s);

/** 23:30 on the 10th: the scheduler starts a 60-min evening; 00:30 on the 11th: it times out (a miss). */
function overnightEveningMissed() {
    vi.setSystemTime(nov(10, 23, 29, 59));
    const h = renderLiveScheduler(eveningOnlyAt('23:30', 60));
    step(1_100);
    expect(h.live.state.activeMission, 'precondition: the 23:30 evening started').toBe('evening');
    crossing(nov(11, 0, 30));
    expect(h.live.state.activeMission, 'precondition: the run timed out').toBe('none');
    expect(h.live.state.lastCompletedOrFailedEveningDate, 'precondition: the miss is dated the 10th').toBe('2026-11-10');
    return h;
}

describe('a Settings save that moves a phase that already ran starts nothing', () => {
    beforeEach(() => { vi.useFakeTimers(); localStorage.clear(); });
    afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); localStorage.clear(); });

    it('a running morning moved to 06:10 at 06:08, then to 06:15, never starts again', () => {
        const h = morningRetimedMidRun('06:10');
        const missed = h.live.state.missedMissionStreak;
        crossing(at(6, 10));
        expect(h.live.state.activeMission, 'a fresh attempt started at the new time').toBe('none');

        h.dispatch(retime('morning', '06:15'));
        crossing(at(6, 15));
        expect(h.live.state.activeMission, 'a fresh attempt started at the second new time').toBe('none');
        expect(startLogs(h.live.state, 'morning'), 'the 06:00 start only').toBe(1);
        expect(skippedLines(h.live.state, 'morning'), 'it ran: not a missed window').toBe(0);
        expect(h.live.state.missedMissionStreak, 'the save itself charges nothing').toBe(missed);

        const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');
        step(10_000);
        expect(setTimeoutSpy, 'the scheduler re-aims at the covered window').not.toHaveBeenCalled();
        h.unmount();
    });

    it('a far move the same day (06:00 run moved to 23:00) starts nothing today and starts tomorrow', () => {
        const h = morningRetimedMidRun('23:00');
        crossing(at(23, 0));
        expect(h.live.state.activeMission, 'the run belongs to today: today is covered').toBe('none');

        crossing(at(23, 0, 1));
        expect(h.live.state.activeMission, 'tomorrow is a new occurrence').toBe('morning');
        expect(startLogs(h.live.state, 'morning')).toBe(2);
        h.unmount();
    });

    it('an overnight evening missed at 00:30 and moved to 00:40 at 00:35 does not start at 00:40', () => {
        const h = overnightEveningMissed();
        jumpTo(nov(11, 0, 35));
        h.dispatch(retime('evening', '00:40'));

        crossing(nov(11, 0, 40));
        expect(h.live.state.activeMission, "the next day's occurrence pulled forward onto the miss").toBe('none');
        expect(startLogs(h.live.state, 'evening'), 'the 23:30 start only').toBe(1);
        expect(skippedLines(h.live.state, 'evening'), 'it ran minutes ago: not a missed window').toBe(0);
        h.unmount();
    });

    it('kept at 00:40, the evening skips only that night: the next night starts as normal', () => {
        const h = overnightEveningMissed();
        jumpTo(nov(11, 0, 35));
        h.dispatch(retime('evening', '00:40'));
        crossing(nov(11, 0, 40));

        crossing(nov(12, 0, 40));
        expect(h.live.state.activeMission).toBe('evening');
        expect(startLogs(h.live.state, 'evening'), 'the 23:30 start and this one: the night of the save was skipped').toBe(2);
        expect(h.live.state.missions[0].occurrenceDate).toBe('2026-11-12');
        h.unmount();
    });
});

describe('the phone and a phase that has not run are not held back', () => {
    beforeEach(() => { vi.useFakeTimers(); localStorage.clear(); });
    afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); localStorage.clear(); delete window.ipcRenderer; });

    it('the phone still starts the moved morning (the rule is the scheduler\'s, not the reducer\'s)', () => {
        const h = morningRetimedMidRun('06:10', true);
        crossing(at(6, 10));
        expect(h.live.state.activeMission, 'precondition: the scheduler started nothing').toBe('none');

        h.emit('remote-control:action', { type: 'SET_ACTIVE_MISSION', phase: 'morning' });
        expect(h.live.state.activeMission).toBe('morning');
        expect(h.live.state.activityLogs.filter(l => l.message.startsWith('morning mission started')).map(l => l.source))
            .toEqual(['remote', 'scheduler']);
        h.unmount();
    });

    it.each([['18:00', 18, 0], ['19:30', 19, 30], ['07:30', 7, 30]])(
        'an evening that ran yesterday at 19:00, moved today to %s, starts at the new time',
        (startsAt, hour, minute) => {
            vi.setSystemTime(at(7, 0));
            const eveningOnly = { ...initialState, missions: initialState.missions.filter(m => m.phase === 'evening') };
            const h = renderLiveScheduler(ranOnce(eveningOnly, 'evening', at(19, 0, -1)));
            step(100);
            h.dispatch(retime('evening', startsAt));

            crossing(at(hour, minute));
            expect(h.live.state.activeMission).toBe('evening');
            h.unmount();
        },
    );

    it('a run AFTER the save is judged as before: the phone\'s early run stopped before the moved window lets it start', () => {
        // The 2026-09-22 rule (useMissionScheduler.early-start.test.tsx): a run that ended before
        // its window covers none of it. Only a save made at or after the phase last ran covers more.
        vi.setSystemTime(at(17, 0));
        const h = renderLiveScheduler(eveningOnlyAt('19:00', 60), { ipc: true });
        h.dispatch(retime('evening', '19:30'));
        jumpTo(at(19, 0));
        h.emit('remote-control:action', { type: 'SET_ACTIVE_MISSION', phase: 'evening' });
        jumpTo(at(19, 15));
        h.emit('remote-control:action', { type: 'CANCEL_MISSION', missionPhase: 'evening' });
        expect(h.live.state.activeMission, 'precondition: the phone stopped its run').toBe('none');

        crossing(at(19, 30));
        expect(h.live.state.activeMission, 'the scheduled 19:30 start').toBe('evening');
        h.unmount();
    });

    it('an evening that has not run today, moved 19:00 → 18:00 at 17:00, starts at 18:00', () => {
        vi.setSystemTime(at(17, 0));
        const h = renderLiveScheduler(eveningOnlyAt('19:00', 60));
        h.dispatch(retime('evening', '18:00'));

        crossing(at(18, 0));
        expect(h.live.state.activeMission).toBe('evening');
        h.unmount();
    });
});

describe('a relaunch after the save', () => {
    beforeEach(() => { vi.useFakeTimers(); localStorage.clear(); });
    afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); localStorage.clear(); });

    it('inside the moved morning window, starts nothing', () => {
        saveAndClose(morningRetimedMidRun('06:10'));

        vi.setSystemTime(at(6, 12));
        const next = renderLiveScheduler(loadMorningOnly());
        step(1_000);
        expect(next.live.state.activeMission).toBe('none');
        expect(skippedLines(next.live.state, 'morning')).toBe(0);
        next.unmount();
    });

    it('inside the moved overnight window (00:45), starts nothing and logs no "skipped" line', () => {
        const h = overnightEveningMissed();
        jumpTo(nov(11, 0, 35));
        h.dispatch(retime('evening', '00:40'));
        saveAndClose(h);

        vi.setSystemTime(nov(11, 0, 45));
        const next = renderLiveScheduler(loadEveningOnly());
        step(1_000);
        expect(next.live.state.activeMission).toBe('none');
        expect(skippedLines(next.live.state, 'evening')).toBe(0);
        next.unmount();
    });
});

describe('the stamp the scheduler reads (startsAtChangedAt)', () => {
    beforeEach(() => { vi.useFakeTimers(); });
    afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

    it('a save that ends the run is stamped at the very instant the run ended, even with no action timestamp', () => {
        vi.setSystemTime(at(6, 0));
        const running = mcReducer(morningOnly(), { type: 'SET_ACTIVE_MISSION', phase: 'morning', origin: 'scheduler', timestamp: new Date().toISOString() });
        vi.setSystemTime(at(6, 8)); // before the run's due end, so its end is stamped at the save
        // Every clock read gives a later millisecond: two reads for one action would disagree.
        const realToIso = Date.prototype.toISOString;
        let reads = 0;
        vi.spyOn(Date.prototype, 'toISOString').mockImplementation(function (this: Date) { return realToIso.call(new Date(this.getTime() + reads++)); });

        const saved = mcReducer(running, retime('morning', '06:10')).missions[0];
        expect(saved.startsAtChangedAt).toBeDefined();
        expect(saved.startsAtChangedAt, 'the move must not look older than the run it ended').toBe(saved.lastActiveAt);
    });

    it('only a real change of the start time, after a run it keeps, is stamped', () => {
        const stamp = { timestamp: '2026-11-10T12:00:00.000Z' };
        const ran = ranOnce(initialState, 'morning', new Date(Date.parse(stamp.timestamp) - 60 * 60_000)); // concluded an hour before
        const morning = (s: MCState) => s.missions.find(m => m.phase === 'morning');
        expect(morning(mcReducer(ran, { ...retime('morning', '06:00'), ...stamp }))?.startsAtChangedAt, 'the same time').toBeUndefined();
        expect(morning(mcReducer(ran, { ...retime('morning', ''), ...stamp }))?.startsAtChangedAt, 'a refused time').toBeUndefined();
        expect(morning(mcReducer(ran, { ...retime('evening', '20:00'), ...stamp }))?.startsAtChangedAt, 'the other phase').toBeUndefined();
        expect(morning(mcReducer(initialState, { ...retime('morning', '06:30'), ...stamp }))?.startsAtChangedAt, 'no run to keep').toBeUndefined();
        expect(morning(mcReducer(ran, { ...retime('morning', '06:30'), ...stamp }))?.startsAtChangedAt).toBe(stamp.timestamp);
    });
});
