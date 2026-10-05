import React, { useReducer, useMemo, useEffect, useRef, useState } from 'react';
import { mcReducer } from './mcReducer';
import { MCContext, loadPersistedStateWithRepairs, STORAGE_KEY } from './useMCStore';
import { useBehaviorHeartbeat } from './useBehaviorHeartbeat';
import { useRemoteSync } from './useRemoteSync';
import { useAuditTrail } from './useAuditTrail';
import { useSuspensionExpiry } from './useSuspensionExpiry';
import { useGameTokenCapSettle } from './useGameTokenCapSettle';
import { useStaleMissionRunEnd } from './useStaleMissionRunEnd';
import { staleIncompleteRunPhases } from './staleMissionRun';
import { gameTokensOverCap } from './moodGauge';
import { pendingFrom } from './pendingState';
import { useSchoolCalendarSync } from './useSchoolCalendarSync';
import { pairingRenewedLogEntry, renewalToMark } from './pairingRenewal';
import { useMissionTimeRepairLog } from './useMissionTimeRepairLog';
import type { MissionTimeRepair } from './missionTimeRepair';

/** Inside the provider: both dispatch through the logging interceptor. */
function SuspensionExpiry(): null {
    useSuspensionExpiry();
    return null;
}

function GameTokenCapSettle(): null {
    useGameTokenCapSettle();
    return null;
}

function StaleMissionRunEnd(): null {
    useStaleMissionRunEnd();
    return null;
}

function MissionTimeRepairLog({ repairs }: { repairs: readonly MissionTimeRepair[] }): null {
    useMissionTimeRepairLog(repairs);
    return null;
}

/** Inside the provider, beside SuspensionExpiry: feeds the school-bag decision. */
function SchoolCalendarSync(): null {
    useSchoolCalendarSync();
    return null;
}

export function MCStoreProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
    // Read once; the mission times hydration reset are logged just after load (missionTimeRepair.ts).
    const [loaded] = useState(loadPersistedStateWithRepairs);
    const [state, dispatch] = useReducer(mcReducer, loaded.state);
    // Every render starts the interceptor's pending state from this render's state.
    const pending = useRef(pendingFrom(state));
    pending.current = pendingFrom(state);
    const contextValue = useMemo(() => ({ state, dispatch, pending }), [state]);
    // Read once, at load. Mounted on every launch, the settle re-rendered on every
    // store change for the app's lifetime, for a job only an over-cap load has.
    const [needsSettle] = useState(() => gameTokensOverCap(state) > 0);
    const [hasStaleRun] = useState(() => staleIncompleteRunPhases(state).length > 0);

    // Accrue mood progress once a minute while the app is running.
    // This heartbeat is the ONLY generator of game tokens — see
    // MOOD_TOKENS_PER_DAY in mcReducer.ts.
    useBehaviorHeartbeat(dispatch);

    // Sync state to Remote Control
    useRemoteSync(state);

    // Mirror every activity-log entry to the append-only file on disk.
    // Survives restarts, the CLEAR button, and the 200-entry ring buffer.
    useAuditTrail(state);

    // Persist state to localStorage on every change (debounced 500ms)
    const persistTimerRef = useRef<ReturnType<typeof setTimeout>>();
    useEffect(() => {
        clearTimeout(persistTimerRef.current);
        persistTimerRef.current = setTimeout(() => {
            try {
                localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
            } catch {
                // Storage quota — fail silently
            }
        }, 500);
        return () => clearTimeout(persistTimerRef.current);
    }, [state]);

    // Read when the settings:get below resolves, not at mount: logs may have moved on.
    const logsRef = useRef(state.activityLogs);
    logsRef.current = state.activityLogs;
    const settingsRef = useRef(state.settings);
    settingsRef.current = state.settings;

    // Once per start: an automatic pairing renewal, logged once (store/pairingRenewal.ts). Only the
    // renewal time is kept: the pairing itself stays in Electron's store, never in this state.
    useEffect(() => {
        if (window.ipcRenderer) {
            window.ipcRenderer.invoke('settings:get')
                .then((config: unknown) => {
                    if (!config) return;
                    // Both dispatched raw, like the heartbeat: neither logs an action, so the
                    // shield-lock re-check CLAUDE.md asks of hand-built entries does not apply.
                    const loggedMarker = settingsRef.current.remotePairingRenewalLogged;
                    const renewalLine = pairingRenewedLogEntry(config, logsRef.current, loggedMarker);
                    if (renewalLine) dispatch({ type: 'ADD_LOG', log: renewalLine });
                    const renewedAt = renewalToMark(config, loggedMarker);
                    if (renewedAt) dispatch({ type: 'SET_SETTINGS', settings: { remotePairingRenewalLogged: renewedAt } });
                })
                .catch(() => { /* settings file busy or unreadable: no renewal line is logged */ });
        }
    }, []);

    return (
        <MCContext.Provider value={contextValue}>
            <SuspensionExpiry />
            {needsSettle && <GameTokenCapSettle />}
            {hasStaleRun && <StaleMissionRunEnd />}
            {loaded.missionTimeRepairs.length > 0 && <MissionTimeRepairLog repairs={loaded.missionTimeRepairs} />}
            <SchoolCalendarSync />
            {children}
        </MCContext.Provider>
    );
}
