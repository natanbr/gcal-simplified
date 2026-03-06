// ============================================================
// Mission Control — useMissionScheduler
// Checks the current time every 30 seconds and auto-activates
// morning / evening missions based on their startsAt / endsAt
// times. Also locks individual tasks when locksAt is passed.
//
// Scheduler rules:
//  - Only triggers a mission if it hasn't already been started
//    today (i.e., mission.startedAt is null or from a prev day).
//  - Once triggered manually, the scheduler won't override it.
//  - The mission stays active until its countdown timer
//    (startedAt + durationMins) expires — NOT based on endsAt.
// ⚠️  Internal to src/mission-control/ only.
// ============================================================

import { useEffect, useRef } from 'react';
import { useMCStore } from '../store/useMCStore.tsx';
import type { MissionPhase, MCState } from '../types';

/** Parse "HH:MM" string into today's Date */
function timeToDate(hhmm: string): Date {
    const [h, m] = hhmm.split(':').map(Number);
    const d = new Date();
    d.setHours(h, m, 0, 0);
    return d;
}


export function useMissionScheduler(): void {
    const { state, dispatch } = useMCStore();

    // Keep a ref to the latest state so the interval tick always
    // reads fresh values without the effect needing to re-run.
    const stateRef = useRef<MCState>(state);
    useEffect(() => { stateRef.current = state; }, [state]);

    useEffect(() => {
        function tick() {
            const s = stateRef.current;
            const now = new Date();

            // ── Activate scheduled missions ───────────────────────────────────────
            // Rule 1: only trigger if we're in the time window
            // Rule 2: don't start if a mission is already active
            // Rule 3: don't re-trigger if this mission already has a startedAt
            //         (startedAt is preserved through cancel/expiry — its presence
            //          means the mission already ran this session)
            for (const m of s.missions) {
                const start = timeToDate(m.startsAt);
                const end = timeToDate(m.endsAt);
                const withinWindow = now >= start && now < end;

                if (withinWindow && !m.startedAt && s.activeMission === 'none') {
                    dispatch({ type: 'SET_ACTIVE_MISSION', phase: m.phase as Exclude<MissionPhase, 'none'> });
                    return; // one mission at a time
                }
            }

            // ── Deactivate: only when the mission's own countdown timer expires.
            //    We do NOT close based on the scheduled endsAt wall-clock — that
            //    would kill manually-triggered missions the moment the clock ticked
            //    past their scheduled end time.
            if (s.activeMission !== 'none') {
                const activeMission = s.missions.find(m => m.phase === s.activeMission);
                if (activeMission && activeMission.startedAt && activeMission.durationMins != null) {
                    const elapsedMins = (now.getTime() - new Date(activeMission.startedAt).getTime()) / 60000;
                    if (elapsedMins >= activeMission.durationMins) {
                        dispatch({ type: 'SET_ACTIVE_MISSION', phase: 'none' });
                    }
                }
            }

            // ── Lock individual tasks whose locksAt has passed ──────────────────
            for (const mission of s.missions) {
                for (const task of mission.tasks) {
                    if (task.locksAt && !task.locked && !task.completed) {
                        if (now >= timeToDate(task.locksAt)) {
                            dispatch({ type: 'LOCK_TASK', missionPhase: mission.phase, taskId: task.id });
                        }
                    }
                }
            }
        }

        tick(); // run immediately on mount
        const id = setInterval(tick, 15_000); // then every 15 s
        return () => clearInterval(id);
    }, [dispatch]); // dispatch is stable; state is read via stateRef
}
