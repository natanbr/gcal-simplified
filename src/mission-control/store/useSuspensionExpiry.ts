// ============================================================
// Mission Control — a suspension ends at its end time, by itself
//
// Every reader derives "in force" from the clock (isPrivilegeSuspended), but a
// surface only re-reads it when it re-renders and the phone only when something
// broadcasts: a completed Game goal's "Use!" stayed locked until an unrelated
// change. One setTimeout to the next end dispatches EXPIRE_SUSPENSIONS, so the
// stored state becomes true, every consumer re-renders, the phone is told, and
// the lift gets its own log line attributed `auto`. Armed only while a
// suspension is stored; a single timeout, not a poll (CLAUDE.md → Performance).
// ⚠️  Internal to src/mission-control/ only.
// ============================================================

import { useEffect, useState } from 'react';
import { useMCStore, useMCDispatch } from './useMCStore';
import { nextSuspensionEnd } from './privileges';

/** setTimeout holds a signed 32-bit delay; above ~24.8 days it fires at once. */
const MAX_TIMEOUT_MS = 2 ** 31 - 1;

export function useSuspensionExpiry(): void {
    const { state } = useMCStore();
    const dispatch = useMCDispatch();
    const endMs = nextSuspensionEnd(state.privileges);
    const [rearm, setRearm] = useState(0);

    // A timer armed before the machine slept fires late: re-aim it on wake,
    // like useMissionScheduler does.
    useEffect(() => {
        if (!window.ipcRenderer) return;
        const unsubscribe = window.ipcRenderer.on('system:resume', () => setRearm(t => t + 1));
        return () => unsubscribe && unsubscribe();
    }, []);

    useEffect(() => {
        if (endMs === null) return;
        const timer = setTimeout(() => {
            // Early (a clamped delay): re-arm, do not dispatch. The reducer would
            // lift nothing, `endMs` would not change, and this effect would never
            // run again.
            if (Date.now() < endMs) setRearm(t => t + 1);
            else dispatch({ type: 'EXPIRE_SUSPENSIONS', origin: 'auto' });
        }, Math.min(Math.max(0, endMs - Date.now()), MAX_TIMEOUT_MS));
        return () => clearTimeout(timer);
    }, [endMs, rearm, dispatch]);
}
