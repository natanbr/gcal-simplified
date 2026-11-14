import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { initialState, mcReducer } from '../store/mcReducer';
import { loadPersistedState } from '../store/useMCStore';
import { getLocalDateString } from '../store/behaviorSync';
import { at, crossing, renderLiveScheduler, saveAndClose, startLogs, step } from './schedulerTestKit';
import type { MCState, Mission } from '../types';

type Phase = 'morning' | 'evening';
const PHASES: Phase[] = ['morning', 'evening'];
const OUTCOMES = ['failed', 'completed', 'stopped'] as const;
/** The hour each default window opens (06:00 and 19:00). */
const WINDOW_OPENS: Record<Phase, number> = { morning: 6, evening: 19 };
const TODAY = getLocalDateString(new Date(2026, 10, 10));

function mission(state: MCState, phase: Phase): Mission {
    const found = state.missions.find(m => m.phase === phase);
    if (!found) throw new Error(`No ${phase} mission`);
    return found;
}

function outcomeDate(state: MCState, phase: Phase): string | null {
    return phase === 'morning' ? state.lastCompletedOrFailedMorningDate : state.lastCompletedOrFailedEveningDate;
}

function base(): MCState {
    return mcReducer({ ...initialState, bankCount: 0, missedMissionStreak: 2 }, {
        type: 'SET_SETTINGS',
        settings: { morningDurationMins: 10 / 60, eveningDurationMins: 10 / 60 },
    });
}

/** What Settings → Save sends to move `phase`'s start time to `startsAt`. */
function retime(phase: Phase, startsAt: string) {
    return { type: 'SET_SETTINGS', settings: phase === 'morning' ? { morningStartsAt: startsAt } : { eveningStartsAt: startsAt } } as const;
}

