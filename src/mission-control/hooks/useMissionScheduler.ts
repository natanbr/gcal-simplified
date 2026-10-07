// ============================================================
// Mission Control — useMissionScheduler
// Exact-time scheduler using setTimeouts.
// Checks the remaining time and triggers missions/locks precisely.
// Which occurrence is open, next or last closed: store/missionOccurrence.ts.
// ⚠️  Internal to src/mission-control/ only.
// ============================================================

import { useEffect, useRef, useState } from 'react';
import { useMCStore, useMCDispatch } from '../store/useMCStore.tsx';
import { hhmmToMins } from '../store/hhmm';
import {
    LATE_FIRE_TOLERANCE_MS, hasClosed, lastClosedOccurrence, nextOccurrence, nextTimeOfDay, openOccurrence,
    type Occurrence,
} from '../store/missionOccurrence';
import type { MissionPhase, MCState, Mission } from '../types';

type Phase = Exclude<MissionPhase, 'none'>;

/** When the mission last started or ended (store/missionActivity.ts), NaN for never. */
function lastActiveMs(s: MCState, phase: Phase): number {
    const stamp = s.missions.find(m => m.phase === phase)?.lastActiveAt;
    return stamp === undefined ? Number.NaN : Date.parse(stamp);
}

/**
 * True when the occurrence `o` of `phase` needs no scheduler start: it
 * concluded (completed or failed; the outcome is dated by the day its window
 * started, store/occurrenceDay.ts, so a timer firing after midnight is judged
 * against the evening that began before it), or the mission ran at some point
 * since its start time — it is running now, or it last started or ended at or
 * after that time. The run is what covers a STOP, which records no outcome: a
 * stop is not a miss (the shield) and not a conclusion (the quick-game window).
 * Without it a stopped mission was restarted 8 ms later. A stamp in the future
 * is ignored: it was written under a clock set ahead, and trusting it would
 * skip every occurrence, silently, until the clock caught up.
 */
function occurrenceHandled(s: MCState, phase: Phase, o: Occurrence): boolean {
    const concluded = phase === 'morning'
        ? s.lastCompletedOrFailedMorningDate === o.day
        : s.lastCompletedOrFailedEveningDate === o.day;
    const activeAt = lastActiveMs(s, phase);
    return concluded
        || s.activeMission === phase
        || (activeAt >= o.startMs && activeAt <= Date.now());
}

/**
 * Whether `passed`, a window that closed without the mission running, is the
 * scheduler's to report: it started while this session was up (the machine
 * slept through it), or after the mission last ran (the app was closed through
 * it). A profile on which the mission never ran says nothing about the app
 * existing at that window, so it gets no line.
 */
function skipOwed(s: MCState, phase: Phase, passed: Occurrence, sessionStartMs: number): boolean {
    return !occurrenceHandled(s, phase, passed)
        && (passed.startMs >= sessionStartMs || lastActiveMs(s, phase) <= Date.now());
}

/** Names the occurrence, so its "skipped" line is written once: a later launch finds it in the log. */
const skippedLineId = (phase: Phase, o: Occurrence) => `mission-skipped-${phase}-${o.day}`;

