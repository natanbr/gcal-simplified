// ============================================================
// Mission Control — which days are school days, read from the family calendar
//
// Feeds `MCState.schoolCalendar`, which the SET_ACTIVE_MISSION fresh start
// reads to decide the school-bag task. Uses two channels the calendar view
// already uses (`auth:check`, `data:events` in its strict mode) — no new IPC
// channel — and no timer: it refreshes on mount, when a mission ends (so the
// next one decides on fresh data), when the machine wakes, and when a
// calendar is connected. It never STARTS a read while a mission runs: no fresh
// start can happen then, and the mission's end reads anyway (CLAUDE.md →
// Performance). A read already in flight when a mission starts is still
// stored — the running checklist is decided and cannot change; the answer
// serves the next mission.
// ⚠️  Internal to src/mission-control/ only.
// ============================================================

import { useEffect, useRef, useState } from 'react';
import { useMCStore, useMCDispatch } from './useMCStore';
import { classifySchoolCalendar, schoolCalendarWindow } from './schoolDays';

export function useSchoolCalendarSync(): void {
    const { state } = useMCStore();
    const dispatch = useMCDispatch();
    // A boolean, so the read effect re-runs when a mission starts or ends and
    // never on the store's ordinary churn (every tap, every heartbeat).
    const missionRunning = state.activeMission !== 'none';
    const [refresh, setRefresh] = useState(0);
    // Only the newest read may store its answer, and nothing after unmount. A
    // counter rather than an effect cleanup: a mission starting must not make
    // the read in flight stale — only a newer read may.
    const latestRead = useRef(0);
    const mounted = useRef(false);

    useEffect(() => {
        mounted.current = true;
        return () => { mounted.current = false; };
    }, []);

    useEffect(() => {
        const ipc = window.ipcRenderer;
        if (!ipc) return;
        const bump = () => setRefresh(n => n + 1);
        const offResume = ipc.on('system:resume', bump);
        const offAuth = ipc.on('auth:success', bump);
        return () => { offResume?.(); offAuth?.(); };
    }, []);

    useEffect(() => {
        const ipc = window.ipcRenderer;
        if (!ipc || missionRunning) return;
        const read = ++latestRead.current;
        const current = () => mounted.current && read === latestRead.current;
        void (async () => {
            try {
                const connected = await ipc.invoke('auth:check');
                if (!current()) return;
                if (connected !== true) {
                    dispatch({ type: 'SET_SCHOOL_CALENDAR', calendar: null, origin: 'system' });
                    return;
                }
                const range = schoolCalendarWindow(new Date());
                // Strict: offline, an expired login, one calendar or the holiday
                // feed failing all REJECT instead of answering a shorter list, so
                // an answer — even an empty one — is complete and replaces the slice.
                const events = await ipc.invoke('data:events', range.timeMin, range.timeMax, { strict: true });
                if (!current()) return;
                if (!Array.isArray(events)) throw new Error('data:events did not answer with a list');
                dispatch({ type: 'SET_SCHOOL_CALENDAR', calendar: classifySchoolCalendar(events, range.from, range.to), origin: 'system' });
            } catch (error) {
                if (current()) console.warn('[SchoolCalendar] Could not read the calendar; keeping the stored school days.', error);
            }
        })();
    }, [refresh, missionRunning, dispatch]);
}