describe('phone mission starts keep repeat sessions available', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date(2026, 10, 10, 14));
        localStorage.clear();
    });
    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
        localStorage.clear();
        delete window.ipcRenderer;
    });

    for (const phase of PHASES) {
        for (const outcome of OUTCOMES) {
            it(`starts another ${phase} session after a ${outcome} session on the same day`, () => {
                const h = renderLiveScheduler(base(), { ipc: true });
                h.emit('remote-control:action', { type: 'SET_ACTIVE_MISSION', phase });
                const first = mission(h.live.state, phase).startedAt;
                expect(first).toBeTruthy();
                h.emit('remote-control:action', { type: 'COMPLETE_TASK', missionPhase: phase, taskId: mission(h.live.state, phase).tasks[0].id });

                if (outcome === 'failed') {
                    step(15_100); // the real scheduler expires the unfinished 10-second run
                } else if (outcome === 'completed') {
                    for (const task of mission(h.live.state, phase).tasks.filter(t => !t.completed)) {
                        h.emit('remote-control:action', { type: 'COMPLETE_TASK', missionPhase: phase, taskId: task.id });
                    }
                    // By hand: the real sender is MissionOverlay's collect / auto-complete path.
                    // The reducer transition is what is under test here, not that sender.
                    h.dispatch({ type: 'COMPLETE_MISSION_ROUTINE', missionPhase: phase, bonusTokens: 2, origin: 'auto' });
                } else {
                    h.emit('remote-control:action', { type: 'CANCEL_MISSION', missionPhase: phase });
                }
                expect(h.live.state.activeMission, 'precondition: the previous session ended').toBe('none');
                const missed = h.live.state.missedMissionStreak;
                const bank = h.live.state.bankCount;
                expect(missed).toBe(outcome === 'failed' ? 3 : outcome === 'completed' ? 1 : 2);
                if (outcome !== 'stopped') expect(outcomeDate(h.live.state, phase)).toBe(TODAY);

                step(1_000);
                h.emit('remote-control:action', { type: 'SET_ACTIVE_MISSION', phase });

                const next = mission(h.live.state, phase);
                expect(h.live.state.activeMission).toBe(phase);
                expect(next.startedAt).not.toBe(first);
                expect(next.loggedTimeoutAt).toBeUndefined();
                expect(next.tasks.every(t => !t.completed && !t.locked)).toBe(true);
                expect(h.live.state.missedMissionStreak, 'starting a retry never refunds the previous miss').toBe(missed);
                expect(h.live.state.bankCount, 'starting never pays a bonus').toBe(bank);
                expect(h.live.state.activityLogs.filter(l => l.message.startsWith(`${phase} mission started`)).map(l => l.source)).toEqual(['remote', 'remote']);
                h.unmount();
            });
        }
    }

    it('ignores duplicate starts and starts for the other phase while a mission runs, without another log line', () => {
        const h = renderLiveScheduler(base(), { ipc: true });
        h.emit('remote-control:action', { type: 'SET_ACTIVE_MISSION', phase: 'morning' });
        const before = h.live.state.missions;
        h.emit('remote-control:action', { type: 'SET_ACTIVE_MISSION', phase: 'morning' });
        h.emit('remote-control:action', { type: 'SET_ACTIVE_MISSION', phase: 'evening' });

        expect(h.live.state.activeMission).toBe('morning');
        expect(h.live.state.missions).toBe(before);
        expect(h.live.state.activityLogs.filter(l => l.message.includes('mission started'))).toHaveLength(1);
        h.unmount();
    });

    /**
     * The phone starts `phase` at `clock` and the real scheduler expires the unfinished 10-second
     * run: a miss charged and logged for today. Started 30 min before the window opens, the run
     * ends before the window's start, so `lastActiveAt` is not "since the window's start" and only
     * `lastCompletedOrFailed*Date` tells the scheduler that occurrence is done.
     */
    function phoneMiss(phase: Phase, clock: Date) {
        vi.setSystemTime(clock);
        const h = renderLiveScheduler(base(), { ipc: true });
        h.emit('remote-control:action', { type: 'SET_ACTIVE_MISSION', phase });
        step(15_100);
        expect(h.live.state.activeMission, 'precondition: the run expired').toBe('none');
        expect(h.live.state.missedMissionStreak, 'precondition: the miss is charged').toBe(3);
        expect(outcomeDate(h.live.state, phase), 'precondition: the miss is logged for today').toBe(TODAY);
        return h;
    }

    /** What the next launch loads, with the logged outcome date kept or removed (the control). */
    function savedAndReloaded(h: ReturnType<typeof phoneMiss>, phase: Phase, keepOutcome: boolean): MCState {
        saveAndClose(h);
        const loaded = loadPersistedState();
        if (keepOutcome) return loaded;
        return phase === 'morning' ? { ...loaded, lastCompletedOrFailedMorningDate: null } : { ...loaded, lastCompletedOrFailedEveningDate: null };
    }

    for (const phase of PHASES) {
        const opens = WINDOW_OPENS[phase];
        const retimed = `${String(opens).padStart(2, '0')}:04`;

        it(`${phase}: a relaunch inside the open window after a logged miss starts no second attempt, and the phone can retry`, () => {
            const loaded = savedAndReloaded(phoneMiss(phase, at(opens - 1, 30)), phase, true);

            vi.setSystemTime(at(opens, 2));
            const next = renderLiveScheduler(loaded, { ipc: true });
            step(1_000);
            expect(next.live.state.activeMission, 'a relaunch inside the window does not schedule a second attempt').toBe('none');
            expect(startLogs(next.live.state, phase), 'the phone start only').toBe(1);

            next.emit('remote-control:action', { type: 'SET_ACTIVE_MISSION', phase });
            expect(next.live.state.activeMission).toBe(phase);
            expect(mission(next.live.state, phase).loggedTimeoutAt).toBeUndefined();
            expect(next.live.state.missedMissionStreak, 'the retry keeps the charged miss').toBe(3);
            next.unmount();
        });

        it(`${phase}: control, the same relaunch without the logged outcome does start the open window`, () => {
            const loaded = savedAndReloaded(phoneMiss(phase, at(opens - 1, 30)), phase, false);

            vi.setSystemTime(at(opens, 2));
            const next = renderLiveScheduler(loaded, { ipc: true });
            step(1_000);
            expect(next.live.state.activeMission, 'the window is open, so only the logged outcome held it back').toBe(phase);
            next.unmount();
        });

        it(`${phase}: a desktop save moving the start a few minutes later after a logged miss starts nothing`, () => {
            const h = phoneMiss(phase, at(opens, 0, 0, 30));
            h.dispatch(retime(phase, retimed));

            crossing(at(opens, 4));
            step(1_000);
            expect(h.live.state.activeMission, 'the new start time passed and nothing started').toBe('none');
            expect(startLogs(h.live.state, phase), 'the phone start only').toBe(1);
            expect(h.live.state.missedMissionStreak).toBe(3);
            h.unmount();
        });

        it(`${phase}: without the logged outcome, the same later start time still starts nothing (2026-11-13)`, () => {
            // Until 2026-11-13 this control started a fresh attempt: only the outcome held it back.
            // Now the save is stamped after today's run, so the run covers the moved occurrence
            // (retimedOntoItsRun, useMissionScheduler.settings-retime.test.tsx).
            const reloaded = savedAndReloaded(phoneMiss(phase, at(opens, 0, 0, 30)), phase, false);

            vi.setSystemTime(at(opens, 0, 0, 50));
            const next = renderLiveScheduler(reloaded, { ipc: true });
            next.dispatch(retime(phase, retimed));

            crossing(at(opens, 4));
            step(1_000);
            expect(startLogs(next.live.state, phase), 'the phone start only').toBe(1);
            next.unmount();
        });
    }

    it('lets the parent start a recovery session while the shield is broken', () => {
        const h = renderLiveScheduler({ ...base(), missedMissionStreak: 6 }, { ipc: true });
        h.emit('remote-control:action', { type: 'SET_ACTIVE_MISSION', phase: 'morning' });
        expect(h.live.state.activeMission).toBe('morning');
        for (const task of mission(h.live.state, 'morning').tasks) {
            h.emit('remote-control:action', { type: 'COMPLETE_TASK', missionPhase: 'morning', taskId: task.id });
        }
        // By hand, as above: MissionOverlay's collect / auto-complete path is the real sender.
        h.dispatch({ type: 'COMPLETE_MISSION_ROUTINE', missionPhase: 'morning', bonusTokens: 2, origin: 'auto' });

        expect(h.live.state.activeMission).toBe('none');
        expect(h.live.state.missedMissionStreak).toBe(5);
        expect(h.live.state.bankCount).toBe(2);
        h.unmount();
    });

    it('still starts the scheduled morning automatically without any phone action', () => {
        vi.setSystemTime(new Date(2026, 10, 10, 5, 59, 59));
        const h = renderLiveScheduler(base(), { ipc: true });
        step(1_100);

        expect(h.live.state.activeMission).toBe('morning');
        expect(h.live.state.activityLogs.find(l => l.message.startsWith('morning mission started'))?.source).toBe('scheduler');
        h.unmount();
    });
});