export function useMissionScheduler(): void {
    const { state } = useMCStore();
    const dispatch = useMCDispatch();

    // Keep a ref to the latest state so inner closures can read it.
    const stateRef = useRef<MCState>(state);
    useEffect(() => { stateRef.current = state; }, [state]);

    // The "skipped" lines this session wrote (an arm never reports one twice,
    // even before its line reaches the state), and when the session began.
    const reported = useRef(new Set<string>());
    const sessionStart = useRef(0);

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
        if (sessionStart.current === 0) sessionStart.current = Date.now();
        // Use a Set so recursive schedules can add/remove themselves correctly
        const timeouts = new Set<ReturnType<typeof setTimeout>>();

        /** A task lock has no window: a fire more than the tolerance late is ignored. */
        function firedTooLate(target: Date, label: string): boolean {
            const driftMs = Date.now() - target.getTime();
            if (driftMs <= LATE_FIRE_TOLERANCE_MS) return false;
            console.warn(`[MissionScheduler] Skipping ${label}: timer fired ${Math.round(driftMs / 60000)} min late.`);
            return true;
        }

        /** Fail closed on anything that is not a real HH:MM (a cleared Settings
         *  field once stored ''): setTimeout(fn, NaN) fires at once, the NaN drift
         *  read as "missed", and the 1 s re-arm logged a skipped mission every
         *  second. Checked on the text, not the Date: '999:00' parses, but its
         *  delay overflows setTimeout's 2^31-1 ms and fires at once too. */
        function armableMins(hhmm: string, label: string): number | null {
            const mins = hhmmToMins(hhmm);
            if (mins === null) console.warn(`[MissionScheduler] Not scheduling ${label}: "${hhmm}" is not a time.`);
            return mins;
        }

        const isReported = (id: string) =>
            reported.current.has(id) || stateRef.current.activityLogs.some(l => l.id === id);

        /** A skipped mission must be visible to a parent, not only in the dev
         *  console — scheduler actions are never silent. Once per occurrence. */
        function reportSkipped(phase: Phase, m: Mission, o: Occurrence) {
            const id = skippedLineId(phase, o);
            if (isReported(id)) return;
            reported.current.add(id);
            console.warn(`[MissionScheduler] Skipping the ${phase} mission of ${o.day}: its window closed unseen (the machine was most likely asleep, or the app closed).`);
            dispatch({ type: 'ADD_LOG', log: {
                id,
                timestamp: new Date().toISOString(),
                icon: '⏭️',
                message: `${phase === 'morning' ? 'Morning' : 'Evening'} mission skipped — the ${m.startsAt} window was missed (machine asleep)`,
                type: 'mission',
                colorKey: phase,
                source: 'scheduler',
            } });
        }

        /**
         * What a (re-)arm aims at, in this order. The last window that closed
         * without running, to report it: a relaunch or a wake used to aim past it
         * in silence. Then the window open now (openOccurrence: after midnight,
         * last night's), but only while it is pending and nothing else runs:
         * either way the fire does nothing, and the re-schedule brought it back
         * every second until the window closed. A mission ending changes
         * `missions`, which re-arms this effect in time to start it. Else the next.
         */
        function targetOf(phase: Phase, m: Mission): Occurrence | null {
            // stateRef, not the effect's `state`: the 1 s re-schedule re-enters here without a render.
            const s = stateRef.current;
            const now = new Date();
            const passed = lastClosedOccurrence(m, s.settings, now);
            if (passed && skipOwed(s, phase, passed, sessionStart.current) && !isReported(skippedLineId(phase, passed))) {
                return passed;
            }
            const open = openOccurrence(m, s.settings, now);
            if (open && s.activeMission === 'none' && !occurrenceHandled(s, phase, open)) return open;
            return nextOccurrence(m, s.settings, now);
        }

        function schedulePhase(m: Mission) {
            if (m.phase === 'none' || armableMins(m.startsAt, `${m.phase} mission`) === null) return;
            const phase = m.phase;
            const target = targetOf(phase, m);
            if (!target) return;
            const id = setTimeout(() => {
                timeouts.delete(id); // Clean up self first

                const s = stateRef.current;
                const alreadyRun = occurrenceHandled(s, phase, target);
                // On time while its window is open (waking at 06:10 starts the
                // 06:00–06:30 mission); after that it was missed, and is reported.
                if (!hasClosed(target, new Date())) {
                    if (s.activeMission === 'none' && !alreadyRun) {
                        // Names the occurrence it starts: a start after midnight is still last night's.
                        dispatch({ type: 'SET_ACTIVE_MISSION', phase, origin: 'scheduler', occurrenceDate: target.day });
                    }
                } else if (!alreadyRun) {
                    reportSkipped(phase, m, target);
                }

                // Aim at what comes next — tracked so cleanup catches it
                const nextId = setTimeout(() => schedulePhase(m), 1000);
                timeouts.add(nextId);
            }, Math.max(0, target.startMs - Date.now()));
            timeouts.add(id);
        }

        function scheduleTaskLock(missionPhase: MissionPhase, taskId: string, locksAtHhmm: string) {
            const locksAtMins = armableMins(locksAtHhmm, `task lock ${taskId}`);
            if (locksAtMins === null) return;
            const target = nextTimeOfDay(locksAtMins, new Date());
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
            schedulePhase(m);
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
