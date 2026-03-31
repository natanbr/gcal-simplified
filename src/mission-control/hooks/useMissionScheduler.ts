// ============================================================
// Mission Control — useMissionScheduler
// Exact-time scheduler using setTimeouts.
// Checks the remaining time and triggers missions/locks precisely.
// ⚠️  Internal to src/mission-control/ only.
// ============================================================

import { useEffect, useRef } from 'react';
import { useMCStore } from '../store/useMCStore.tsx';
import type { MissionPhase, MCState } from '../types';

/** Calculate ms from now until the target HH:MM time. If it already passed, returns ms until tomorrow's time. */
function getMsUntilNextTime(hhmm: string): number {
    const [h, m] = hhmm.split(':').map(Number);
    const now = new Date();
    const target = new Date();
    target.setHours(h, m, 0, 0);

    if (target.getTime() <= now.getTime()) {
        target.setDate(target.getDate() + 1);
    }

    return target.getTime() - now.getTime();
}

export function useMissionScheduler(): void {
    const { state, dispatch } = useMCStore();

    // Keep a ref to the latest state so inner closures can read it.
    const stateRef = useRef<MCState>(state);
    useEffect(() => { stateRef.current = state; }, [state]);

    // ── 1. Exact-Time Trigger Scheduler ───────────────────────────────────────
    // Sets timeouts to precisely start missions and lock tasks at their exact times.
    useEffect(() => {
        // Use a Set so recursive schedules can add/remove themselves correctly
        const timeouts = new Set<ReturnType<typeof setTimeout>>();

        function schedulePhase(phase: MissionPhase, hhmm: string) {
            if (phase === 'none') return;
            const ms = getMsUntilNextTime(hhmm);
            const id = setTimeout(() => {
                timeouts.delete(id); // Clean up self first

                const s = stateRef.current;
                // Only trigger if no mission is currently running
                if (s.activeMission === 'none') {
                    dispatch({ type: 'SET_ACTIVE_MISSION', phase });
                }

                // Schedule the next day's occurrence — tracked so cleanup catches it
                const nextId = setTimeout(() => schedulePhase(phase, hhmm), 1000);
                timeouts.add(nextId);
            }, ms);
            timeouts.add(id);
        }

        function scheduleTaskLock(missionPhase: MissionPhase, taskId: string, locksAtHhmm: string) {
            const ms = getMsUntilNextTime(locksAtHhmm);
            const id = setTimeout(() => {
                timeouts.delete(id); // Clean up self first

                const s = stateRef.current;
                const m = s.missions.find(m => m.phase === missionPhase);
                const t = m?.tasks.find(t => t.id === taskId);

                // If it isn't locked/completed yet, lock it
                if (t && !t.locked && !t.completed) {
                    dispatch({ type: 'LOCK_TASK', missionPhase, taskId });
                }

                // Schedule next day's lock — tracked so cleanup catches it
                const nextId = setTimeout(() => scheduleTaskLock(missionPhase, taskId, locksAtHhmm), 1000);
                timeouts.add(nextId);
            }, ms);
            timeouts.add(id);
        }

        // Schedule all configured missions
        for (const m of state.missions) {
            schedulePhase(m.phase as Exclude<MissionPhase, 'none'>, m.startsAt);
            for (const t of m.tasks) {
                if (t.locksAt) {
                    scheduleTaskLock(m.phase, t.id, t.locksAt);
                }
            }
        }

        return () => {
            timeouts.forEach(clearTimeout);
            timeouts.clear();
        };
    }, [
        state.settings.morningStartsAt,
        state.settings.eveningStartsAt,
        dispatch
    ]); // Only re-run when configured start times change

    // ── 2. Expiry Interval (Duration Countdown) ───────────────────────────────
    // Periodically checks if the currently running mission's duration has expired.
    useEffect(() => {
        function tick() {
            const s = stateRef.current;
            if (s.activeMission !== 'none') {
                const activeMission = s.missions.find(m => m.phase === s.activeMission);
                if (activeMission && activeMission.startedAt && activeMission.durationMins != null) {
                    const elapsedMins = (new Date().getTime() - new Date(activeMission.startedAt).getTime()) / 60000;
                    if (elapsedMins >= activeMission.durationMins) {
                        dispatch({ type: 'SET_ACTIVE_MISSION', phase: 'none' });
                    }
                }
            }
        }

        // Polling every 15s is fine here because it's strictly a duration countdown
        // it doesn't trigger anything, just automatically closes it when time is up.
        const id = setInterval(tick, 15_000);
        return () => clearInterval(id);
    }, [dispatch]);
}

