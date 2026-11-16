// ============================================================
// Mission Control — the expiry tick pays a run finished in time
// ------------------------------------------------------------
// The 15 s tick ends a run whose time is up. With every task done it used to
// end it with SET_ACTIVE_MISSION 'none' alone and leave the payment to the
// overlay's auto-collect, a setTimeout due at the end. After a sleep both are
// overdue; when the tick ran first the run was no longer running, so the
// overlay's completion was refused (completableRun): no bonus, no shield step
// back and no outcome date, so the quick game stayed shut for the day
// (2026-11-14). The scheduler runs here without the overlay, as on a minimized
// run or the Calendar view. The two together, in either order:
// components/MissionOverlay.scheduler-race.test.tsx.
// ============================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { initialState } from '../store/mcReducer';
import { getLocalDateString } from '../store/behaviorSync';
import { isQuickGameWindowOpen } from '../store/gameWindow';
import { at, launchInsideWindow, step, type Phase } from './schedulerTestKit';
import type { MCState } from '../types';

type Harness = ReturnType<typeof launchInsideWindow>;

const NAME: Record<Phase, string> = { morning: 'Morning', evening: 'Evening' };
const lines = (s: MCState, phase: Phase, what: 'completed' | 'expired') =>
    s.activityLogs.filter(l => l.message === `${NAME[phase]} mission ${what}`);
const run = (h: Harness, phase: Phase) => h.live.state.missions.find(m => m.phase === phase);

/** Launches inside `phase`'s window (the scheduler starts it 4 min in) with `streak` misses on the shield. */
function launch(phase: Phase, streak = 2): { h: Harness; bank: number } {
    const h = launchInsideWindow(phase, { ...initialState, missedMissionStreak: streak });
    return { h, bank: h.live.state.bankCount };
}

/** Ticks every open task of the running `phase` but the last `leave` (a tick toggles, so done ones are skipped). */
function tickTasks(h: Harness, phase: Phase, leave = 0) {
    const open = run(h, phase)?.tasks.filter(t => !t.completed) ?? [];
    expect(open.length, 'precondition: the mission has open tasks').toBeGreaterThan(leave);
    for (const t of open.slice(0, open.length - leave)) h.dispatch({ type: 'COMPLETE_TASK', missionPhase: phase, taskId: t.id });
}

/** The machine sleeps through the run's end and wakes at `wake`: no timer ran in between, then the tick's next 15 s. */
function sleepUntil(wake: Date) {
    vi.setSystemTime(wake);
    step(15_100);
}

beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
});

afterEach(() => {
    vi.useRealTimers();
    localStorage.clear();
});

describe('the expiry tick, every task done', () => {
    it('morning: completed, paid, one shield back, dated by its day, and the quick game opens', () => {
        const { h, bank } = launch('morning');
        tickTasks(h, 'morning');
        sleepUntil(at(7, 0));

        const s = h.live.state;
        expect(lines(s, 'morning', 'completed'), 'one completion line').toHaveLength(1);
        expect(lines(s, 'morning', 'completed')[0]).toMatchObject({ delta: 2, source: 'auto' });
        expect(lines(s, 'morning', 'expired'), 'a completed run is not reported as expired').toHaveLength(0);
        expect(s.bankCount).toBe(bank + 2);
        expect(s.missedMissionStreak, 'one shield step given back').toBe(1);
        expect(s.lastCompletedOrFailedMorningDate).toBe(getLocalDateString(at(6, 4)));
        expect(s.activeMission).toBe('none');
        expect(isQuickGameWindowOpen(s, new Date().toISOString()), 'the quick game opens before the evening').toBe(true);
        h.unmount();
    });

    it('evening: completed, paid and one shield back', () => {
        const { h, bank } = launch('evening');
        tickTasks(h, 'evening');
        sleepUntil(at(21, 0));

        const s = h.live.state;
        expect(lines(s, 'evening', 'completed')).toHaveLength(1);
        expect(lines(s, 'evening', 'expired')).toHaveLength(0);
        expect(s.bankCount).toBe(bank + 2);
        expect(s.missedMissionStreak).toBe(1);
        expect(s.lastCompletedOrFailedEveningDate).toBe(getLocalDateString(at(19, 4)));
        expect(s.activeMission).toBe('none');
        h.unmount();
    });

    it('whining flagged during the run: the overlay\'s bonus, one star less', () => {
        const { h, bank } = launch('morning');
        h.dispatch({ type: 'TOGGLE_WHINING', missionPhase: 'morning' });
        tickTasks(h, 'morning');
        sleepUntil(at(7, 0));

        expect(lines(h.live.state, 'morning', 'completed')[0]).toMatchObject({ delta: 1 });
        expect(h.live.state.bankCount).toBe(bank + 1);
        h.unmount();
    });

    it('with the shield broken: the completion is still the way out (6 → 5, unlocked)', () => {
        const { h, bank } = launch('morning', 6);
        tickTasks(h, 'morning');
        sleepUntil(at(7, 0));

        const s = h.live.state;
        expect(lines(s, 'morning', 'completed')).toHaveLength(1);
        expect(s.missedMissionStreak).toBe(5);
        expect(s.bankCount).toBe(bank + 2);
        expect(s.activityLogs.some(l => l.message.startsWith('Shield restored')), 'the unlock is logged').toBe(true);
        h.unmount();
    });
});

describe('the expiry tick pays nothing it must not', () => {
    it('a task left: a miss, charged to the day, no payment', () => {
        const { h, bank } = launch('morning');
        tickTasks(h, 'morning', 1);
        sleepUntil(at(7, 0));

        const s = h.live.state;
        expect(lines(s, 'morning', 'completed')).toHaveLength(0);
        expect(lines(s, 'morning', 'expired')).toHaveLength(1);
        expect(s.bankCount).toBe(bank);
        expect(s.missedMissionStreak, 'one shield step lost').toBe(3);
        expect(s.lastCompletedOrFailedMorningDate).toBe(getLocalDateString(at(6, 4)));
        h.unmount();
    });

    it('every task done only after the timeout was logged: still a miss, never paid', () => {
        const { h, bank } = launch('morning');
        tickTasks(h, 'morning', 1);
        // Just past the end, before the tick: the overlay's timer logs the miss (it sends no origin).
        vi.setSystemTime(at(6, 34, 0, 1));
        h.dispatch({ type: 'MARK_MISSION_TIMEOUT', missionPhase: 'morning' });
        expect(run(h, 'morning')?.loggedTimeoutAt, 'precondition: the timeout is logged').toBeTruthy();
        tickTasks(h, 'morning'); // the last task, in the gap before the tick
        expect(run(h, 'morning')?.tasks.every(t => t.completed), 'precondition: every task done').toBe(true);
        step(15_100);

        const s = h.live.state;
        expect(lines(s, 'morning', 'completed')).toHaveLength(0);
        expect(s.bankCount).toBe(bank);
        expect(s.missedMissionStreak, 'the one miss, nothing given back').toBe(3);
        expect(s.activeMission).toBe('none');
        h.unmount();
    });
});
