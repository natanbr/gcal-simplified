// ============================================================
// Mission Control — useMissionScheduler
// Exact-time scheduler using setTimeouts.
// Checks the remaining time and triggers missions/locks precisely.
// ⚠️  Internal to src/mission-control/ only.
// ============================================================

import { useEffect, useRef, useState } from 'react';
import { useMCStore, useMCDispatch } from '../store/useMCStore.tsx';
import { getLocalDateString } from '../store/behaviorSync';
import type { MissionPhase, MCState } from '../types';

/**
 * How late a timer may fire and still count as "on time".
 *
 * A `setTimeout` armed for 06:00 does not survive a machine suspend intact —
 * on resume it fires immediately, hours after the moment it was aiming at. That
 * is what made missions start at visibly wrong times. Anything later than this
 * window is treated as a missed occurrence: it is skipped and recorded, rather
 * than starting a "morning" routine in the middle of the afternoon.
 */
const LATE_FIRE_TOLERANCE_MS = 5 * 60 * 1000;

/** Today's wall-clock Date matching HH:MM (regardless of whether it passed). */
function occurrenceToday(hhmm: string): Date {
    const [h, m] = hhmm.split(':').map(Number);
    const target = new Date();
    target.setHours(h, m, 0, 0);
    return target;
}

/** The next wall-clock Date matching HH:MM — today if still ahead, else tomorrow. */
function nextOccurrence(hhmm: string): Date {
    const target = occurrenceToday(hhmm);
    if (target.getTime() <= Date.now()) {
        target.setDate(target.getDate() + 1);
    }
    return target;
}

