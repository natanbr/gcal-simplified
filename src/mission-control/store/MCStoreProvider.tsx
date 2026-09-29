import React, { useReducer, useMemo, useEffect, useRef, useState } from 'react';
import { mcReducer } from './mcReducer';
import { MCContext, loadPersistedState, STORAGE_KEY } from './useMCStore';
import { useBehaviorHeartbeat } from './useBehaviorHeartbeat';
import { useRemoteSync } from './useRemoteSync';
import { useAuditTrail } from './useAuditTrail';
import { useSuspensionExpiry } from './useSuspensionExpiry';
import { useGameTokenCapSettle } from './useGameTokenCapSettle';
import { gameTokensOverCap } from './moodGauge';
import { pendingFrom } from './pendingState';
import { useSchoolCalendarSync } from './useSchoolCalendarSync';

/** Inside the provider: both dispatch through the logging interceptor. */
function SuspensionExpiry(): null {
    useSuspensionExpiry();
    return null;
}

function GameTokenCapSettle(): null {
    useGameTokenCapSettle();
    return null;
}

/** Inside the provider, beside SuspensionExpiry: feeds the school-bag decision. */
function SchoolCalendarSync(): null {
    useSchoolCalendarSync();
    return null;
}

export function MCStoreProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
    const [state, dispatch] = useReducer(mcReducer, undefined, loadPersistedState);
    // Every render starts the interceptor's pending state from this render's state.
    const pending = useRef(pendingFrom(state));
    pending.current = pendingFrom(state);
    const contextValue = useMemo(() => ({ state, dispatch, pending }), [state]);
    // Read once, at load. Mounted on every launch, the settle re-rendered on every
    // store change for the app's lifetime, for a job only an over-cap load has.
    const [needsSettle] = useState(() => gameTokensOverCap(state) > 0);

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

    // Sync remote control keys from Electron store
    useEffect(() => {
        if (window.ipcRenderer) {
            (window.ipcRenderer.invoke('settings:get') as Promise<{ remoteRoomId?: string; remoteKey?: string }>)
                .then((config) => {
                    if (config.remoteRoomId && config.remoteKey) {
                        dispatch({ 
                            type: 'SET_SETTINGS', 
                            settings: { 
                                remoteRoomId: config.remoteRoomId, 
                                remoteKey: config.remoteKey 
                            } 
                        });
                    }
                })
                .catch(() => { /* settings file busy or unreadable: the pairing keys stay as they were */ });
        }
    }, []);

    return (
        <MCContext.Provider value={contextValue}>
            <SuspensionExpiry />
            {needsSettle && <GameTokenCapSettle />}
            <SchoolCalendarSync />
            {children}
        </MCContext.Provider>
    );
}
