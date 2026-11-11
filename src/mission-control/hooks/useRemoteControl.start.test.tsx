import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { initialState, mcReducer } from '../store/mcReducer';
import { STORAGE_KEY, loadPersistedState } from '../store/useMCStore';
import { getLocalDateString } from '../store/behaviorSync';
import { renderLiveScheduler, step } from './schedulerTestKit';
import type { MCState, Mission } from '../types';

type Phase = 'morning' | 'evening';
const PHASES: Phase[] = ['morning', 'evening'];
const OUTCOMES = ['failed', 'completed', 'stopped'] as const;

function mission(state: MCState, phase: Phase): Mission {
    const found = state.missions.find(m => m.phase === phase);
    if (!found) throw new Error(`No ${phase} mission`);
    return found;
}

function base(): MCState {
    return mcReducer({ ...initialState, bankCount: 0, missedMissionStreak: 2 }, {
        type: 'SET_SETTINGS',
        settings: { morningDurationMins: 10 / 60, eveningDurationMins: 10 / 60 },
    });
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
                    h.dispatch({ type: 'COMPLETE_MISSION_ROUTINE', missionPhase: phase, bonusTokens: 2, origin: 'auto' });
                } else {
                    h.emit('remote-control:action', { type: 'CANCEL_MISSION', missionPhase: phase });
                }
                expect(h.live.state.activeMission, 'precondition: the previous session ended').toBe('none');
                const missed = h.live.state.missedMissionStreak;
                const bank = h.live.state.bankCount;
                expect(missed).toBe(outcome === 'failed' ? 3 : outcome === 'completed' ? 1 : 2);
                const outcomeDate = phase === 'morning'
                    ? h.live.state.lastCompletedOrFailedMorningDate : h.live.state.lastCompletedOrFailedEveningDate;
                if (outcome !== 'stopped') expect(outcomeDate).toBe(getLocalDateString(new Date()));

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

    it('permits a phone retry after a failed session is saved and the desktop restarts the same day', () => {
        const first = renderLiveScheduler(base(), { ipc: true });
        first.emit('remote-control:action', { type: 'SET_ACTIVE_MISSION', phase: 'morning' });
        step(15_100);
        expect(first.live.state.activeMission).toBe('none');
        localStorage.setItem(STORAGE_KEY, JSON.stringify(first.live.state));
        first.unmount();

        const next = renderLiveScheduler(loadPersistedState(), { ipc: true });
        step(1_000);
        expect(next.live.state.activeMission, 'a restart does not schedule a second attempt').toBe('none');
        next.emit('remote-control:action', { type: 'SET_ACTIVE_MISSION', phase: 'morning' });
        expect(next.live.state.activeMission).toBe('morning');
        expect(mission(next.live.state, 'morning').loggedTimeoutAt).toBeUndefined();
        expect(next.live.state.missedMissionStreak).toBe(3);
        next.unmount();
    });

    it('lets the parent start a recovery session while the shield is broken', () => {
        const h = renderLiveScheduler({ ...base(), missedMissionStreak: 6 }, { ipc: true });
        h.emit('remote-control:action', { type: 'SET_ACTIVE_MISSION', phase: 'morning' });
        expect(h.live.state.activeMission).toBe('morning');
        for (const task of mission(h.live.state, 'morning').tasks) {
            h.emit('remote-control:action', { type: 'COMPLETE_TASK', missionPhase: 'morning', taskId: task.id });
        }
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