export function useMissionScheduler(): void {
    const { state } = useMCStore();
    const dispatch = useMCDispatch();

    // Keep a ref to the latest state so inner closures can read it.
    const stateRef = useRef<MCState>(state);
    useEffect(() => { stateRef.current = state; }, [state]);

    // ── 0. Re-arm on resume ───────────────────────────────────────────────────
    // The main process emits `system:resume` when the machine wakes. Timers armed
    // before the suspend are no longer trustworthy, so we tear the whole schedule
    // down and rebuild it against the real clock.
    const [rearmToken, setRearmToken] = useState(0);
    useEffect(() => {
        if (!window.ipcRenderer) return;
        const unsubscribe = window.ipcRenderer.on('system:resume', () => {
            setRearmToken(t => t + 1);
        });
        return () => unsubscribe && unsubscribe();
    }, []);

    // ── 1. Exact-Time Trigger Scheduler ───────────────────────────────────────
    // Sets timeouts to precisely start missions and lock tasks at their exact times.
    useEffect(() => {
        // Use a Set so recursive schedules can add/remove themselves correctly
        const timeouts = new Set<ReturnType<typeof setTimeout>>();

        /** True when the timer fired so far past its target that it must be ignored.
         *  A fire while the mission's own window (startsAt → endsAt) is still open
         *  counts as ON TIME: waking the machine at 06:10 must start the
         *  06:00–06:30 mission, not silently lose the day. */
        function firedTooLate(target: Date, label: string, windowEndHhmm?: string): boolean {
            const driftMs = Date.now() - target.getTime();
            if (driftMs <= LATE_FIRE_TOLERANCE_MS) return false;
            if (windowEndHhmm) {
                const windowEnd = new Date(target);
                const [h, m] = windowEndHhmm.split(':').map(Number);
                windowEnd.setHours(h, m, 0, 0);
                if (Date.now() < windowEnd.getTime()) return false;
            }
            console.warn(
                `[MissionScheduler] Skipping ${label}: timer fired ${Math.round(driftMs / 60000)} min late ` +
                `(target ${target.toLocaleTimeString()}). The machine was most likely asleep.`
            );
            return true;
        }

        function schedulePhase(phase: MissionPhase, hhmm: string, endsAt?: string) {
            if (phase === 'none') return;
            let target = nextOccurrence(hhmm);
            // A re-arm (mount or system:resume) while today's window is still
            // open must aim at today's occurrence — nextOccurrence alone rolls
            // to tomorrow the second the start time has passed, which is how a
            // sleep spanning 06:00 used to lose the whole day's mission.
            if (endsAt) {
                const todayStart = occurrenceToday(hhmm);
                if (todayStart.getTime() <= Date.now() && Date.now() < occurrenceToday(endsAt).getTime()) {
                    target = todayStart;
                }
            }
            const id = setTimeout(() => {
                timeouts.delete(id); // Clean up self first

                const s = stateRef.current;
                const todayStr = getLocalDateString();
                const alreadyRun =
                    phase === 'morning'
                        ? s.lastCompletedOrFailedMorningDate === todayStr
                        : phase === 'evening'
                        ? s.lastCompletedOrFailedEveningDate === todayStr
                        : false;

                if (!firedTooLate(target, `${phase} mission`, endsAt)) {
                    // Only trigger if no mission is currently running AND it hasn't run today yet
                    if (s.activeMission === 'none' && !alreadyRun) {
                        dispatch({ type: 'SET_ACTIVE_MISSION', phase, origin: 'scheduler' });
                    }
                } else if (!alreadyRun) {
                    // A skipped mission must be visible to a parent, not only in
                    // the dev console — scheduler actions are never silent.
                    dispatch({ type: 'ADD_LOG', log: {
                        id: self.crypto.randomUUID(),
                        timestamp: new Date().toISOString(),
                        icon: '⏭️',
                        message: `${phase === 'morning' ? 'Morning' : 'Evening'} mission skipped — the ${hhmm} window was missed (machine asleep)`,
                        type: 'mission',
                        colorKey: phase,
                        source: 'scheduler',
                    } });
                }

                // Schedule the next day's occurrence — tracked so cleanup catches it
                const nextId = setTimeout(() => schedulePhase(phase, hhmm, endsAt), 1000);
                timeouts.add(nextId);
            }, Math.max(0, target.getTime() - Date.now()));
            timeouts.add(id);
        }

        function scheduleTaskLock(missionPhase: MissionPhase, taskId: string, locksAtHhmm: string) {
            const target = nextOccurrence(locksAtHhmm);
            const id = setTimeout(() => {
                timeouts.delete(id); // Clean up self first

                if (!firedTooLate(target, `task lock ${taskId}`)) {
                    const s = stateRef.current;
                    const m = s.missions.find(m => m.phase === missionPhase);
                    const t = m?.tasks.find(t => t.id === taskId);

                    // If it isn't locked/completed yet, lock it
                    if (t && !t.locked && !t.completed) {
                        dispatch({ type: 'LOCK_TASK', missionPhase, taskId, origin: 'scheduler' });
                    }
                }

                // Schedule next day's lock — tracked so cleanup catches it
                const nextId = setTimeout(() => scheduleTaskLock(missionPhase, taskId, locksAtHhmm), 1000);
                timeouts.add(nextId);
            }, Math.max(0, target.getTime() - Date.now()));
            timeouts.add(id);
        }

        // Schedule all configured missions
        for (const m of state.missions) {
            schedulePhase(m.phase as Exclude<MissionPhase, 'none'>, m.startsAt, m.endsAt);
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
        state.missions,
        dispatch,
        rearmToken
    ]); // Re-arm when mission configuration changes, or after a system resume

    // ── 2. Expiry Interval (Duration Countdown) ───────────────────────────────
    // Periodically checks if the currently running mission's duration has expired.
    // Gated on activeMission: when nothing is running (e.g. the whole time the
    // user is on the Calendar view) there is nothing to count down, so we run NO
    // interval at all instead of waking the CPU every 15s to check a no-op.
    useEffect(() => {
        if (state.activeMission === 'none') return;

        function tick() {
            const s = stateRef.current;
            if (s.activeMission !== 'none') {
                const activeMission = s.missions.find(m => m.phase === s.activeMission);
                if (activeMission && activeMission.startedAt && activeMission.durationMins != null) {
                    const elapsedMins = (new Date().getTime() - new Date(activeMission.startedAt).getTime()) / 60000;
                    if (elapsedMins >= activeMission.durationMins) {
                        // Record the miss BEFORE clearing the phase. MissionOverlay's
                        // timer only exists while the overlay is on screen, so a
                        // mission left minimized — or expiring on the Calendar view —
                        // would end with no timeout marked and the shield would never
                        // see it. The reducer's `loggedTimeoutAt` guard makes the
                        // overlay also firing harmless.
                        const allDone = activeMission.tasks.length > 0
                            && activeMission.tasks.every(t => t.completed);
                        if (!allDone && !activeMission.loggedTimeoutAt) {
                            dispatch({ type: 'MARK_MISSION_TIMEOUT', missionPhase: s.activeMission, origin: 'scheduler' });
                        }
                        dispatch({ type: 'SET_ACTIVE_MISSION', phase: 'none', origin: 'scheduler' });
                    }
                }
            }
        }

        // Polling every 15s is fine here because it's strictly a duration countdown
        // it doesn't trigger anything, just automatically closes it when time is up.
        const id = setInterval(tick, 15_000);
        return () => clearInterval(id);
    }, [state.activeMission, dispatch]);
}
